import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform;
// OTA 模式下 APP 从服务器加载，API 用相对路径即可
// 本地模式（file://）才需要指定服务器公网地址
const isLocalApp = isCapacitor && window.location.protocol === 'file:';
const SERVER_URL = 'https://parakeet-nimble-cage.ngrok-free.dev';
const API_URL = isLocalApp ? SERVER_URL : '';
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#e0e0e0"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>');
const CHUNK_SIZE = 2 * 1024 * 1024;

// 修复头像 URL：补全地址 + 兜底默认头像
function getAvatarUrl(avatar) {
  if (!avatar) return DEFAULT_AVATAR;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  if (avatar.startsWith('/')) return `${API_URL}${avatar}`;
  return avatar;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function getFileIcon(mimeType, filename) {
  if (!mimeType && !filename) return '📄';
  const ext = (filename?.split('.').pop() || mimeType?.split('/').pop() || '').toLowerCase();
  const iconMap = {
    'pdf': '📕', 'doc': '📘', 'docx': '📘',
    'xls': '📗', 'xlsx': '📗', 'csv': '📗',
    'ppt': '📙', 'pptx': '📙',
    'zip': '🗜️', 'rar': '🗜️', '7z': '🗜️', 'tar': '🗜️', 'gz': '🗜️',
    'txt': '📄', 'json': '📋', 'xml': '📋', 'html': '🌐', 'css': '🎨', 'js': '📜', 'ts': '📜',
    'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵', 'ogg': '🎵',
    'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬', 'wmv': '🎬',
    'exe': '⚙️', 'msi': '⚙️', 'dmg': '⚙️', 'apk': '📱', 'ipa': '📱'
  };
  if (iconMap[ext]) return iconMap[ext];
  if (mimeType?.startsWith('image/')) return '🖼️';
  if (mimeType?.startsWith('video/')) return '🎬';
  if (mimeType?.startsWith('audio/')) return '🎵';
  if (mimeType?.includes('pdf')) return '📕';
  if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return '🗜️';
  return '📄';
}

function parseBilibiliUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV\w+)/i);
  if (match) return match[1];
  const shortMatch = text.match(/https?:\/\/b23\.tv\/(\w+)/i);
  if (shortMatch) return shortMatch[1];
  const bareMatch = text.match(/^BV\w{10}$/);
  if (bareMatch) return bareMatch[0];
  return null;
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
  const [showOtaModal, setShowOtaModal] = useState(false);
  const appVersion = '1.0.0';
  
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

  // === 微信新功能 ===
  // 底部Tab (微信/通讯录/发现/我)
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
      { id: 'moonshot-v1-8k', name: 'Kimi Moonshot-8K', free: false },
      { id: 'moonshot-v1-32k', name: 'Kimi Moonshot-32K', free: false },
      { id: 'moonshot-v1-128k', name: 'Kimi Moonshot-128K', free: false },
      { id: 'glm-4-plus', name: '智谱 GLM-4-Plus', free: false }
    ]);
  const [balance, setBalance] = useState(0);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargePayCode, setRechargePayCode] = useState(null);
  const [rechargeHistory, setRechargeHistory] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pendingRecharges, setPendingRecharges] = useState([]);
  const aiMessagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      if (!token) return;
      try {
        await axios.get(`${API_URL}/api/profile`, {
          headers: { Authorization: token }
        });
      } catch (err) {
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
        socketRef.current.disconnect();
      }
    };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (currentRoomId && socketRef.current) {
      socketRef.current.emit('joinRoom', currentRoomId);
      setMessagesLoading(true);
    }
  }, [currentRoomId]);

  // 深色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

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

  // OTA 版本检查 (仅 Capacitor 原生 App 中执行，网页版跳过)
  useEffect(() => {
    if (!isCapacitor) return;
    const checkUpdate = async () => {
      try {
        const res = await axios.get(`${API_URL}/ota-version.json`, { timeout: 5000 });
        const serverVersion = res.data;
        setOtaInfo(serverVersion);
        const savedVersion = localStorage.getItem('appVersion');
        if (!savedVersion || serverVersion.buildNumber > parseInt(savedVersion)) {
          setShowOtaModal(true);
        }
      } catch (e) {
        // 离线或服务器不可用时忽略
      }
    };
    if (isAuthenticated) {
      checkUpdate();
    }
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
    socketRef.current = io(API_URL || window.location.origin, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000
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
    socketRef.current.on('userOnline', (data) => {
      setOnlineUsers(prev => [...prev.filter(u => u.id !== data.id), data]);
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: true } : f));
    });
    socketRef.current.on('userOffline', (data) => {
      setOnlineUsers(prev => prev.filter(u => u.id !== data.id));
      setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: false } : f));
    });
    socketRef.current.on('newMessage', (message) => {
      setMessages(prev => [...prev, message]);
      setRooms(prev => prev.map(room => {
        if (room.id === message.roomId) {
          return { ...room, lastMessage: message };
        }
        return room;
      }));
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
        readBy: msg.readBy.includes(userId) ? msg.readBy : [...msg.readBy, userId]
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
      if (userId === socketRef.current?.userId) {
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
  };

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/rooms`, {
        headers: { Authorization: token }
      });
      setRooms(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setRooms([]);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friends`, {
        headers: { Authorization: token }
      });
      setFriends(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch friends', err);
      setFriends([]);
    }
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

  const uploadFile = async (file) => {
    if (!file || !currentRoomId) return;
    try {
      await uploadSimple(file);
    } catch (err) {
      console.error('Upload failed', err);
      alert('上传失败: ' + err.message);
    }
  };

  const uploadSimple = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/api/upload/simple`, formData, {
      headers: {
        Authorization: token,
        'Content-Type': 'multipart/form-data'
      }
    });
    sendMediaMessage(response.data.url, file.name, file.type, file.size);
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
      const response = await axios.get(`${API_URL}/api/users/search/${searchId.trim()}`, {
        headers: { Authorization: token }
      });
      setSearchResult(response.data);
    } catch (err) {
      setSearchResult(null);
      alert('未找到该用户');
    }
  };

  const sendFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/request`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      alert('好友请求已发送');
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
        content: res.data.reply || '（无回复）' 
      }]);
      if (res.data.balance !== undefined) {
        setBalance(res.data.balance);
      }
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.error || err.message || '请求失败';
      if (data?.hint) msg += '\n\n💡 ' + data.hint;
      if (err.response?.status === 402) {
        msg += '\n\n请点击上方"充值"按钮充值余额';
      }
      const rechargeUrl = data?.rechargeUrl;
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ ' + msg,
        ...(rechargeUrl ? { rechargeUrl } : {})
      }]);
    } finally {
      setAiLoading(false);
    }
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

  // 简易 markdown 渲染（粗体 + 代码块 + 换行）
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
        alert('搜索没有结果，请尝试其他关键词');
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
      alert('已分享到聊天');
    } else {
      alert('请先选择一个聊天室');
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
        alert('该好友暂未设置收款码');
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
      alert('资料已更新');
    } catch (err) {
      alert('更新失败');
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
      alert('充值金额至少1元');
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
        alert('需要管理员权限');
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
      alert('充值已确认');
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
      alert('充值已拒绝');
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
      alert('上传头像失败');
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

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatMessagePreview = (message) => {
    if (!message) return '';
    if (message.type === 'image') return '[图片]';
    if (message.type === 'video') return '[视频]';
    if (message.type === 'audio') return '[音频]';
    if (message.type === 'file') return `[文件] ${message.filename || ''}`;
    return message.content?.slice(0, 30) || '';
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
      showToast(`余额不足，当前余额：¥${balance.toFixed(2)}，需要：¥${amount.toFixed(2)}`, 'error');
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

  // 切换深色模式
  const toggleDarkMode = () => setDarkMode(prev => !prev);

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

  // 格式化录音时间
  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
          <h1>你无只因</h1>
          <p className="auth-subtitle">现代化即时通讯平台</p>
          <form className="auth-form" onSubmit={handleAuth}>
            <div className="input-group">
              <span className="input-icon">👤</span>
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <span className="input-icon">🔒</span>
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
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${bottomTab !== 'chats' ? 'sidebar-hidden' : ''}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info" onClick={() => setShowProfileModal(true)} style={{ cursor: 'pointer' }}>
            <img src={getAvatarUrl(user?.avatar)} alt="" />
            <span>{user?.username}</span>
          </div>
           <div className="header-actions">
            <button className="icon-btn" onClick={handleLogout} title="退出登录">🚪</button>
          </div>
        </div>
        
        {/* 简洁搜索框和聊天列表 */}
        <div className="search-box">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索聊天..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="room-list">
          <div className="room-list-header" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {rooms?.filter(r => r.type !== 'private')?.length || 0} 个聊天
          </div>
          {rooms?.filter(r => r.type !== 'private')?.filter(room =>
            !searchQuery || room.name?.toLowerCase().includes(searchQuery.toLowerCase())
          )?.map(room => (
            <div
              key={room.id}
              className={`room-item ${currentRoomId === room.id ? 'active' : ''}`}
              onClick={() => handleRoomClick(room)}
            >
              <div className="avatar" style={{ width: 42, height: 42, borderRadius: 8, background: '#07c160', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18 }}>{(room.name || '群')[0]}</div>
              <div className="room-info">
                <div className="room-name">{room.name}</div>
                <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
              </div>
              {room.lastMessage?.timestamp && (
                <div className="room-time">{formatTime(room.lastMessage.timestamp)}</div>
              )}
            </div>
          ))}
          {(!rooms || rooms.filter(r => r.type !== 'private').length === 0) && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              <div>暂无聊天</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>点击右下角"+"开始新的对话</div>
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <button className="sidebar-btn secondary" onClick={() => { setShowSearchModal(true); fetchFriendRequests(); }}>
            👥 添加好友
          </button>
          <button className="sidebar-btn secondary" onClick={openFileTransfer}>
            📁 文件传输
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
                      <img src={getAvatarUrl(r.avatar)} alt="" className="contact-avatar" />
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
                        <img src={getAvatarUrl(friend.avatar)} alt="" className="contact-avatar" />
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
              <div className="discover-item" onClick={() => { setView('video'); setBottomTab('chats'); }}>
                <div className="discover-icon" style={{ background: '#ff6b35' }}>📺</div>
                <div className="discover-info">
                  <div className="discover-title">B站视频</div>
                  <div className="discover-desc">搜索和分享B站视频</div>
                </div>
                <span className="discover-arrow">›</span>
              </div>
              <div className="discover-item" onClick={() => { setView('ai'); setBottomTab('chats'); }}>
                <div className="discover-icon" style={{ background: '#6435c9' }}>🤖</div>
                <div className="discover-info">
                  <div className="discover-title">AI助手</div>
                  <div className="discover-desc">智能对话助手，支持多模型</div>
                </div>
                <span className="discover-arrow">›</span>
              </div>
              <div className="discover-item" onClick={() => { setShowMoments(true); }}>
                <div className="discover-icon" style={{ background: '#f06c00' }}>📱</div>
                <div className="discover-info">
                  <div className="discover-title">朋友圈</div>
                  <div className="discover-desc">和朋友分享生活点滴</div>
                </div>
                <span className="discover-arrow">›</span>
              </div>
              <div className="discover-item" onClick={() => { setShowGameModal(true); }}>
                <div className="discover-icon" style={{ background: '#6435c9' }}>🎮</div>
                <div className="discover-info">
                  <div className="discover-title">小游戏</div>
                  <div className="discover-desc">猜拳游戏</div>
                </div>
                <span className="discover-arrow">›</span>
              </div>
              <div className="discover-item" onClick={() => setShowBackupModal(true)}>
                <div className="discover-icon" style={{ background: '#00b5ad' }}>💾</div>
                <div className="discover-info">
                  <div className="discover-title">聊天记录管理</div>
                  <div className="discover-desc">备份与恢复聊天记录</div>
                </div>
                <span className="discover-arrow">›</span>
              </div>
            </div>
          </div>
        ) : bottomTab === 'me' ? (
          /* ===== 我的页面 ===== */
          <div className="me-page">
            <div className="me-header" onClick={() => setShowProfileModal(true)}>
              <img src={getAvatarUrl(user?.avatar)} alt="" className="me-avatar" />
              <div className="me-info">
                <div className="me-name">{user?.username}</div>
                <div className="me-id">ID: {user?.sixDigitId || '000000'}</div>
                <div className="me-bio">{user?.bio || '这个人很懒，什么都没写'}</div>
              </div>
              <span className="me-arrow">›</span>
            </div>
            <div className="me-menu">
              <div className="me-menu-item" onClick={() => { setShowMoments(true); }}>
                <div className="menu-icon" style={{ background: '#f06c00' }}>📱</div>
                <span>朋友圈</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="me-menu-item" onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }}>
                <div className="menu-icon" style={{ background: '#fa5151' }}>💰</div>
                <span>钱包</span>
                <span className="menu-badge">¥{balance.toFixed(2)}</span>
              </div>
              <div className="me-menu-item" onClick={() => setShowBackupModal(true)}>
                <div className="menu-icon" style={{ background: '#00b5ad' }}>💾</div>
                <span>聊天记录管理</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="me-menu-item" onClick={() => { fetchPhoneInfo(); setShowPhoneModal(true); }}>
                <div className="menu-icon" style={{ background: '#1890ff' }}>📱</div>
                <span>{phoneInfo.phoneBound ? phoneInfo.phone : '绑定手机号'}</span>
                <span className="menu-arrow">›</span>
              </div>
              <div className="me-menu-item" onClick={() => { setShowProfileModal(true); }}>
                <div className="menu-icon" style={{ background: '#07c160' }}>⚙️</div>
                <span>设置</span>
                <span className="menu-arrow">›</span>
              </div>
            </div>
            <div className="me-footer">
              <div className="me-menu-item" onClick={() => setShowBackupModal(true)}>
                <div className="menu-icon" style={{ background: '#1890ff' }}>🔐</div>
                <span>聊天记录备份与恢复</span>
                <span className="menu-arrow">›</span>
              </div>
            </div>
            <div className="me-version">
              <span>你无只因 v{messageStats.totalMessages > 0 ? '2.0' : '1.0'}</span>
            </div>
          </div>
        ) : view === 'ai' ? (
          /* ===== AI助手全屏视图 ===== */
          <div className="ai-fullview">
            <div className="ai-fullview-header">
              <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
              <h3>🤖 AI 助手</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>余额: ¥{balance.toFixed(2)}</span>
                <button onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }} className="header-btn" title="充值">💰</button>
                {user?.username === 'admin' && (
                  <button onClick={() => { setShowAdminModal(true); fetchPendingRecharges(); }} className="header-btn" title="管理">👑</button>
                )}
                <button onClick={resetAiChat} className="header-btn" title="新对话">🔄</button>
              </div>
            </div>
            <div className="ai-model-selector" style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>模型：</label>
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={{ flex: 1, padding: '4px 8px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 4, background: 'white', maxWidth: 200 }}>
                {aiModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name} {m.free ? '🆓' : '💎'}</option>
                ))}
              </select>
            </div>
            <div className="ai-messages" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {aiMessages.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                  <div style={{ marginBottom: 8 }}>向 AI 助手提问吧</div>
                  <div style={{ fontSize: 12 }}>支持多轮对话，连续上下文</div>
                </div>
              )}
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`ai-message ${msg.role}`}>
                  <div className="ai-avatar">{msg.role === 'user' ? (user?.avatar ? <img src={getAvatarUrl(user.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : '🧑') : '🤖'}</div>
                  <div className="ai-bubble">
                    {msg.role === 'user' ? msg.content : (
                      <>
                        <div className="ai-content">{renderMarkdown(msg.content)}</div>
                        {msg.rechargeUrl && (
                          <a href={msg.rechargeUrl} target="_blank" rel="noopener noreferrer" className="send-button" style={{ marginTop: 8, display: 'inline-block', background: '#ff6b35', textDecoration: 'none', color: 'white', padding: '6px 12px', borderRadius: 4, fontSize: 13 }}>💰 前往充值</a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="ai-message assistant">
                  <div className="ai-avatar">🤖</div>
                  <div className="ai-bubble"><div className="ai-typing"><span></span><span></span><span></span></div></div>
                </div>
              )}
              <div ref={aiMessagesEndRef} />
            </div>
            <div className="ai-input-area" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--bg-card)' }}>
              <textarea className="ai-input" placeholder="输入问题，Enter发送，Shift+Enter换行" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={handleAiKeyPress} disabled={aiLoading} rows={2} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, resize: 'none', outline: 'none' }} />
              <button className="ai-send-button" onClick={sendAiMessage} disabled={!aiInput.trim() || aiLoading} style={{ padding: '8px 20px', background: aiInput.trim() && !aiLoading ? 'var(--primary)' : '#ccc', color: 'white', border: 'none', borderRadius: 8, cursor: aiInput.trim() && !aiLoading ? 'pointer' : 'default', fontSize: 14, alignSelf: 'flex-end' }}>{aiLoading ? '思考中' : '发送'}</button>
            </div>
          </div>
        ) : view === 'video' ? (
          /* ===== B站视频全屏视图 ===== */
          <div className="video-fullview">
            <div className="video-fullview-header">
              <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
              <h3>📺 B站视频</h3>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <form onSubmit={searchBilibili} style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder="搜索B站视频..." value={bilibiliQuery} onChange={e => setBilibiliQuery(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                <button type="submit" style={{ padding: '8px 16px', background: '#ff6b35', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }} disabled={bilibiliLoading}>{bilibiliLoading ? '搜索中' : '搜索'}</button>
              </form>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {selectedBiliVideo ? (
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setSelectedBiliVideo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{selectedBiliVideo.title}</span>
                  </div>
                  <div className="bilibili-embed" style={{ marginBottom: 12, position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8 }}>
                    <iframe src={`https://player.bilibili.com/player.html?bvid=${selectedBiliVideo.bvid}`} title={selectedBiliVideo.title} allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <div>👤 {selectedBiliVideo.author} · ▶ {selectedBiliVideo.play}次 · ⏱ {selectedBiliVideo.duration}</div>
                  </div>
                  <button onClick={() => shareBilibiliToChat(selectedBiliVideo)} style={{ padding: '8px 16px', background: '#07c160', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', width: '100%', fontSize: 14 }}>分享到聊天</button>
                </div>
              ) : bilibiliResults.length > 0 ? (
                bilibiliResults.map((video, idx) => (
                  <div key={idx} onClick={() => setSelectedBiliVideo(video)} style={{ display: 'flex', padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 10 }}>
                    <img src={video.pic} alt={video.title} style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{video.author}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>▶ {video.play} · {video.duration}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                  {bilibiliLoading ? '搜索中...' : <><div style={{ fontSize: 48, marginBottom: 12 }}>📺</div><div>输入关键词搜索B站视频</div></>}
                </div>
              )}
            </div>
          </div>
        ) : currentRoom ? (
          <>
            <div className="chat-header">
              <h3>{currentRoom.name}</h3>
              <div className="header-tools">
                <button onClick={() => setShowSearch(s => !s)} title="搜索消息">
                  {showSearch ? '✕' : '🔍'}
                </button>
                <div className="online-badge">在线</div>
              </div>
            </div>
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
                    {msg.type === 'image' && <img className="media" src={msg.fileUrl} alt="" onClick={() => window.open(msg.fileUrl)} />}
                    {msg.type === 'video' && (
                      <video className="media" src={msg.fileUrl} controls onClick={() => window.open(msg.fileUrl)} />
                    )}
                    {msg.type === 'audio' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                        <span style={{ fontSize: 24 }}>🎵</span>
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
                        <span className="music-icon">🎵</span>
                        <a href={msg.content} target="_blank" rel="noopener noreferrer">点击播放音乐</a>
                      </div>
                    )}
                    {msg.type === 'redPacket' && (
                      <div className="red-packet-message" onClick={() => claimRedPacket(msg.id)}>
                        <div className="red-packet-icon">🧧</div>
                        <div className="red-packet-info">
                          <div className="red-packet-title">{msg.message}</div>
                          <div className="red-packet-detail">
                            {msg.remaining > 0 ? `还剩${msg.remaining}个红包` : '红包已被领完'}
                          </div>
                          {msg.claimed && msg.claimed.includes(socketRef.current?.userId) && (
                            <div className="claimed-badge">已领取</div>
                          )}
                        </div>
                      </div>
                    )}
                    {msg.type === 'poll' && (
                      <div className="poll-message">
                        <div className="poll-title">📊 {msg.question}</div>
                        {msg.options.map((opt, i) => {
                          const totalVotes = msg.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                          const voteCount = opt.votes?.length || 0;
                          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                          const hasVoted = msg.options.some(o => o.votes?.includes(socketRef.current?.userId));
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
                        <span className="dice-icon">🎲</span>
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
                      <div className="announcement-message">📢 {msg.content}</div>
                    )}
                    {(() => {
                      const bvid = parseBilibiliUrl(msg.content);
                      if (!bvid) return null;
                      return (
                        <div className="bilibili-embed">
                          <iframe src={`https://player.bilibili.com/player.html?bvid=${bvid}`} title="Bilibili video" allowFullScreen />
                        </div>
                      );
                    })()}
                  </>
                );
                return (
                <div key={msg.id || index} id={`msg-${msg.id}`} className={`message ${isMine ? 'sent' : 'received'} ${isSearchMatch ? 'highlighted' : ''} ${isPinned ? 'pinned' : ''}`}>
                  <img className="avatar" src={getAvatarUrl(msg.sender?.avatar || user?.avatar)} alt="" />
                  <div className="message-content">
                    {isPinned && <div className="pinned-badge">📌 置顶</div>}
                    {msg.sender?.username !== user?.username && !msg.recalled && (
                      <div className="sender-name">{msg.sender?.username}</div>
                    )}
                    {msg.forwardedFrom && !msg.recalled && (
                      <div className="forwarded-badge">📤 转发自 {msg.forwardedFrom}</div>
                    )}
                    <div className={`bubble ${msg.recalled ? 'recalled' : ''}`}>
                      {msg.recalled ? (
                        <span className="recalled-text">⚠️ 此消息已被撤回</span>
                      ) : contentToRender}
                    </div>
                    {!msg.recalled && (
                      <div className="message-actions">
                        {isMine && (
                          <>
                            <button onClick={() => recallMessage(msg.id)} title="撤回消息">↩️</button>
                            <button onClick={() => startEditMessage(msg)} title="编辑消息">✏️</button>
                          </>
                        )}
                        <button onClick={() => startReply(msg)} title="引用回复">💬</button>
                        <button onClick={() => openForwardModal(msg)} title="转发">📤</button>
                        <button onClick={() => toggleStarMessage(msg.id)} title={isStarred ? '取消收藏' : '收藏'}>
                          {isStarred ? '⭐' : '☆'}
                        </button>
                        <button onClick={() => togglePinMessage(msg.id)} title={isPinned ? '取消置顶' : '置顶'}>
                          {isPinned ? '📌' : '📍'}
                        </button>
                      </div>
                    )}
                    <div className="message-footer">
                      <div className="time">{formatTime(msg.timestamp)}</div>
                      {readInfo && <div className="read-info">{readInfo}</div>}
                    </div>
                  </div>
                </div>
                );
              })}
              {typingUser && <div className="typing-indicator">{typingUser} 正在输入...</div>}
              <div ref={setMessageEndRef} />
            </div>
            <div className="chat-input-area">
              {/* 群公告 */}
              {roomAnnouncements[currentRoomId] && (
                <div className="room-announcement">📢 {roomAnnouncements[currentRoomId]}</div>
              )}
              {/* 引用回复提示 */}
              {replyToMessage && (
                <div className="reply-preview">
                  <span>回复 {replyToMessage.sender?.username}：</span>
                  <span className="reply-content">{replyToMessage.content?.slice(0, 50) || '[媒体消息]'}</span>
                  <button className="cancel-reply" onClick={cancelReply}>✕</button>
                </div>
              )}
              {/* 编辑提示 */}
              {editingMessage && (
                <div className="edit-preview">
                  <span>✏️ 编辑消息中...</span>
                  <button className="cancel-edit" onClick={cancelEdit}>✕</button>
                </div>
              )}
              <div className="chat-input-wrapper">
                <div className="chat-input-actions">
                  <button onClick={() => fileInputRef.current?.click()} title="发送文件">📎</button>
                  <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? '停止录音' : '语音消息'} className={isRecording ? 'recording' : ''}>
                    {isRecording ? '⏹️' : '🎤'}
                  </button>
                  <button onClick={() => setShowEmojiPicker(s => !s)} title="表情" className={showEmojiPicker ? 'active' : ''}>😊</button>
                  <button onClick={() => setShowMentionPicker(s => !s)} title="@提及" className={showMentionPicker ? 'active' : ''}>@</button>
                  <button onClick={() => setShowQuickReplies(s => !s)} title="快捷回复">⚡</button>
                  <button onClick={sendDice} title="骰子">🎲</button>
                  <button onClick={() => setShowGameModal(true)} title="猜拳">✊</button>
                  <button onClick={() => setShowRedPacketModal(true)} title="红包">🧧</button>
                  <button onClick={() => setShowPollModal(true)} title="投票">📊</button>
                  <button onClick={() => setShowMusicModal(true)} title="音乐">🎵</button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="*/*"
                    onChange={handleFileSelect}
                  />
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
                          <img src={getAvatarUrl(u.avatar)} alt="" className="mention-avatar" />
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
          </>
        ) : (
          <div className="mobile-room-list">
            <div className="search-box" style={{ padding: '10px 16px' }}>
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input type="text" placeholder="搜索聊天..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="room-list" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="room-list-header" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {rooms?.filter(r => r.type !== 'private')?.length || 0} 个聊天
              </div>
              {rooms?.filter(r => r.type !== 'private')?.filter(room =>
                !searchQuery || room.name?.toLowerCase().includes(searchQuery.toLowerCase())
              )?.map(room => (
                <div key={room.id} className={`room-item ${currentRoomId === room.id ? 'active' : ''}`} onClick={() => handleRoomClick(room)}>
                  <div className="avatar" style={{ width: 48, height: 48, borderRadius: 10, background: '#07c160', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20 }}>{(room.name || '群')[0]}</div>
                  <div className="room-info">
                    <div className="room-name">{room.name}</div>
                    <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
                  </div>
                  {room.lastMessage?.timestamp && (
                    <div className="room-time">{formatTime(room.lastMessage.timestamp)}</div>
                  )}
                </div>
              ))}
              {(!rooms || rooms.filter(r => r.type !== 'private').length === 0) && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
                  <div>暂无聊天</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showPhoneModal && (
        <div className="modal-overlay" onClick={closePhoneModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
            {phoneInfo.phoneBound ? (
              /* 已绑定 → 显示信息 + 解绑 */
              <>
                <h3>📱 手机号</h3>
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
                <h3>✅ 绑定成功</h3>
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
                <h3>📱 输入验证码</h3>
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
                <h3>📱 绑定手机号</h3>
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
                <img src={getAvatarUrl(user?.avatar)} alt="" style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <button 
                  onClick={() => avatarInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--primary-color)', color: 'white', cursor: 'pointer', fontSize: 16 }}
                >
                  📷
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
                💡 在微信中生成收款码，复制链接或截图内容填入此处
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
            <h3>💰 {selectedFriendPayCode.username} 的收款码</h3>
            <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selectedFriendPayCode.payCode}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              💡 复制以上内容，在微信中打开即可转账给该好友
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => { setShowPayCodeModal(false); setSelectedFriendPayCode(null); }}>关闭</button>
              <button 
                className="confirm" 
                onClick={() => {
                  navigator.clipboard.writeText(selectedFriendPayCode.payCode);
                  alert('收款码已复制到剪贴板');
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
            <h3>💰 充值余额</h3>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>👑 管理员 - 待确认充值</h3>
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
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowAdminModal(false)}>关闭</button>
              <button className="confirm" onClick={fetchPendingRecharges}>刷新</button>
            </div>
          </div>
        </div>
      )}

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => { setShowSearchModal(false); setSearchId(''); setSearchResult(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>添加好友</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="输入6位好友ID"
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
                  <img src={getAvatarUrl(searchResult.avatar)} alt="" style={{ width: 50, height: 50, borderRadius: '50%' }} />
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
                    <img src={getAvatarUrl(request.avatar)} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
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
                    <img src={getAvatarUrl(friend.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 8 }} />
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
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* 红包弹窗 */}
      {showRedPacketModal && (
        <div className="modal-overlay" onClick={() => setShowRedPacketModal(false)}>
          <div className="modal red-packet-modal" onClick={e => e.stopPropagation()}>
            <h3>🧧 发红包</h3>
            <div className="balance-info">
              <span>当前余额：</span>
              <span className="balance-amount">¥{balance.toFixed(2)}</span>
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
            <h3>📊 发起投票</h3>
            <div className="form-group">
              <label>投票主题</label>
              <input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="输入投票主题" />
            </div>
            <div className="form-group">
              <label>选项</label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="poll-option-row">
                  <input type="text" value={opt} onChange={e => updatePollOption(i, e.target.value)} placeholder={`选项 ${i + 1}`} />
                  {pollOptions.length > 2 && (
                    <button className="remove-option" onClick={() => removePollOption(i)}>✕</button>
                  )}
                </div>
              ))}
              <button className="add-option" onClick={addPollOption}>+ 添加选项</button>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowPollModal(false)}>取消</button>
              <button className="confirm" onClick={createPoll}>发起投票</button>
            </div>
          </div>
        </div>
      )}

      {/* 小游戏弹窗 */}
      {showGameModal && (
        <div className="modal-overlay" onClick={() => setShowGameModal(false)}>
          <div className="modal game-modal" onClick={e => e.stopPropagation()}>
            <h3>✊✌️🖐️ 猜拳游戏</h3>
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
            <h3>🎵 分享音乐</h3>
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
            <h3>📱 朋友圈</h3>
            <div className="moment-input">
              <textarea value={newMoment} onChange={e => setNewMoment(e.target.value)} placeholder="分享你的动态..." />
              <button onClick={publishMoment}>发布</button>
            </div>
            <div className="moments-list">
              {moments.map(m => (
                <div key={m.id} className="moment-item">
                  <div className="moment-header">
                    <img src={getAvatarUrl(m.author?.avatar)} alt="" />
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
          <span>📊 总消息: {messageStats.totalMessages}</span>
          <span>📅 今日: {messageStats.todayMessages}</span>
          <span>👥 在线: {messageStats.activeUsers}</span>
          <button onClick={fetchStats}>刷新</button>
        </div>
      )}

      {/* 底部Tab导航 - 微信风格 */}
      <div className="bottom-tab-bar">
        <button className={`bottom-tab ${bottomTab === 'chats' ? 'active' : ''}`} onClick={() => { setBottomTab('chats'); }}>
          <span className="tab-icon">💬</span>
          <span className="tab-label">微信</span>
        </button>
        <button className={`bottom-tab ${bottomTab === 'contacts' ? 'active' : ''}`} onClick={() => { setBottomTab('contacts'); fetchFriendRequests(); }}>
          <span className="tab-icon">👥</span>
          <span className="tab-label">通讯录</span>
          {friendRequests.length > 0 && <span className="tab-badge">{friendRequests.length}</span>}
        </button>
        <button className={`bottom-tab ${bottomTab === 'discover' ? 'active' : ''}`} onClick={() => setBottomTab('discover')}>
          <span className="tab-icon">🔍</span>
          <span className="tab-label">发现</span>
        </button>
        <button className={`bottom-tab ${bottomTab === 'me' ? 'active' : ''}`} onClick={() => setBottomTab('me')}>
          <span className="tab-icon">👤</span>
          <span className="tab-label">我</span>
        </button>
      </div>

      {/* 启动闪屏 */}
      {showSplash && (
        <div className="splash-screen">
          <div className="splash-content">
            <div className="splash-icon">💬</div>
            <h1 className="splash-title">你无只因</h1>
            <p className="splash-subtitle">现代化即时通讯平台</p>
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
            <h3>📤 转发消息</h3>
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
            <h3>💾 聊天记录管理</h3>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                聊天记录存储在服务器上，登录后自动同步
              </div>
              <button className="confirm" onClick={() => { exportChat(); setShowBackupModal(false); }} style={{ marginBottom: 8 }}>
                📤 导出聊天记录
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
      {/* OTA 更新弹窗 */}
      {showOtaModal && otaInfo && (
        <div className="modal-overlay" onClick={() => { setShowOtaModal(false); localStorage.setItem('appVersion', String(otaInfo.buildNumber)); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 48, margin: '12px 0' }}>📦</div>
            <h3>发现新版本</h3>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0' }}>
              <div>当前版本: v{appVersion}</div>
              <div>最新版本: v{otaInfo.version}</div>
              {otaInfo.releaseNotes && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 }}>
                  {otaInfo.releaseNotes}
                </div>
              )}
            </div>
            <div className="modal-buttons" style={{ flexDirection: 'column', gap: 8 }}>
              <button className="confirm" onClick={() => { window.open(otaInfo.updateUrl, '_blank'); }}>
                {otaInfo.forceUpdate ? '立即更新' : '前往下载'}
              </button>
              {!otaInfo.forceUpdate && (
                <button className="cancel" onClick={() => { setShowOtaModal(false); localStorage.setItem('appVersion', String(otaInfo.buildNumber)); }}>
                  稍后再说
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && '✅ '}
          {toast.type === 'error' && '❌ '}
          {toast.type === 'info' && 'ℹ️ '}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
