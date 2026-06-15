import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { I } from './components/Icon';
import { isCapacitor, SERVER_URL, API_URL, APP_VERSION, MAJOR_VERSION, WEB_BUILD, NATIVE_BUILD, CHUNK_SIZE, DEFAULT_AVATAR, EMOJIS } from './utils/constants';
import { formatFileSize, getFileIcon, parseBilibiliUrl, formatTime, formatRecordingTime, formatMessagePreview } from './utils/format';
import { getAvatarUrl } from './utils/avatar';
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

// AvatarImg 组件：在 App 环境中通过 axios 加载图片，绕过 ngrok 安全提示页
function AvatarImg({ src, alt, className, style }) {
  const [imgSrc, setImgSrc] = useState(src);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src || src === DEFAULT_AVATAR || !src.startsWith('http')) {
      setImgSrc(src || DEFAULT_AVATAR);
      return;
    }
    // 在 App 环境中，使用 axios 获取图片并转换为 blob URL
    if (isCapacitor) {
      axios.get(src, { responseType: 'blob' })
        .then(res => {
          const blobUrl = URL.createObjectURL(res.data);
          setImgSrc(blobUrl);
          setError(false);
        })
        .catch(() => {
          setError(true);
          setImgSrc(DEFAULT_AVATAR);
        });
    } else {
      setImgSrc(src);
    }
  }, [src]);

  if (error) {
    return <img src={DEFAULT_AVATAR} alt={alt} className={className} style={style} />;
  }

  return <img src={imgSrc} alt={alt} className={className} style={style} onError={(e) => { e.target.src = DEFAULT_AVATAR; }} />;
}

function RoomAvatar({ name, size = 'md' }) {
  return (
    <div className={`room-avatar room-avatar-${size}`}>
      {(name || '群')[0]}
    </div>
  );
}

function EmptyState({ icon = 'chat', title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><I name={icon} size={44} /></div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  );
}

function FeatureItem({ icon, tone, title, desc, onClick, loading }) {
  return (
    <button className="feature-item" onClick={onClick}>
      <span className={`feature-icon feature-${tone}`}><I name={icon} size={20} /></span>
      <span className="feature-copy">
        <span className="feature-title">{title}</span>
        <span className="feature-desc">{loading || desc}</span>
      </span>
      <I name="arrowRight" size={17} className="feature-arrow" />
    </button>
  );
}

