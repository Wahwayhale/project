import { useState, useRef } from 'react';
import axios from 'axios';
import { API_URL, CHUNK_SIZE } from '../utils/constants';

const QUICK_REPLIES = ['好的', '收到', '没问题', '稍等', '哈哈哈', '嗯嗯', '谢谢', '再见'];

const EMOJIS = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','🥺','😢','😭','😤','😠','😡','🤬','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','👶','🧒','👦','👧','🧑','👱','👨','👩','🧔','👴','👵','🙋','🙌','🙏','👍','👎','💪','🤘','🖖','✌️','🤞','🤟','🤙','👌','✋','🤚','🖐️','🖖','👆','👇','👈','👉','🖕','👋','🤟','✍️','💅'];

const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🎉','💯','🔥','👏'];

/**
 * useChat — 聊天核心逻辑：消息发送/编辑/撤回/删除、文件上传、表情/@/快捷回复、
 * 骰子/猜拳、消息反应、置顶、转发、搜索等
 *
 * @param {object} params
 * @param {React.MutableRefObject} params.socketRef   — Socket.io 连接 ref
 * @param {object} params.user                        — 当前用户
 * @param {string} params.currentRoomId               — 当前房间 ID
 * @param {object} params.currentRoom                 — 当前房间对象
 * @param {function} params.showToast                 — Toast 提示函数
 * @param {string} params.token                       — JWT token
 * @param {Array} params.allUsers                     — 全部用户列表
 * @param {function} params.setPinnedMessages         — 设置置顶消息
 * @param {string} params.searchQuery                 — 当前搜索关键词
 */
export function useChat({ socketRef, user, currentRoomId, currentRoom, showToast, token, allUsers, setPinnedMessages, searchQuery, setMessages, setNewMessage, setMessagesLoading, setUploadProgress, messages, newMessage, uploadProgress, messageEndRef, setMessageEndRef, messagesContainerRef, messagesLoading }) {
  // ===== 消息状态 (由 App.js 管理，通过参数传入) =====

  // 消息编辑
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');

  // 消息引用回复
  const [replyToMessage, setReplyToMessage] = useState(null);

  // 消息列表滚动 (messageEndRef, messagesContainerRef 由 App.js 传入)

  // 表情面板
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // @提及
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  // 快捷回复面板
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  // 消息搜索
  const [showSearch, setShowSearch] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all');
  const [searchResults, setSearchResults] = useState([]);

  // 消息撤回
  const [recalledMessages, setRecalledMessages] = useState(new Set());

  // 消息反应选择器
  const [reactionPicker, setReactionPicker] = useState(null); // { messageId, x, y } or null

  // 消息转发
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);

  // 文件上传 (uploadProgress 由 App.js 传入)
  const fileInputRef = useRef(null);

  // 输入中计时器
  const typingTimeoutRef = useRef(null);

  // ===== 发送消息 =====
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

  // ===== 编辑消息 =====
  const startEditMessage = (msg) => {
    setEditingMessage(msg.id);
    setNewMessage(msg.content);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
    setNewMessage('');
  };

  // ===== 置顶消息 =====
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

  // ===== 撤回消息 =====
  const recallMessage = (messageId) => {
    if (!currentRoomId) return;
    socketRef.current.emit('recallMessage', {
      roomId: currentRoomId,
      messageId,
    });
    showToast('已撤回消息', 'success');
  };

  // ===== 删除消息 =====
  const deleteMessage = (messageId) => {
    if (!currentRoomId || !window.confirm('确定要删除这条消息吗？')) return;
    socketRef.current.emit('deleteMessage', {
      roomId: currentRoomId,
      messageId,
    });
  };

  // ===== 插入表情 =====
  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // ===== 输入处理 =====
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ===== 图片压缩 =====
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

  // ===== 发送媒体消息 =====
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

  // ===== 简单上传 =====
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

  // ===== 分片上传 =====
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

  // ===== 上传文件 =====
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

  // ===== 文件选择 =====
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
    }
    e.target.value = '';
  };

  // ===== 骰子 =====
  const sendDice = () => {
    if (!currentRoomId) return;
    socketRef.current.emit('sendDice', { roomId: currentRoomId });
  };

  // ===== 猜拳 =====
  const sendRockPaperScissors = (choice) => {
    if (!currentRoomId) return;
    socketRef.current.emit('sendRockPaperScissors', { roomId: currentRoomId, choice });
  };

  // ===== 快捷回复 =====
  const insertQuickReply = (reply) => {
    setNewMessage(prev => prev + reply);
    setShowQuickReplies(false);
  };

  // ===== 消息反应 =====
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

  const openReactionPicker = (messageId, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setReactionPicker({ messageId, x: rect.left, y: rect.top - 50 });
  };

  // ===== 引用回复 =====
  const startReply = (msg) => {
    setReplyToMessage(msg);
  };

  const cancelReply = () => setReplyToMessage(null);

  // ===== 消息转发 =====
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

  // ===== @提及 =====
  const insertMention = (username) => {
    setNewMessage(prev => prev + `@${username} `);
    setShowMentionPicker(false);
    setMentionFilter('');
  };

  // 获取可@的用户列表
  const getMentionableUsers = () => {
    if (!currentRoom) return allUsers;
    // 如果是群聊，返回群成员
    if (currentRoom.members) {
      return allUsers.filter(u => currentRoom.members.includes(u.username) || u.username === user.username);
    }
    // 如果是私聊，返回对方
    return allUsers.filter(u => u.username !== user.username);
  };

  const getFilteredMentionUsers = () => {
    const users = getMentionableUsers();
    if (!mentionFilter) return users;
    return users.filter(u => u.username.toLowerCase().includes(mentionFilter.toLowerCase()));
  };

  // ===== 已读信息 =====
  const getReadInfo = (msg) => {
    if (!msg.readBy || msg.readBy.length <= 1) return '';
    const count = msg.readBy.length - 1; // 排除自己
    return `${count}人已读`;
  };

  // ===== 消息搜索 =====
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

  // ===== 返回值 =====
  return {
    // 状态 (messages/newMessage/uploadProgress/messagesLoading 由 App.js 管理)
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
    // 函数
    sendMessage,
    handleKeyDown,
    handleInputChange,
    handleFileSelect,
    recallMessage,
    deleteMessage,
    startEditMessage,
    cancelEdit,
    startReply,
    cancelReply,
    insertEmoji,
    insertMention,
    getFilteredMentionUsers,
    insertQuickReply,
    sendDice,
    sendRockPaperScissors,
    toggleReaction,
    openReactionPicker,
    togglePinMessage,
    openForwardModal,
    forwardMessage,
    getReadInfo,
    doSearch,
    // 常量
    QUICK_REPLIES,
    EMOJIS,
    REACTION_EMOJIS,
  };
}
