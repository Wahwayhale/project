import { useState, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/constants';

export function useSocial({
  token,
  showToast,
  currentRoomId,
  socketRef,
  setExportingChat,
}) {
  // ===== 朋友圈 =====
  const [moments, setMoments] = useState([]);
  const [showMoments, setShowMoments] = useState(false);
  const [newMoment, setNewMoment] = useState('');

  // ===== 投票 =====
  const [polls, setPolls] = useState({});
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  // 增强投票
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollDeadline, setPollDeadline] = useState('');
  const [pollOptionImages, setPollOptionImages] = useState({});

  // ===== 群接龙 =====
  const [showSolitaireModal, setShowSolitaireModal] = useState(false);
  const [solitaireTitle, setSolitaireTitle] = useState('');
  const [solitaireFormat, setSolitaireFormat] = useState('');
  const [showSolitaireJoin, setShowSolitaireJoin] = useState(null); // solitaireId or null

  // ===== 打卡 =====
  const [checkInData, setCheckInData] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInNote, setCheckInNote] = useState('');
  const checkInNoteRef = useRef(null);

  // ===== 小游戏 =====
  const [gameResult, setGameResult] = useState(null);
  const [showGameModal, setShowGameModal] = useState(false);

  // ===== Bot =====
  const [showBotModal, setShowBotModal] = useState(false);
  const [bots, setBots] = useState([]);
  const [botForm, setBotForm] = useState({ name: '', prompt: '', autoReply: false, scheduleCron: '', scheduleMsg: '' });

  // ===== Wrapped =====
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedData, setWrappedData] = useState(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);

  // ===== 数据统计 =====
  const [messageStats, setMessageStats] = useState({ totalMessages: 0, todayMessages: 0, activeUsers: 0 });

  // ===== 朋友圈函数 =====
  const publishMoment = () => {
    if (!newMoment.trim()) return;
    socketRef.current.emit('publishMoment', { content: newMoment.trim() });
    setNewMoment('');
    setShowMoments(false);
    showToast('动态已发布', 'success');
  };

  const likeMoment = (momentId) => {
    socketRef.current.emit('likeMoment', { momentId });
  };

  const commentMoment = (momentId) => {
    const content = prompt('请输入评论内容：');
    if (content) {
      socketRef.current.emit('commentMoment', { momentId, content });
    }
  };

  // ===== 投票函数 =====
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

  const votePoll = (pollId, optionIndex) => {
    socketRef.current.emit('votePoll', { roomId: currentRoomId, pollId, optionIndex });
  };

  const addPollOption = () => setPollOptions(prev => [...prev, '']);
  const removePollOption = (index) => setPollOptions(prev => prev.filter((_, i) => i !== index));
  const updatePollOption = (index, value) => {
    setPollOptions(prev => prev.map((opt, i) => i === index ? value : opt));
  };

  const createEnhancedPoll = () => {
    if (!pollQuestion || pollOptions.filter(o => o.trim()).length < 2 || !currentRoomId) return;
    const opts = pollOptions.filter(o => o.trim()).map((text, i) => ({ text, image: pollOptionImages[i] || null }));
    socketRef.current.emit('createPollEnhanced', { roomId: currentRoomId, question: pollQuestion, options: opts, anonymous: pollAnonymous, deadline: pollDeadline || null });
    setShowPollModal(false); setPollQuestion(''); setPollOptions(['', '']); setPollAnonymous(false); setPollDeadline(''); setPollOptionImages({});
    showToast('投票已创建', 'success');
  };

  // ===== 接龙函数 =====
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

  // ===== 打卡函数 =====
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

  // ===== 导出与统计 =====
  const exportChat = () => {
    if (!currentRoomId) return;
    setExportingChat(true);
    socketRef.current.emit('exportChat', { roomId: currentRoomId });
  };

  const fetchStats = () => {
    socketRef.current.emit('getStats');
  };

  return {
    // Moments
    moments, setMoments,
    showMoments, setShowMoments,
    newMoment, setNewMoment,
    // Polls
    polls, setPolls,
    showPollModal, setShowPollModal,
    pollQuestion, setPollQuestion,
    pollOptions, setPollOptions,
    pollAnonymous, setPollAnonymous,
    pollDeadline, setPollDeadline,
    pollOptionImages, setPollOptionImages,
    // Solitaire
    showSolitaireModal, setShowSolitaireModal,
    solitaireTitle, setSolitaireTitle,
    solitaireFormat, setSolitaireFormat,
    showSolitaireJoin, setShowSolitaireJoin,
    // Check-in
    checkInData, setCheckInData,
    showCheckIn, setShowCheckIn,
    checkInNote, setCheckInNote,
    checkInNoteRef,
    // Game
    gameResult, setGameResult,
    showGameModal, setShowGameModal,
    // Bot
    showBotModal, setShowBotModal,
    bots, setBots,
    botForm, setBotForm,
    // Wrapped
    showWrapped, setShowWrapped,
    wrappedData, setWrappedData,
    wrappedLoading, setWrappedLoading,
    // Stats
    messageStats, setMessageStats,
    // Functions
    publishMoment,
    likeMoment,
    commentMoment,
    createPoll,
    votePoll,
    addPollOption,
    removePollOption,
    updatePollOption,
    createEnhancedPoll,
    createSolitaire,
    joinSolitaire,
    doCheckIn,
    fetchCheckIns,
    fetchWrapped,
    fetchBots,
    createBot,
    deleteBot,
    exportChat,
    fetchStats,
  };
}
