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
import ImageViewer from './components/ui/ImageViewer';
import SplashScreen from './components/ui/SplashScreen';
import FeatureItem from './components/ui/FeatureItem';
import MeMenuItem from './components/ui/MeMenuItem';
import BottomTabBar from './components/BottomTabBar';
import ContactsView from './components/ContactsView';
import DiscoverView from './components/DiscoverView';
import MeView from './components/MeView';
import GameModal from './components/modals/GameModal';
import MusicShareModal from './components/modals/MusicShareModal';
import ForwardModal from './components/modals/ForwardModal';
import BackupModal from './components/modals/BackupModal';
import MajorUpdateModal from './components/modals/MajorUpdateModal';
import SolitaireModal from './components/modals/SolitaireModal';
import CheckInModal from './components/modals/CheckInModal';
import WrappedModal from './components/modals/WrappedModal';
import RedPacketModal from './components/modals/RedPacketModal';
import PollModal from './components/modals/PollModal';
import CreateGroupModal from './components/modals/CreateGroupModal';
import PhoneModal from './components/modals/PhoneModal';
import ProfileModal from './components/modals/ProfileModal';
import RechargeModal from './components/modals/RechargeModal';
import AdminModal from './components/modals/AdminModal';
import RoomManageModal from './components/modals/RoomManageModal';
import AddFriendModal from './components/modals/AddFriendModal';
import MomentsPanel from './components/modals/MomentsPanel';
import ResetPwModal from './components/modals/ResetPwModal';
import ImageGenModal from './components/modals/ImageGenModal';
import BotModal from './components/modals/BotModal';
import PolishModal from './components/modals/PolishModal';
import DailyDigestModal from './components/modals/DailyDigestModal';
import ChatView from './components/ChatView';
import AiView from './components/AiView';
import BilibiliView from './components/BilibiliView';
import MusicPanel from './components/panels/MusicPanel';
import GifPanel from './components/panels/GifPanel';
import NewsPanel from './components/panels/NewsPanel';
import WeatherPanel from './components/panels/WeatherPanel';
import MapPanel from './components/panels/MapPanel';
import CallOverlay from './components/call/CallOverlay';
import CallIncoming from './components/call/CallIncoming';
// axios 全局配置
axios.defaults.timeout = 15000;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
// Capacitor App 使用 ngrok 时，跳过 ngrok 浏览器安全警告页
if (isCapacitor) {
  axios.defaults.headers.common['ngrok-skip-browser-warning'] = '1';
}
// 请求重试 + 401 自动重新登录
var isReloggingIn = false;
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
  const peerRef = useRef(null);

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
    REACTION_EMOJIS,
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

  // ===== Socket 连接（最后调用，所有 setter 已就绪）=====
  const { onlineUsers } = useSocket({
    socketRef,
    token,
    user,
    isAuthenticated,
    handlers: {
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
      currentRoomId,
      peerRef,
      notifyEnabled,
      notifyMuted,
      showToast,
    }
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
          parts.push(<code key={key++} className="md-code">{token.slice(1, -1)}</code>);
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

  const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const response = await axios.post(`${API_URL}/api/upload/avatar`, formData, {
        headers: {
          Authorization: token,
          'Content-Type': 'multipart/form-data'
        }
      });
      const avatarPath = response.data.avatar;
      const newAvatar = avatarPath.startsWith('http') ? avatarPath : avatarPath;
      setUser(prev => ({ ...prev, avatar: newAvatar }));
      await axios.put(`${API_URL}/api/profile`, { avatar: newAvatar }, {
        headers: { Authorization: token }
      });
    } catch (err) {
      showToast('上传头像失败', 'error');
    }
  };

  // 高亮搜索匹配文本
  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
    );
  };

  // 群公告
  const setAnnouncement = () => {
    if (!currentRoomId) return;
    const announcement = window.prompt('请输入群公告内容：');
    if (announcement !== null) {
      socketRef.current.emit('setAnnouncement', { roomId: currentRoomId, announcement });
    }
  };

  const isRoomOwner = () => {
    return currentRoom && user && currentRoom.owner === user.username;
  };

  const muteRoomMember = (username) => {
    if (!currentRoomId || !socketRef.current) return;
    socketRef.current.emit('muteRoomMember', { roomId: currentRoomId, username });
  };

  const unmuteRoomMember = (username) => {
    if (!currentRoomId || !socketRef.current) return;
    socketRef.current.emit('unmuteRoomMember', { roomId: currentRoomId, username });
  };

  const kickRoomMember = (username) => {
    if (!currentRoomId || !socketRef.current) return;
    socketRef.current.emit('kickRoomMember', { roomId: currentRoomId, username });
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
              <div className="auth-server-info">
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
          <ContactsView
            friends={friends}
            friendRequests={friendRequests}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setContactsLetter={setContactsLetter}
            startChatWithFriend={startChatWithFriend}
            acceptFriendRequest={acceptFriendRequest}
            rejectFriendRequest={rejectFriendRequest}
          />
        ) : bottomTab === 'discover' ? (
          /* ===== 发现页面 ===== */
          <DiscoverView
            setView={setView}
            setBottomTab={setBottomTab}
            setShowImageGen={setShowImageGen}
            fetchDailyDigest={fetchDailyDigest}
            setShowBotModal={setShowBotModal}
            fetchBots={fetchBots}
            setShowMusicPanel={setShowMusicPanel}
            setShowGifPanel={setShowGifPanel}
            fetchNews={fetchNews}
            setShowMoments={setShowMoments}
            setShowGameModal={setShowGameModal}
            setShowWeatherPanel={setShowWeatherPanel}
            setShowMapPanel={setShowMapPanel}
            wrappedLoading={wrappedLoading}
            fetchWrapped={fetchWrapped}
            setShowBackupModal={setShowBackupModal}
          />
        ) : bottomTab === 'me' ? (
          /* ===== 我的页面 ===== */
          <MeView
            user={user}
            setShowProfileModal={setShowProfileModal}
            balance={balance}
            setShowMoments={setShowMoments}
            setShowRechargeModal={setShowRechargeModal}
            fetchRechargeHistory={fetchRechargeHistory}
            setShowBackupModal={setShowBackupModal}
            phoneInfo={phoneInfo}
            fetchPhoneInfo={fetchPhoneInfo}
            setShowPhoneModal={setShowPhoneModal}
            otaInfo={otaInfo}
            appVersion={appVersion}
          />
        ) : view === 'ai' ? (
          <AiView
            user={user}
            balance={balance}
            setView={setView}
            setBottomTab={setBottomTab}
            fetchDailyDigest={fetchDailyDigest}
            showToast={showToast}
            aiModel={aiModel}
            setAiModel={setAiModel}
            aiModels={aiModels}
            aiMessages={aiMessages}
            aiInput={aiInput}
            setAiInput={setAiInput}
            aiLoading={aiLoading}
            handleAiKeyPress={handleAiKeyPress}
            sendAiMessage={sendAiMessage}
            renderMarkdown={renderMarkdown}
            aiMessagesEndRef={aiMessagesEndRef}
            setShowRechargeModal={setShowRechargeModal}
            fetchRechargeHistory={fetchRechargeHistory}
            resetAiChat={resetAiChat}
            openAdminCenter={openAdminCenter}
          />
        ) : view === 'video' ? (
          <BilibiliView
            setView={setView}
            setBottomTab={setBottomTab}
            bilibiliQuery={bilibiliQuery}
            setBilibiliQuery={setBilibiliQuery}
            bilibiliLoading={bilibiliLoading}
            searchBilibili={searchBilibili}
            selectedBiliVideo={selectedBiliVideo}
            setSelectedBiliVideo={setSelectedBiliVideo}
            bilibiliResults={bilibiliResults}
            shareBilibiliToChat={shareBilibiliToChat}
            observeVideo={observeVideo}
          />
        ) : currentRoom ? (
          <ChatView
            currentRoom={currentRoom}
            currentRoomId={currentRoomId}
            setCurrentRoom={setCurrentRoom}
            setCurrentRoomId={setCurrentRoomId}
            setMessages={setMessages}
            user={user}
            allUsers={allUsers}
            messages={messages}
            pinnedMessages={pinnedMessages}
            starredMessages={starredMessages}
            getReadInfo={getReadInfo}
            highlightText={highlightText}
            typingUser={typingUser}
            aiSummary={aiSummary}
            aiSummaryLoading={aiSummaryLoading}
            setAiSummary={setAiSummary}
            summarizeChat={summarizeChat}
            setShowImageGen={setShowImageGen}
            isSharingLocation={isSharingLocation}
            startSharingLocation={startSharingLocation}
            stopSharingLocation={stopSharingLocation}
            setShowCheckIn={setShowCheckIn}
            fetchCheckIns={fetchCheckIns}
            setShowMusicPanel={setShowMusicPanel}
            startCall={startCall}
            showSearch={showSearch}
            setShowSearch={setShowSearch}
            setShowRoomManage={setShowRoomManage}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            translations={translations}
            openImageViewer={openImageViewer}
            descLoading={descLoading}
            imageDesc={imageDesc}
            describeImage={describeImage}
            observeVideo={observeVideo}
            translatingMsg={translatingMsg}
            translateMessage={translateMessage}
            openLocationMap={openLocationMap}
            claimRedPacket={claimRedPacket}
            votePoll={votePoll}
            joinSolitaire={joinSolitaire}
            toggleReaction={toggleReaction}
            recallMessage={recallMessage}
            startEditMessage={startEditMessage}
            deleteMessage={deleteMessage}
            openReactionPicker={openReactionPicker}
            startReply={startReply}
            openForwardModal={openForwardModal}
            toggleStarMessage={toggleStarMessage}
            togglePinMessage={togglePinMessage}
            reactionPicker={reactionPicker}
            setReactionPicker={setReactionPicker}
            REACTION_EMOJIS={REACTION_EMOJIS}
            setMessageEndRef={setMessageEndRef}
            roomAnnouncements={roomAnnouncements}
            replyToMessage={replyToMessage}
            cancelReply={cancelReply}
            editingMessage={editingMessage}
            cancelEdit={cancelEdit}
            fileInputRef={fileInputRef}
            isRecording={isRecording}
            startRecording={startRecording}
            stopRecording={stopRecording}
            cancelRecording={cancelRecording}
            recordingTime={recordingTime}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            showMentionPicker={showMentionPicker}
            setShowMentionPicker={setShowMentionPicker}
            showQuickReplies={showQuickReplies}
            setShowQuickReplies={setShowQuickReplies}
            sendDice={sendDice}
            setShowGameModal={setShowGameModal}
            setShowRedPacketModal={setShowRedPacketModal}
            setShowPollModal={setShowPollModal}
            setShowSolitaireModal={setShowSolitaireModal}
            setShowMusicModal={setShowMusicModal}
            handleFileSelect={handleFileSelect}
            fetchSmartReplies={fetchSmartReplies}
            smartRepliesLoading={smartRepliesLoading}
            setPolishText={setPolishText}
            setPolishResult={setPolishResult}
            setShowPolishModal={setShowPolishModal}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            insertEmoji={insertEmoji}
            mentionFilter={mentionFilter}
            setMentionFilter={setMentionFilter}
            getFilteredMentionUsers={getFilteredMentionUsers}
            insertMention={insertMention}
            quickReplies={quickReplies}
            insertQuickReply={insertQuickReply}
            smartReplies={smartReplies}
            setSmartReplies={setSmartReplies}
            handleInputChange={handleInputChange}
            handleKeyDown={handleKeyDown}
            sendMessage={sendMessage}
          />
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

      <PhoneModal showPhoneModal={showPhoneModal} closePhoneModal={closePhoneModal} phoneInfo={phoneInfo} phoneStep={phoneStep} phoneInput={phoneInput} setPhoneInput={setPhoneInput} codeInput={codeInput} setCodeInput={setCodeInput} codeCountdown={codeCountdown} phoneSendingCode={phoneSendingCode} phoneBinding={phoneBinding} handleSendCode={handleSendCode} handleVerifyAndBind={handleVerifyAndBind} handleUnbindPhone={handleUnbindPhone} />

      <ProfileModal showProfileModal={showProfileModal} setShowProfileModal={setShowProfileModal} user={user} profileEdit={profileEdit} setProfileEdit={setProfileEdit} avatarInputRef={avatarInputRef} uploadAvatar={uploadAvatar} updateProfile={updateProfile} />

      {showPayCodeModal && selectedFriendPayCode && (
        <div className="modal-overlay" onClick={() => { setShowPayCodeModal(false); setSelectedFriendPayCode(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><I name="wallet" size={20} /> {selectedFriendPayCode.username} 的收款码</h3>
            <div className="paycode-box">
              <div className="paycode-content">
                {selectedFriendPayCode.payCode}
              </div>
            </div>
            <div className="paycode-hint">
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
      <RechargeModal showRechargeModal={showRechargeModal} setShowRechargeModal={setShowRechargeModal} setRechargePayCode={setRechargePayCode} setRechargeAmount={setRechargeAmount} rechargePayCode={rechargePayCode} rechargeAmount={rechargeAmount} requestRecharge={requestRecharge} rechargeHistory={rechargeHistory} />

      <AdminModal showAdminModal={showAdminModal} setShowAdminModal={setShowAdminModal} fetchAdminDashboard={fetchAdminDashboard} adminDashboardLoading={adminDashboardLoading} adminDashboard={adminDashboard} aiStatus={aiStatus} aiStatusLoading={aiStatusLoading} fetchAiStatus={fetchAiStatus} pendingRecharges={pendingRecharges} fetchPendingRecharges={fetchPendingRecharges} confirmRecharge={confirmRecharge} rejectRecharge={rejectRecharge} />

      <RoomManageModal showRoomManage={showRoomManage} setShowRoomManage={setShowRoomManage} currentRoom={currentRoom} allUsers={allUsers} roomAnnouncements={roomAnnouncements} currentRoomId={currentRoomId} isRoomOwner={isRoomOwner} setAnnouncement={setAnnouncement} unmuteRoomMember={unmuteRoomMember} muteRoomMember={muteRoomMember} kickRoomMember={kickRoomMember} user={user} />

      <AddFriendModal showSearchModal={showSearchModal} setShowSearchModal={setShowSearchModal} setSearchId={setSearchId} setSearchResult={setSearchResult} searchId={searchId} searchResult={searchResult} searchUser={searchUser} user={user} showToast={showToast} friendRequests={friendRequests} sendFriendRequest={sendFriendRequest} acceptFriendRequest={acceptFriendRequest} rejectFriendRequest={rejectFriendRequest} />

      <CreateGroupModal showCreateModal={showCreateModal} setShowCreateModal={setShowCreateModal} friends={friends} createGroup={createGroup} />

      {uploadProgress && (
        <div className="upload-progress">
          <h4>上传中: {uploadProgress.filename}</h4>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${uploadProgress.progress}%` }} />
          </div>
          <div className="upload-progress-text">
            {uploadProgress.progress}%
          </div>
        </div>
      )}

      {/* 深色模式切换按钮 */}
      <button className="dark-mode-toggle" onClick={toggleDarkMode} title={darkMode ? '切换浅色模式' : '切换深色模式'}>
        {darkMode ? <I name="moon" size={15} /> : <I name="sun" size={15} />}
      </button>

      {/* 红包弹窗 */}
      <RedPacketModal showRedPacketModal={showRedPacketModal} setShowRedPacketModal={setShowRedPacketModal} balance={balance} redPacketAmount={redPacketAmount} setRedPacketAmount={setRedPacketAmount} redPacketCount={redPacketCount} setRedPacketCount={setRedPacketCount} redPacketMessage={redPacketMessage} setRedPacketMessage={setRedPacketMessage} sendRedPacket={sendRedPacket} />

      {/* 投票弹窗 */}
      <PollModal showPollModal={showPollModal} setShowPollModal={setShowPollModal} pollQuestion={pollQuestion} setPollQuestion={setPollQuestion} pollOptions={pollOptions} updatePollOption={updatePollOption} removePollOption={removePollOption} addPollOption={addPollOption} pollAnonymous={pollAnonymous} setPollAnonymous={setPollAnonymous} pollDeadline={pollDeadline} setPollDeadline={setPollDeadline} createEnhancedPoll={createEnhancedPoll} />

      {/* 小游戏弹窗 */}
      <GameModal showGameModal={showGameModal} setShowGameModal={setShowGameModal} sendRockPaperScissors={sendRockPaperScissors} />

      {/* 音乐分享弹窗 */}
      <MusicShareModal showMusicModal={showMusicModal} setShowMusicModal={setShowMusicModal} musicUrl={musicUrl} setMusicUrl={setMusicUrl} currentRoomId={currentRoomId} socketRef={socketRef} showToast={showToast} />

      {/* 朋友圈 */}
      <MomentsPanel showMoments={showMoments} setShowMoments={setShowMoments} newMoment={newMoment} setNewMoment={setNewMoment} publishMoment={publishMoment} moments={moments} likeMoment={likeMoment} commentMoment={commentMoment} />

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
      <ForwardModal showForwardModal={showForwardModal} setShowForwardModal={setShowForwardModal} setForwardMsg={setForwardMsg} rooms={rooms} forwardMessage={forwardMessage} />

      {/* 聊天记录备份弹窗 */}
      <BackupModal showBackupModal={showBackupModal} setShowBackupModal={setShowBackupModal} exportChat={exportChat} messageStats={messageStats} />
      {/* 大版本更新说明：同一大版本仅展示一次，不触发 APK 下载 */}
      <MajorUpdateModal showMajorUpdateModal={showMajorUpdateModal} otaInfo={otaInfo} setShowMajorUpdateModal={setShowMajorUpdateModal} appVersion={appVersion} />

      {/* ===== 图片查看器 ===== */}
      <ImageViewer imageViewer={imageViewer} setImageViewer={setImageViewer} imageViewerNav={imageViewerNav} downloadImage={downloadImage} />

      {/* ===== 群接龙弹窗 ===== */}
      <SolitaireModal showSolitaireModal={showSolitaireModal} setShowSolitaireModal={setShowSolitaireModal} solitaireTitle={solitaireTitle} setSolitaireTitle={setSolitaireTitle} solitaireFormat={solitaireFormat} setSolitaireFormat={setSolitaireFormat} createSolitaire={createSolitaire} />

      {/* ===== 密码找回弹窗 ===== */}
      <ResetPwModal showResetPw={showResetPw} setShowResetPw={setShowResetPw} resetPwStep={resetPwStep} setResetPwStep={setResetPwStep} resetPwPhone={resetPwPhone} setResetPwPhone={setResetPwPhone} resetPwCode={resetPwCode} setResetPwCode={setResetPwCode} resetPwNewPw={resetPwNewPw} setResetPwNewPw={setResetPwNewPw} resetPwCountdown={resetPwCountdown} handleSendResetCode={handleSendResetCode} handleResetPassword={handleResetPassword} />

      {/* ===== AI 图片生成弹窗 ===== */}
      <ImageGenModal showImageGen={showImageGen} setShowImageGen={setShowImageGen} genPrompt={genPrompt} setGenPrompt={setGenPrompt} genStyle={genStyle} setGenStyle={setGenStyle} genResult={genResult} setGenResult={setGenResult} genLoading={genLoading} generateImage={generateImage} shareGeneratedImage={shareGeneratedImage} />

      {/* ===== 打卡签到弹窗 ===== */}
      <CheckInModal showCheckIn={showCheckIn} setShowCheckIn={setShowCheckIn} checkInData={checkInData} checkInNote={checkInNote} setCheckInNote={setCheckInNote} doCheckIn={doCheckIn} />

      {/* ===== 年度报告弹窗 ===== */}
      <WrappedModal showWrapped={showWrapped} wrappedData={wrappedData} setShowWrapped={setShowWrapped} />

      {/* ===== Bot 管理弹窗 ===== */}
      <BotModal showBotModal={showBotModal} setShowBotModal={setShowBotModal} bots={bots} deleteBot={deleteBot} botForm={botForm} setBotForm={setBotForm} createBot={createBot} />

      {/* ===== WebRTC 通话界面 ===== */}
      <CallOverlay callState={callState} toggleMute={toggleMute} hangUp={hangUp} />

      {/* ===== 来电提醒 ===== */}
      <CallIncoming callState={callState} hangUp={hangUp} acceptCall={acceptCall} />

      {/* ===== AI 润色弹窗 ===== */}
      <PolishModal showPolishModal={showPolishModal} setShowPolishModal={setShowPolishModal} setPolishResult={setPolishResult} polishText={polishText} setPolishText={setPolishText} polishTone={polishTone} setPolishTone={setPolishTone} polishResult={polishResult} polishLoading={polishLoading} polishMessage={polishMessage} applyPolish={applyPolish} />

      {/* ===== AI 每日摘要弹窗 ===== */}
      <DailyDigestModal showDailyDigest={showDailyDigest} setShowDailyDigest={setShowDailyDigest} setDailyDigest={setDailyDigest} dailyDigestLoading={dailyDigestLoading} dailyDigest={dailyDigest} />

      {/* ===== 音乐播放器面板 ===== */}
      <MusicPanel showMusicPanel={showMusicPanel} setShowMusicPanel={setShowMusicPanel} musicSearch={musicSearch} setMusicSearch={setMusicSearch} musicLoading={musicLoading} searchMusic={searchMusic} musicResults={musicResults} currentSong={currentSong} isPlaying={isPlaying} togglePlay={togglePlay} shareSongToChat={shareSongToChat} playSong={playSong} musicLyric={musicLyric} audioRef={audioRef} setIsPlaying={setIsPlaying} />

      {/* ===== GIF 面板 ===== */}
      <GifPanel showGifPanel={showGifPanel} setShowGifPanel={setShowGifPanel} setGifSearch={setGifSearch} setGifResults={setGifResults} gifSearch={gifSearch} gifLoading={gifLoading} searchGif={searchGif} gifResults={gifResults} sendGif={sendGif} />

      {/* ===== 新闻热搜面板 ===== */}
      <NewsPanel showNewsPanel={showNewsPanel} setShowNewsPanel={setShowNewsPanel} setNewsStories={setNewsStories} newsStories={newsStories} newsLoading={newsLoading} shareNews={shareNews} />

      {/* ===== 天气面板 ===== */}
      <WeatherPanel showWeatherPanel={showWeatherPanel} setShowWeatherPanel={setShowWeatherPanel} setWeatherData={setWeatherData} setWeatherCity={setWeatherCity} weatherCity={weatherCity} weatherLoading={weatherLoading} searchWeather={searchWeather} weatherData={weatherData} shareWeather={shareWeather} />

      {/* ===== 地图面板 ===== */}
      <MapPanel showMapPanel={showMapPanel} setShowMapPanel={setShowMapPanel} setShowMapViewer={setShowMapViewer} setMapResults={setMapResults} mapSearch={mapSearch} setMapSearch={setMapSearch} mapLoading={mapLoading} searchMap={searchMap} getMyLocation={getMyLocation} mapResults={mapResults} showMapViewer={showMapViewer} shareMap={shareMap} isCapacitor={isCapacitor} API_URL={API_URL} />

      {/* ===== Toast ===== */}
      <Toast toast={toast} />
    </div>
  );
}

export default App;
