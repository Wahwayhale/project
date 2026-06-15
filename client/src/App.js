import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { I } from './components/Icon';
import { useToast } from './hooks/useToast';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useFriends } from './hooks/useFriends';
import { useRooms } from './hooks/useRooms';
import { useChat } from './hooks/useChat';
import { useAI } from './hooks/useAI';
import { usePanels } from './hooks/usePanels';
import { useWallet } from './hooks/useWallet';
import { useSocial } from './hooks/useSocial';
import { useCall } from './hooks/useCall';
import Toast from './components/ui/Toast';
import { isCapacitor, SERVER_URL, API_URL, APP_VERSION, MAJOR_VERSION, WEB_BUILD, NATIVE_BUILD, CHUNK_SIZE, DEFAULT_AVATAR, EMOJIS } from './utils/constants';
import { formatFileSize, getFileIcon, parseBilibiliUrl, formatTime, formatRecordingTime, formatMessagePreview } from './utils/format';
import { getAvatarUrl } from './utils/avatar';
import AvatarImg from './components/ui/AvatarImg';
import RoomAvatar from './components/ui/RoomAvatar';
import EmptyState from './components/ui/EmptyState';
import SplashScreen from './components/ui/SplashScreen';
import FeatureItem from './components/ui/FeatureItem';
import MeMenuItem from './components/ui/MeMenuItem';
import BottomTabBar from './components/BottomTabBar';
import GameModal from './components/modals/GameModal';
// axios 全局配置
axios.defaults.timeout = 15000;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
// Capacitor App 使用 ngrok 时，跳过 ngrok 浏览器安全警告页
if (isCapacitor) {
  axios.defaults.headers.common['ngrok-skip-browser-warning'] = '1';
}
// 请求重试 + 401 自动重新登录
let isReloggingIn = false;
axios.interceptors.response.use(null, async (err) => {
  const config = err.config;
  // 401 → 尝试重新登录
  if (err.response?.status === 401 && !isReloggingIn && !config.url?.includes('/api/login')) {
    isReloggingIn = true;
    const savedUser = localStorage.getItem('savedUsername');
    const savedPass = localStorage.getItem('savedPassword');
    if (savedUser && savedPass) {
      try {
        const loginRes = await axios.post(`${API_URL}/api/login`, { username: savedUser, password: savedPass });
        const newToken = loginRes.data.token;
        localStorage.setItem('token', newToken);
        config.headers.Authorization = newToken;
        isReloggingIn = false;
        return axios(config); // 用新 token 重试原请求
      } catch {}
    }
    isReloggingIn = false;
  }
  // 网络重试
  if (!config || config._retryCount >= 2) return Promise.reject(err);
  if (!err.response && err.code !== 'ECONNABORTED') {
    config._retryCount = (config._retryCount || 0) + 1;
    await new Promise(r => setTimeout(r, 1000 * config._retryCount));
    return axios(config);
  }
  return Promise.reject(err);
});
console.log('[APP] Capacitor:', isCapacitor, 'API_URL:', API_URL || '(relative)');