function MeMenuItem({ icon, tone, label, meta, onClick }) {
  return (
    <button className="me-menu-item" onClick={onClick}>
      <span className={`menu-icon menu-${tone}`}><I name={icon} size={18} /></span>
      <span>{label}</span>
      {meta ? <span className="menu-badge">{meta}</span> : <I name="arrowRight" size={17} className="menu-arrow" />}
    </button>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '');
  const [password, setPassword] = useState(localStorage.getItem('savedPassword') || '');
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPayCodeModal, setShowPayCodeModal] = useState(false);
  const [selectedFriendPayCode, setSelectedFriendPayCode] = useState(null);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [profileEdit, setProfileEdit] = useState({ bio: '', payCode: '' });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [messageEndRef, setMessageEndRef] = useState(null);
  const messagesContainerRef = useRef(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [view, setView] = useState('chats');
  
  // 深色模式
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');
  
  // 聊天背景
  const [chatBackgrounds, setChatBackgrounds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chatBackgrounds') || '{}'); } catch { return {}; }
  });
  
  // 消息免打扰
  const [mutedRooms, setMutedRooms] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mutedRooms') || '[]')); } catch { return new Set(); }
  });
  
  // 消息收藏
  const [starredMessages, setStarredMessages] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('starredMessages') || '[]')); } catch { return new Set(); }
  });
  
  // 快捷回复
  const [quickReplies] = useState(['好的', '收到', '没问题', '稍等', '哈哈哈', '嗯嗯', '谢谢', '再见']);
  
  // 消息置顶
  const [pinnedMessages, setPinnedMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedMessages') || '{}'); } catch { return {}; }
  });
  
  // 红包
  const [redPackets, setRedPackets] = useState({});
  const [showRedPacketModal, setShowRedPacketModal] = useState(false);
  const [redPacketAmount, setRedPacketAmount] = useState('');
  const [redPacketCount, setRedPacketCount] = useState('');
  const [redPacketMessage, setRedPacketMessage] = useState('恭喜发财，大吉大利');
  
  // 投票
  const [polls, setPolls] = useState({});
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  
  // 小游戏
  const [gameResult, setGameResult] = useState(null);
  const [showGameModal, setShowGameModal] = useState(false);
  
  // 朋友圈
  const [moments, setMoments] = useState([]);
  const [showMoments, setShowMoments] = useState(false);
  const [newMoment, setNewMoment] = useState('');
  
  // 数据统计
  const [messageStats, setMessageStats] = useState({ totalMessages: 0, todayMessages: 0, activeUsers: 0 });
  
  // 音乐分享
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [musicUrl, setMusicUrl] = useState('');
  
  // 聊天记录导出
  const [exportingChat, setExportingChat] = useState(false);
  
  // 文件传输助手
  const [fileTransferRoom, setFileTransferRoom] = useState(null);
  
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
  
  // 群公告
  const [roomAnnouncements, setRoomAnnouncements] = useState(() => {
    try { return JSON.parse(localStorage.getItem('roomAnnouncements') || '{}'); } catch { return {}; }
  });
  
  // 消息编辑
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  
  // 消息引用回复
  const [replyToMessage, setReplyToMessage] = useState(null);
  
  // @提及
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  
  // 快捷回复面板
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  
  // 语音录制
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const recordingTimerRef = useRef(null);
  
  // Toast 通知系统
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  // === 聊天室功能 ===
  // 底部Tab (聊天/通讯录/发现/我)
  const [bottomTab, setBottomTab] = useState('chats');
  // 启动闪屏
  const [showSplash, setShowSplash] = useState(true);
  // 消息转发
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  // 通讯录字母索引
  const [contactsLetter, setContactsLetter] = useState('');
  // 聊天记录备份
  const [showBackupModal, setShowBackupModal] = useState(false);
  // 字体大小 (默认16px)
  const [fontSize, setFontSize] = useState(parseInt(localStorage.getItem('chatFontSize') || '15'));
  // 聊天背景选择
  const [showBgPicker, setShowBgPicker] = useState(false);

  // ===== 新功能状态 =====
  // 图片查看器
  const [imageViewer, setImageViewer] = useState(null); // { url, urls[] } or null
  // 聊天置顶
  const [pinnedChats, setPinnedChats] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinnedChats') || '[]')); } catch { return new Set(); }
  });
  // 消息反应
  const [reactionPicker, setReactionPicker] = useState(null); // { messageId, x, y } or null
  const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🎉','💯','🔥','👏'];
  // 群接龙
  const [showSolitaireModal, setShowSolitaireModal] = useState(false);
  const [solitaireTitle, setSolitaireTitle] = useState('');
  const [solitaireFormat, setSolitaireFormat] = useState('');
  const [showSolitaireJoin, setShowSolitaireJoin] = useState(null); // solitaireId or null
  // AI 摘要
  const [aiSummary, setAiSummary] = useState(null); // { text } or null
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  // 密码找回
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwPhone, setResetPwPhone] = useState('');
  const [resetPwCode, setResetPwCode] = useState('');
  const [resetPwNewPw, setResetPwNewPw] = useState('');
  const [resetPwStep, setResetPwStep] = useState(0); // 0=phone, 1=code, 2=newPw
  const [resetPwCountdown, setResetPwCountdown] = useState(0);
  // 未读消息数
  const [unreadCounts, setUnreadCounts] = useState({});

  // ===== 第2代新功能 =====
  // AI 图片生成
  const [showImageGen, setShowImageGen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genStyle, setGenStyle] = useState('');
  const [genResult, setGenResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  // AI 翻译
  const [translatingMsg, setTranslatingMsg] = useState(null);
  const [translations, setTranslations] = useState({});
  // WebRTC
  const [callState, setCallState] = useState(null); // { type, roomId, peerId, localStream, remoteStream, status }
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  // 位置共享
  const [sharedLocations, setSharedLocations] = useState({});
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const locationWatchId = useRef(null);
  // 打卡
  const [checkInData, setCheckInData] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInNote, setCheckInNote] = useState('');
  const checkInNoteRef = useRef(null);
  // 增强投票
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollDeadline, setPollDeadline] = useState('');
  const [pollOptionImages, setPollOptionImages] = useState({});
  // Wrapped
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedData, setWrappedData] = useState(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  // Bot
  const [showBotModal, setShowBotModal] = useState(false);
  const [bots, setBots] = useState([]);
  const [botForm, setBotForm] = useState({ name: '', prompt: '', autoReply: false, scheduleCron: '', scheduleMsg: '' });

  useEffect(() => {
    localStorage.setItem('chatFontSize', fontSize.toString());
  }, [fontSize]);

  // 闪屏自动消失
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // 消息搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // 表情面板
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const EMOJIS = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','🥺','😢','😭','😤','😠','😡','🤬','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','👶','🧒','👦','👧','🧑','👱','👨','👩','🧔','👴','👵','🙋','🙌','🙏','👍','👎','💪','🤘','🖖','✌️','🤞','🤟','🤙','👌','✋','🤚','🖐️','🖖','👆','👇','👈','👉','🖕','👋','🤟','✍️','💅'];

  // 消息撤回
  const [recalledMessages, setRecalledMessages] = useState(new Set());

  const [bilibiliQuery, setBilibiliQuery] = useState('');
  const [bilibiliResults, setBilibiliResults] = useState([]);
  const [bilibiliLoading, setBilibiliLoading] = useState(false);
  const [selectedBiliVideo, setSelectedBiliVideo] = useState(null);
  const [popularVideos, setPopularVideos] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModel, setAiModel] = useState('glm-4-flash');
  const [aiModels, setAiModels] = useState([
      { id: 'glm-4-flash', name: '智谱 GLM-4-Flash（免费）', free: true },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4-Flash', free: false },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4-Pro', free: false },
      { id: 'deepseek-r1', name: 'DeepSeek R1（独立Key）', free: false },
      { id: 'moonshot-v1-8k', name: 'Kimi Moonshot-8K', free: false },
      { id: 'moonshot-v1-32k', name: 'Kimi Moonshot-32K', free: false },
      { id: 'moonshot-v1-128k', name: 'Kimi Moonshot-128K', free: false },
      { id: 'ernie-4.5-turbo-128k', name: '百度千帆 ERNIE 4.5 Turbo', free: false },
      { id: 'glm-4-plus', name: '智谱 GLM-4-Plus', free: false }
    ]);
  const [balance, setBalance] = useState(0);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargePayCode, setRechargePayCode] = useState(null);
  const [rechargeHistory, setRechargeHistory] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pendingRecharges, setPendingRecharges] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [adminDashboardLoading, setAdminDashboardLoading] = useState(false);
  const [showRoomManage, setShowRoomManage] = useState(false);

  // ===== AI 增强功能 =====
  const [smartReplies, setSmartReplies] = useState([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishText, setPolishText] = useState('');
  const [polishResult, setPolishResult] = useState('');
  const [polishTone, setPolishTone] = useState('casual');
  const [polishLoading, setPolishLoading] = useState(false);
  const [dailyDigest, setDailyDigest] = useState(null);
  const [dailyDigestLoading, setDailyDigestLoading] = useState(false);
  const [showDailyDigest, setShowDailyDigest] = useState(false);

  // ===== Phase 1 新功能 =====
  // GIF
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  // News
  const [showNewsPanel, setShowNewsPanel] = useState(false);
  const [newsStories, setNewsStories] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  // Quote
  const [dailyQuote, setDailyQuote] = useState(null);
  // AI Vision
  const [imageDesc, setImageDesc] = useState({});
  const [descLoading, setDescLoading] = useState(null);
  // Events
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  // Search
  const [searchFilter, setSearchFilter] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  // Theme
  const [themePreset, setThemePreset] = useState(localStorage.getItem('themePreset') || 'mint');
  // Weather
  const [showWeatherPanel, setShowWeatherPanel] = useState(false);
  const [weatherCity, setWeatherCity] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  // Map
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [showMapViewer, setShowMapViewer] = useState(null); // { lat, lng, name }
  // Notifications enabled
  const [notifyEnabled, setNotifyEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [notifyMuted, setNotifyMuted] = useState(false);
  const notifyRef = useRef({ enabled: notifyEnabled, muted: notifyMuted });
  useEffect(() => { notifyRef.current = { enabled: notifyEnabled, muted: notifyMuted }; }, [notifyEnabled, notifyMuted]);

  // ===== 音乐播放器 =====
  const [musicSearch, setMusicSearch] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState(null); // { id, name, artist, pic, url }
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [musicLyric, setMusicLyric] = useState('');
  const audioRef = useRef(null);

  // 视频离开视口自动暂停
  const videoObserverRef = useRef(null);
  const observeVideo = (el) => {
    if (el && videoObserverRef.current) {
      videoObserverRef.current.observe(el);
    }
  };

  useEffect(() => {
    videoObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          // 离开视口 → 暂停视频
          const video = entry.target.tagName === 'VIDEO' ? entry.target : entry.target.querySelector('video');
          if (video && !video.paused) video.pause();
          // 离开视口 → 卸载 B站 iframe
          const iframe = entry.target.tagName === 'IFRAME' ? entry.target : entry.target.querySelector('iframe');
          if (iframe && iframe.src && iframe.src.includes('bilibili')) {
            iframe.setAttribute('data-src', iframe.src);
            iframe.removeAttribute('src');
          }
        } else {
          // 回到视口 → 恢复 B站 iframe
          const iframe = entry.target.tagName === 'IFRAME' ? entry.target : entry.target.querySelector('iframe');
          if (iframe && !iframe.src && iframe.getAttribute('data-src')) {
            iframe.src = iframe.getAttribute('data-src');
          }
        }
      });
    }, { rootMargin: '200px' });
    return () => videoObserverRef.current?.disconnect();
  }, []);

  const aiMessagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  // 诊断信息
  const [diag, setDiag] = useState('');
  useEffect(() => {
    // APK 启动流程：1.重新登录 2.检测连接 3.加载数据
    const startup = async () => {
      if (isCapacitor) {
        const u = localStorage.getItem('savedUsername');
        const p = localStorage.getItem('savedPassword');
        if (u && p) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: u, password: p }, { timeout: 10000 });
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + '🔐 OK | ');
          } catch {
            localStorage.removeItem('token'); localStorage.removeItem('user');
            setToken(null); setUser(null);
            setDiag(d => d + '🔐 FAIL | ');
          }
        }
      }
      // 连接检测（不弹 toast，静默）
      if (isCapacitor) {
        try {
          await axios.get(`${API_URL}/api/ai/models`, { timeout: 5000 });
          setDiag(d => d + '✅ | ');
        } catch {
          setDiag(d => d + '❌ | ');
        }
      }
    };
    startup();

    // Token 验证 + 自动重新登录（Web 端）
    const checkAuth = async () => {
      if (!token) return;
      try {
        await axios.get(`${API_URL}/api/profile`, { headers: { Authorization: token } });
      } catch (err) {
        // Token 无效，尝试用保存的密码重新登录
        const savedUser = localStorage.getItem('savedUsername');
        const savedPass = localStorage.getItem('savedPassword');
        if (savedUser && savedPass) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: savedUser, password: savedPass });
            const newToken = res.data.token;
            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + 'Auto-relogin OK | ');
            return; // 登录成功，不需要清除
          } catch (e2) {
            setDiag(d => d + 'Auto-relogin FAILED | ');
          }
        }
        // 无法恢复，清除
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (token) {
      validateToken();
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && user) {
      connectSocket();
      fetchRooms();
      fetchFriends();
      fetchFriendRequests();
      fetchUsers();
      fetchPopularVideos();
      fetchAiModels();
      fetchPhoneInfo();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off('reactionUpdated');
        socketRef.current.off('solitaireUpdated');
        socketRef.current.off('unreadCounts');
        socketRef.current.off('solitaireError');
        socketRef.current.off('incomingCall');
        socketRef.current.off('callAccepted');
        socketRef.current.off('iceCandidate');
        socketRef.current.off('callEnded');
        socketRef.current.off('locationUpdate');
        socketRef.current.off('locationStopped');
        socketRef.current.off('locationsList');
        socketRef.current.off('checkInUpdate');
        socketRef.current.off('checkInList');
        socketRef.current.off('checkInError');
        socketRef.current.disconnect();
      }
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
      socketRef.current.emit('joinRoom', currentRoomId);
      // 先加载本地缓存，秒开
      try {
        const cached = JSON.parse(localStorage.getItem('msgCache_' + currentRoomId) || '[]');
        if (cached.length > 0) { setMessages(cached); setMessagesLoading(false); }
        else { setMessagesLoading(true); }
      } catch { setMessagesLoading(true); }
    }
  }, [currentRoomId]);

  // 深色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    changeTheme(themePreset);
  }, []);

  // 保存聊天背景
  useEffect(() => {
    localStorage.setItem('chatBackgrounds', JSON.stringify(chatBackgrounds));
  }, [chatBackgrounds]);

  // 保存免打扰设置
  useEffect(() => {
    localStorage.setItem('mutedRooms', JSON.stringify([...mutedRooms]));
  }, [mutedRooms]);

  // 保存收藏
  useEffect(() => {
    localStorage.setItem('starredMessages', JSON.stringify([...starredMessages]));
  }, [starredMessages]);

  // 保存置顶
  useEffect(() => {
    localStorage.setItem('pinnedMessages', JSON.stringify(pinnedMessages));
  }, [pinnedMessages]);

  // 保存群公告
  useEffect(() => {
    localStorage.setItem('roomAnnouncements', JSON.stringify(roomAnnouncements));
  }, [roomAnnouncements]);

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

  const validateToken = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/profile`, {
        headers: { Authorization: token }
      });
      setUser(response.data);
      setProfileEdit({ bio: response.data.bio || '', payCode: response.data.payCode || '' });
      setIsAuthenticated(true);
      // 获取余额
      axios.get(`${API_URL}/api/user/balance`, { headers: { Authorization: token } })
        .then(res => setBalance(res.data.balance))
        .catch(() => {});
    } catch (err) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
    }
  };

  const connectSocket = () => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }
    const wsUrl = API_URL || window.location.origin;
    console.log('Socket connecting to:', wsUrl);
    socketRef.current = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      upgrade: false,
      perMessageDeflate: true
    });
    socketRef.current.on('connect', () => {
      console.log('Socket connected');
      socketRef.current.emit('authenticate', token);
    });
    socketRef.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      showToast('连接已断开，正在重连...', 'info');
    });
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
      showToast('网络连接异常，请检查服务器是否运行', 'error');
    });
    socketRef.current.on('authenticated', (data) => {
      console.log('Socket authenticated', data);
    });
    // 接收完整在线用户列表（首次连接时）
    socketRef.current.on('onlineUsersList', (list) => {
      const ids = new Set(list.map(u => u.id));
      setOnlineUsers(list);
      setFriends(prev => prev.map(f => ({ ...f, online: ids.has(f.id) })));
    });
    socketRef.current.on('userOnline', (data) => {
      setOnlineUsers(prev => [...prev.filter(u => u.id !== data.id), data]);
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: true } : f));
    });
    socketRef.current.on('userOffline', (data) => {
      setOnlineUsers(prev => prev.filter(u => u.id !== data.id));
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: false } : f));
    });
    socketRef.current.on('newMessage', (message) => {
      setMessages(prev => {
        const next = [...prev, message];
        // 本地缓存最近 100 条消息
        try { localStorage.setItem('msgCache_' + message.roomId, JSON.stringify(next.slice(-100))); } catch {}
        return next;
      });
      setRooms(prev => prev.map(room => {
        if (room.id === message.roomId) {
          return { ...room, lastMessage: message };
        }
        return room;
      }));
      if (typeof Notification !== 'undefined' && notifyRef.current.enabled && !notifyRef.current.muted && message.sender?.id !== user?.id && document.hidden) {
        try {
          new Notification(message.sender?.username || '新消息', {
            body: (message.content || `[${message.type}]`).substring(0, 100),
            icon: message.sender?.avatar || undefined,
            tag: message.roomId
          });
        } catch {}
      }
    });
    socketRef.current.on('joinedRoom', (data) => {
      setMessages(data.messages || []);
      setMessagesLoading(false);
    });
    socketRef.current.on('userTyping', ({ username }) => {
      setTypingUser(username);
    });
    socketRef.current.on('userStopTyping', () => {
      setTypingUser(null);
    });
    socketRef.current.on('roomCreated', (room) => {
      setRooms(prev => {
        if (prev.find(r => r.id === room.id)) return prev;
        return [...prev, room];
      });
    });
    socketRef.current.on('groupCreated', (room) => {
      setCurrentRoom(room);
      setCurrentRoomId(room.id);
      setShowCreateModal(false);
    });
    socketRef.current.on('friendRequest', (data) => {
      setFriendRequests(prev => {
        if (prev.find(r => r.id === data.id)) return prev;
        return [...prev, data];
      });
    });
    socketRef.current.on('friendAccepted', (data) => {
      setFriends(prev => {
        if (prev.find(f => f.id === data.id)) return prev;
        return [...prev, { ...data, online: true }];
      });
    });
    socketRef.current.on('messageRecalled', ({ messageId, roomId }) => {
      setRecalledMessages(prev => new Set([...prev, messageId]));
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, recalled: true } : msg
      ));
      showToast('一条消息已被撤回', 'info');
    });

    // 消息被删除
    socketRef.current.on('messageDeleted', ({ messageId, roomId }) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      showToast('一条消息已被删除', 'info');
    });

    // 删除错误
    socketRef.current.on('deleteError', ({ error }) => {
      showToast(error, 'error');
    });

    // 聊天被删除（自己退出或被移出房间）
    socketRef.current.on('chatDeleted', ({ roomId }) => {
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (currentRoomId === roomId) {
        setCurrentRoom(null);
        setCurrentRoomId(null);
        setMessages([]);
      }
      showToast('已删除聊天', 'info');
    });

    // 已读回执更新
    socketRef.current.on('messageReadUpdate', ({ messageId, userId, readBy }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, readBy } : msg
      ));
    });
    
    // @提及通知
    socketRef.current.on('mentionNotification', ({ messageId, roomId, roomName, sender }) => {
      showToast(`${sender} 在 ${roomName} 中提到了你`, 'info');
    });
    
    // 所有消息已读
    socketRef.current.on('allMessagesRead', ({ roomId, userId }) => {
      if (userId === socketRef.current.userId) return;
      setMessages(prev => prev.map(msg => ({
        ...msg,
        readBy: (msg.readBy || []).includes(userId) ? msg.readBy : [...(msg.readBy || []), userId]
      })));
    });

    // 消息编辑
    socketRef.current.on('messageEdited', ({ messageId, content, editedAt }) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, content, edited: true, editedAt } : msg
      ));
    });

    // 消息转发
    socketRef.current.on('messageForwarded', (message) => {
      setMessages(prev => [...prev, message]);
      setRooms(prev => prev.map(room => {
        if (room.id === message.roomId) {
          return { ...room, lastMessage: message };
        }
        return room;
      }));
    });

    // 红包相关
    socketRef.current.on('redPacketClaimed', ({ packetId, userId, share }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === packetId) {
          const newClaimed = [...(msg.claimed || []), userId];
          return { ...msg, claimed: newClaimed, remaining: msg.remaining - 1 };
        }
        return msg;
      }));
      if (userId === user?.id) {
        showToast(`抢到红包 ¥${share.toFixed(2)}！`, 'success');
      }
    });

    // 红包错误
    socketRef.current.on('redPacketError', ({ error }) => {
      showToast(error, 'error');
    });

    // 余额更新
    socketRef.current.on('balanceUpdated', ({ balance }) => {
      setBalance(balance);
    });

    // 投票更新
    socketRef.current.on('pollUpdated', ({ pollId, optionIndex, userId }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === pollId) {
          const newOptions = [...msg.options];
          newOptions[optionIndex] = {
            ...newOptions[optionIndex],
            votes: [...(newOptions[optionIndex].votes || []), userId]
          };
          return { ...msg, options: newOptions };
        }
        return msg;
      }));
    });

    // 群公告
    socketRef.current.on('announcementUpdated', ({ roomId, announcement }) => {
      setRoomAnnouncements(prev => ({ ...prev, [roomId]: announcement }));
      setCurrentRoom(prev => prev?.id === roomId ? { ...prev, announcement } : prev);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, announcement } : r));
      showToast('群公告已更新', 'info');
    });

    // 被踢出群
    socketRef.current.on('youWereKicked', ({ roomId, roomName }) => {
      showToast(`你已被移出群聊「${roomName}」`, 'error');
      if (currentRoomId === roomId) {
        setCurrentRoomId(null);
        setCurrentRoom(null);
        setMessages([]);
      }
    });

    socketRef.current.on('memberKicked', ({ roomId, username }) => {
      setCurrentRoom(prev => prev?.id === roomId ? { ...prev, members: (prev.members || []).filter(m => m !== username) } : prev);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, members: (r.members || []).filter(m => m !== username) } : r));
      showToast(`${username} 已被移出群聊`, 'info');
    });

    socketRef.current.on('memberMuted', ({ roomId, username }) => {
      setCurrentRoom(prev => prev?.id === roomId ? { ...prev, mutedMembers: [...new Set([...(prev.mutedMembers || []), username])] } : prev);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, mutedMembers: [...new Set([...(r.mutedMembers || []), username])] } : r));
    });

    socketRef.current.on('memberUnmuted', ({ roomId, username }) => {
      setCurrentRoom(prev => prev?.id === roomId ? { ...prev, mutedMembers: (prev.mutedMembers || []).filter(m => m !== username) } : prev);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, mutedMembers: (r.mutedMembers || []).filter(m => m !== username) } : r));
    });

    // 朋友圈
    socketRef.current.on('newMoment', (moment) => {
      setMoments(prev => [moment, ...prev]);
    });

    socketRef.current.on('momentLiked', ({ momentId, userId }) => {
      setMoments(prev => prev.map(m => {
        if (m.id === momentId) {
          const likes = [...(m.likes || [])];
          if (!likes.includes(userId)) likes.push(userId);
          return { ...m, likes };
        }
        return m;
      }));
    });

    socketRef.current.on('momentComment', ({ momentId, comment }) => {
      setMoments(prev => prev.map(m => {
        if (m.id === momentId) {
          return { ...m, comments: [...(m.comments || []), comment] };
        }
        return m;
      }));
    });

    // 聊天导出
    socketRef.current.on('chatExport', ({ roomId, roomName, messages }) => {
      const data = JSON.stringify(messages, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roomName}_chat_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('聊天记录已导出', 'success');
      setExportingChat(false);
    });

    // 统计
    socketRef.current.on('statsResult', (stats) => {
      setMessageStats(stats);
    });

    // ===== 新功能 Socket 监听 =====
    // 消息反应更新
    socketRef.current.on('reactionUpdated', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, reactions } : msg
      ));
    });

    // 群接龙更新
    socketRef.current.on('solitaireUpdated', ({ solitaireId, participants }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === solitaireId ? { ...msg, participants } : msg
      ));
    });

    // 未读消息计数
    socketRef.current.on('unreadCounts', (counts) => {
      setUnreadCounts(counts);
    });

    // 接龙错误
    socketRef.current.on('solitaireError', ({ error }) => {
      showToast(error, 'error');
    });

    // ===== WebRTC 信令监听 =====
    socketRef.current.on('incomingCall', ({ from, roomId, signal, callType }) => {
      setCallState({ type: callType || 'video', status: 'incoming', signal, peerId: from.id, localStream: null, remoteStream: null, roomId, caller: from });
      showToast(`${from.username} 正在呼叫你...`, 'info');
    });
    socketRef.current.on('callAccepted', ({ from, signal }) => {
      try {
        if (peerRef.current && peerRef.current.signalingState !== 'closed') {
          peerRef.current.setRemoteDescription(new RTCSessionDescription(signal)).catch(() => {});
          setCallState(prev => prev ? { ...prev, status: 'connecting' } : null);
        }
      } catch(e) {}
    });
    socketRef.current.on('iceCandidate', ({ from, candidate }) => {
      try {
        if (peerRef.current && peerRef.current.signalingState !== 'closed' && candidate) {
          peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      } catch(e) {}
    });
    socketRef.current.on('callEnded', () => {
      setCallState(prev => {
        if (!prev) return null;
        if (prev.localStream) {
          try { prev.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
        }
        return null;
      });
      try { if (peerRef.current) { peerRef.current.close(); peerRef.current = null; } } catch(e) {}
      showToast('通话已结束', 'info');
    });

    // ===== 位置 + 打卡监听 =====
    socketRef.current.on('locationUpdate', ({ userId, username, lat, lng }) => {
      setSharedLocations(prev => ({ ...prev, [userId]: { lat, lng, username } }));
    });
    socketRef.current.on('locationStopped', ({ userId }) => {
      setSharedLocations(prev => { const n = { ...prev }; delete n[userId]; return n; });
    });
    socketRef.current.on('locationsList', (locations) => {
      const map = {}; locations.forEach(l => { map[l.userId] = l; });
      setSharedLocations(map);
    });
    socketRef.current.on('checkInUpdate', ({ entry, total }) => {
      showToast(`${entry.username} 打卡成功！今日 ${total} 人已打卡`, 'success');
    });
    socketRef.current.on('checkInList', (data) => {
      setCheckInData(data);
    });
    socketRef.current.on('checkInError', ({ error }) => { showToast(error, 'error'); });
  };

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/rooms`, { headers: { Authorization: token } });
      setRooms(Array.isArray(response.data) ? response.data : []);
      setDiag(d => d + 'Rooms:' + (Array.isArray(response.data)?response.data.length:'err') + ' | ');
    } catch (err) { console.error('Failed to fetch rooms', err); setRooms([]); setDiag(d => d + 'Rooms:FAIL | '); }
  };

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friends`, { headers: { Authorization: token } });
      const data = Array.isArray(response.data) ? response.data : [];
      setFriends(data);
      setDiag(d => d + 'Friends:' + data.length + ' | ');
    } catch (err) { console.error('Failed to fetch friends', err); setFriends([]); setDiag(d => d + 'Friends:FAIL | '); }
  };

  const fetchFriendRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friend-requests`, {
        headers: { Authorization: token }
      });
      setFriendRequests(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch friend requests', err);
      setFriendRequests([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { Authorization: token }
      });
      setAllUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch users', err);
      setAllUsers([]);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { username, password });
      const { token: newToken, user: userData } = response.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('savedUsername', username);
      localStorage.setItem('savedPassword', password);
      setToken(newToken);
      setUser(userData);
      setProfileEdit({ bio: userData.bio || '', payCode: userData.payCode || '' });
      setIsAuthenticated(true);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() && !editingMessage) return;
    
    if (editingMessage) {
      // 编辑消息
      socketRef.current.emit('editMessage', {
        roomId: currentRoomId,
        messageId: editingMessage,
        content: newMessage.trim()
      });
      setEditingMessage(null);
      setEditText('');
      setNewMessage('');
      showToast('消息已编辑', 'success');
      return;
    }
    
    // 解析@提及
    const mentions = [];
    const content = newMessage.trim();
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedUser = allUsers.find(u => u.username === match[1]);
      if (mentionedUser) mentions.push(mentionedUser.id);
    }
    
    socketRef.current.emit('sendMessage', {
      roomId: currentRoomId,
      content,
      type: 'text',
      replyTo: replyToMessage ? replyToMessage.id : null,
      mentions: [...new Set(mentions)]
    });
    setMessages(prev => [...prev, {id:'temp-'+Date.now(),content,type:'text',sender:{id:user?.id,username:user?.username,avatar:user?.avatar},roomId:currentRoomId,timestamp:new Date(),readBy:[user?.id]}]);
    socketRef.current.emit('stopTyping', currentRoomId);
    setNewMessage('');
    setReplyToMessage(null);
    setShowEmojiPicker(false);
    setShowMentionPicker(false);
  };

  // 编辑消息
  const startEditMessage = (msg) => {
    setEditingMessage(msg.id);
    setNewMessage(msg.content);
    setEditText(msg.content);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
    setNewMessage('');
  };

  // 收藏/取消收藏
  const toggleStarMessage = (messageId) => {
    setStarredMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
        showToast('已取消收藏', 'info');
      } else {
        next.add(messageId);
        showToast('已收藏消息', 'success');
      }
      return next;
    });
  };

  // 置顶/取消置顶
  const togglePinMessage = (messageId) => {
    setPinnedMessages(prev => {
      const next = { ...prev };
      if (next[currentRoomId]?.includes(messageId)) {
        next[currentRoomId] = next[currentRoomId].filter(id => id !== messageId);
        showToast('已取消置顶', 'info');
      } else {
        if (!next[currentRoomId]) next[currentRoomId] = [];
        next[currentRoomId].push(messageId);
        showToast('已置顶消息', 'success');
      }
      return next;
    });
  };

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
  const recallMessage = (messageId) => {
    if (!currentRoomId) return;
    socketRef.current.emit('recallMessage', {
      roomId: currentRoomId,
      messageId,
    });
    showToast('已撤回消息', 'success');
  };

  // 删除消息
  const deleteMessage = (messageId) => {
    if (!currentRoomId || !window.confirm('确定要删除这条消息吗？')) return;
    socketRef.current.emit('deleteMessage', {
      roomId: currentRoomId,
      messageId,
    });
  };

  // 删除/退出聊天
  const deleteChat = (roomId, e) => {
    e?.stopPropagation();
    if (!window.confirm('确定要删除该聊天吗？\n\n删除后你将不再看到此聊天记录。')) return;
    socketRef.current.emit('deleteChat', { roomId });
  };

  // 插入表情
  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    if (currentRoomId && e.target.value) {
      socketRef.current.emit('typing', currentRoomId);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit('stopTyping', currentRoomId);
      }, 2000);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 图片压缩（Canvas 缩放，目标 < 1MB）
  const compressImage = (file) => new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 500 * 1024) return resolve(file);
    const img = new Image();
    img.onload = () => {
      const maxW = 1920, maxH = 1920;
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w *= r; h *= r; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(file);
  });

  const uploadFile = async (file) => {
    if (!file || !currentRoomId) return;
    const maxChunk = 2 * 1024 * 1024;
    try {
      const processed = await compressImage(file);
      if (processed.size > maxChunk) {
        await uploadChunked(processed, maxChunk);
      } else {
        await uploadSimple(processed);
      }
    } catch (err) {
      setUploadProgress(null);
      showToast('上传失败: ' + (err.message || '网络错误'), 'error');
    }
  };

  const uploadSimple = async (file) => {
    setUploadProgress({ filename: file.name, progress: 0 });
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/api/upload/simple`, formData, {
      headers: { Authorization: token, 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => setUploadProgress({ filename: file.name, progress: Math.round((e.loaded / e.total) * 100) })
    });
    setUploadProgress(null);
    sendMediaMessage(response.data.url, file.name, file.type, file.size);
  };

  const uploadChunked = async (file, chunkSize) => {
    const totalChunks = Math.ceil(file.size / chunkSize);
    // 1. Init
    const initRes = await axios.post(`${API_URL}/api/upload/init`, {
      filename: file.name, totalChunks, fileSize: file.size, mimeType: file.type
    }, { headers: { Authorization: token } });
    const uploadId = initRes.data.uploadId;

    // 2. Upload chunks sequentially (avoids server overload)
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      const fd = new FormData();
      fd.append('chunk', chunk, `chunk_${i}`);
      fd.append('uploadId', uploadId);
      fd.append('chunkIndex', String(i));
      await axios.post(`${API_URL}/api/upload/chunk`, fd, {
        headers: { Authorization: token, 'Content-Type': 'multipart/form-data' }
      });
      setUploadProgress({ filename: file.name, progress: Math.round(((i + 1) / totalChunks) * 100) });
    }

    // 3. Complete
    const compRes = await axios.post(`${API_URL}/api/upload/complete`, { uploadId }, {
      headers: { Authorization: token }
    });
    setUploadProgress(null);
    sendMediaMessage(compRes.data.url, file.name, file.type, file.size);
  };

  const sendMediaMessage = (fileUrl, filename, mimeType, fileSize) => {
    if (!currentRoomId) return;
    let type = 'file';
    if (mimeType.startsWith('image/')) type = 'image';
    else if (mimeType.startsWith('video/')) type = 'video';
    else if (mimeType.startsWith('audio/')) type = 'audio';
    
    socketRef.current.emit('sendMessage', {
      roomId: currentRoomId,
      content: '',
      type,
      fileUrl: `${API_URL}${fileUrl}`,
      filename,
      fileSize,
      mimeType
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
    }
    e.target.value = '';
  };

  const handleRoomClick = (room) => {
    setCurrentRoom(room);
    setCurrentRoomId(room.id);
  };

  const createGroup = () => {
    const groupName = prompt('请输入群聊名称：');
    if (!groupName || !groupName.trim()) return;
    const selectedFriends = friends.filter(f => window.confirm(`是否添加 ${f.username} 到群聊？`));
    socketRef.current.emit('createGroup', {
      name: groupName.trim(),
      members: selectedFriends.map(f => f.username)
    });
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try {
      // 支持 6位数字ID 或 用户名搜索
      const isNumericId = /^\d{6}$/.test(searchId.trim());
      let response;
      if (isNumericId) {
        response = await axios.get(`${API_URL}/api/users/search/${searchId.trim()}`, { headers: { Authorization: token } });
      } else {
        response = await axios.get(`${API_URL}/api/users/searchByName/${encodeURIComponent(searchId.trim())}`, { headers: { Authorization: token } });
      }
      setSearchResult(response.data);
    } catch (err) {
      setSearchResult(null);
      showToast('未找到该用户', 'error');
    }
  };

  const sendFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/request`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      showToast('好友请求已发送', 'success');
      setSearchResult(prev => prev ? { ...prev, requestSent: true } : null);
    } catch (err) {
      alert(err.response?.data?.error || '发送失败');
    }
  };

  const fetchPopularVideos = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/bilibili/popular`, {
        headers: { Authorization: token }
      });
      if (res.data.code === 0 && res.data.data?.list) {
        setPopularVideos(res.data.data.list.map(v => ({
          bvid: v.bvid,
          title: v.title,
          author: v.owner?.name,
          pic: v.pic ? `${API_URL}/api/bilibili/proxy-image?url=${encodeURIComponent(v.pic)}` : '',
          play: v.stat?.view || 0,
          duration: v.duration ? `${Math.floor(v.duration/60)}:${String(v.duration%60).padStart(2,'0')}` : '',
          description: v.desc || ''
        })));
      }
    } catch (err) {
      console.error('获取热门视频失败', err);
    }
  };

  const fetchAiModels = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ai/models`, {
        headers: { Authorization: token }
      });
      if (res.data.models) setAiModels(res.data.models);
    } catch (err) {
      console.error('获取模型列表失败', err);
    }
  };

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

  const sendAiMessage = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    setAiMessages(prev => [...prev, { role: 'user', content: text }]);
    setAiInput('');
    setAiLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/chat`, {
        message: text,
        model: aiModel
      }, { headers: { Authorization: token } });
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: res.data.reply || '（无回复）',
        provider: res.data.provider,
        model: res.data.model,
        requestedModel: res.data.requestedModel,
        hint: res.data.hint
      }]);
      if (res.data.balance !== undefined) {
        setBalance(res.data.balance);
      }
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.error || err.message || '请求失败';
      if (data?.hint) msg += '\n\n' + data.hint;
      if (err.response?.status === 402) {
        msg += '\n\n请点击上方"充值"按钮充值余额';
      }
      const rechargeUrl = data?.rechargeUrl;
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: '' + msg,
        ...(rechargeUrl ? { rechargeUrl } : {})
      }]);
    } finally {
      setAiLoading(false);
    }
  };

  const fetchAiStatus = async () => {
    if (user?.username !== 'admin') return;
    setAiStatusLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/ai-status`, {
        headers: { Authorization: token }
      });
      setAiStatus(response.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'AI 状态获取失败', 'error');
    } finally {
      setAiStatusLoading(false);
    }
  };

  const fetchAdminDashboard = async () => {
    if (user?.username !== 'admin') return;
    setAdminDashboardLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/dashboard`, {
        headers: { Authorization: token }
      });
      setAdminDashboard(response.data);
    } catch (err) {
      showToast(err.response?.data?.error || '管理概览获取失败', 'error');
    } finally {
      setAdminDashboardLoading(false);
    }
  };

  const openAdminCenter = () => {
    setShowAdminModal(true);
    fetchPendingRecharges();
    fetchAiStatus();
    fetchAdminDashboard();
  };

  const resetAiChat = async () => {
    setAiMessages([]);
    try {
      await axios.post(`${API_URL}/api/ai/reset`, {}, { 
        headers: { Authorization: token } 
      });
    } catch (e) {}
  };

  const handleAiKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiMessage();
    }
  };

  // ===== AI 增强功能函数 =====

  // 智能快捷回复
  const fetchSmartReplies = async () => {
    if (!currentRoomId || smartRepliesLoading) return;
    setSmartRepliesLoading(true);
    try {
      const recentMsgs = messages.slice(-5).filter(m => m.type === 'text' && !m.recalled);
      if (recentMsgs.length === 0) { setSmartReplies([]); setSmartRepliesLoading(false); return; }
      const context = recentMsgs.map(m => `${m.sender?.username}: ${m.content}`).join('\n');
      const res = await axios.post(`${API_URL}/api/ai/smart-reply`,
        { roomId: currentRoomId, context },
        { headers: { Authorization: token } }
      );
      setSmartReplies(res.data.replies || []);
    } catch (err) {
      setSmartReplies([]);
    } finally {
      setSmartRepliesLoading(false);
    }
  };

  // 消息润色
  const polishMessage = async () => {
    if (!polishText.trim() || polishLoading) return;
    setPolishLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/polish-message`,
        { text: polishText.trim(), tone: polishTone },
        { headers: { Authorization: token } }
      );
      setPolishResult(res.data.polished);
    } catch (err) {
      showToast('润色失败', 'error');
    } finally {
      setPolishLoading(false);
    }
  };

  // 应用润色结果到输入框
  const applyPolish = () => {
    setNewMessage(polishResult);
    setShowPolishModal(false);
    setPolishText('');
    setPolishResult('');
    showToast('已应用润色', 'success');
  };

  // AI 每日摘要
  const fetchDailyDigest = async () => {
    setDailyDigestLoading(true);
    setShowDailyDigest(true);
    try {
      const res = await axios.post(`${API_URL}/api/ai/daily-digest`,
        {},
        { headers: { Authorization: token } }
      );
      setDailyDigest(res.data);
    } catch (err) {
      showToast('摘要生成失败', 'error');
      setShowDailyDigest(false);
    } finally {
      setDailyDigestLoading(false);
    }
  };

  // ===== Phase 1 新功能 =====
  const searchGif = async (e) => {
    e?.preventDefault();
    if (!gifSearch.trim() || gifLoading) return;
    setGifLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/giphy/search`, { params: { q: gifSearch.trim() }, headers: { Authorization: token } });
      setGifResults(res.data.gifs || []);
    } catch { setGifResults([]); }
    finally { setGifLoading(false); }
  };
  const sendGif = (gif) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: '', type: 'image', fileUrl: gif.url, filename: 'gif', mimeType: 'image/gif' });
    setShowGifPanel(false); setGifSearch(''); setGifResults([]);
  };
  const fetchNews = async () => {
    setNewsLoading(true); setShowNewsPanel(true);
    try {
      const res = await axios.get(`${API_URL}/api/news/hot`, { headers: { Authorization: token } });
      setNewsStories(res.data.stories || []);
    } catch { setNewsStories([]); }
    finally { setNewsLoading(false); }
  };
  const shareNews = (story) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: `📰 ${story.title}\n${story.url}`, type: 'text' });
    showToast('已分享', 'success');
  };
  const fetchQuote = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/quote/random`, { headers: { Authorization: token } });
      setDailyQuote(res.data);
    } catch {}
  };

  // ===== Phase 2-3 新功能 =====
  const describeImage = async (msgId, imageUrl) => {
    if (imageDesc[msgId] || descLoading === msgId) return;
    setDescLoading(msgId);
    try {
      const res = await axios.post(`${API_URL}/api/ai/describe-image`, { imageUrl }, { headers: { Authorization: token } });
      setImageDesc(prev => ({ ...prev, [msgId]: res.data.description }));
    } catch { showToast('识别失败', 'error'); }
    finally { setDescLoading(null); }
  };
  const createEvent = () => {
    if (!currentRoomId || !eventTitle.trim() || !eventTime) return;
    axios.post(`${API_URL}/api/events/create`, { roomId: currentRoomId, title: eventTitle.trim(), time: eventTime }, { headers: { Authorization: token } })
      .then(() => { setShowEventModal(false); setEventTitle(''); setEventTime(''); showToast('日程已创建', 'success'); })
      .catch(e => showToast(e.response?.data?.error || '创建失败', 'error'));
  };
  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') { showToast('此浏览器不支持桌面通知', 'error'); return; }
    try {
      const perm = await Notification.requestPermission();
      setNotifyEnabled(perm === 'granted');
      if (perm === 'granted') showToast('桌面通知已开启', 'success');
    } catch { showToast('浏览器不支持通知', 'error'); }
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
  const doSearch = async () => {
    if (!currentRoomId || !searchQuery) return;
    try {
      const res = await axios.get(`${API_URL}/api/rooms/${currentRoomId}/search`, {
        params: { q: searchQuery, type: searchFilter === 'all' ? '' : searchFilter, limit: 50 },
        headers: { Authorization: token }
      });
      setSearchResults(res.data.messages || []);
    } catch { setSearchResults([]); }
  };
  // 天气（统一走服务端代理）
  const searchWeather = async (e) => {
    e?.preventDefault();
    if (!weatherCity.trim() || weatherLoading) return;
    setWeatherLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/weather/${encodeURIComponent(weatherCity.trim())}`, { headers: { Authorization: token } });
      setWeatherData(res.data);
    } catch { showToast('天气查询失败', 'error'); }
    finally { setWeatherLoading(false); }
  };
  const shareWeather = () => {
    if (!currentRoomId || !weatherData) return;
    const w = weatherData;
    const content = `🌤 ${w.city} 天气\n🌡 ${w.temp}°C (体感 ${w.feelsLike}°C)\n☁ ${w.desc}\n💧 湿度 ${w.humidity}% | 🌬 ${w.wind}\n📊 ${w.high}°C / ${w.low}°C`;
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content, type: 'text' });
    showToast('已分享天气', 'success');
  };
  // 地图 (高德)
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState([]);
  const searchMap = async (e) => {
    e?.preventDefault();
    if (!mapSearch.trim() || mapLoading) return;
    setMapLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/map/poi`, { params: { keyword: mapSearch.trim() }, headers: { Authorization: token } });
      setMapResults(res.data.pois || []);
    } catch { setMapResults([]); showToast('搜索失败', 'error'); }
    finally { setMapLoading(false); }
  };
  const getMyLocation = async () => {
    setMapLoading(true);
    try {
      let lat, lng;
      if (isCapacitor) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: true });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else if (navigator.geolocation) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
        });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else { showToast('不支持定位', 'error'); setMapLoading(false); return; }
      setShowMapViewer({ lat, lng, name: '我的位置' });
    } catch { showToast('定位失败', 'error'); }
    setMapLoading(false);
  };
  const shareMap = (poi) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    const mapUrl = `${API_URL}/api/map/static?lat=${poi.lat}&lng=${poi.lng}&zoom=16`;
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: `📍 ${poi.name || poi.fullName}\n${mapUrl}`, type: 'text' });
    setShowMapPanel(false); setShowMapViewer(null);
    showToast('已分享', 'success');
  };

  // ===== 音乐播放器 =====
  const searchMusic = async (e) => {
    e?.preventDefault();
    if (!musicSearch.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicResults([]);
    try {
      const res = await axios.get(`${API_URL}/api/music/search`, {
        params: { keyword: musicSearch.trim() },
        headers: { Authorization: token }
      });
      setMusicResults(res.data.songs || []);
    } catch (err) {
      showToast('搜索失败', 'error');
    } finally {
      setMusicLoading(false);
    }
  };

  const playSong = async (song) => {
    try {
      const res = await axios.get(`${API_URL}/api/music/url/${song.id}`, {
        headers: { Authorization: token }
      });
      const url = res.data.url;
      if (!url) { showToast('暂无播放地址', 'error'); return; }
      setCurrentSong({ ...song, url });
      setIsPlaying(true);
      // 延迟播放，等 audio 元素挂载
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => showToast('播放失败', 'error'));
        }
      }, 100);
      // 获取歌词
      axios.get(`${API_URL}/api/music/lyric/${song.id}`, { headers: { Authorization: token } })
        .then(r => setMusicLyric(r.data.lyric || ''))
        .catch(() => setMusicLyric(''));
    } catch (err) {
      showToast('获取播放地址失败', 'error');
    }
  };

  const shareSongToChat = (song) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    const content = ` ${song.name} - ${song.artist}\n${song.url || ''}`;
    socketRef.current?.emit('sendMessage', {
      roomId: currentRoomId,
      content,
      type: 'text'
    });
    showToast('已分享到聊天', 'success');
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
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

  const searchBilibili = async (e) => {
    e?.preventDefault();
    if (!bilibiliQuery.trim()) return;
    setBilibiliLoading(true);
    try {
      const res = await axios.get(
        `${API_URL}/api/bilibili/search`,
        {
          params: { keyword: bilibiliQuery.trim() },
          headers: { Authorization: token }
        }
      );
      if (res.data.code === 0 && res.data.data?.result) {
        setBilibiliResults(res.data.data.result.map(v => ({
          bvid: v.bvid,
          title: v.title.replace(/<[^>]*>/g, ''),
          author: v.author,
          pic: v.pic ? `${API_URL}/api/bilibili/proxy-image?url=${encodeURIComponent(v.pic)}` : '',
          play: v.play,
          duration: v.duration,
          description: v.description?.replace(/<[^>]*>/g, '') || ''
        })));
      } else {
        setBilibiliResults([]);
        showToast('没有搜索结果', 'info');
      }
    } catch (err) {
      console.error('B站搜索失败', err);
      setBilibiliResults([]);
      alert('搜索失败：' + (err.response?.data?.error || err.message));
    }
    setBilibiliLoading(false);
  };

  const shareBilibiliToChat = (video) => {
    const url = `https://www.bilibili.com/video/${video.bvid}`;
    if (currentRoomId) {
      socketRef.current.emit('sendMessage', {
        roomId: currentRoomId,
        content: url,
        type: 'text'
      });
      showToast('已分享到聊天', 'success');
    } else {
      showToast('请先选择聊天室', 'error');
    }
  };

  const acceptFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/accept`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      setFriendRequests(prev => prev.filter(r => r.username !== targetUsername));
      fetchFriends();
    } catch (err) {
      alert(err.response?.data?.error || '操作失败');
    }
  };

  const rejectFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/reject`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      setFriendRequests(prev => prev.filter(r => r.username !== targetUsername));
    } catch (err) {
      alert(err.response?.data?.error || '操作失败');
    }
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

  // 获取余额
  const fetchBalance = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/user/balance`, {
        headers: { Authorization: token }
      });
      setBalance(response.data.balance);
    } catch (err) {
      console.error('获取余额失败:', err);
    }
  };

  // 充值请求
  const requestRecharge = async () => {
    if (!rechargeAmount || parseFloat(rechargeAmount) < 1) {
      showToast('充值金额至少1元', 'error');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/recharge/request`, 
        { amount: parseFloat(rechargeAmount) },
        { headers: { Authorization: token } }
      );
      setRechargePayCode(response.data);
      fetchRechargeHistory();
    } catch (err) {
      alert(err.response?.data?.error || '充值请求失败');
    }
  };

  // 获取充值记录
  const fetchRechargeHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/recharge/history`, {
        headers: { Authorization: token }
      });
      setRechargeHistory(response.data);
    } catch (err) {
      console.error('获取充值记录失败:', err);
    }
  };

  // 管理员：获取待确认充值
  const fetchPendingRecharges = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/recharges/pending`, {
        headers: { Authorization: token }
      });
      setPendingRecharges(response.data);
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('需要管理员权限', 'error');
      } else {
        alert(err.response?.data?.error || '获取待确认充值失败');
      }
    }
  };

  // 管理员：确认充值
  const confirmRecharge = async (rechargeId) => {
    try {
      await axios.post(`${API_URL}/api/admin/recharge/confirm`, 
        { rechargeId },
        { headers: { Authorization: token } }
      );
      fetchPendingRecharges();
      showToast('充值已确认', 'success');
    } catch (err) {
      alert(err.response?.data?.error || '确认失败');
    }
  };

  // 管理员：拒绝充值
  const rejectRecharge = async (rechargeId) => {
    try {
      await axios.post(`${API_URL}/api/admin/recharge/reject`, 
        { rechargeId },
        { headers: { Authorization: token } }
      );
      fetchPendingRecharges();
      showToast('已拒绝', 'info');
    } catch (err) {
      alert(err.response?.data?.error || '拒绝失败');
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
      // 存储相对路径，渲染时由 getAvatarUrl 自动补全
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

  const startChatWithFriend = (friend) => {
    const roomName = `chat_${[user.username, friend.username].sort().join('_')}`;
    const existingRoom = (rooms || []).find(r => r.name === roomName || (r.members && r.members.includes(user.username) && r.members.includes(friend.username)));
    if (existingRoom) {
      setCurrentRoom(existingRoom);
      setCurrentRoomId(existingRoom.id);
    } else {
      socketRef.current.emit('createGroup', {
        name: `${friend.username} & ${user.username}`,
        members: [friend.username]
      });
      setTimeout(() => {
        setCurrentRoomId(`chat_${[user.username, friend.username].sort().join('_')}`);
      }, 500);
    }
    setView('chats');
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

  // 发送红包
  const sendRedPacket = () => {
    if (!redPacketAmount || !redPacketCount || !currentRoomId) return;
    const amount = parseFloat(redPacketAmount);
    const count = parseInt(redPacketCount);
    
    // 检查余额
    if (balance < amount) {
      showToast(`余额不足，当前余额：¥${(balance || 0).toFixed(2)}，需要：¥${amount.toFixed(2)}`, 'error');
      return;
    }
    
    // 验证红包规则
    if (amount < 1) {
      showToast('红包金额最少为1元', 'error');
      return;
    }
    if (count < 1 || count > 100) {
      showToast('红包个数必须在1-100之间', 'error');
      return;
    }
    if (amount / count < 0.01) {
      showToast('每个红包金额不能低于0.01元', 'error');
      return;
    }
    
    // 生成随机分配
    const distribution = generateRedPacketDistribution(amount, count);
    
    socketRef.current.emit('sendRedPacket', {
      roomId: currentRoomId,
      amount,
      count,
      message: redPacketMessage,
      distribution
    });
    setShowRedPacketModal(false);
    setRedPacketAmount('');
    setRedPacketCount('');
    setRedPacketMessage('恭喜发财，大吉大利');
    showToast('红包已发送', 'success');
  };

  // 生成红包随机分配
  const generateRedPacketDistribution = (totalAmount, totalCount) => {
    const distribution = [];
    let remaining = totalAmount;
    
    for (let i = 0; i < totalCount - 1; i++) {
      // 确保剩余每人至少0.01元
      const maxPossible = remaining - (totalCount - i - 1) * 0.01;
      const minPossible = 0.01;
      const amount = minPossible + Math.random() * (maxPossible - minPossible);
      distribution.push(parseFloat(amount.toFixed(2)));
      remaining -= amount;
    }
    
    // 最后一个红包拿剩余金额
    distribution.push(parseFloat(remaining.toFixed(2)));
    
    // 打乱顺序
    for (let i = distribution.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
    }
    
    return distribution;
  };

  // 抢红包
  const claimRedPacket = (packetId) => {
    socketRef.current.emit('claimRedPacket', { roomId: currentRoomId, packetId });
  };

  // 创建投票
  const createPoll = () => {
    if (!pollQuestion || pollOptions.filter(o => o.trim()).length < 2 || !currentRoomId) return;
    socketRef.current.emit('createPoll', {
      roomId: currentRoomId,
      question: pollQuestion,
      options: pollOptions.filter(o => o.trim())
    });
    setShowPollModal(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    showToast('投票已创建', 'success');
  };

  // 投票
  const votePoll = (pollId, optionIndex) => {
    socketRef.current.emit('votePoll', { roomId: currentRoomId, pollId, optionIndex });
  };

  // 添加投票选项
  const addPollOption = () => setPollOptions(prev => [...prev, '']);
  const removePollOption = (index) => setPollOptions(prev => prev.filter((_, i) => i !== index));
  const updatePollOption = (index, value) => {
    setPollOptions(prev => prev.map((opt, i) => i === index ? value : opt));
  };

  // 发送骰子
  const sendDice = () => {
    if (!currentRoomId) return;
    socketRef.current.emit('sendDice', { roomId: currentRoomId });
  };

  // 发送猜拳
  const sendRockPaperScissors = (choice) => {
    if (!currentRoomId) return;
    socketRef.current.emit('sendRockPaperScissors', { roomId: currentRoomId, choice });
  };

  // 设置群公告
  const setAnnouncement = () => {
    if (!currentRoomId) return;
    const announcement = prompt('请输入群公告内容：');
    if (announcement !== null) {
      socketRef.current.emit('setAnnouncement', { roomId: currentRoomId, announcement });
    }
  };

  const isRoomOwner = () => currentRoom?.owner === user?.username || user?.username === 'admin';

  const muteRoomMember = (username) => {
    if (!currentRoomId || !username) return;
    socketRef.current.emit('muteMember', { roomId: currentRoomId, username });
    showToast(`已禁言 ${username}`, 'info');
  };

  const unmuteRoomMember = (username) => {
    if (!currentRoomId || !username) return;
    socketRef.current.emit('unmuteMember', { roomId: currentRoomId, username });
    showToast(`已解除 ${username} 的禁言`, 'success');
  };

  const kickRoomMember = (username) => {
    if (!currentRoomId || !username || username === user?.username) return;
    if (!window.confirm(`确定将 ${username} 移出群聊吗？`)) return;
    socketRef.current.emit('kickMember', { roomId: currentRoomId, username });
  };

  // 发布朋友圈
  const publishMoment = () => {
    if (!newMoment.trim()) return;
    socketRef.current.emit('publishMoment', { content: newMoment.trim() });
    setNewMoment('');
    setShowMoments(false);
    showToast('动态已发布', 'success');
  };

  // 点赞朋友圈
  const likeMoment = (momentId) => {
    socketRef.current.emit('likeMoment', { momentId });
  };

  // 评论朋友圈
  const commentMoment = (momentId) => {
    const content = prompt('请输入评论内容：');
    if (content) {
      socketRef.current.emit('commentMoment', { momentId, content });
    }
  };

  // 导出聊天记录
  const exportChat = () => {
    if (!currentRoomId) return;
    setExportingChat(true);
    socketRef.current.emit('exportChat', { roomId: currentRoomId });
  };

  // 获取统计
  const fetchStats = () => {
    socketRef.current.emit('getStats');
  };

  // 插入快捷回复
  const insertQuickReply = (reply) => {
    setNewMessage(prev => prev + reply);
    setShowQuickReplies(false);
  };

  // 切换聊天置顶
  const togglePinChat = (roomId, e) => {
    if (e) e.stopPropagation();
    setPinnedChats(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
        showToast('已取消置顶', 'info');
      } else {
        next.add(roomId);
        showToast('已置顶聊天', 'success');
      }
      localStorage.setItem('pinnedChats', JSON.stringify([...next]));
      return next;
    });
  };

  // 打开图片查看器
  const openImageViewer = (url, allUrls) => {
    setImageViewer({ url, urls: allUrls || [url], index: allUrls ? allUrls.indexOf(url) : 0 });
  };

  // 图片查看器导航
  const imageViewerNav = (dir) => {
    if (!imageViewer?.urls) return;
    const len = imageViewer.urls.length;
    const newIdx = ((imageViewer.index || 0) + dir + len) % len;
    setImageViewer(prev => ({ ...prev, url: prev.urls[newIdx], index: newIdx }));
  };

  // 下载图片
  const downloadImage = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = url.split('/').pop() || 'image';
    a.click();
  };

  // 消息反应
  const toggleReaction = (messageId, emoji) => {
    if (!currentRoomId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    const hasReacted = msg.reactions?.[emoji]?.includes(user?.id);
    if (hasReacted) {
      socketRef.current.emit('removeReaction', { roomId: currentRoomId, messageId, emoji });
    } else {
      socketRef.current.emit('addReaction', { roomId: currentRoomId, messageId, emoji });
    }
    setReactionPicker(null);
  };

  // 打开反应选择器
  const openReactionPicker = (messageId, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setReactionPicker({ messageId, x: rect.left, y: rect.top - 50 });
  };

  // AI 摘要
  const summarizeChat = async () => {
    if (!currentRoomId || aiSummaryLoading) return;
    setAiSummaryLoading(true);
    setAiSummary(null);
    try {
      const res = await axios.post(`${API_URL}/api/ai/summarize`,
        { roomId: currentRoomId, messageCount: 30 },
        { headers: { Authorization: token } }
      );
      setAiSummary({ text: res.data.summary });
      showToast('AI 摘要完成', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'AI摘要失败', 'error');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // 密码找回流程
  const handleSendResetCode = async () => {
    if (!resetPwPhone || !/^1[3-9]\d{9}$/.test(resetPwPhone)) {
      showToast('请输入正确的手机号', 'error');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/user/send-reset-code`, { phone: resetPwPhone });
      setResetPwStep(1);
      setResetPwCountdown(60);
      const timer = setInterval(() => {
        setResetPwCountdown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; });
      }, 1000);
      showToast('验证码已发送', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || '发送失败', 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwCode || resetPwCode.length !== 6) { showToast('请输入6位验证码', 'error'); return; }
    if (!resetPwNewPw || resetPwNewPw.length < 3) { showToast('新密码至少3位', 'error'); return; }
    try {
      await axios.post(`${API_URL}/api/user/reset-password`, {
        phone: resetPwPhone, code: resetPwCode, newPassword: resetPwNewPw
      });
      showToast('密码重置成功，请登录', 'success');
      // 重置表单并返回登录
      setShowResetPw(false);
      setResetPwPhone(''); setResetPwCode(''); setResetPwNewPw('');
      setResetPwStep(0); setResetPwCountdown(0);
      setAuthMode('login');
    } catch (err) {
      showToast(err.response?.data?.error || '重置失败', 'error');
    }
  };

  // 群接龙
  const createSolitaire = () => {
    if (!solitaireTitle.trim() || !currentRoomId) return;
    socketRef.current.emit('createSolitaire', {
      roomId: currentRoomId,
      title: solitaireTitle.trim(),
      format: solitaireFormat.trim() || '{序号}. {内容}'
    });
    setShowSolitaireModal(false);
    setSolitaireTitle('');
    setSolitaireFormat('');
    showToast('接龙已发起', 'success');
  };

  const joinSolitaire = (solitaireId, content) => {
    if (!currentRoomId || !content) return;
    socketRef.current.emit('joinSolitaire', { roomId: currentRoomId, solitaireId, content });
    setShowSolitaireJoin(null);
    showToast('已参与接龙', 'success');
  };

  // 切换深色模式
  const toggleDarkMode = () => setDarkMode(prev => !prev);

  // 保存置顶
  useEffect(() => {
    localStorage.setItem('pinnedChats', JSON.stringify([...pinnedChats]));
  }, [pinnedChats]);

  // 获取未读计数
  useEffect(() => {
    if (socketRef.current?.connected && isAuthenticated) {
      socketRef.current.emit('getUnreadCounts');
      const interval = setInterval(() => {
        socketRef.current?.emit('getUnreadCounts');
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // ===== AI 图片生成 =====
  const generateImage = async () => {
    if (!genPrompt.trim() || genLoading) return;
    setGenLoading(true); setGenResult(null);
    try {
      const res = await axios.post(`${API_URL}/api/ai/generate-image`,
        { prompt: genPrompt.trim(), style: genStyle || '' },
        { headers: { Authorization: token } }
      );
      setGenResult(res.data.imageUrl);
      showToast('图片生成成功！', 'success');
    } catch (err) { showToast('生成失败: ' + (err.response?.data?.error || err.message), 'error'); }
    finally { setGenLoading(false); }
  };

  const shareGeneratedImage = () => {
    if (!genResult || !currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    socketRef.current.emit('sendMessage', { roomId: currentRoomId, content: '', type: 'image', fileUrl: genResult, filename: 'AI生成图片.jpg', mimeType: 'image/jpeg', fileSize: 0 });
    setShowImageGen(false); setGenPrompt(''); setGenResult(null);
    showToast('已分享到聊天', 'success');
  };

  // ===== 翻译 =====
  const translateMessage = async (msgId, text) => {
    if (translations[msgId]) { setTranslations(prev => { const n={...prev}; delete n[msgId]; return n; }); return; }
    setTranslatingMsg(msgId);
    try {
      const res = await axios.post(`${API_URL}/api/ai/translate`, { text, targetLang: 'zh' }, { headers: { Authorization: token } });
      setTranslations(prev => ({ ...prev, [msgId]: res.data.translation }));
    } catch (err) { showToast('翻译失败', 'error'); }
    finally { setTranslatingMsg(null); }
  };

  // ===== WebRTC 通话 =====
  const startCall = async (targetUserId, callType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
      setCallState({ type: callType, status: 'calling', localStream: stream, remoteStream: null, peerId: targetUserId, roomId: currentRoomId });
      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => { if (e.candidate) socketRef.current.emit('iceCandidate', { toUserId: targetUserId, candidate: e.candidate }); };
      pc.ontrack = (e) => { setCallState(prev => prev ? { ...prev, remoteStream: e.streams[0] } : null); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') hangUp(); };
      peerRef.current = pc;
      socketRef.current.emit('callUser', { toUserId: targetUserId, roomId: currentRoomId, signal: offer, callType });
    } catch (err) { showToast('无法访问摄像头/麦克风', 'error'); }
  };

  const acceptCall = async () => {
    if (!callState) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callState.type === 'video', audio: true });
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => { if (e.candidate) socketRef.current.emit('iceCandidate', { toUserId: callState.peerId, candidate: e.candidate }); };
      pc.ontrack = (e) => { setCallState(prev => prev ? { ...prev, remoteStream: e.streams[0], status: 'connected' } : null); };
      await pc.setRemoteDescription(new RTCSessionDescription(callState.signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answerCall', { toUserId: callState.peerId, signal: answer });
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') hangUp(); };
      peerRef.current = pc;
      setCallState(prev => prev ? { ...prev, localStream: stream, remoteStream: null, status: 'connecting' } : null);
    } catch (err) { showToast('无法访问摄像头/麦克风', 'error'); }
  };

  const hangUp = () => {
    try {
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    } catch(e) {}
    if (callState?.localStream) {
      try { callState.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    if (callState?.peerId && socketRef.current) {
      socketRef.current.emit('hangUp', { toUserId: callState.peerId });
    }
    setCallState(null);
  };

  const toggleMute = () => {
    if (!callState?.localStream) return;
    try {
      callState.localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setCallState(prev => prev ? { ...prev, muted: !prev.muted } : null);
    } catch(e) {}
  };

  // ===== 位置共享 =====
  const startSharingLocation = () => {
    if (!currentRoomId) return;
    if (navigator.geolocation) {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          socketRef.current.emit('shareLocation', { roomId: currentRoomId, lat: latitude, lng: longitude });
          setSharedLocations(prev => ({ ...prev, [user?.id]: { lat: latitude, lng: longitude, username: user?.username } }));
        },
        (err) => showToast('获取位置失败: ' + err.message, 'error'),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      setIsSharingLocation(true);
      showToast('开始共享位置', 'success');
    } else { showToast('浏览器不支持定位', 'error'); }
  };

  const stopSharingLocation = () => {
    if (locationWatchId.current) { navigator.geolocation.clearWatch(locationWatchId.current); locationWatchId.current = null; }
    socketRef.current.emit('stopSharingLocation', { roomId: currentRoomId });
    setIsSharingLocation(false);
    setSharedLocations({});
    showToast('已停止位置共享', 'info');
  };

  const openLocationMap = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  // ===== 打卡 =====
  const doCheckIn = (note) => {
    if (!currentRoomId) return;
    socketRef.current.emit('checkIn', { roomId: currentRoomId, note });
  };

  const fetchCheckIns = () => {
    if (!currentRoomId) return;
    socketRef.current.emit('getCheckIns', { roomId: currentRoomId });
  };

  // ===== Wrapped =====
  const fetchWrapped = async () => {
    setWrappedLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/stats/yearly`, { headers: { Authorization: token } });
      setWrappedData(res.data);
      setShowWrapped(true);
    } catch (err) { showToast('获取统计失败', 'error'); }
    finally { setWrappedLoading(false); }
  };

  // ===== Bot =====
  const fetchBots = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/bots`, { headers: { Authorization: token } });
      setBots(res.data);
    } catch (err) { /* ignore */ }
  };

  const createBot = async () => {
    if (!botForm.name.trim()) { showToast('请输入机器人名称', 'error'); return; }
    try {
      const schedule = botForm.scheduleCron ? { cron: botForm.scheduleCron, message: botForm.scheduleMsg || '定时消息' } : null;
      await axios.post(`${API_URL}/api/bots`, { ...botForm, schedule }, { headers: { Authorization: token } });
      setShowBotModal(false); setBotForm({ name: '', prompt: '', autoReply: false, scheduleCron: '', scheduleMsg: '' });
      fetchBots(); showToast('机器人已创建', 'success');
    } catch (err) { showToast(err.response?.data?.error || '创建失败', 'error'); }
  };

  const deleteBot = async (botId) => {
    try {
      await axios.delete(`${API_URL}/api/bots/${botId}`, { headers: { Authorization: token } });
      fetchBots(); showToast('机器人已删除', 'success');
    } catch (err) { showToast('删除失败', 'error'); }
  };

  // ===== 增强投票 =====
  const createEnhancedPoll = () => {
    if (!pollQuestion || pollOptions.filter(o => o.trim()).length < 2 || !currentRoomId) return;
    const opts = pollOptions.filter(o => o.trim()).map((text, i) => ({ text, image: pollOptionImages[i] || null }));
    socketRef.current.emit('createPollEnhanced', { roomId: currentRoomId, question: pollQuestion, options: opts, anonymous: pollAnonymous, deadline: pollDeadline || null });
    setShowPollModal(false); setPollQuestion(''); setPollOptions(['', '']); setPollAnonymous(false); setPollDeadline(''); setPollOptionImages({});
    showToast('投票已创建', 'success');
  };

  // 设置聊天背景
  const setChatBackground = (bg) => {
    setChatBackgrounds(prev => ({ ...prev, [currentRoomId]: bg }));
  };

  // 引用回复
  const startReply = (msg) => {
    setReplyToMessage(msg);
  };

  // 取消引用
  const cancelReply = () => setReplyToMessage(null);

  // === 消息转发 ===
  const openForwardModal = (msg) => {
    setForwardMsg(msg);
    setShowForwardModal(true);
  };

  const forwardMessage = (targetRoom) => {
    if (!forwardMsg || !targetRoom) return;
    const msg = forwardMsg;
    socketRef.current.emit('forwardMessage', {
      roomId: targetRoom.id,
      originalMessage: {
        content: msg.content,
        type: msg.type,
        fileUrl: msg.fileUrl,
        filename: msg.filename,
        mimeType: msg.mimeType,
        fileSize: msg.fileSize
      },
      forwardedFrom: currentRoom?.name || '未知'
    });
    setShowForwardModal(false);
    setForwardMsg(null);
    showToast(`已转发到 ${targetRoom.name}`, 'success');
  };

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

  // @提及
  const insertMention = (username) => {
    setNewMessage(prev => prev + `@${username} `);
    setShowMentionPicker(false);
    setMentionFilter('');
  };

  // 获取已读人数文本
  const getReadInfo = (msg) => {
    if (!msg.readBy || msg.readBy.length <= 1) return '';
    const count = msg.readBy.length - 1; // 排除自己
    return `${count}人已读`;
  };

  // 获取@提及的用户列表
  const getMentionableUsers = () => {
    if (!currentRoom) return allUsers;
    // 如果是群聊，返回群成员
    if (currentRoom.members) {
      return allUsers.filter(u => currentRoom.members.includes(u.username) || u.username === user.username);
    }
    // 如果是私聊，返回对方
    return allUsers.filter(u => u.username !== user.username);
  };

  // 获取过滤后的@用户列表
  const getFilteredMentionUsers = () => {
    const users = getMentionableUsers();
    if (!mentionFilter) return users;
    return users.filter(u => u.username.toLowerCase().includes(mentionFilter.toLowerCase()));
  };

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

  // 打开文件传输助手
  const openFileTransfer = () => {
    // 创建一个特殊的"文件传输助手"房间
    const fileTransferRoom = {
      id: 'file_transfer',
      name: '文件传输助手',
      type: 'direct',
      isFileTransfer: true
    };
    setCurrentRoom(fileTransferRoom);
    setCurrentRoomId('file_transfer');
    setMessages([]);
    showToast('已打开文件传输助手', 'info');
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
                      onKeyPress={handleKeyPress}
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
      {showGameModal && (
        <div className="modal-overlay" onClick={() => setShowGameModal(false)}>
          <div className="modal game-modal" onClick={e => e.stopPropagation()}>
            <h3><I name="hand" size={20} /> 猜拳游戏</h3>
            <p>选择你的出拳：</p>
            <div className="game-choices">
              <button className="choice-btn" onClick={() => { sendRockPaperScissors('石头'); setShowGameModal(false); }}>✊ 石头</button>
              <button className="choice-btn" onClick={() => { sendRockPaperScissors('剪刀'); setShowGameModal(false); }}>✌️ 剪刀</button>
              <button className="choice-btn" onClick={() => { sendRockPaperScissors('布'); setShowGameModal(false); }}>🖐️ 布</button>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowGameModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

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
      <div className="bottom-tab-bar">
        <button className={`bottom-tab ${bottomTab === 'chats' ? 'active' : ''}`} onClick={() => { setBottomTab('chats'); }}>
          <span className="tab-icon"><I name="chat" size={22} /></span>
          <span className="tab-label">聊天</span>
        </button>
        <button className={`bottom-tab ${bottomTab === 'contacts' ? 'active' : ''}`} onClick={() => { setBottomTab('contacts'); fetchFriendRequests(); }}>
          <span className="tab-icon"><I name="contacts" size={22} /></span>
          <span className="tab-label">通讯录</span>
          {friendRequests.length > 0 && <span className="tab-badge">{friendRequests.length}</span>}
        </button>
        <button className={`bottom-tab ${bottomTab === 'discover' ? 'active' : ''}`} onClick={() => setBottomTab('discover')}>
          <span className="tab-icon"><I name="discover" size={22} /></span>
          <span className="tab-label">发现</span>
        </button>
        <button className={`bottom-tab ${bottomTab === 'me' ? 'active' : ''}`} onClick={() => setBottomTab('me')}>
          <span className="tab-icon"><I name="me" size={22} /></span>
          <span className="tab-label">我</span>
        </button>
      </div>

      {/* 启动闪屏 */}
      {showSplash && (
        <div className="splash-screen">
          <div className="splash-content">
            <div className="splash-icon"><I name="chat" size={48} color="#fff" /></div>
            <h1 className="splash-title">聊天室</h1>
            <p className="splash-subtitle">v{appVersion}</p>
            <div className="splash-loader">
              <div className="splash-loader-bar"></div>
            </div>
          </div>
        </div>
      )}

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
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '× '}
          {toast.type === 'info' && '· '}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
