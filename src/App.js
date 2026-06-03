import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const API_URL = '';
const CHUNK_SIZE = 2 * 1024 * 1024;

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
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [profileEdit, setProfileEdit] = useState({ bio: '' });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [messageEndRef, setMessageEndRef] = useState(null);
  const [view, setView] = useState('chats');
  const [bilibiliQuery, setBilibiliQuery] = useState('');
  const [bilibiliResults, setBilibiliResults] = useState([]);
  const [bilibiliLoading, setBilibiliLoading] = useState(false);
  const [selectedBiliVideo, setSelectedBiliVideo] = useState(null);
  const [popularVideos, setPopularVideos] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModel, setAiModel] = useState('Qwen/Qwen2.5-7B-Instruct');
  const [aiModels, setAiModels] = useState([
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: '通义千问 2.5 (7B)', free: true }
  ]);
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
      setMessages([]);
    }
  }, [currentRoomId]);

  useEffect(() => {
    messageEndRef?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const validateToken = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/profile`, {
        headers: { Authorization: token }
      });
      setUser(response.data);
      setProfileEdit({ bio: response.data.bio || '' });
      setIsAuthenticated(true);
    } catch (err) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
    }
  };

  const connectSocket = () => {
    socketRef.current = io(API_URL);
    socketRef.current.emit('authenticate', token);
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
      setProfileEdit({ bio: userData.bio || '' });
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
    if (!newMessage.trim() || !currentRoomId) return;
    socketRef.current.emit('sendMessage', {
      roomId: currentRoomId,
      content: newMessage.trim(),
      type: 'text'
    });
    socketRef.current.emit('stopTyping', currentRoomId);
    setNewMessage('');
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
    } catch (err) {
      const data = err.response?.data;
      let msg = data?.error || err.message || '请求失败';
      if (data?.hint) msg += '\n\n💡 ' + data.hint;
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ ' + msg
      }]);
    }
    setAiLoading(false);
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
      const newAvatar = `${API_URL}${response.data.avatar}`;
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

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>你无只因</h1>
          <form className="auth-form" onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <div className="error">{error}</div>}
            <button type="submit">{authMode === 'login' ? '登录' : '注册'}</button>
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
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info" onClick={() => setShowProfileModal(true)} style={{ cursor: 'pointer' }}>
            <img src={user?.avatar} alt="" />
            <span>{user?.username}</span>
          </div>
          <button onClick={handleLogout}>退出</button>
        </div>
        
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button 
            style={{ flex: 1, padding: 12, border: 'none', background: view === 'chats' ? 'var(--primary-color)' : 'transparent', color: view === 'chats' ? 'white' : 'inherit', cursor: 'pointer' }}
            onClick={() => setView('chats')}
          >
            聊天
          </button>
          <button 
            style={{ flex: 1, padding: 12, border: 'none', background: view === 'friends' ? 'var(--primary-color)' : 'transparent', color: view === 'friends' ? 'white' : 'inherit', cursor: 'pointer' }}
            onClick={() => setView('friends')}
          >
            好友 {friendRequests.length > 0 && <span style={{ background: 'red', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: 11 }}>{friendRequests.length}</span>}
          </button>
          <button 
            style={{ flex: 1, padding: 12, border: 'none', background: view === 'video' ? 'var(--primary-color)' : 'transparent', color: view === 'video' ? 'white' : 'inherit', cursor: 'pointer' }}
            onClick={() => setView('video')}
          >
            视频
          </button>
          <button 
            style={{ flex: 1, padding: 12, border: 'none', background: view === 'ai' ? 'var(--primary-color)' : 'transparent', color: view === 'ai' ? 'white' : 'inherit', cursor: 'pointer' }}
            onClick={() => setView('ai')}
          >
            AI
          </button>
        </div>

        {view === 'chats' ? (
          <>
            <div className="search-box">
              <input type="text" placeholder="搜索聊天" />
            </div>
            <div className="room-list">
              {rooms?.filter(r => r.type !== 'private')?.map(room => (
                <div
                  key={room.id}
                  className={`room-item ${currentRoomId === room.id ? 'active' : ''}`}
                  onClick={() => handleRoomClick(room)}
                >
                  <div className="avatar">👥</div>
                  <div className="room-info">
                    <div className="room-name">{room.name}</div>
                    <div className="last-message">{formatMessagePreview(room.lastMessage)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--border-color)' }}>
              <button className="send-button" style={{ width: '100%', marginBottom: 8 }} onClick={() => setShowCreateModal(true)}>
                创建群聊
              </button>
              <button className="send-button" style={{ width: '100%', background: '#888' }} onClick={() => { setShowSearchModal(true); fetchFriendRequests(); }}>
                添加好友
              </button>
            </div>
          </>
        ) : view === 'friends' ? (
          <div className="room-list">
            <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
              好友列表 ({friends.length})
            </div>
            {friends?.map(friend => (
              <div
                key={friend.id}
                className="room-item"
                onClick={() => startChatWithFriend(friend)}
              >
                <div className="avatar" style={{ position: 'relative' }}>
                  <img src={friend.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />
                  {friend.online && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, background: 'green', borderRadius: '50%', border: '2px solid white' }} />}
                </div>
                <div className="room-info">
                  <div className="room-name">{friend.username}</div>
                  <div className="last-message">{friend.online ? '在线' : '离线'}</div>
                </div>
              </div>
            ))}
            {friends.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
                暂无好友，点击"添加好友"开始
              </div>
            )}
          </div>
        ) : view === 'video' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: 12 }}>
              <form onSubmit={searchBilibili} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="搜索B站视频..."
                  value={bilibiliQuery}
                  onChange={e => setBilibiliQuery(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
                <button type="submit" className="send-button" style={{ padding: '8px 16px' }} disabled={bilibiliLoading}>
                  {bilibiliLoading ? '搜索中' : '搜索'}
                </button>
              </form>
            </div>
            <div className="room-list" style={{ flex: 1, overflowY: 'auto' }}>
              {selectedBiliVideo ? (
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <button 
                      onClick={() => setSelectedBiliVideo(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}
                    >
                      ←
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{selectedBiliVideo.title}</span>
                  </div>
                  <div className="bilibili-embed" style={{ marginBottom: 12 }}>
                    <iframe
                      src={`https://player.bilibili.com/player.html?bvid=${selectedBiliVideo.bvid}`}
                      title={selectedBiliVideo.title}
                      allowFullScreen
                    />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <div>👤 {selectedBiliVideo.author}</div>
                    <div>▶ {selectedBiliVideo.play}次播放</div>
                    <div>⏱ {selectedBiliVideo.duration}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 12, maxHeight: 60, overflow: 'hidden' }}>
                    {selectedBiliVideo.description}
                  </div>
                  <button 
                    className="send-button" 
                    style={{ width: '100%' }}
                    onClick={() => shareBilibiliToChat(selectedBiliVideo)}
                  >
                    分享到聊天
                  </button>
                </div>
              ) : bilibiliResults.length > 0 ? (
                bilibiliResults.map((video, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedBiliVideo(video)}
                    style={{ 
                      display: 'flex', 
                      padding: '10px 12px', 
                      borderBottom: '1px solid var(--border-color)', 
                      cursor: 'pointer',
                      gap: 10
                    }}
                  >
                    <img 
                      src={video.pic} 
                      alt={video.title}
                      style={{ width: 90, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} 
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {video.author}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        ▶ {video.play} · {video.duration}
                      </div>
                    </div>
                  </div>
                ))
              ) : popularVideos.length > 0 ? (
                <>
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    🔥 B站热门推荐
                  </div>
                  {popularVideos.map((video, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedBiliVideo(video)}
                      style={{ 
                        display: 'flex', 
                        padding: '10px 12px', 
                        borderBottom: '1px solid var(--border-color)', 
                        cursor: 'pointer',
                        gap: 10
                      }}
                    >
                      <img 
                        src={video.pic} 
                        alt={video.title}
                        style={{ width: 90, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} 
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {video.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {video.author}
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                          ▶ {video.play} · {video.duration}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                  {bilibiliLoading ? '搜索中...' : '输入关键词搜索B站视频'}
                </div>
              )}
            </div>
          </div>
        ) : view === 'ai' ? (
          <div className="ai-panel">
            <div className="ai-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>🤖 AI 助手</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  基于硅基流动 · 永久免费
                </div>
              </div>
              <button 
                onClick={resetAiChat}
                style={{ 
                  padding: '4px 10px', 
                  fontSize: 12, 
                  background: '#f0f0f0', 
                  border: '1px solid #ddd', 
                  borderRadius: 4,
                  cursor: 'pointer' 
                }}
                title="开启新对话"
              >
                🔄 新对话
              </button>
            </div>
            
            <div className="ai-model-selector">
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 6 }}>模型：</label>
              <select 
                value={aiModel} 
                onChange={(e) => setAiModel(e.target.value)}
                style={{ 
                  flex: 1, 
                  padding: '4px 6px', 
                  fontSize: 13, 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 4,
                  background: 'white'
                }}
              >
                {aiModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.free ? '🆓' : '💎'}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="ai-messages">
              {aiMessages.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                  <div style={{ marginBottom: 8 }}>向 AI 助手提问吧</div>
                  <div style={{ fontSize: 12 }}>支持多轮对话，连续上下文</div>
                </div>
              )}
              {aiMessages.map((msg, idx) => (
                <div key={idx} className={`ai-message ${msg.role}`}>
                  <div className="ai-avatar">
                    {msg.role === 'user' ? (user?.avatar ? <img src={user.avatar} alt="" /> : '🧑') : '🤖'}
                  </div>
                  <div className="ai-bubble">
                    {msg.role === 'user' ? msg.content : (
                      <div className="ai-content">{renderMarkdown(msg.content)}</div>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="ai-message assistant">
                  <div className="ai-avatar">🤖</div>
                  <div className="ai-bubble">
                    <div className="ai-typing"><span></span><span></span><span></span></div>
                  </div>
                </div>
              )}
              <div ref={aiMessagesEndRef} />
            </div>
            
            <div className="ai-input-area">
              <textarea
                className="ai-input"
                placeholder="输入问题，按 Enter 发送，Shift+Enter 换行"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={handleAiKeyPress}
                disabled={aiLoading}
                rows={2}
              />
              <button 
                className="ai-send-button" 
                onClick={sendAiMessage} 
                disabled={!aiInput.trim() || aiLoading}
              >
                {aiLoading ? '思考中' : '发送'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="main-chat">
        {currentRoom ? (
          <>
            <div className="chat-header">
              <h3>{currentRoom.name}</h3>
              <div className="online-badge">在线</div>
            </div>
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className={`message ${msg.sender?.username === user?.username ? 'sent' : 'received'}`}>
                  <img className="avatar" src={msg.sender?.avatar || user?.avatar} alt="" />
                  <div className="message-content">
                    {msg.sender?.username !== user?.username && (
                      <div className="sender-name">{msg.sender?.username}</div>
                    )}
                    <div className="bubble">
                      {msg.type === 'text' && (
                        <>
                          <div style={{ marginBottom: parseBilibiliUrl(msg.content) ? 8 : 0 }}>{msg.content}</div>
                          {(() => {
                            const bvid = parseBilibiliUrl(msg.content);
                            if (!bvid) return null;
                            return (
                              <div className="bilibili-embed">
                                <iframe
                                  src={`https://player.bilibili.com/player.html?bvid=${bvid}`}
                                  title="Bilibili video"
                                  allowFullScreen
                                />
                              </div>
                            );
                          })()}
                        </>
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
                        <a 
                          href={msg.fileUrl} 
                          download={msg.filename}
                          className="file-attachment"
                        >
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
                    </div>
                    <div className="time">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
              {typingUser && <div className="typing-indicator">{typingUser} 正在输入...</div>}
              <div ref={setMessageEndRef} />
            </div>
            <div className="chat-input-area">
              <div className="chat-input-wrapper">
                <div className="chat-input-actions">
                  <button onClick={() => fileInputRef.current?.click()} title="发送图片">📷</button>
                  <button onClick={() => fileInputRef.current?.click()} title="发送视频">🎬</button>
                  <button onClick={() => fileInputRef.current?.click()} title="发送任意文件">📎</button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="*/*"
                    onChange={handleFileSelect}
                  />
                </div>
                <textarea
                  className="chat-input"
                  placeholder="输入消息..."
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                />
                <button className="send-button" onClick={sendMessage} disabled={!newMessage.trim()}>
                  发送
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <div>选择一个聊天开始</div>
          </div>
        )}
      </div>

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <h3>个人资料</h3>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={user?.avatar} alt="" style={{ width: 80, height: 80, borderRadius: '50%' }} />
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
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowProfileModal(false)}>关闭</button>
              <button className="confirm" onClick={updateProfile}>保存</button>
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
                  <img src={searchResult.avatar} alt="" style={{ width: 50, height: 50, borderRadius: '50%' }} />
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
                    <img src={request.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
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
                    <img src={friend.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 8 }} />
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
    </div>
  );
}

export default App;
