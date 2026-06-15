import { useState, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/constants';

export function useAI({
  token,
  user,
  showToast,
  setBalance,
  currentRoomId,
  messages,
  socketRef,
  setNewMessage,
}) {
  // ===== AI 对话 =====
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
  const [aiStatus, setAiStatus] = useState(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const aiMessagesEndRef = useRef(null);

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

  // ===== AI 图片生成 =====
  const [showImageGen, setShowImageGen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genStyle, setGenStyle] = useState('');
  const [genResult, setGenResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);

  // ===== AI 翻译 =====
  const [translatingMsg, setTranslatingMsg] = useState(null);
  const [translations, setTranslations] = useState({});

  // ===== AI 识图 =====
  const [imageDesc, setImageDesc] = useState({});
  const [descLoading, setDescLoading] = useState(null);

  // ===== AI 摘要 =====
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // ===== AI 对话函数 =====
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

  // ===== AI 识图 =====
  const describeImage = async (msgId, imageUrl) => {
    if (imageDesc[msgId] || descLoading === msgId) return;
    setDescLoading(msgId);
    try {
      const res = await axios.post(`${API_URL}/api/ai/describe-image`, { imageUrl }, { headers: { Authorization: token } });
      setImageDesc(prev => ({ ...prev, [msgId]: res.data.description }));
    } catch { showToast('识别失败', 'error'); }
    finally { setDescLoading(null); }
  };

  return {
    // AI Chat
    aiMessages, setAiMessages,
    aiInput, setAiInput,
    aiLoading, setAiLoading,
    aiModel, setAiModel,
    aiModels, setAiModels,
    aiStatus, setAiStatus,
    aiStatusLoading, setAiStatusLoading,
    aiMessagesEndRef,
    // AI enhanced features
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
    // AI image generation
    showImageGen, setShowImageGen,
    genPrompt, setGenPrompt,
    genStyle, setGenStyle,
    genResult, setGenResult,
    genLoading, setGenLoading,
    // AI translation
    translatingMsg, setTranslatingMsg,
    translations, setTranslations,
    // AI image description
    imageDesc, setImageDesc,
    descLoading, setDescLoading,
    // AI summary
    aiSummary, setAiSummary,
    aiSummaryLoading, setAiSummaryLoading,
    // Functions
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
  };
}