function App() {
  const {
    isAuthenticated, user, token, setUser, setToken,
    authMode, setAuthMode, username, setUsername,
    password, setPassword, error, setError,
    handleAuth, handleLogout, diag,
    balance, setBalance,
    profileEdit, setProfileEdit,
  } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPayCodeModal, setShowPayCodeModal] = useState(false);
  const [selectedFriendPayCode, setSelectedFriendPayCode] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [messageEndRef, setMessageEndRef] = useState(null);
  const messagesContainerRef = useRef(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [view, setView] = useState('chats');

  // 快捷回复
  const [quickReplies] = useState(['好的', '收到', '没问题', '稍等', '哈哈哈', '嗯嗯', '谢谢', '再见']);
  
  
  
  // 聊天记录导出
  const [exportingChat, setExportingChat] = useState(false);

  // OTA 更新
  const [otaInfo, setOtaInfo] = useState(null);
  const [showMajorUpdateModal, setShowMajorUpdateModal] = useState(false);
  const appVersion = APP_VERSION;
  
  // 手机号绑定（验证码流程）
  const [phoneInfo, setPhoneInfo] = useState({ phone: null, phoneBound: false, phoneBoundAt: null });
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [phoneStep, setPhoneStep] = useState('input'); // input | code | done
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [phoneBinding, setPhoneBinding] = useState(false);
  const [phoneSendingCode, setPhoneSendingCode] = useState(false);

  // 语音录制
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const recordingTimerRef = useRef(null);
  
  // Toast 通知系统
  const { toast, showToast } = useToast();

  // 设置系统
  const {
    darkMode, toggleDarkMode, fontSize, setFontSize,
    themePreset, setThemePreset,
    chatBackgrounds, setChatBackgrounds,
    mutedRooms, setMutedRooms,
    starredMessages, toggleStarMessage,
    pinnedMessages, setPinnedMessages,
    roomAnnouncements, setRoomAnnouncements,
    pinnedChats, togglePinChat,
  } = useSettings();

  // === 聊天室功能 ===
  // 底部Tab (聊天/通讯录/发现/我)
  const [bottomTab, setBottomTab] = useState('chats');
  // 启动闪屏
  const [showSplash, setShowSplash] = useState(true);
  // 通讯录字母索引
  const [contactsLetter, setContactsLetter] = useState('');
  // 聊天记录备份
  const [showBackupModal, setShowBackupModal] = useState(false);
  // 聊天背景选择
  const [showBgPicker, setShowBgPicker] = useState(false);

  // ===== 新功能状态 =====
  // 图片查看器
  const [imageViewer, setImageViewer] = useState(null); // { url, urls[] } or null
  // 密码找回
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwPhone, setResetPwPhone] = useState('');
  const [resetPwCode, setResetPwCode] = useState('');
  const [resetPwNewPw, setResetPwNewPw] = useState('');
  const [resetPwStep, setResetPwStep] = useState(0); // 0=phone, 1=code, 2=newPw
  const [resetPwCountdown, setResetPwCountdown] = useState(0);
  // ===== 第2代新功能 =====

  // 闪屏自动消失
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // 消息搜索
  const [searchQuery, setSearchQuery] = useState('');

  const [showRoomManage, setShowRoomManage] = useState(false);

  // ===== Socket 连接与在线用户 =====
  const socketRef = useRef(null);
  const friendsRef = useRef([]);

  // ===== 聊天室管理 =====
  const roomsHook = useRooms({
    socketRef,
    user,
    friendsRef,
    setMessages,
    setMessagesLoading,
    showToast,
  });
  const {
    rooms, setRooms,
    currentRoom, setCurrentRoom,
    currentRoomId, setCurrentRoomId,
    fileTransferRoom, setFileTransferRoom,
    typingUser, setTypingUser,
    unreadCounts, setUnreadCounts,
    handleRoomClick,
    createGroup,
    deleteChat,
    openFileTransfer,
  } = roomsHook;

  const friendsHook = useFriends({
    socketRef,
    user,
    token,
    showToast,
    rooms,
    setCurrentRoom,
    setCurrentRoomId,
    setView,
  });
  const {
    friends, setFriends,
    friendRequests, setFriendRequests,
    allUsers, setAllUsers,
    searchId, setSearchId,
    searchResult, setSearchResult,
    showSearchModal, setShowSearchModal,
    fetchFriends, fetchFriendRequests, fetchUsers,
    searchUser, sendFriendRequest,
    acceptFriendRequest, rejectFriendRequest,
    startChatWithFriend,
  } = friendsHook;
  friendsRef.current = friends;
  const { onlineUsers } = useSocket({
    socketRef,
    token,
    user,
    isAuthenticated,
    handlers: {
      // State setters
      setFriends,
      setMessages,
      setRooms,
      setTypingUser,
      setRecalledMessages,
      setBalance,
      setRoomAnnouncements,
      setCurrentRoom,
      setCurrentRoomId,
      setMoments,
      setMessageStats,
      setUnreadCounts,
      setCallState,
      setSharedLocations,
      setCheckInData,
      setExportingChat,
      setShowCreateModal,
      setFriendRequests,
      setMessagesLoading,
      // Current state values
      currentRoomId,
      // Refs
      peerRef,
      // Notification flags
      notifyEnabled,
      notifyMuted,
      // Toast callback
      showToast,
    }
  });

  // ===== 聊天核心逻辑 =====
  const chatHook = useChat({
    socketRef,
    user,
    currentRoomId,
    currentRoom,
    showToast,
    token,
    allUsers,
    setPinnedMessages,
    searchQuery,
    setMessages, setNewMessage,
    setMessagesLoading, setUploadProgress,
    messages, newMessage, uploadProgress,
    messageEndRef, setMessageEndRef,
    messagesContainerRef, messagesLoading,
  });
  const {
    editingMessage, editText,
    replyToMessage,
    showEmojiPicker, setShowEmojiPicker,
    showMentionPicker, setShowMentionPicker,
    mentionFilter, setMentionFilter,
    showQuickReplies, setShowQuickReplies,
    showSearch, setShowSearch,
    searchFilter, setSearchFilter,
    searchResults, setSearchResults,
    recalledMessages, setRecalledMessages,
    reactionPicker, setReactionPicker,
    forwardMsg, showForwardModal,
    fileInputRef,
    sendMessage, handleKeyDown, handleInputChange,
    handleFileSelect,
    recallMessage, deleteMessage,
    startEditMessage, cancelEdit,
    startReply, cancelReply,
    insertEmoji, insertMention, getFilteredMentionUsers,
    insertQuickReply,
    sendDice, sendRockPaperScissors,
    toggleReaction, openReactionPicker,
    togglePinMessage,
    openForwardModal, forwardMessage,
    doSearch, getReadInfo,
  } = chatHook;

  // ===== AI 功能 =====
  const {
    aiMessages, setAiMessages,
    aiInput, setAiInput,
    aiLoading, setAiLoading,
    aiModel, setAiModel,
    aiModels, setAiModels,
    aiStatus, setAiStatus,
    aiStatusLoading, setAiStatusLoading,
    aiMessagesEndRef,
    smartReplies, setSmartReplies,
    smartRepliesLoading, setSmartRepliesLoading,
    showPolishModal, setShowPolishModal,
    polishText, setPolishText,
    polishResult, setPolishResult,
    polishTone, setPolishTone,
    polishLoading, setPolishLoading,
    dailyDigest, setDailyDigest,
    dailyDigestLoading, setDailyDigestLoading,
    showDailyDigest, setShowDailyDigest,
    showImageGen, setShowImageGen,
    genPrompt, setGenPrompt,
    genStyle, setGenStyle,
    genResult, setGenResult,
    genLoading, setGenLoading,
    translatingMsg, setTranslatingMsg,
    translations, setTranslations,
    imageDesc, setImageDesc,
    descLoading, setDescLoading,
    aiSummary, setAiSummary,
    aiSummaryLoading, setAiSummaryLoading,
    sendAiMessage,
    fetchAiModels,
    fetchAiStatus,
    resetAiChat,
    handleAiKeyPress,
    fetchSmartReplies,
    polishMessage,
    applyPolish,
    fetchDailyDigest,
    summarizeChat,
    generateImage,
    shareGeneratedImage,
    translateMessage,
    describeImage,
  } = useAI({
    token,
    user,
    showToast,
    setBalance,
    currentRoomId,
    messages,
    socketRef,
    setNewMessage,
  });

  // ===== 面板功能 =====
  const {
    showMusicModal, setShowMusicModal,
    musicUrl, setMusicUrl,
    musicSearch, setMusicSearch,
    musicResults, setMusicResults,
    musicLoading, setMusicLoading,
    currentSong, setCurrentSong,
    isPlaying, setIsPlaying,
    showMusicPanel, setShowMusicPanel,
    musicLyric, setMusicLyric,
    audioRef,
    showGifPanel, setShowGifPanel,
    gifSearch, setGifSearch,
    gifResults, setGifResults,
    gifLoading, setGifLoading,
    showNewsPanel, setShowNewsPanel,
    newsStories, setNewsStories,
    newsLoading, setNewsLoading,
    dailyQuote, setDailyQuote,
    showEventModal, setShowEventModal,
    eventTitle, setEventTitle,
    eventTime, setEventTime,
    showWeatherPanel, setShowWeatherPanel,
    weatherCity, setWeatherCity,
    weatherData, setWeatherData,
    weatherLoading, setWeatherLoading,
    showMapPanel, setShowMapPanel,
    mapLoading, setMapLoading,
    showMapViewer, setShowMapViewer,
    mapSearch, setMapSearch,
    mapResults, setMapResults,
    bilibiliQuery, setBilibiliQuery,
    bilibiliResults, setBilibiliResults,
    bilibiliLoading, setBilibiliLoading,
    selectedBiliVideo, setSelectedBiliVideo,
    popularVideos, setPopularVideos,
    notifyEnabled, setNotifyEnabled,
    notifyMuted, setNotifyMuted,
    notifyRef,
    videoObserverRef,
    observeVideo,
    searchMusic, playSong, shareSongToChat, togglePlay,
    searchGif, sendGif,
    fetchNews, shareNews,
    fetchQuote,
    createEvent,
    enableNotifications,
    searchWeather, shareWeather,
    searchMap, getMyLocation, shareMap,
    fetchPopularVideos,
    searchBilibili, shareBilibiliToChat,
  } = usePanels({
    token,
    showToast,
    currentRoomId,
    socketRef,
  });

  // ===== 钱包与红包 =====
  const {
    showRechargeModal, setShowRechargeModal,
    rechargeAmount, setRechargeAmount,
    rechargePayCode, setRechargePayCode,
    rechargeHistory, setRechargeHistory,
    showAdminModal, setShowAdminModal,
    pendingRecharges, setPendingRecharges,
    adminDashboard, setAdminDashboard,
    adminDashboardLoading, setAdminDashboardLoading,
    redPackets, setRedPackets,
    showRedPacketModal, setShowRedPacketModal,
    redPacketAmount, setRedPacketAmount,
    redPacketCount, setRedPacketCount,
    redPacketMessage, setRedPacketMessage,
    fetchBalance,
    requestRecharge,
    fetchRechargeHistory,
    fetchPendingRecharges,
    confirmRecharge,
    rejectRecharge,
    fetchAdminDashboard,
    openAdminCenter,
    sendRedPacket,
    generateRedPacketDistribution,
    claimRedPacket,
  } = useWallet({
    token,
    user,
    showToast,
    balance,
    setBalance,
    currentRoomId,
    socketRef,
    fetchAiStatus,
  });

  // ===== 社交功能 =====
  const {
    moments, setMoments,
    showMoments, setShowMoments,
    newMoment, setNewMoment,
    polls, setPolls,
    showPollModal, setShowPollModal,
    pollQuestion, setPollQuestion,
    pollOptions, setPollOptions,
    pollAnonymous, setPollAnonymous,
    pollDeadline, setPollDeadline,
    pollOptionImages, setPollOptionImages,
    showSolitaireModal, setShowSolitaireModal,
    solitaireTitle, setSolitaireTitle,
    solitaireFormat, setSolitaireFormat,
    showSolitaireJoin, setShowSolitaireJoin,
    checkInData, setCheckInData,
    showCheckIn, setShowCheckIn,
    checkInNote, setCheckInNote,
    checkInNoteRef,
    gameResult, setGameResult,
    showGameModal, setShowGameModal,
    showBotModal, setShowBotModal,
    bots, setBots,
    botForm, setBotForm,
    showWrapped, setShowWrapped,
    wrappedData, setWrappedData,
    wrappedLoading, setWrappedLoading,
    messageStats, setMessageStats,
    publishMoment, likeMoment, commentMoment,
    createPoll, votePoll, addPollOption, removePollOption, updatePollOption,
    createEnhancedPoll,
    createSolitaire, joinSolitaire,
    doCheckIn, fetchCheckIns,
    fetchWrapped,
    fetchBots, createBot, deleteBot,
    exportChat, fetchStats,
  } = useSocial({
    token,
    showToast,
    currentRoomId,
    socketRef,
    setExportingChat,
  });

  // ===== 通话与位置 =====
  const {
    callState, setCallState,
    localVideoRef,
    sharedLocations, setSharedLocations,
    isSharingLocation, setIsSharingLocation,
    locationWatchId,
    startCall, acceptCall, hangUp, toggleMute,
    startSharingLocation, stopSharingLocation,
    openLocationMap,
  } = useCall({
    showToast,
    currentRoomId,
    socketRef,
    user,
    allUsers,
    peerRef,
  });

  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchRooms();
      fetchFriends();
      fetchFriendRequests();
      fetchUsers();
      fetchPopularVideos();
      fetchAiModels();
      fetchPhoneInfo();
    }
    return () => {
      // 清理位置共享
      if (locationWatchId.current) {
        navigator.geolocation?.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
      // 清理通话
      if (callState?.localStream) {
        try { callState.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
      }
      if (peerRef.current) {
        try { peerRef.current.close(); } catch(e) {}
      }
    };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (currentRoomId && socketRef.current) {
      try {
        const cached = JSON.parse(localStorage.getItem('msgCache_' + currentRoomId) || '[]');
        if (cached.length > 0) { setMessages(cached); setMessagesLoading(false); }
        else { setMessagesLoading(true); }
      } catch { setMessagesLoading(true); }
    }
  }, [currentRoomId]);

  useEffect(() => {
    changeTheme(themePreset);
  }, []);

  // 消息加载后滚动到底部
  useEffect(() => {
    if (!messagesLoading && messages.length > 0 && messageEndRef) {
      setTimeout(() => messageEndRef.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, messagesLoading, messageEndRef]);

  // OTA 版本检查：手机端登录不弹下载窗；仅大版本变化时展示一次更新说明。
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await axios.get(`${API_URL}/ota-version.json`, { timeout: 5000 });
        const info = res.data || {};
        setOtaInfo(info);
        const major = String(info.majorVersion || (info.appVersion || '').split('.')[0] || MAJOR_VERSION);
        const seenKey = `seenMajorUpdate:${major}`;
        if (info.showMajorUpdate && major !== localStorage.getItem(seenKey)) {
          setShowMajorUpdateModal(true);
        }
      } catch (e) { /* 离线忽略 */ }
    };
    if (isAuthenticated) checkUpdate();
  }, [isAuthenticated]);

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/rooms`, { headers: { Authorization: token } });
      setRooms(Array.isArray(response.data) ? response.data : []);
      setDiag(d => d + 'Rooms:' + (Array.isArray(response.data)?response.data.length:'err') + ' | ');
    } catch (err) { console.error('Failed to fetch rooms', err); setRooms([]); setDiag(d => d + 'Rooms:FAIL | '); }
  };


  // 编辑消息

  // 取消编辑

  // 置顶/取消置顶

  // 免打扰切换
  const toggleMuteRoom = (roomId) => {
    setMutedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
        showToast('已开启通知', 'success');
      } else {
        next.add(roomId);
        showToast('已开启免打扰', 'info');
      }
      return next;
    });
  };

  // 撤回消息

  // 删除消息

  // 插入表情



  // 图片压缩（Canvas 缩放，目标 < 1MB）






  // 获取手机号信息
  const fetchPhoneInfo = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/user/phone`, {
        headers: { Authorization: token }
      });
      setPhoneInfo(res.data);
    } catch (err) {
      console.error('获取手机号信息失败', err);
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    if (phoneSendingCode) return;
    if (!token) {
      showToast('请先登录', 'error');
      return;
    }
    if (!phoneInput || !/^1[3-9]\d{9}$/.test(phoneInput)) {
      showToast('请输入正确的11位手机号', 'error');
      return;
    }
    setPhoneSendingCode(true);
    try {
      const res = await axios.post(`${API_URL}/api/user/send-code`,
        { phone: phoneInput },
        { headers: { Authorization: token } }
      );
      setPhoneStep('code');
      // 开始倒计时
      setCodeCountdown(60);
      const timer = setInterval(() => {
        setCodeCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
      showToast('验证码已发送', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || '发送失败', 'error');
    } finally {
      setPhoneSendingCode(false);
    }
  };

  // 校验验证码并绑定
  const handleVerifyAndBind = async () => {
    if (!codeInput || codeInput.length !== 6) {
      showToast('请输入6位验证码', 'error');
      return;
    }
    setPhoneBinding(true);
    try {
      const res = await axios.post(`${API_URL}/api/user/verify-and-bind`,
        { phone: phoneInput, code: codeInput },
        { headers: { Authorization: token } }
      );
      setPhoneInfo({ ...phoneInfo, phone: res.data.phone, phoneBound: true, phoneBoundAt: res.data.phoneBoundAt });
      setPhoneStep('done');
      showToast('手机号绑定成功', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || '绑定失败', 'error');
    } finally {
      setPhoneBinding(false);
    }
  };

  // 解绑手机号
  const handleUnbindPhone = async () => {
    if (!window.confirm('确定要解绑手机号吗？')) return;
    try {
      await axios.post(`${API_URL}/api/user/unbind-phone`, {}, {
        headers: { Authorization: token }
      });
      setPhoneInfo({ phone: null, phoneBound: false, phoneBoundAt: null });
      setPhoneInput('');
      setCodeInput('');
      setPhoneStep('input');
      setCodeCountdown(0);
      showToast('手机号已解绑', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || '解绑失败', 'error');
    }
  };

  // 关闭手机号弹窗
  const closePhoneModal = () => {
    setShowPhoneModal(false);
    setPhoneInput('');
    setCodeInput('');
    setPhoneStep('input');
    setCodeCountdown(0);
  };

  const changeTheme = (preset) => {
    setThemePreset(preset);
    localStorage.setItem('themePreset', preset);
    const themes = {
      mint: { primary: '#42d6a4', primaryGrad: 'linear-gradient(135deg, #42d6a4 0%, #55c7f7 100%)' },
      green: { primary: '#07c160', primaryGrad: 'linear-gradient(135deg, #07c160, #10b981)' },
      blue: { primary: '#3b82f6', primaryGrad: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
      purple: { primary: '#8b5cf6', primaryGrad: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
      peach: { primary: '#ff8fb3', primaryGrad: 'linear-gradient(135deg, #ff8fb3, #ffd166)' },
      orange: { primary: '#f59e0b', primaryGrad: 'linear-gradient(135deg, #f59e0b, #f97316)' }
    };
    const t = themes[preset] || themes.mint;
    document.documentElement.style.setProperty('--primary', t.primary);
    document.documentElement.style.setProperty('--primary-gradient', t.primaryGrad);
  };
  // ===== 简易 markdown 渲染（粗体 + 代码块 + 换行）
  const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // 代码块 ```xxx```
      if (line.startsWith('```')) return null;
      // 处理粗体 **xxx** 和行内代码 `xxx`
      const parts = [];
      let rest = line;
      let key = 0;
      const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      let m;
      let last = 0;
      while ((m = regex.exec(rest)) !== null) {
        if (m.index > last) parts.push(rest.slice(last, m.index));
        const token = m[0];
        if (token.startsWith('**')) {
          parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('`')) {
          parts.push(<code key={key++} style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>{token.slice(1, -1)}</code>);
        }
        last = m.index + token.length;
      }
      if (last < rest.length) parts.push(rest.slice(last));
      return <div key={i} style={{ minHeight: line ? 1.4 : 0 }}>{parts.length ? parts : '\u00A0'}</div>;
    });
  };

  const showFriendPayCode = async (username) => {
    try {
      const response = await axios.get(`${API_URL}/api/users/${username}/paycode`, {
        headers: { Authorization: token }
      });
      if (response.data.payCode) {
        setSelectedFriendPayCode({ username, payCode: response.data.payCode });
        setShowPayCodeModal(true);
      } else {
        showToast('该好友未设置收款码', 'info');
      }
    } catch (err) {
      alert(err.response?.data?.error || '获取收款码失败');
    }
  };

  const updateProfile = async () => {
    try {
      const response = await axios.put(`${API_URL}/api/profile`, profileEdit, {
        headers: { Authorization: token }
      });
      setUser(response.data);
      showToast('资料已更新', 'success');
    } catch (err) {
      showToast('更新失败', 'error');
    }
  };

  // 设置聊天背景
  const setChatBackground = (bg) => {
    setChatBackgrounds(prev => ({ ...prev, [currentRoomId]: bg }));
  };

  // 引用回复

  // 取消引用


  // === 通讯录字母分组 ===
  const getContactsGrouped = () => {
    const groups = {};
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
    letters.forEach(l => groups[l] = []);
    
    (friends || []).forEach(f => {
      const firstChar = f.username.charAt(0).toUpperCase();
      const key = firstChar.match(/[A-Z]/) ? firstChar : '#';
      groups[key].push(f);
    });
    
    // 同时把好友请求也显示
    if (friendRequests.length > 0) {
      groups['邀请'] = friendRequests.map(r => ({ ...r, isRequest: true }));
    }
    
    return { groups, letters: letters.filter(l => groups[l]?.length > 0) };
  };

  // ===== 图片查看器工具 =====
  const openImageViewer = (url, urls) => {
    const index = urls?.indexOf(url) || 0;
    setImageViewer({ url, urls, index });
  };
  const imageViewerNav = (dir) => {
    setImageViewer(prev => {
      if (!prev?.urls?.length) return prev;
      const idx = ((prev.index || 0) + dir + prev.urls.length) % prev.urls.length;
      return { ...prev, url: prev.urls[idx], index: idx };
    });
  };
  const downloadImage = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop() || 'image';
    a.click();
  };

  // @提及

  // 获取已读人数文本

  // 获取@提及的用户列表

  // 获取过滤后的@用户列表

  // 开始录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        uploadFile(file);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      showToast('开始录音', 'info');
    } catch (err) {
      showToast('无法访问麦克风', 'error');
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    showToast('录音已发送', 'success');
  };

  // 取消录音
  const cancelRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    showToast('录音已取消', 'info');
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>聊天室</h1>
          <p className="auth-subtitle">清爽、轻快的即时聊天空间</p>
          <form className="auth-form" onSubmit={handleAuth}>
            <div className="input-group">
              <span className="input-icon"><I name="me" size={17} /></span>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <span className="input-icon"><I name="security" size={17} /></span>
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="auth-btn" type="submit">{authMode === 'login' ? '登录' : '注册'}</button>
            <div className="switch-auth">
              {authMode === 'login' ? (
                <>没有账号？<a onClick={() => setAuthMode('register')}>注册</a></>
              ) : (
                <>已有账号？<a onClick={() => setAuthMode('login')}>登录</a></>
              )}
            </div>
            {isCapacitor && (
              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                服务器：{SERVER_URL}
              </div>
            )}
            {authMode === 'login' && (
              <span className="forgot-pw-link" onClick={() => { setShowResetPw(true); setResetPwStep(0); setResetPwPhone(''); setResetPwCode(''); setResetPwNewPw(''); }}>
                忘记密码？
              </span>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${bottomTab !== 'chats' ? 'sidebar-hidden' : ''}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info sidebar-user" onClick={() => setShowProfileModal(true)}>
            <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" />
            <div className="sidebar-user-copy">
              <span className="sidebar-username">{user?.username}</span>
              <span className="sidebar-userid">ID: {user?.sixDigitId || '...'}</span>
            </div>
          </div>
           <div className="header-actions">
            <button className="icon-btn" onClick={handleLogout} title="退出登录"><I name="logout" size={17} /></button>
          </div>
        </div>
        
        {isCapacitor && diag && (
          <div className="diagnostic-bar">
            {diag}
          </div>
        )}
        {/* 简洁搜索框和聊天列表 */}
        <div className="search-box">
          <div className="search-wrapper">
            <span className="search-icon"><I name="search" size={16} /></span>
            <input
              type="text"
              placeholder="搜索聊天..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="room-list">
          <div className="room-list-header">
            {rooms?.filter(r => r.type !== 'private')?.length || 0} 个聊天
          </div>
          {(() => {
            const filteredRooms = rooms?.filter(r => r.type !== 'private')?.filter(room =>
              !searchQuery || room.name?.toLowerCase().includes(searchQuery.toLowerCase())
            ) || [];
            const pinnedList = filteredRooms.filter(r => pinnedChats.has(r.id));
            const unpinnedList = filteredRooms.filter(r => !pinnedChats.has(r.id));
            return (
              <>
                {pinnedList.length > 0 && <div className="pinned-divider"><I name="pin" size={14} /> 置顶聊天</div>}
                {pinnedList.map(room => (
                  <div key={room.id} className={`room-item pinned-chat ${currentRoomId === room.id ? 'active' : ''}`} onClick={() => handleRoomClick(room)}>
                    <RoomAvatar name={room.name} />
                    <div className="room-info">
                      <div className="room-name">{room.name}</div>
                      <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
                    </div>
                    <div className="room-side">
                      {room.lastMessage?.timestamp && <div className="room-time">{formatTime(room.lastMessage.timestamp)}</div>}
                      {unreadCounts[room.id] > 0 && currentRoomId !== room.id && <span className="unread-badge">{unreadCounts[room.id]}</span>}
                    </div>
                    <button className="room-pin-btn" onClick={(e) => togglePinChat(room.id, e)} title="取消置顶"><I name="pin" size={14} /></button>
                    {room.id !== 'global' && <button className="room-pin-btn danger" onClick={(e) => deleteChat(room.id, e)} title="删除聊天"><I name="delete" size={14} /></button>}
                  </div>
                ))}
                {unpinnedList.map(room => (
                  <div key={room.id} className={`room-item ${currentRoomId === room.id ? 'active' : ''}`} onClick={() => handleRoomClick(room)}>
                    <RoomAvatar name={room.name} />
                    <div className="room-info">
                      <div className="room-name">{room.name}</div>
                      <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
                    </div>
                    <div className="room-side">
                      {room.lastMessage?.timestamp && <div className="room-time">{formatTime(room.lastMessage.timestamp)}</div>}
                      {unreadCounts[room.id] > 0 && currentRoomId !== room.id && <span className="unread-badge">{unreadCounts[room.id]}</span>}
                    </div>
                    <button className="room-pin-btn" onClick={(e) => togglePinChat(room.id, e)} title="置顶聊天"><I name="pin" size={14} /></button>
                    {room.id !== 'global' && <button className="room-pin-btn danger" onClick={(e) => deleteChat(room.id, e)} title="删除聊天"><I name="delete" size={14} /></button>}
                  </div>
                ))}
              </>
            );
          })()}
          {(!rooms || rooms.filter(r => r.type !== 'private').length === 0) && (
            <EmptyState icon="chat" title="暂无聊天" desc="点击底部添加入口开始新的对话" />
          )}
        </div>
        <div className="sidebar-footer">
          <button className="sidebar-btn secondary" onClick={() => { setShowSearchModal(true); fetchFriendRequests(); }}>
            添加好友
          </button>
          <button className="sidebar-btn secondary" onClick={openFileTransfer}>
            文件传输
          </button>
        </div>
      </div>

      <div className={`main-chat ${bottomTab !== 'chats' && !currentRoom ? 'full-view' : ''}`}>
        {bottomTab === 'contacts' ? (
          /* ===== 通讯录页面 ===== */
          <div className="contacts-page">
            <div className="contacts-header">
              <h2>通讯录</h2>
              <span className="contacts-count">{friends.length} 位联系人</span>
            </div>
            <div className="contacts-search">
              <input type="text" placeholder="搜索联系人..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="contacts-body">
              {friendRequests.length > 0 && (
                <div className="contacts-section">
                  <div className="contacts-section-title">新的好友 <span className="badge">{friendRequests.length}</span></div>
                  {friendRequests.map(r => (
                    <div key={r.id} className="contact-item request-item">
                      <AvatarImg src={getAvatarUrl(r.avatar)} alt="" className="contact-avatar" />
                      <div className="contact-info">
                        <div className="contact-name">{r.username}</div>
                        <div className="contact-desc">想加你为好友</div>
                      </div>
                      <div className="contact-actions">
                        <button className="accept-btn" onClick={() => acceptFriendRequest(r.username)}>接受</button>
                        <button className="reject-btn" onClick={() => rejectFriendRequest(r.username)}>拒绝</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const { groups, letters } = getContactsGrouped();
                return letters.map(letter => (
                  <div key={letter} className="contacts-section" id={`contact-${letter}`}>
                    <div className="contacts-section-title">{letter}</div>
                    {groups[letter].map(friend => (
                      <div key={friend.id || friend.username} className="contact-item" onClick={() => { if (!friend.isRequest) startChatWithFriend(friend); }}>
                        <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" className="contact-avatar" />
                        <div className="contact-info">
                          <div className="contact-name">{friend.username}</div>
                          {!friend.isRequest && <div className="contact-desc">在线</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
            <div className="contacts-index">
              {(() => {
                const { letters } = getContactsGrouped();
                return letters.map(l => (
                  <span key={l} className="index-letter" onClick={() => {
                    setContactsLetter(l);
                    document.getElementById(`contact-${l}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}>{l}</span>
                ));
              })()}
            </div>
          </div>
        ) : bottomTab === 'discover' ? (
          /* ===== 发现页面 ===== */
          <div className="discover-page">
            <div className="discover-header"><h2>发现</h2></div>
            <div className="discover-list">
              <div className="discover-section-title">AI 工具</div>
              <FeatureItem icon="ai" tone="ai" title="AI 助手" desc="智能对话助手，支持多模型" onClick={() => { setView('ai'); setBottomTab('chats'); }} />
              <FeatureItem icon="palette" tone="image" title="AI 图片生成" desc="描述你想要的图片，一键生成并分享" onClick={() => setShowImageGen(true)} />
              <FeatureItem icon="digest" tone="digest" title="AI 每日摘要" desc="AI 总结你今天的聊天内容" onClick={fetchDailyDigest} />
              <FeatureItem icon="bot" tone="bot" title="聊天机器人" desc="创建自定义自动回复机器人" onClick={() => { setShowBotModal(true); fetchBots(); }} />

              <div className="discover-section-title">内容分享</div>
              <FeatureItem icon="bilibili" tone="bili" title="B站视频" desc="搜索和分享B站视频" onClick={() => { setView('video'); setBottomTab('chats'); }} />
              <FeatureItem icon="music" tone="music" title="网易云音乐" desc="搜歌、听歌、分享给好友" onClick={() => setShowMusicPanel(true)} />
              <FeatureItem icon="image" tone="gif" title="GIF 表情包" desc="搜索 GIF 发送到聊天" onClick={() => { setShowGifPanel(true); }} />
              <FeatureItem icon="digest" tone="news" title="今日热搜" desc="知乎日报精选内容" onClick={fetchNews} />

              <div className="discover-section-title">生活与社交</div>
              <FeatureItem icon="camera" tone="moments" title="朋友圈" desc="和朋友分享生活点滴" onClick={() => { setShowMoments(true); }} />
              <FeatureItem icon="game" tone="game" title="小游戏" desc="猜拳游戏" onClick={() => { setShowGameModal(true); }} />
              <FeatureItem icon="search" tone="weather" title="天气查询" desc="查询城市天气，分享到聊天" onClick={() => setShowWeatherPanel(true)} />
              <FeatureItem icon="location" tone="map" title="地图" desc="GPS定位、查看地图、分享位置" onClick={() => setShowMapPanel(true)} />

              <div className="discover-section-title">数据管理</div>
              <FeatureItem icon="stats" tone="stats" title="年度聊天报告" desc="查看你的聊天数据统计" loading={wrappedLoading ? '加载中...' : ''} onClick={fetchWrapped} />
              <FeatureItem icon="backup" tone="backup" title="聊天记录管理" desc="备份与恢复聊天记录" onClick={() => setShowBackupModal(true)} />
            </div>
          </div>
        ) : bottomTab === 'me' ? (
          /* ===== 我的页面 ===== */
          <div className="me-page">
            <div className="me-header" onClick={() => setShowProfileModal(true)}>
              <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" className="me-avatar" />
              <div className="me-info">
                <div className="me-name">{user?.username}</div>
                <div className="me-id">ID: {user?.sixDigitId || '000000'}</div>
                <div className="me-bio">{user?.bio || '这个人很懒，什么都没写'}</div>
              </div>
              <span className="me-arrow">›</span>
            </div>
            <div className="me-menu">
              <MeMenuItem icon="camera" tone="moments" label="朋友圈" onClick={() => { setShowMoments(true); }} />
              <MeMenuItem icon="wallet" tone="wallet" label="钱包" meta={`¥${(balance || 0).toFixed(2)}`} onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }} />
              <MeMenuItem icon="backup" tone="backup" label="聊天记录管理" onClick={() => setShowBackupModal(true)} />
              <MeMenuItem icon="phone" tone="phone" label={phoneInfo.phoneBound ? phoneInfo.phone : '绑定手机号'} onClick={() => { fetchPhoneInfo(); setShowPhoneModal(true); }} />
              <MeMenuItem icon="settings" tone="primary" label="设置" onClick={() => { setShowProfileModal(true); }} />
            </div>
            <div className="me-footer">
              <MeMenuItem icon="security" tone="security" label="聊天记录备份与恢复" onClick={() => setShowBackupModal(true)} />
            </div>
            <MeMenuItem icon="download" tone="download" label={`下载最新安装包 (v${otaInfo?.appVersion || appVersion})`} onClick={() => {
              const apkPath = otaInfo?.apkUrl || `/releases/ChatRoom-v${appVersion}.apk`;
              const u = apkPath.startsWith('http') ? apkPath : `${API_URL}${apkPath}`;
              isCapacitor ? window.location.href = u : window.open(u, '_blank');
            }} />
            <div className="me-version">
              <span>聊天室 v{otaInfo?.appVersion || appVersion} · Web {otaInfo?.webBuild || WEB_BUILD}</span>
            </div>
          </div>
        ) : view === 'ai' ? (
          /* ===== AI助手全屏视图 ===== */
          <div className="ai-fullview">
            <div className="ai-fullview-header">
              <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
              <h3><I name="ai" size={20} /> AI 助手</h3>
              <div className="ai-header-actions">
                <span className="ai-balance">余额: ¥{(balance || 0).toFixed(2)}</span>
                <button onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }} className="header-btn" title="充值"><I name="wallet" size={15} /></button>
                {user?.username === 'admin' && (
                  <button onClick={openAdminCenter} className="header-btn" title="管理"><I name="crown" size={15} /></button>
                )}
                <button onClick={resetAiChat} className="header-btn" title="新对话"><I name="reset" size={15} /></button>
              </div>
            </div>
            <div className="ai-model-selector">
              <label>模型</label>
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                {aiModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name} {m.free ? '免费' : '付费'}</option>
                ))}
              </select>
            </div>
            <div className="ai-messages">
              {aiMessages.length === 0 && (
                <EmptyState icon="ai" title="向 AI 助手提问吧" desc="支持多轮对话，连续上下文" />
              )}
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`ai-message ${msg.role}`}>
                  <div className="ai-avatar">{msg.role === 'user' ? <AvatarImg src={getAvatarUrl(user.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : <I name="ai" size={18} />}</div>
                  <div className="ai-bubble">
                    {msg.role === 'user' ? msg.content : (
                      <>
                        <div className="ai-content">{renderMarkdown(msg.content)}</div>
                        {(msg.provider || msg.hint) && (
                          <div className="ai-meta-line">
                            {msg.provider && <span>{msg.provider} · {msg.model}</span>}
                            {msg.hint && <span>{msg.hint}</span>}
                          </div>
                        )}
                        {msg.rechargeUrl && (
                          <a href={msg.rechargeUrl} target="_blank" rel="noopener noreferrer" className="recharge-link">前往充值</a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="ai-message assistant">
                  <div className="ai-avatar"><I name="ai" size={18} /></div>
                  <div className="ai-bubble"><div className="ai-typing"><span></span><span></span><span></span></div></div>
                </div>
              )}
              <div ref={aiMessagesEndRef} />
            </div>
            <div className="ai-input-area">
              <textarea className="ai-input" placeholder="输入问题，Enter发送，Shift+Enter换行" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={handleAiKeyPress} disabled={aiLoading} rows={2} />
              <button className="ai-send-button" onClick={sendAiMessage} disabled={!aiInput.trim() || aiLoading}>{aiLoading ? '思考中...' : '发送'}</button>
            </div>
          </div>
        ) : view === 'video' ? (
          /* ===== B站视频全屏视图 ===== */
          <div className="video-fullview">
            <div className="video-fullview-header">
              <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
              <h3><I name="bilibili" size={20} /> B站视频</h3>
            </div>
            <div className="panel-searchbar panel-bili-searchbar">
              <form onSubmit={searchBilibili}>
                <input type="text" placeholder="搜索B站视频..." value={bilibiliQuery} onChange={e => setBilibiliQuery(e.target.value)} />
                <button type="submit" disabled={bilibiliLoading}>{bilibiliLoading ? '搜索中' : '搜索'}</button>
              </form>
            </div>
            <div className="panel-scroll">
              {selectedBiliVideo ? (
                <div className="panel-detail">
                  <div className="panel-detail-head">
                    <button onClick={() => setSelectedBiliVideo(null)} className="panel-back">←</button>
                    <span>{selectedBiliVideo.title}</span>
                  </div>
                  <div className="bilibili-embed">
                    <iframe src={`https://player.bilibili.com/player.html?bvid=${selectedBiliVideo.bvid}`} title={selectedBiliVideo.title} allowFullScreen />
                  </div>
                  <div className="panel-meta">
                    <div>{selectedBiliVideo.author} · ▶ {selectedBiliVideo.play}次 · {selectedBiliVideo.duration}</div>
                  </div>
                  <button onClick={() => shareBilibiliToChat(selectedBiliVideo)} className="panel-primary-btn"><I name="forward" size={15} color="#fff" /> 分享到聊天</button>
                </div>
              ) : bilibiliResults.length > 0 ? (
                bilibiliResults.map((video, idx) => (
                  <div key={idx} onClick={() => setSelectedBiliVideo(video)} className="panel-list-item">
                    <img src={video.pic} alt={video.title} className="panel-thumb" />
                    <div className="panel-list-copy">
                      <div className="panel-list-title">{video.title}</div>
                      <div className="panel-list-sub">{video.author}</div>
                      <div className="panel-list-meta">▶ {video.play} · {video.duration}</div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState icon="bilibili" title={bilibiliLoading ? '搜索中...' : '输入关键词搜索B站视频'} />
              )}
            </div>
          </div>
        ) : currentRoom ? (
          <div className="chat-shell">
            <div className="chat-top-stack">
              <div className="chat-header">
                <div className="chat-header-main">
                  <button className="back-btn" onClick={() => { setCurrentRoom(null); setCurrentRoomId(null); setMessages([]); }} title="返回">
                    <I name="arrowLeft" size={20} />
                  </button>
                  <div className="chat-header-copy">
                    <h3>{currentRoom.name}</h3>
                    <div className="chat-header-meta">
                      <div className="online-badge">在线</div>
                      <span className="chat-header-hint">
                        {currentRoom?.members?.length > 1 ? `${currentRoom.members.length} 位成员` : '私密对话'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="header-tools">
                  <button className="ai-summary-btn-inline" onClick={summarizeChat} disabled={aiSummaryLoading} title="AI摘要">
                    {aiSummaryLoading ? '…' : <I name="ai" size={16} />}
                  </button>
                  <button onClick={() => setShowImageGen(true)} title="AI图片生成"><I name="image" size={15} /></button>
                  <button onClick={isSharingLocation ? stopSharingLocation : startSharingLocation} title={isSharingLocation ? '停止位置共享' : '共享位置'} className={isSharingLocation ? 'danger-active' : ''}>
                    <I name="location" size={15} />
                  </button>
                  <button onClick={() => { setShowCheckIn(true); fetchCheckIns(); }} title="打卡签到"><I name="checkin" size={15} /></button>
                  <button onClick={() => setShowMusicPanel(true)} title="听歌"><I name="music" size={15} /></button>
                  {!currentRoom?.type?.includes('group') && currentRoom?.members?.filter(m => m !== user?.username).length > 0 && (
                    <button onClick={() => {
                      const otherUser = allUsers.find(u => currentRoom.members.includes(u.username) && u.username !== user?.username);
                      if (otherUser) startCall(otherUser.id, 'video');
                    }} title="视频通话"><I name="video" size={15} /></button>
                  )}
                  <button onClick={() => setShowSearch(s => !s)} title="搜索消息">
                    {showSearch ? <I name="close" size={15} /> : <I name="search" size={15} />}
                  </button>
                  {currentRoom?.members?.length > 1 && (
                    <button onClick={() => setShowRoomManage(true)} title="群管理"><I name="settings" size={15} /></button>
                  )}
                </div>
              </div>
              {aiSummary && (
                <div className="summary-flash">
                  <div className="sflash-top">
                    <span className="sflash-title"><I name="ai" size={16} /> AI 聊天摘要</span>
                    <button className="sflash-close" onClick={() => setAiSummary(null)}><I name="close" size={16} /></button>
                  </div>
                  <div className="sflash-body">{aiSummary.text}</div>
                </div>
              )}
              {aiSummaryLoading && (
                <div className="summary-loading">
                  <div className="ai-typing"><span></span><span></span><span></span></div>
                  <span>AI 正在分析聊天记录...</span>
                </div>
              )}
              {showSearch && (
                <div className="message-search-bar">
                  <input
                    type="text"
                    placeholder="搜索聊天记录..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <span className="search-count">
                      {messages.filter(m => !m.recalled && m.content?.toLowerCase().includes(searchQuery.toLowerCase())).length} 条结果
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="chat-thread">
              <div className="messages-container">
              {messages.map((msg, index) => {
                const isSearchMatch = searchQuery && !msg.recalled && msg.content?.toLowerCase().includes(searchQuery.toLowerCase());
                const isPinned = pinnedMessages[currentRoomId]?.includes(msg.id);
                const isStarred = starredMessages.has(msg.id);
                const isMine = msg.sender?.username === user?.username;
                const readInfo = isMine ? getReadInfo(msg) : '';
                
                // 渲染引用回复
                const renderReply = (replyMsg) => {
                  if (!replyMsg) return null;
                  return (
                    <div className="reply-quote" onClick={() => {
                      const el = document.getElementById(`msg-${replyMsg.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>
                      <span className="reply-sender">{replyMsg.sender?.username}</span>
                      <span className="reply-text">{replyMsg.content?.slice(0, 50) || '[媒体消息]'}</span>
                    </div>
                  );
                };

                // 渲染@提及
                const renderMentions = (content) => {
                  if (!content) return content;
                  const parts = content.split(/(@\w+)/g);
                  return parts.map((part, i) => {
                    if (part.startsWith('@') && part.length > 1) {
                      const isMe = part === `@${user?.username}`;
                      return <span key={i} className={`mention ${isMe ? 'mention-me' : ''}`}>{part}</span>;
                    }
                    return isSearchMatch ? highlightText(part, searchQuery) : part;
                  });
                };

                const contentToRender = msg.recalled ? null : (
                  <>
                    {msg.replyTo && renderReply(messages.find(m => m.id === msg.replyTo))}
                    {msg.type === 'text' && (
                      <div className="message-text">
                        {renderMentions(msg.content)}
                        {msg.edited && <span className="edited-tag">（已编辑）</span>}
                      </div>
                    )}
                    {/* AI 翻译结果 */}
                    {translations[msg.id] && (
                      <div className="translation-text" style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 0', borderTop: '1px dashed var(--border)' }}>
                        {translations[msg.id]}
                      </div>
                    )}
                    {msg.type === 'image' && (
                      <div style={{ position: 'relative' }}>
                        <img className="media" src={msg.fileUrl} alt="" onClick={() => openImageViewer(msg.fileUrl, messages.filter(m => m.type === 'image').map(m => m.fileUrl))} />
                        <button onClick={() => describeImage(msg.id, msg.fileUrl)} disabled={descLoading === msg.id}
                          style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
                          {descLoading === msg.id ? '…' : imageDesc[msg.id] ? imageDesc[msg.id] : 'AI 识图'}
                        </button>
                      </div>
                    )}
                    {msg.type === 'video' && (
                      <video className="media" ref={observeVideo} src={msg.fileUrl} controls preload="none"
                        onClick={() => window.open(msg.fileUrl)} />
                    )}
                    {msg.type === 'audio' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                        <span style={{ fontSize: 24 }}><I name="music" size={20} /></span>
                        <audio src={msg.fileUrl} controls style={{ flex: 1, maxWidth: 250, height: 36 }} />
                      </div>
                    )}
                    {msg.type === 'file' && (
                      <a href={msg.fileUrl} download={msg.filename} className="file-attachment">
                        <div className="file-icon">{getFileIcon(msg.mimeType, msg.filename)}</div>
                        <div className="file-info">
                          <div className="file-name">{msg.filename || '未命名文件'}</div>
                          <div className="file-meta">
                            {msg.mimeType && <span>{msg.mimeType.split('/')[1]?.toUpperCase() || msg.mimeType}</span>}
                            {msg.fileSize && <span>{formatFileSize(msg.fileSize)}</span>}
                          </div>
                        </div>
                        <div className="file-download">下载</div>
                      </a>
                    )}
                    {msg.type === 'music' && (
                      <div className="music-message">
                        <span className="music-icon"><I name="music" size={20} /></span>
                        <a href={msg.content} target="_blank" rel="noopener noreferrer">点击播放音乐</a>
                      </div>
                    )}
                    {msg.type === 'redPacket' && (
                      <div className="red-packet-message" onClick={() => claimRedPacket(msg.id)}>
                        <div className="red-packet-icon"><I name="gift" size={20} /></div>
                        <div className="red-packet-info">
                          <div className="red-packet-title">{msg.message}</div>
                          <div className="red-packet-detail">
                            {msg.remaining > 0 ? `还剩${msg.remaining}个红包` : '红包已被领完'}
                          </div>
                          {msg.claimed && msg.claimed.includes(user?.id) && (
                            <div className="claimed-badge">已领取</div>
                          )}
                        </div>
                      </div>
                    )}
                    {msg.type === 'poll' && (
                      <div className="poll-message">
                        <div className="poll-title">{msg.question}</div>
                        {msg.anonymous && <div className="poll-anon-badge">匿名投票</div>}
                        {msg.deadline && <div className="poll-deadline">截止: {new Date(msg.deadline).toLocaleString()}</div>}
                        {(msg.options || []).map((opt, i) => {
                          const totalVotes = msg.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                          const voteCount = opt.votes?.length || 0;
                          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                          const hasVoted = msg.options.some(o => o.votes?.includes(user?.id));
                          return (
                            <div key={i} className="poll-option" onClick={() => !hasVoted && votePoll(msg.id, i)}>
                              <div className="poll-option-text">{opt.text}</div>
                              {hasVoted && (
                                <>
                                  <div className="poll-bar">
                                    <div className="poll-fill" style={{ width: `${percentage}%` }} />
                                  </div>
                                  <div className="poll-percentage">{percentage}% ({voteCount}票)</div>
                                </>
                              )}
                            </div>
                          );
                        })}
                        <div className="poll-footer">共 {msg.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)} 人参与投票</div>
                      </div>
                    )}
                    {msg.type === 'dice' && (
                      <div className="dice-message">
                        <span className="dice-icon"><I name="dice" size={24} /></span>
                        <span className="dice-value">{msg.value} 点</span>
                      </div>
                    )}
                    {msg.type === 'rockPaperScissors' && (
                      <div className="game-message">
                        <div className="game-result">
                          <div>你的选择: {msg.userChoice}</div>
                          <div>对手选择: {msg.botChoice}</div>
                          <div className={`game-result-text ${msg.result === '你赢了' ? 'win' : msg.result === '你输了' ? 'lose' : 'draw'}`}>
                            {msg.result}
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.type === 'announcement' && (
                      <div className="announcement-message">{msg.content}</div>
                    )}
                    {msg.type === 'solitaire' && (
                      <div className="solitaire-card">
                        <div className="solitaire-top">
                          <span className="solitaire-emoji"><I name="solitaire" size={18} /></span>
                          <div>
                            <div className="solitaire-name">{msg.title}</div>
                            <div className="solitaire-hint">{msg.format || '{序号}. {内容}'}</div>
                          </div>
                        </div>
                        {msg.participants && msg.participants.length > 0 && (
                          <div className="solitaire-list">
                            {msg.participants.map((p, i) => (
                              <div key={i} className="solitaire-entry">
                                <span className="solitaire-num">{p.index}</span>
                                <span style={{ fontWeight: 600, fontSize: 12 }}>{p.username}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{p.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {!msg.participants?.find(p => p.userId === user?.id) ? (
                          <button className="solitaire-join" onClick={() => {
                            const content = prompt('请输入你的接龙内容：');
                            if (content) joinSolitaire(msg.id, content);
                          }}>+ 参与接龙</button>
                        ) : (
                          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                            已参与（{(msg.participants || []).length}人）
                          </div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const bvid = parseBilibiliUrl(msg.content);
                      if (!bvid) return null;
                      return (
                        <div className="bilibili-embed" ref={observeVideo}>
                          <iframe src={`https://player.bilibili.com/player.html?bvid=${bvid}`} title="Bilibili video" allowFullScreen />
                        </div>
                      );
                    })()}
                  </>
                );
                return (
                <div key={msg.id || index} id={`msg-${msg.id}`} className={`message ${isMine ? 'sent' : 'received'} ${isSearchMatch ? 'highlighted' : ''} ${isPinned ? 'pinned' : ''}`}>
                  <AvatarImg className="avatar" src={getAvatarUrl(msg.sender?.avatar || user?.avatar)} alt="" />
                  <div className="message-content">
                    {isPinned && <div className="pinned-badge"><I name="pin" size={12} /> 置顶</div>}
                    {msg.sender?.username !== user?.username && !msg.recalled && (
                      <div className="sender-name">{msg.sender?.username}</div>
                    )}
                    {msg.forwardedFrom && !msg.recalled && (
                      <div className="forwarded-badge"><I name="forward" size={12} /> 转发自 {msg.forwardedFrom}</div>
                    )}
                    <div className={`bubble ${msg.recalled ? 'recalled' : ''}`}>
                      {msg.recalled ? (
                        <span className="recalled-text"><I name="reset" size={12} /> 此消息已被撤回</span>
                      ) : contentToRender}
                    </div>
                    {!msg.recalled && (
                      <>
                        {/* 消息反应显示 */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="reaction-bar">
                            {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                              <span
                                key={emoji}
                                className={`reaction-tag ${(userIds || []).includes(user?.id) ? 'me' : ''}`}
                                onClick={() => toggleReaction(msg.id, emoji)}
                              >
                                {emoji} <span className="rcount">{(userIds || []).length}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="message-actions">
                          {isMine && (
                            <>
                              <button onClick={() => recallMessage(msg.id)} title="撤回消息"><I name="reset" size={15} /></button>
                              <button onClick={() => startEditMessage(msg)} title="编辑消息"><I name="edit" size={15} /></button>
                              <button onClick={() => deleteMessage(msg.id)} title="删除消息"><I name="delete" size={15} /></button>
                            </>
                          )}
                          {!isMine && currentRoom?.createdBy === user?.username && (
                            <button onClick={() => deleteMessage(msg.id)} title="删除消息"><I name="delete" size={15} /></button>
                          )}
                          <button onClick={(e) => openReactionPicker(msg.id, e)} title="表情回应"><I name="reaction" size={15} /></button>
                          <button onClick={() => startReply(msg)} title="引用回复"><I name="reply" size={15} /></button>
                          <button onClick={() => openForwardModal(msg)} title="转发"><I name="forward" size={15} /></button>
                          <button onClick={() => toggleStarMessage(msg.id)} title={isStarred ? '取消收藏' : '收藏'}>
                            <I name="star" size={15} color={isStarred ? 'var(--warning)' : undefined} />
                          </button>
                          <button onClick={() => togglePinMessage(msg.id)} title={isPinned ? '取消置顶' : '置顶'}>
                            <I name="pin" size={15} color={isPinned ? 'var(--primary)' : undefined} />
                          </button>
                        </div>
                      </>
                    )}
                    <div className="message-footer">
                      <div className="time">{formatTime(msg.timestamp)}</div>
                      {readInfo && <div className="read-info">{readInfo}</div>}
                    </div>
                    {/* 翻译按钮 */}
                    {!isMine && msg.type === 'text' && msg.content && !msg.recalled && (
                      <span className="translate-badge" onClick={() => translateMessage(msg.id, msg.content)}>
                        {translatingMsg === msg.id ? '…' : translations[msg.id] ? '原文' : <><I name="translate" size={13} /> 翻译</>}
                      </span>
                    )}
                    {translations[msg.id] && (
                      <div className="translated-text">{translations[msg.id]}</div>
                    )}
                    {/* 位置消息 */}
                    {msg.type === 'location' && (
                      <div className="location-bubble" onClick={() => openLocationMap(msg.lat, msg.lng)}>
                        <div className="loc-header"><span className="loc-icon"><I name="location" size={14} /></span><span className="loc-user">{msg.sender?.username}</span></div>
                        <div className="loc-coords">{msg.lat?.toFixed(4)}, {msg.lng?.toFixed(4)}</div>
                        <div className="location-map-preview"><I name="location" size={24} /></div>
                      </div>
                    )}
                    {/* 打卡消息 */}
                    {msg.type === 'checkIn' && (
                      <div className="checkin-card">
                        <div className="checkin-day">✅ {new Date(msg.timestamp).toLocaleDateString('zh-CN')}</div>
                        <div className="checkin-count">{msg.sender?.username} 打卡{msg.note ? `：${msg.note}` : ''}</div>
                      </div>
                    )}
                    {/* 已读回执头像 */}
                    {isMine && msg.readBy && msg.readBy.length > 1 && (
                      <div className="read-avatars-row">
                        {msg.readBy.slice(0, 5).filter(uid => uid !== user?.id).map(uid => {
                          const u = allUsers.find(x => x.id === uid);
                          return u ? <AvatarImg key={uid} className="read-avatar-mini" src={getAvatarUrl(u.avatar)} alt="" title={u.username} /> : null;
                        })}
                        {msg.readBy.length - 1 > 5 && <span className="read-more-hint">+{msg.readBy.length - 6}</span>}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
              {typingUser && <div className="typing-indicator">{typingUser} 正在输入...</div>}
              {/* 反应选择器 */}
              {reactionPicker && (
                <div className="reaction-picker-popup" style={{ position: 'fixed', top: reactionPicker.y, left: reactionPicker.x, zIndex: 1000 }}>
                  {REACTION_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => toggleReaction(reactionPicker.messageId, emoji)}>{emoji}</button>
                  ))}
                  <button onClick={() => setReactionPicker(null)} style={{ fontSize: 14 }}><I name="close" size={14} /></button>
                </div>
              )}
                <div ref={setMessageEndRef} />
              </div>
            </div>
            <div className="chat-input-area">
              <div className="chat-input-stack">
                {roomAnnouncements[currentRoomId] && (
                  <div className="room-announcement">{roomAnnouncements[currentRoomId]}</div>
                )}
                {replyToMessage && (
                  <div className="reply-preview">
                    <span>回复 {replyToMessage.sender?.username}：</span>
                    <span className="reply-content">{replyToMessage.content?.slice(0, 50) || '[媒体消息]'}</span>
                    <button className="cancel-reply" onClick={cancelReply}><I name="close" size={14} /></button>
                  </div>
                )}
                {editingMessage && (
                  <div className="edit-preview">
                    <span><I name="edit" size={13} /> 编辑消息中...</span>
                    <button className="cancel-edit" onClick={cancelEdit}><I name="close" size={14} /></button>
                  </div>
                )}
                <div className="chat-input-wrapper">
                  <div className="chat-input-toolbar">
                    <div className="chat-input-actions">
                      <button onClick={() => fileInputRef.current?.click()} title="发送文件"><I name="attach" size={17} /></button>
                      <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? '停止录音' : '语音消息'} className={isRecording ? 'recording' : ''}>
                        {isRecording ? <I name="stop" size={17} color="var(--danger)" /> : <I name="mic" size={17} />}
                      </button>
                      <button onClick={() => setShowEmojiPicker(s => !s)} title="表情" className={showEmojiPicker ? 'active' : ''}><I name="emoji" size={17} /></button>
                      <button onClick={() => setShowMentionPicker(s => !s)} title="@提及" className={showMentionPicker ? 'active' : ''}>@</button>
                      <button onClick={() => setShowQuickReplies(s => !s)} title="快捷回复"><I name="quick" size={17} /></button>
                      <button onClick={sendDice} title="骰子"><I name="dice" size={17} /></button>
                      <button onClick={() => setShowGameModal(true)} title="猜拳"><I name="hand" size={17} /></button>
                      <button onClick={() => setShowRedPacketModal(true)} title="红包"><I name="gift" size={17} /></button>
                      <button onClick={() => setShowPollModal(true)} title="投票"><I name="vote" size={17} /></button>
                      <button onClick={() => setShowSolitaireModal(true)} title="群接龙"><I name="solitaire" size={17} /></button>
                      <button onClick={() => setShowMusicModal(true)} title="音乐"><I name="music" size={17} /></button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="*/*"
                        onChange={handleFileSelect}
                      />
                    </div>
                    <div className="chat-compose-tools">
                      <button
                        className="action-btn small"
                        onClick={fetchSmartReplies}
                        disabled={smartRepliesLoading || !currentRoomId}
                        title="AI智能回复建议"
                      >{smartRepliesLoading ? '…' : <I name="smart" size={16} />}</button>
                      <button
                        className="action-btn small"
                        onClick={() => { setPolishText(newMessage); setPolishResult(''); setShowPolishModal(true); }}
                        disabled={!newMessage.trim()}
                        title="AI润色文字"
                      ><I name="polish" size={16} /></button>
                    </div>
                  </div>
                  {isRecording && (
                    <div className="recording-indicator">
                      <span className="recording-dot" />
                      <span>录音中 {formatRecordingTime(recordingTime)}</span>
                      <button onClick={cancelRecording} className="cancel-recording">取消</button>
                    </div>
                  )}
                  {showEmojiPicker && (
                    <div className="emoji-picker">
                      {EMOJIS.map((emoji, i) => (
                        <button key={i} className="emoji-item" onClick={() => insertEmoji(emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {showMentionPicker && (
                    <div className="mention-picker">
                      <input
                        type="text"
                        className="mention-search-input"
                        placeholder="搜索用户..."
                        value={mentionFilter}
                        onChange={e => setMentionFilter(e.target.value)}
                        autoFocus
                      />
                      <div className="mention-list">
                        {getFilteredMentionUsers().map(u => (
                          <button key={u.id} className="mention-item" onClick={() => insertMention(u.username)}>
                            <AvatarImg src={getAvatarUrl(u.avatar)} alt="" className="mention-avatar" />
                            <span>{u.username}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {showQuickReplies && (
                    <div className="quick-replies-panel">
                      {quickReplies.map((reply, i) => (
                        <button key={i} className="quick-reply-item" onClick={() => insertQuickReply(reply)}>
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                  {smartReplies.length > 0 && (
                    <div className="smart-replies-bar">
                      <span className="smart-replies-label">AI建议：</span>
                      {smartReplies.map((reply, i) => (
                        <button key={i} className="smart-reply-btn" onClick={() => { setNewMessage(reply); setSmartReplies([]); }}>
                          {reply}
                        </button>
                      ))}
                      <button className="smart-reply-close" onClick={() => setSmartReplies([])}><I name="close" size={14} /></button>
                    </div>
                  )}
                  <div className="chat-compose-row">
                    <textarea
                      className="chat-input"
                      placeholder="输入消息... 输入 @ 提及用户"
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                    />
                    <button className="send-button" onClick={sendMessage} disabled={!newMessage.trim() && !editingMessage}>
                      {editingMessage ? '保存' : '发送'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : bottomTab === 'chats' ? (
          <>
            <div className="page-empty-shell chat-empty-desktop">
              <EmptyState icon="chat" title="选择一个聊天室开始对话" desc="从左侧聊天列表中进入一个聊天室，或新建对话" />
            </div>
            <div className="mobile-room-list">
              <div className="search-box">
                <div className="search-wrapper">
                  <span className="search-icon"><I name="search" size={16} /></span>
                  <input type="text" placeholder="搜索聊天..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
              </div>
              <div className="room-list room-list-mobile">
                <div className="room-list-header">
                  {rooms?.filter(r => r.type !== 'private')?.length || 0} 个聊天
                </div>
                {(() => {
                  const filtered = rooms?.filter(r => r.type !== 'private')?.filter(room =>
                    !searchQuery || room.name?.toLowerCase().includes(searchQuery.toLowerCase())
                  ) || [];
                  const pinned = filtered.filter(r => pinnedChats.has(r.id));
                  const unpinned = filtered.filter(r => !pinnedChats.has(r.id));
                  return (
                    <>
                      {pinned.length > 0 && <div className="pinned-divider"><I name="pin" size={14} /> 置顶聊天</div>}
                      {[...pinned, ...unpinned].map(room => {
                        const isPinned = pinnedChats.has(room.id);
                        return (
                          <div key={room.id} className={`room-item ${isPinned ? 'pinned-chat' : ''} ${currentRoomId === room.id ? 'active' : ''}`} onClick={() => handleRoomClick(room)}>
                            <RoomAvatar name={room.name} size="lg" />
                            <div className="room-info">
                              <div className="room-name">{room.name}</div>
                              <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
                            </div>
                            <div className="room-side">
                              {room.lastMessage?.timestamp && <div className="room-time">{formatTime(room.lastMessage.timestamp)}</div>}
                              {unreadCounts[room.id] > 0 && currentRoomId !== room.id && <span className="unread-badge">{unreadCounts[room.id]}</span>}
                            </div>
                            {room.id !== 'global' && <button className="room-pin-btn danger" onClick={(e) => deleteChat(room.id, e)} title="删除聊天"><I name="delete" size={14} /></button>}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                {(!rooms || rooms.filter(r => r.type !== 'private').length === 0) && (
                  <EmptyState icon="chat" title="暂无聊天" desc="点击添加好友开始新的对话" />
                )}
              </div>
            </div>
          </>
        ) : bottomTab !== 'chats' ? (
          <div className="page-empty-shell">
            <EmptyState icon="chat" title="请选择一个功能" desc="使用底部导航进入通讯录、发现或我的页面" />
          </div>
        ) : (
          <div className="page-empty-shell">
            <EmptyState icon="chat" title="选择一个聊天室开始对话" desc="从左侧聊天列表中进入一个聊天室，或新建对话" />
          </div>
        )}
      </div>

      {showPhoneModal && (
        <div className="modal-overlay" onClick={closePhoneModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
            {phoneInfo.phoneBound ? (
              /* 已绑定 → 显示信息 + 解绑 */
              <>
                <h3><I name="phone" size={20} /> 手机号</h3>
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>{phoneInfo.phone}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    绑定时间：{phoneInfo.phoneBoundAt ? new Date(phoneInfo.phoneBoundAt).toLocaleString() : ''}
                  </div>
                </div>
                <div className="modal-buttons">
                  <button className="cancel" onClick={closePhoneModal}>关闭</button>
                  <button className="danger" onClick={handleUnbindPhone}>解绑</button>
                </div>
              </>
            ) : phoneStep === 'done' ? (
              /* 绑定成功 */
              <>
                <h3><I name="checkin" size={20} /> 绑定成功</h3>
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: 'var(--primary)' }}>{phoneInfo.phone}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>手机号绑定成功</div>
                </div>
                <div className="modal-buttons">
                  <button className="confirm" onClick={closePhoneModal}>完成</button>
                </div>
              </>
            ) : phoneStep === 'code' ? (
              /* 第二步：输入验证码 */
              <>
                <h3><I name="phone" size={20} /> 输入验证码</h3>
                <div style={{ padding: '10px 0 5px' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    验证码已发送至 <strong>{phoneInput.slice(0,3) + '****' + phoneInput.slice(7)}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} style={{
                        width: 44, height: 54, borderRadius: 8, border: '2px solid ' + (codeInput.length > i ? 'var(--primary)' : 'var(--border)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, fontWeight: 'bold', background: '#f5f5f5', transition: 'border 0.2s'
                      }}>
                        {codeInput[i] || ''}
                      </div>
                    ))}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength="6"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    style={{ width: '100%', padding: '12px 16px', fontSize: 20, letterSpacing: 8, textAlign: 'center',
                      border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                    placeholder="请输入验证码"
                  />
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    {codeCountdown > 0 ? (
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{codeCountdown}s 后重新获取</span>
                    ) : (
                      <button onClick={handleSendCode} disabled={phoneSendingCode} style={{
                        background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13
                      }}>重新获取验证码</button>
                    )}
                  </div>
                </div>
                <div className="modal-buttons">
                  <button className="cancel" onClick={closePhoneModal}>取消</button>
                  <button className="confirm" onClick={handleVerifyAndBind} disabled={phoneBinding || codeInput.length !== 6}>
                    {phoneBinding ? '验证中...' : '确认绑定'}
                  </button>
                </div>
              </>
            ) : (
              /* 第一步：输入手机号 */
              <>
                <h3><I name="phone" size={20} /> 绑定手机号</h3>
                <div style={{ padding: '20px 0' }}>
                  <input
                    type="tel"
                    placeholder="请输入手机号"
                    maxLength="11"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                    style={{ width: '100%', padding: '12px 16px', fontSize: 16, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>绑定后可用于账号找回和安全验证</div>
                </div>
                <div className="modal-buttons">
                  <button className="cancel" onClick={closePhoneModal}>取消</button>
                  <button className="confirm" onClick={handleSendCode} disabled={phoneSendingCode || !/^1[3-9]\d{9}$/.test(phoneInput)}>
                    {phoneSendingCode ? '发送中...' : '获取验证码'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <h3>个人资料</h3>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <button 
                  onClick={() => avatarInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--primary-color)', color: 'white', cursor: 'pointer', fontSize: 16 }}
                >
                  <I name="image" size={24} />
                </button>
                <input 
                  type="file" 
                  ref={avatarInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      uploadAvatar(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>我的ID</label>
              <div style={{ padding: '10px 12px', background: 'var(--bg-color)', borderRadius: 8, fontSize: 18, fontWeight: 'bold', textAlign: 'center', letterSpacing: 2 }}>
                {user?.sixDigitId}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>分享ID给好友，让他们搜索添加你</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>用户名</label>
              <div style={{ padding: '10px 12px', background: 'var(--bg-color)', borderRadius: 8 }}>{user?.username}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>个人签名</label>
              <textarea
                value={profileEdit.bio}
                onChange={(e) => setProfileEdit({ ...profileEdit, bio: e.target.value })}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit' }}
                rows={3}
                placeholder="编辑个人签名..."
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>微信收款码</label>
              <textarea
                value={profileEdit.payCode}
                onChange={(e) => setProfileEdit({ ...profileEdit, payCode: e.target.value })}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit' }}
                rows={2}
                placeholder="填写微信收款链接或收款码内容..."
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                在微信中生成收款码，复制链接或截图内容填入此处
              </div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowProfileModal(false)}>关闭</button>
              <button className="confirm" onClick={updateProfile}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showPayCodeModal && selectedFriendPayCode && (
        <div className="modal-overlay" onClick={() => { setShowPayCodeModal(false); setSelectedFriendPayCode(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><I name="wallet" size={20} /> {selectedFriendPayCode.username} 的收款码</h3>
            <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selectedFriendPayCode.payCode}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              复制以上内容，在微信中打开即可转账给该好友
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowPayCodeModal(false); setSelectedFriendPayCode(null); }}>关闭</button>
              <button 
                className="confirm" 
                onClick={() => {
                  navigator.clipboard.writeText(selectedFriendPayCode.payCode);
                  showToast('已复制', 'success');
                }}
              >
                复制收款码
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 充值弹窗 */}
      {showRechargeModal && (
        <div className="modal-overlay" onClick={() => { setShowRechargeModal(false); setRechargePayCode(null); setRechargeAmount(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <h3><I name="wallet" size={20} /> 充值余额</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>充值金额（元）</label>
              <input
                type="number"
                placeholder="输入充值金额，最少1元"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                min="1"
                step="1"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 4 }}
              />
            </div>
            
            {!rechargePayCode && (
              <button 
                className="confirm" 
                onClick={requestRecharge}
                style={{ width: '100%', marginBottom: 12 }}
              >
                提交充值请求
              </button>
            )}
            
            {rechargePayCode && (
              <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
                  充值金额: ¥{rechargePayCode.amount}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  请使用微信扫描以下收款码转账：
                </div>
                <img 
                  src={rechargePayCode.payCode} 
                  alt="微信收款码" 
                  style={{ width: 200, height: 200, borderRadius: 8 }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
                  ⏳ 转账后等待管理员确认，确认后余额自动增加
                </div>
              </div>
            )}
            
            {rechargeHistory.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>充值记录</div>
                <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                  {rechargeHistory.slice(0, 5).map(r => (
                    <div key={r.id} style={{ padding: 8, background: 'var(--bg-color)', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>¥{r.amount}</span>
                        <span style={{ color: r.status === 'confirmed' ? '#07c160' : r.status === 'rejected' ? '#fa5151' : '#888' }}>
                          {r.status === 'confirmed' ? '已确认' : r.status === 'rejected' ? '已拒绝' : '待确认'}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowRechargeModal(false); setRechargePayCode(null); setRechargeAmount(''); }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员确认充值弹窗 */}
      {showAdminModal && (
        <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
          <div className="modal admin-center-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="crown" size={20} /> 管理中心</h3>
            <div className="admin-section-head">
              <span>运营概览</span>
              <button className="mini-text-btn" onClick={fetchAdminDashboard} disabled={adminDashboardLoading}>
                {adminDashboardLoading ? '刷新中' : '刷新'}
              </button>
            </div>
            <div className="admin-metric-grid">
              {[
                ['用户', adminDashboard?.stats?.users ?? '-'],
                ['在线', adminDashboard?.stats?.onlineUsers ?? '-'],
                ['房间', adminDashboard?.stats?.rooms ?? '-'],
                ['今日消息', adminDashboard?.stats?.todayMessages ?? '-'],
                ['待充值', adminDashboard?.stats?.pendingRecharges ?? '-'],
                ['今日充值', `¥${(adminDashboard?.stats?.todayRechargeAmount || 0).toFixed(2)}`]
              ].map(([label, value]) => (
                <div key={label} className="admin-metric">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="admin-section-head">
              <span>AI 稳定性中心</span>
              <button className="mini-text-btn" onClick={fetchAiStatus} disabled={aiStatusLoading}>
                {aiStatusLoading ? '检测中' : '刷新'}
              </button>
            </div>
            <div className="ai-status-grid">
              {(aiStatus?.providers || []).map(p => (
                <div key={p.id} className={`ai-status-card ${p.configured ? 'configured' : 'missing'} ${p.ok === false ? 'failed' : ''}`}>
                  <div className="ai-status-top">
                    <span>{p.name}</span>
                    <span className="ai-status-dot" />
                  </div>
                  <div className="ai-status-desc">
                    {!p.configured ? '未配置 Key' : p.ok === false ? (p.detail || '最近调用失败') : p.ok === true ? '最近调用正常' : '已配置，等待调用检测'}
                  </div>
                  {p.checkedAt && <div className="ai-status-time">{new Date(p.checkedAt).toLocaleTimeString()}</div>}
                </div>
              ))}
              {!aiStatus && (
                <div className="ai-status-empty">点击刷新查看 AI 通道状态</div>
              )}
            </div>
            <div className="admin-section-head">
              <span>待确认充值</span>
              <button className="mini-text-btn" onClick={fetchPendingRecharges}>刷新</button>
            </div>
            {pendingRecharges.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                暂无待确认的充值请求
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {pendingRecharges.map(r => (
                  <div key={r.id} style={{ padding: 12, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{r.username}</div>
                        <div style={{ fontSize: 18, color: '#07c160' }}>¥{r.amount}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.createdAt).toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          onClick={() => confirmRecharge(r.id)}
                          style={{ padding: '6px 12px', fontSize: 12, background: '#07c160', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                          确认
                        </button>
                        <button 
                          onClick={() => rejectRecharge(r.id)}
                          style={{ padding: '6px 12px', fontSize: 12, background: '#fa5151', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                          拒绝
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="admin-section-head">
              <span>最近审计</span>
            </div>
            <div className="audit-list">
              {(adminDashboard?.audit || []).length === 0 ? (
                <div className="ai-status-empty">暂无审计记录</div>
              ) : adminDashboard.audit.map(item => (
                <div key={item.id} className="audit-item">
                  <span>{item.action}</span>
                  <strong>{item.actor}</strong>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowAdminModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showRoomManage && currentRoom && (
        <div className="modal-overlay" onClick={() => setShowRoomManage(false)}>
          <div className="modal room-manage-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="settings" size={20} /> 聊天管理</h3>
            <div className="room-manage-summary">
              <RoomAvatar name={currentRoom.name} size="lg" />
              <div>
                <strong>{currentRoom.name}</strong>
                <span>{currentRoom.members?.length || 0} 位成员</span>
              </div>
            </div>
            <div className="admin-section-head">
              <span>群公告</span>
              {isRoomOwner() && <button className="mini-text-btn" onClick={setAnnouncement}>编辑</button>}
            </div>
            <div className="room-announcement-box">
              {roomAnnouncements[currentRoomId] || '暂无公告'}
            </div>
            <div className="admin-section-head">
              <span>成员</span>
            </div>
            <div className="room-member-list">
              {(currentRoom.members || []).map(username => {
                const member = allUsers.find(u => u.username === username);
                const muted = currentRoom.mutedMembers?.includes(username);
                return (
                  <div key={username} className="room-member-row">
                    <AvatarImg src={getAvatarUrl(member?.avatar)} alt="" />
                    <div className="room-member-copy">
                      <strong>{username}</strong>
                      <span>{currentRoom.owner === username ? '群主' : muted ? '已禁言' : '成员'}</span>
                    </div>
                    {isRoomOwner() && username !== user?.username && (
                      <div className="room-member-actions">
                        <button className="mini-text-btn" onClick={() => muted ? unmuteRoomMember(username) : muteRoomMember(username)}>
                          {muted ? '解禁' : '禁言'}
                        </button>
                        <button className="mini-text-btn danger" onClick={() => kickRoomMember(username)}>移出</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowRoomManage(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => { setShowSearchModal(false); setSearchId(''); setSearchResult(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>添加好友</h3>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--primary-bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              我的ID：<strong style={{ color: 'var(--primary)', fontSize: 16, letterSpacing: 3 }}>{user?.sixDigitId}</strong>
              <span style={{ marginLeft: 8, cursor: 'pointer', color: 'var(--primary)' }}
                onClick={() => { navigator.clipboard?.writeText(user?.sixDigitId || ''); showToast('ID已复制', 'success'); }}>📋复制</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="输入好友用户名或6位ID"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                maxLength={6}
                style={{ flex: 1 }}
              />
              <button className="confirm" onClick={searchUser}>搜索</button>
            </div>
            {searchResult && (
              <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AvatarImg src={getAvatarUrl(searchResult.avatar)} alt="" style={{ width: 50, height: 50, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>{searchResult.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {searchResult.sixDigitId}</div>
                    {searchResult.bio && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{searchResult.bio}</div>}
                  </div>
                  {searchResult.isFriend ? (
                    <span style={{ color: 'green' }}>已是好友</span>
                  ) : searchResult.requestSent ? (
                    <span style={{ color: 'orange' }}>已发送请求</span>
                  ) : (
                    <button className="confirm" onClick={() => sendFriendRequest(searchResult.username)}>添加</button>
                  )}
                </div>
              </div>
            )}
            {friendRequests.length > 0 && (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>好友请求 ({friendRequests.length})</div>
                {friendRequests?.map(request => (
                  <div key={request.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 8 }}>
                    <AvatarImg src={getAvatarUrl(request.avatar)} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold' }}>{request.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {request.sixDigitId}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="confirm" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => acceptFriendRequest(request.username)}>接受</button>
                      <button className="cancel" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => rejectFriendRequest(request.username)}>拒绝</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowSearchModal(false); setSearchId(''); setSearchResult(null); }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>创建群聊</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              从好友列表中选择成员创建群聊
            </p>
            {friends.length > 0 ? (
              <div className="user-list">
                {friends.map(friend => (
                  <label key={friend.id} className="user-checkbox">
                    <input type="checkbox" />
                    <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 8 }} />
                    <span>{friend.username}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                暂无好友，请先添加好友
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowCreateModal(false)}>取消</button>
              <button className="confirm" onClick={createGroup}>创建</button>
            </div>
          </div>
        </div>
      )}

      {uploadProgress && (
        <div className="upload-progress">
          <h4>上传中: {uploadProgress.filename}</h4>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${uploadProgress.progress}%` }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            {uploadProgress.progress}%
          </div>
        </div>
      )}

      {/* 深色模式切换按钮 */}
      <button className="dark-mode-toggle" onClick={toggleDarkMode} title={darkMode ? '切换浅色模式' : '切换深色模式'}>
        {darkMode ? <I name="search" size={15} /> : <I name="star" size={15} />}
      </button>

      {/* 红包弹窗 */}
      {showRedPacketModal && (
        <div className="modal-overlay" onClick={() => setShowRedPacketModal(false)}>
          <div className="modal red-packet-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="gift" size={20} /> 发红包</h3>
            <div className="balance-info">
              <span>当前余额：</span>
              <span className="balance-amount">¥{(balance || 0).toFixed(2)}</span>
            </div>
            <div className="form-group">
              <label>红包金额（元）</label>
              <input type="number" value={redPacketAmount} onChange={e => setRedPacketAmount(e.target.value)} placeholder="输入金额" min="1" step="0.01" />
            </div>
            <div className="form-group">
              <label>红包个数</label>
              <input type="number" value={redPacketCount} onChange={e => setRedPacketCount(e.target.value)} placeholder="输入个数" min="1" />
            </div>
            <div className="form-group">
              <label>祝福语</label>
              <input type="text" value={redPacketMessage} onChange={e => setRedPacketMessage(e.target.value)} placeholder="恭喜发财，大吉大利" />
            </div>
            {redPacketAmount && redPacketCount && (
              <div className="red-packet-preview">
                预计每个红包约 ¥{(parseFloat(redPacketAmount) / parseInt(redPacketCount)).toFixed(2)}
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowRedPacketModal(false)}>取消</button>
              <button className="confirm" onClick={sendRedPacket}>发送</button>
            </div>
          </div>
        </div>
      )}

      {/* 投票弹窗 */}
      {showPollModal && (
        <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
          <div className="modal poll-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="vote" size={20} /> 发起投票</h3>
            <div className="form-group"><label>投票主题</label><input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="输入投票主题" /></div>
            <div className="form-group">
              <label>选项</label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="poll-option-row">
                  <input type="text" value={opt} onChange={e => updatePollOption(i, e.target.value)} placeholder={`选项 ${i + 1}`} />
                  {pollOptions.length > 2 && <button className="remove-option" onClick={() => removePollOption(i)}>✕</button>}
                </div>
              ))}
              <button className="add-option" onClick={addPollOption}>+ 添加选项</button>
            </div>
            <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={pollAnonymous} onChange={e => setPollAnonymous(e.target.checked)} style={{ width: 'auto' }} /> 匿名投票</label></div>
            <div className="form-group"><label>截止时间（可选）</label><input type="datetime-local" value={pollDeadline} onChange={e => setPollDeadline(e.target.value)} /></div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowPollModal(false)}>取消</button>
              <button className="confirm" onClick={createEnhancedPoll}>发起投票</button>
            </div>
          </div>
        </div>
      )}

      {/* 小游戏弹窗 */}
      <GameModal showGameModal={showGameModal} setShowGameModal={setShowGameModal} sendRockPaperScissors={sendRockPaperScissors} />

      {/* 音乐分享弹窗 */}
      {showMusicModal && (
        <div className="modal-overlay" onClick={() => setShowMusicModal(false)}>
          <div className="modal music-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="music" size={20} /> 分享音乐</h3>
            <div className="form-group">
              <label>音乐链接</label>
              <input type="url" value={musicUrl} onChange={e => setMusicUrl(e.target.value)} placeholder="输入音乐链接" />
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowMusicModal(false)}>取消</button>
              <button className="confirm" onClick={() => {
                if (musicUrl && currentRoomId) {
                  socketRef.current.emit('sendMessage', { roomId: currentRoomId, content: musicUrl, type: 'music' });
                  setShowMusicModal(false);
                  setMusicUrl('');
                  showToast('音乐已分享', 'success');
                }
              }}>分享</button>
            </div>
          </div>
        </div>
      )}

      {/* 朋友圈 */}
      {showMoments && (
        <div className="modal-overlay" onClick={() => setShowMoments(false)}>
          <div className="modal moments-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="camera" size={20} /> 朋友圈</h3>
            <div className="moment-input">
              <textarea value={newMoment} onChange={e => setNewMoment(e.target.value)} placeholder="分享你的动态..." />
              <button onClick={publishMoment}>发布</button>
            </div>
            <div className="moments-list">
              {moments.map(m => (
                <div key={m.id} className="moment-item">
                  <div className="moment-header">
                    <AvatarImg src={getAvatarUrl(m.author?.avatar)} alt="" />
                    <span>{m.author?.username}</span>
                    <span className="moment-time">{formatTime(m.timestamp)}</span>
                  </div>
                  <div className="moment-content">{m.content}</div>
                  <div className="moment-actions">
                    <button onClick={() => likeMoment(m.id)}>❤️ {(m.likes || []).length}</button>
                    <button onClick={() => commentMoment(m.id)}>💬 {(m.comments || []).length}</button>
                  </div>
                  {(m.comments || []).length > 0 && (
                    <div className="moment-comments">
                      {(m.comments || []).map(c => (
                        <div key={c.id} className="comment-item">
                          <strong>{c.author?.username}:</strong> {c.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowMoments(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 数据统计弹窗 */}
      {messageStats.totalMessages > 0 && (
        <div className="stats-bar">
          <span><I name="stats" size={14} /> 总消息: {messageStats.totalMessages}</span>
          <span><I name="calendar" size={14} /> 今日: {messageStats.todayMessages}</span>
          <span><I name="contacts" size={14} /> 在线: {messageStats.activeUsers}</span>
          <button onClick={fetchStats}>刷新</button>
        </div>
      )}

      {/* 底部Tab导航 */}
      <BottomTabBar bottomTab={bottomTab} setBottomTab={setBottomTab} friendRequests={friendRequests} fetchFriendRequests={fetchFriendRequests} />

      {/* 启动闪屏 */}
      <SplashScreen showSplash={showSplash} appVersion={appVersion} />

      {/* 转发弹窗 */}
      {showForwardModal && (
        <div className="modal-overlay" onClick={() => { setShowForwardModal(false); setForwardMsg(null); }}>
          <div className="modal forward-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="forward" size={20} /> 转发消息</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              选择要转发到的聊天
            </p>
            <div className="forward-list">
              {rooms?.filter(r => r.type !== 'private')?.map(room => (
                <div key={room.id} className="forward-item" onClick={() => forwardMessage(room)}>
                  <div className="forward-avatar">{(room.name || '群')[0]}</div>
                  <span>{room.name}</span>
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowForwardModal(false); setForwardMsg(null); }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 聊天记录备份弹窗 */}
      {showBackupModal && (
        <div className="modal-overlay" onClick={() => setShowBackupModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3><I name="backup" size={20} /> 聊天记录管理</h3>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                聊天记录存储在服务器上，登录后自动同步
              </div>
              <button className="confirm" onClick={() => { exportChat(); setShowBackupModal(false); }} style={{ marginBottom: 8 }}>
                导出聊天记录
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
                {messageStats.totalMessages > 0 && `当前聊天记录: ${messageStats.totalMessages} 条消息`}
              </div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowBackupModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {/* 大版本更新说明：同一大版本仅展示一次，不触发 APK 下载 */}
      {showMajorUpdateModal && otaInfo && (
        <div className="modal-overlay" onClick={() => {
          const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
          localStorage.setItem(`seenMajorUpdate:${major}`, major);
          setShowMajorUpdateModal(false);
        }}>
          <div className="modal major-update-modal" onClick={e => e.stopPropagation()}>
            <div className="major-update-icon"><I name="sparkles" size={34} /></div>
            <h3>{otaInfo.updateTitle || '聊天室更新啦'}</h3>
            <p className="major-update-version">v{otaInfo.appVersion || appVersion}</p>
            <div className="major-update-list">
              {(Array.isArray(otaInfo.updateNotes) ? otaInfo.updateNotes : [otaInfo.notes || '体验细节已更新。']).map((note, i) => (
                <div key={i} className="major-update-item">
                  <I name="checkin" size={15} />
                  <span>{note}</span>
                </div>
              ))}
            </div>
            <button className="confirm" onClick={() => {
              const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
              localStorage.setItem(`seenMajorUpdate:${major}`, major);
              setShowMajorUpdateModal(false);
            }}>
              知道了
            </button>
          </div>
        </div>
      )}

      {/* ===== 图片查看器 ===== */}
      {imageViewer && (
        <div className="image-viewer-overlay" onClick={() => setImageViewer(null)}>
          <button className="image-viewer-close" onClick={() => setImageViewer(null)}><I name="close" size={20} color="#fff" /></button>
          {imageViewer.urls?.length > 1 && (
            <>
              <button className="image-viewer-nav prev" onClick={(e) => { e.stopPropagation(); imageViewerNav(-1); }}>‹</button>
              <button className="image-viewer-nav next" onClick={(e) => { e.stopPropagation(); imageViewerNav(1); }}>›</button>
            </>
          )}
          <div className="image-viewer-content" onClick={e => e.stopPropagation()}>
            <img src={imageViewer.url} alt="" />
          </div>
          <div className="image-viewer-tools">
            <button onClick={() => downloadImage(imageViewer.url)}>下载</button>
            {imageViewer.urls?.length > 1 && (
              <button disabled>{(imageViewer.index || 0) + 1} / {imageViewer.urls.length}</button>
            )}
          </div>
        </div>
      )}

      {/* ===== 群接龙弹窗 ===== */}
      {showSolitaireModal && (
        <div className="modal-overlay" onClick={() => setShowSolitaireModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><I name="solitaire" size={20} /> 发起群接龙</h3>
            <div className="form-group">
              <label>接龙主题</label>
              <input type="text" value={solitaireTitle} onChange={e => setSolitaireTitle(e.target.value)} placeholder="例如：今天吃什么？" />
            </div>
            <div className="form-group">
              <label>接龙格式（可选）</label>
              <input type="text" value={solitaireFormat} onChange={e => setSolitaireFormat(e.target.value)} placeholder="{序号}. {内容}" />
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowSolitaireModal(false)}>取消</button>
              <button className="confirm" onClick={createSolitaire}>发起接龙</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 密码找回弹窗 ===== */}
      {showResetPw && (
        <div className="modal-overlay" onClick={() => setShowResetPw(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3><I name="security" size={20} /> 找回密码</h3>
            {resetPwStep === 0 && (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>输入绑定的手机号，获取验证码</p>
                <input type="tel" placeholder="请输入手机号" value={resetPwPhone} onChange={e => setResetPwPhone(e.target.value.replace(/\D/g, ''))} maxLength={11} style={{ width: '100%', marginBottom: 12 }} />
                <div className="modal-buttons">
                  <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
                  <button className="confirm" onClick={handleSendResetCode}>获取验证码</button>
                </div>
              </>
            )}
            {resetPwStep === 1 && (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
                  验证码已发送至 <strong>{resetPwPhone.slice(0,3)}****{resetPwPhone.slice(7)}</strong>
                </p>
                <div className="code-grid">
                  {[0,1,2,3,4,5].map(i => (
                    <div key={i} className={`cdigit ${resetPwCode.length > i ? 'on' : ''}`}>{resetPwCode[i] || ''}</div>
                  ))}
                </div>
                <input type="text" inputMode="numeric" maxLength={6} value={resetPwCode}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setResetPwCode(v); if (v.length === 6) setResetPwStep(2); }}
                  style={{ width: '100%', padding: '10px 0', fontSize: 18, letterSpacing: 10, textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', position: 'absolute', opacity: 0 }} autoFocus />
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  {resetPwCountdown > 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{resetPwCountdown}s 后重新获取</span>
                  ) : (
                    <button onClick={handleSendResetCode} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}>重新获取</button>
                  )}
                </div>
                <div className="modal-buttons">
                  <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
                  <button className="confirm" disabled={resetPwCode.length !== 6} onClick={() => setResetPwStep(2)}>下一步</button>
                </div>
              </>
            )}
            {resetPwStep === 2 && (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>设置新密码（至少3位）</p>
                <input type="password" placeholder="请输入新密码" value={resetPwNewPw}
                  onChange={e => setResetPwNewPw(e.target.value)}
                  style={{ width: '100%', marginBottom: 12 }} autoFocus />
                <div className="modal-buttons">
                  <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
                  <button className="confirm" onClick={handleResetPassword}>重置密码</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== AI 图片生成弹窗 ===== */}
      {showImageGen && (
        <div className="modal-overlay" onClick={() => setShowImageGen(false)}>
          <div className="modal ai-image-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="palette" size={20} /> AI 图片生成</h3>
            <div className="form-group"><label>描述词</label><textarea value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="描述你想生成的图片，例如：a cat wearing sunglasses" rows={2} /></div>
            <div className="form-group"><label>风格（可选）</label><input type="text" value={genStyle} onChange={e => setGenStyle(e.target.value)} placeholder="例如：anime style, watercolor, realistic" /></div>
            {genResult && (
              <div className="image-gen-result">
                <img src={genResult} alt="生成结果" />
                <div className="image-gen-actions">
                  <button className="gen-share-btn" onClick={shareGeneratedImage}>发送到聊天</button>
                  <button className="gen-retry-btn" onClick={() => setGenResult(null)}>重新生成</button>
                </div>
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowImageGen(false); setGenResult(null); }}>关闭</button>
              {!genResult && <button className="confirm" onClick={generateImage} disabled={genLoading || !genPrompt.trim()}>{genLoading ? '生成中...' : '生成图片'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* ===== 打卡签到弹窗 ===== */}
      {showCheckIn && (
        <div className="modal-overlay" onClick={() => setShowCheckIn(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3><I name="checkin" size={20} /> 每日打卡</h3>
            {checkInData && (
              <div style={{ marginBottom: 12 }}>
                <div className="checkin-card">
                  <div className="checkin-day">{new Date().toLocaleDateString('zh-CN')}</div>
                  <div className="checkin-count">今日已打卡: {checkInData.today.length} 人</div>
                </div>
                {checkInData.today.length > 0 && (
                  <div className="checkin-leaderboard" style={{ marginTop: 10 }}>
                    {checkInData.today.map((c, i) => (
                      <div key={i} className="lb-row">
                        <span className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`} style={i > 2 ? { background: '#e5e7eb', color: '#6b7280' } : {}}>{i + 1}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.username}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{new Date(c.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="form-group"><label>打卡备注（可选）</label><input type="text" value={checkInNote} onChange={e => setCheckInNote(e.target.value)} placeholder="今天做什么了？" /></div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowCheckIn(false); setCheckInNote(''); }}>关闭</button>
              <button className="confirm" onClick={() => { doCheckIn(checkInNote); setCheckInNote(''); }}>打卡</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 年度报告弹窗 ===== */}
      {showWrapped && wrappedData && (
        <div className="modal-overlay" onClick={() => setShowWrapped(false)}>
          <div className="modal wrapped-modal" onClick={e => e.stopPropagation()}>
            <div className="wrapped-hero"><I name="stats" size={48} /></div>
            <h3>你的聊天年度报告</h3>
            <div className="wrapped-stat"><div className="wstat-num">{wrappedData.total}</div><div className="wstat-label">总消息数</div></div>
            <div className="wrapped-stat"><div className="wstat-num">{wrappedData.totalSent}</div><div className="wstat-label">📤 发送 / 📥 {wrappedData.totalReceived} 接收</div></div>
            <div className="wrapped-stat"><div className="wstat-num">{wrappedData.activeHour}:00</div><div className="wstat-label">最活跃时间段</div></div>
            {wrappedData.topFriend && (
              <div className="wrapped-friend">
                <span>最亲密好友：</span><strong>{wrappedData.topFriend.name}</strong>
                <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 12 }}>{wrappedData.topFriend.count} 条消息</span>
              </div>
            )}
            <div className="modal-buttons">
              <button className="confirm" onClick={() => setShowWrapped(false)}>知道了</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Bot 管理弹窗 ===== */}
      {showBotModal && (
        <div className="modal-overlay" onClick={() => setShowBotModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3><I name="bot" size={20} /> 聊天机器人</h3>
            {bots.map(bot => (
              <div key={bot.id} className="bot-card">
                <div className="bot-info">
                  <div className="bot-name">{bot.name}</div>
                  <div className="bot-status">{bot.autoReply ? '自动回复中' : '已关闭回复'} {bot.schedule ? `| ⏰ ${bot.schedule.cron}` : ''}</div>
                </div>
                <button onClick={() => deleteBot(bot.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="delete" size={16} /></button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
              <div className="form-group"><label>机器人名称</label><input type="text" value={botForm.name} onChange={e => setBotForm(f => ({ ...f, name: e.target.value }))} placeholder="例如：早安助手" /></div>
              <div className="form-group"><label>人设提示词</label><textarea value={botForm.prompt} onChange={e => setBotForm(f => ({ ...f, prompt: e.target.value }))} placeholder="你是一个友好的早安助手..." rows={2} /></div>
              <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={botForm.autoReply} onChange={e => setBotForm(f => ({ ...f, autoReply: e.target.checked }))} style={{ width: 'auto' }} /> 自动回复群聊消息</label></div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowBotModal(false)}>关闭</button>
              <button className="confirm" onClick={createBot}>创建机器人</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== WebRTC 通话界面 ===== */}
      {callState && callState.status && callState.status !== 'incoming' && (
        <div className="call-overlay">
          <div className="call-remote-video">
            {callState.remoteStream ? (
              <video ref={el => { if (el && callState?.remoteStream) { try { el.srcObject = callState.remoteStream; el.play().catch(() => {}); } catch(e) {} } }} autoPlay playsInline />
            ) : (
              <div className="call-waiting">
                {(callState.status === 'calling' || callState.status === 'connecting') ? (callState.status === 'calling' ? '正在呼叫...' : '连接中...') : '📞'}
              </div>
            )}
          </div>
          {callState.localStream && (
            <div className="call-local-video">
              <video ref={el => { if (el && callState?.localStream) { try { el.srcObject = callState.localStream; el.play().catch(() => {}); } catch(e) {} } }} autoPlay playsInline muted />
            </div>
          )}
          <div className="call-controls">
            <button className="call-btn mute" onClick={toggleMute}>{callState?.muted ? <I name="micOff" size={20} color="#fff" /> : <I name="mic" size={20} color="#fff" />}</button>
            <button className="call-btn hangup" onClick={hangUp}><I name="micOff" size={20} color="currentColor" /></button>
          </div>
        </div>
      )}

      {/* ===== 来电提醒 ===== */}
      {callState && callState.status === 'incoming' && (
        <div className="call-incoming-overlay">
          <div style={{ fontSize: 36, marginBottom: 8 }}><I name="video" size={36} /></div>
          <div style={{ fontWeight: 700 }}>{callState.caller?.username} 邀请你{callState.type === 'video' ? '视频' : '语音'}通话</div>
          <div className="call-incoming-actions">
            <button className="call-btn hangup" onClick={hangUp} style={{ width: 48, height: 48 }}><I name="micOff" size={20} color="currentColor" /></button>
            <button className="call-btn" onClick={acceptCall} style={{ background: '#10b981', color: 'white', width: 48, height: 48, boxShadow: '0 4px 16px rgba(16,185,129,0.4)' }}>📞</button>
          </div>
        </div>
      )}

      {/* ===== AI 润色弹窗 ===== */}
      {showPolishModal && (
        <div className="modal-overlay" onClick={() => { setShowPolishModal(false); setPolishResult(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3><I name="polish" size={20} /> AI 文字润色</h3>
            <div className="form-group">
              <label>原始文字</label>
              <textarea value={polishText} onChange={e => setPolishText(e.target.value)} rows={3} placeholder="输入要润色的文字..." />
            </div>
            <div className="form-group">
              <label>风格</label>
              <select value={polishTone} onChange={e => setPolishTone(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
                <option value="casual">口语化</option>
                <option value="formal">正式</option>
                <option value="funny">幽默</option>
                <option value="concise">简洁</option>
              </select>
            </div>
            {polishResult && (
              <div className="form-group">
                <label>润色结果</label>
                <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.6 }}>{polishResult}</div>
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowPolishModal(false); setPolishResult(''); }}>取消</button>
              {!polishResult ? (
                <button className="confirm" onClick={polishMessage} disabled={!polishText.trim() || polishLoading}>
                  {polishLoading ? '润色中...' : '开始润色'}
                </button>
              ) : (
                <button className="confirm" onClick={applyPolish}>应用到输入框</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== AI 每日摘要弹窗 ===== */}
      {showDailyDigest && (
        <div className="modal-overlay" onClick={() => { setShowDailyDigest(false); setDailyDigest(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3><I name="digest" size={20} /> AI 每日摘要</h3>
            {dailyDigestLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ opacity: 0.25, marginBottom: 12 }}><I name="ai" size={48} /></div>
                <div>AI 正在分析你今天的聊天记录...</div>
              </div>
            ) : dailyDigest ? (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div className="stat-chip" style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{dailyDigest.stats?.totalMessages || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>今日消息</div>
                  </div>
                  <div className="stat-chip" style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{dailyDigest.stats?.activeRooms || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>活跃群聊</div>
                  </div>
                </div>
                <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 10, marginBottom: 14, lineHeight: 1.7, fontSize: 14 }}>
                  {dailyDigest.digest}
                </div>
                {dailyDigest.highlightMessages?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>📌 最新消息</div>
                    {dailyDigest.highlightMessages.map((m, i) => (
                      <div key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>[{m.room}]</span> <strong>{m.sender}</strong>: {m.content?.slice(0, 40)}{(m.content?.length > 40) ? '...' : ''}
                        <span style={{ float: 'right', color: 'var(--text-secondary)', fontSize: 11 }}>{m.time}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>生成失败</div>
            )}
            <div className="modal-buttons">
              <button className="confirm" onClick={() => { setShowDailyDigest(false); setDailyDigest(null); }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 音乐播放器面板 ===== */}
      {showMusicPanel && (
        <div className="modal-overlay" onClick={() => setShowMusicPanel(false)}>
          <div className="modal music-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="music-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}><I name="music" size={20} /> 网易云音乐</h3>
              <button onClick={() => setShowMusicPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><I name="close" size={20} /></button>
            </div>
            {/* 搜索框 */}
            <form onSubmit={searchMusic} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={musicSearch}
                onChange={e => setMusicSearch(e.target.value)}
                placeholder="搜索歌曲、歌手..."
                style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }}
              />
              <button type="submit" disabled={musicLoading} style={{ padding: '10px 18px', background: 'linear-gradient(135deg, #ec4141, #e03a3a)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {musicLoading ? '搜索中...' : '搜索'}
              </button>
            </form>
            {/* 迷你播放器 */}
            {currentSong && (
              <div className="mini-player" style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={currentSong.pic || ''} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSong.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{currentSong.artist}</div>
                </div>
                <button onClick={togglePlay} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, width: 36, height: 36, cursor: 'pointer', fontSize: 16, color: '#fff' }}>
                  {isPlaying ? <I name="stop" size={18} color="#fff" /> : <I name="send" size={18} color="#fff" />}
                </button>
                <button onClick={() => shareSongToChat(currentSong)} title="分享到聊天" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, padding: '4px 8px', color: '#fff', display: 'flex', alignItems: 'center' }}><I name="forward" size={15} color="#fff" /></button>
              </div>
            )}
            {/* 歌词 */}
            {musicLyric && isPlaying && (
              <div className="lyric-box" style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 12, maxHeight: 120, overflowY: 'auto', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {musicLyric.split('\n').slice(0, 10).join('\n')}
              </div>
            )}
            {/* 搜索结果 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {musicResults.length === 0 && !musicLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  <div style={{ opacity: 0.25, marginBottom: 12 }}><I name="music" size={48} /></div>
                  <div>输入关键词搜索歌曲</div>
                </div>
              )}
              {musicResults.map((song, i) => (
                <div key={song.id || i} className="music-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: currentSong?.id === song.id ? 'var(--hover)' : 'transparent', borderRadius: 8 }}
                  onClick={() => playSong(song)}
                >
                  <img src={song.pic || ''} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--bg)' }} onError={e => { e.target.style.display = 'none'; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{song.artist}{song.album ? ` · ${song.album}` : ''}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); playSong(song); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="播放">▶️</button>
                  <button onClick={(e) => { e.stopPropagation(); shareSongToChat(song); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="分享"><I name="forward" size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} style={{ display: 'none' }} />

      {/* ===== GIF 面板 ===== */}
      {showGifPanel && (
        <div className="modal-overlay" onClick={() => { setShowGifPanel(false); setGifSearch(''); setGifResults([]); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}><I name="image" size={20} /> GIF 表情包</h3>
              <button onClick={() => { setShowGifPanel(false); setGifSearch(''); setGifResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
            </div>
            <form onSubmit={searchGif} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={gifSearch} onChange={e => setGifSearch(e.target.value)} placeholder="搜索 GIF..." style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
              <button type="submit" disabled={gifLoading} style={{ padding: '10px 18px', background: 'linear-gradient(135deg, #fb7299, #cc66cc)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>{gifLoading ? '搜索中' : '搜索'}</button>
            </form>
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {gifResults.length === 0 && !gifLoading && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>输入关键词搜索 GIF</div>
              )}
              {gifResults.map((gif, i) => (
                <div key={gif.id || i} onClick={() => sendGif(gif)} style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
                  <img src={gif.preview || gif.url} alt={gif.title} style={{ width: '100%', height: 120, objectFit: 'cover' }} loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 新闻热搜面板 ===== */}
      {showNewsPanel && (
        <div className="modal-overlay" onClick={() => { setShowNewsPanel(false); setNewsStories([]); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}><I name="digest" size={20} /> 今日热搜</h3>
              <button onClick={() => { setShowNewsPanel(false); setNewsStories([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {newsLoading ? (
                <div style={{ textAlign: 'center', padding: 30 }}>加载中...</div>
              ) : newsStories.map((s, i) => (
                <div key={s.id || i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => shareNews(s)}>
                  {s.image && <img src={s.image} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>点击分享到聊天</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 天气面板 ===== */}
      {showWeatherPanel && (
        <div className="modal-overlay" onClick={() => { setShowWeatherPanel(false); setWeatherData(null); setWeatherCity(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>🌤 天气查询</h3>
              <button onClick={() => { setShowWeatherPanel(false); setWeatherData(null); setWeatherCity(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
            </div>
            <form onSubmit={searchWeather} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="text" value={weatherCity} onChange={e => setWeatherCity(e.target.value)} placeholder="输入城市名，如：北京" style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
              <button type="submit" disabled={weatherLoading} style={{ padding: '10px 18px', background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>{weatherLoading ? '查询中' : '查询'}</button>
            </form>
            {weatherLoading && <div style={{ textAlign: 'center', padding: 30 }}>查询中...</div>}
            {weatherData && !weatherLoading && (
              <div style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: 14, padding: 24, color: 'white' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{weatherData.city}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 56, fontWeight: 200 }}>{weatherData.temp}°</div>
                  <div>
                    <div style={{ fontSize: 15 }}>{weatherData.desc}</div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>体感 {weatherData.feelsLike}°C</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, opacity: 0.9, marginBottom: 12 }}>
                  <span>💧 {weatherData.humidity}%</span>
                  <span>🌬 {weatherData.wind}</span>
                  <span>📊 {weatherData.high}° / {weatherData.low}°</span>
                </div>
                <button onClick={shareWeather} style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>📤 分享天气到聊天</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 地图面板 ===== */}
      {showMapPanel && (
        <div className="modal-overlay" onClick={() => { setShowMapPanel(false); setShowMapViewer(null); setMapResults([]); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}><I name="location" size={20} /> 地图</h3>
              <button onClick={() => { setShowMapPanel(false); setShowMapViewer(null); setMapResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
            </div>
            {/* 搜索栏 */}
            <form onSubmit={searchMap} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={mapSearch} onChange={e => setMapSearch(e.target.value)} placeholder="搜索地点..." style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
              <button type="submit" disabled={mapLoading} style={{ padding: '10px 16px', background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>{mapLoading ? '搜索中' : '搜索'}</button>
              <button type="button" onClick={getMyLocation} disabled={mapLoading} title="GPS定位" style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}><I name="location" size={18} /></button>
            </form>
            {/* 搜索结果 */}
            {mapResults.length > 0 && !showMapViewer && (
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
                {mapResults.map((poi, i) => (
                  <div key={i} onClick={() => setShowMapViewer({ lat: poi.lat, lng: poi.lng, name: poi.name })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <I name="location" size={16} color="var(--primary)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{poi.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.fullName}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setShowMapViewer({ lat: poi.lat, lng: poi.lng, name: poi.name }); shareMap({ lat: poi.lat, lng: poi.lng, name: poi.name, fullName: poi.fullName }); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="forward" size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            {/* 地图视图 */}
            {showMapViewer ? (
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><I name="location" size={14} /> {showMapViewer.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => shareMap(showMapViewer)} style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>分享</button>
                    <button onClick={() => setShowMapViewer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={14} /></button>
                  </div>
                </div>
                {isCapacitor ? (
                  <div onClick={() => window.open(`${API_URL}/api/map/static?lat=${showMapViewer.lat}&lng=${showMapViewer.lng}&zoom=17`, '_system')}
                    style={{ width: '100%', height: 200, background: '#e8e8e8', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexDirection: 'column', gap: 8 }}>
                    <I name="location" size={36} color="var(--primary)" />
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>点击查看地图</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showMapViewer.lat.toFixed(4)}, {showMapViewer.lng.toFixed(4)}</span>
                  </div>
                ) : (
                  <iframe src={`${API_URL}/api/map/static?lat=${showMapViewer.lat}&lng=${showMapViewer.lng}&zoom=17`} title="高德地图" style={{ width: '100%', height: 350, border: 'none' }} />
                )}
              </div>
            ) : mapResults.length === 0 && !mapLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}><I name="location" size={64} /></div>
                <div>搜索地点或点击 GPS 获取当前位置</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      <Toast toast={toast} />
    </div>
  );
}

export default App;
