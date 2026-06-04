const express = require('express');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 100 * 1024 * 1024
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend build as static files
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

const JWT_SECRET = 'wechat-secret-key-2024';
const PORT = 3001;

const collections = db.init();
const users = collections.users;
const friendRequests = collections.friendRequests;
const friends = collections.friends;
const rooms = collections.rooms;
const recharges = collections.recharges;

// Start auto-flush to prevent data loss on crash
db.startAutoFlush(collections);

// Graceful shutdown: flush data on exit
function handleShutdown(signal) {
  console.log(`\nReceived ${signal}, flushing data to disk...`);
  db.flushAll(collections);
  db.stopAutoFlush();
  process.exit(0);
}
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

const onlineUsers = new Map();
const userSockets = new Map();
const chunksStore = new Map();

function generateSixDigitId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
}

function ensureUserData(userId) {
  if (!friendRequests.has(userId)) {
    friendRequests.set(userId, []);
  }
  if (!friends.has(userId)) {
    friends.set(userId, []);
  }
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (users.has(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  let sixDigitId = generateSixDigitId();
  while (Array.from(users.values()).some(u => u.sixDigitId === sixDigitId)) {
    sixDigitId = generateSixDigitId();
  }
  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    sixDigitId,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    bio: '',
    createdAt: new Date()
  };
  users.set(username, user);
  ensureUserData(user.id);
  
  const globalRoom = rooms.get('global');
  if (globalRoom && !globalRoom.members.includes(username)) {
    globalRoom.members.push(username);
    rooms.set('global', globalRoom);
  }
  
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, sixDigitId: user.sixDigitId, bio: user.bio } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, sixDigitId: user.sixDigitId, bio: user.bio } });
});

app.get('/api/users', verifyToken, (req, res) => {
  const userList = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    sixDigitId: u.sixDigitId,
    bio: u.bio,
    online: onlineUsers.has(u.id)
  }));
  res.json(userList);
});

app.get('/api/users/search/:sixDigitId', verifyToken, (req, res) => {
  const { sixDigitId } = req.params;
  const user = Array.from(users.values()).find(u => u.sixDigitId === sixDigitId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const userFriends = friends.get(req.user.id) || [];
  const isFriend = userFriends.includes(user.username);
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    sixDigitId: user.sixDigitId,
    bio: user.bio,
    online: onlineUsers.has(user.id),
    isFriend
  });
});

app.get('/api/profile', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    sixDigitId: user.sixDigitId,
    bio: user.bio,
    online: onlineUsers.has(user.id)
  });
});

app.put('/api/profile', verifyToken, (req, res) => {
  const { avatar, bio, payCode } = req.body;
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (avatar !== undefined) {
    user.avatar = avatar;
  }
  if (bio !== undefined) {
    user.bio = bio;
  }
  if (payCode !== undefined) {
    user.payCode = payCode;
  }
  users.set(user.username, user);
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    sixDigitId: user.sixDigitId,
    bio: user.bio,
    payCode: user.payCode
  });
});

// 收款码相关 API
app.get('/api/user/paycode', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ payCode: user.payCode || null });
});

app.post('/api/user/paycode', verifyToken, (req, res) => {
  const { payCode } = req.body;
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  user.payCode = payCode || null;
  users.set(user.username, user);
  res.json({ payCode: user.payCode });
});

app.get('/api/users/:username/paycode', verifyToken, (req, res) => {
  const { username } = req.params;
  const user = users.get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ 
    username: user.username,
    payCode: user.payCode || null 
  });
});

// ========== 充值系统 ==========

// 管理员收款码（用户充值时显示）
const ADMIN_PAY_CODE = '/paycode.jpg'; // 收款码图片路径

// AI调用价格（每次调用扣费金额，单位：元）
const AI_CALL_PRICE = 0.02; // 每次调用0.02元

// 获取用户余额
app.get('/api/user/balance', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ balance: user.balance || 0 });
});

// 充值请求
app.post('/api/recharge/request', verifyToken, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 1) {
    return res.status(400).json({ error: '充值金额至少1元' });
  }
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const rechargeId = uuidv4();
  const rechargeRecord = {
    id: rechargeId,
    userId: user.id,
    username: user.username,
    amount: parseFloat(amount),
    status: 'pending', // pending, confirmed, rejected
    createdAt: new Date().toISOString(),
    confirmedAt: null
  };
  
  recharges.set(rechargeId, rechargeRecord);
  
  res.json({
    rechargeId,
    amount: rechargeRecord.amount,
    payCode: ADMIN_PAY_CODE,
    message: '请使用微信扫描收款码转账，转账后等待管理员确认'
  });
});

// 获取用户充值记录
app.get('/api/recharge/history', verifyToken, (req, res) => {
  const userRecharges = recharges.findAll(r => r.userId === req.user.id);
  res.json(userRecharges.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// 管理员：获取所有待确认充值
app.get('/api/admin/recharges/pending', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  const pendingRecharges = recharges.findAll(r => r.status === 'pending');
  res.json(pendingRecharges.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// 管理员：确认充值
app.post('/api/admin/recharge/confirm', verifyToken, (req, res) => {
  const { rechargeId } = req.body;
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const recharge = recharges.get(rechargeId);
  if (!recharge) {
    return res.status(404).json({ error: '充值记录不存在' });
  }
  if (recharge.status !== 'pending') {
    return res.status(400).json({ error: '该充值已处理' });
  }
  
  // 更新充值状态
  recharge.status = 'confirmed';
  recharge.confirmedAt = new Date().toISOString();
  recharges.set(rechargeId, recharge);
  
  // 增加用户余额
  const targetUser = Array.from(users.values()).find(u => u.id === recharge.userId);
  if (targetUser) {
    targetUser.balance = (targetUser.balance || 0) + recharge.amount;
    users.set(targetUser.username, targetUser);
  }
  
  res.json({ success: true, recharge, newBalance: targetUser?.balance });
});

// 管理员：拒绝充值
app.post('/api/admin/recharge/reject', verifyToken, (req, res) => {
  const { rechargeId, reason } = req.body;
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  const recharge = recharges.get(rechargeId);
  if (!recharge) {
    return res.status(404).json({ error: '充值记录不存在' });
  }
  if (recharge.status !== 'pending') {
    return res.status(400).json({ error: '该充值已处理' });
  }
  
  recharge.status = 'rejected';
  recharge.confirmedAt = new Date().toISOString();
  recharge.rejectReason = reason || '管理员拒绝';
  recharges.set(rechargeId, recharge);
  
  res.json({ success: true, recharge });
});

app.get('/api/friends', verifyToken, (req, res) => {
  ensureUserData(req.user.id);
  const friendUsernames = friends.get(req.user.id) || [];
  const friendList = friendUsernames.map(username => {
    const user = users.get(username);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      sixDigitId: user.sixDigitId,
      bio: user.bio,
      online: onlineUsers.has(user.id)
    };
  }).filter(Boolean);
  res.json(friendList);
});

app.get('/api/friend-requests', verifyToken, (req, res) => {
  ensureUserData(req.user.id);
  const requests = friendRequests.get(req.user.id) || [];
  const requestList = requests.map(username => {
    const user = users.get(username);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      sixDigitId: user.sixDigitId,
      bio: user.bio
    };
  }).filter(Boolean);
  res.json(requestList);
});

app.post('/api/friends/request', verifyToken, (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  if (username === req.user.username) {
    return res.status(400).json({ error: 'Cannot add yourself' });
  }
  const targetUser = users.get(username);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  ensureUserData(req.user.id);
  ensureUserData(targetUser.id);
  
  const existingFriends = friends.get(req.user.id) || [];
  if (existingFriends.includes(username)) {
    return res.status(400).json({ error: 'Already friends' });
  }
  
  const existingRequests = friendRequests.get(req.user.id) || [];
  if (existingRequests.includes(username)) {
    return res.status(400).json({ error: 'Request already sent by this user' });
  }
  
  ensureUserData(targetUser.id);
  const targetRequests = friendRequests.get(targetUser.id) || [];
  if (targetRequests.includes(req.user.username)) {
    return res.status(400).json({ error: 'Friend request already sent' });
  }
  
  friendRequests.set(targetUser.id, [...targetRequests, req.user.username]);
  
  const targetSocket = userSockets.get(targetUser.id);
  if (targetSocket) {
    const senderUser = users.get(req.user.username);
    targetSocket.emit('friendRequest', {
      id: req.user.id,
      username: req.user.username,
      avatar: senderUser?.avatar,
      sixDigitId: senderUser?.sixDigitId,
      bio: senderUser?.bio
    });
  }
  
  res.json({ success: true, message: 'Friend request sent' });
});

app.post('/api/friends/accept', verifyToken, (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  ensureUserData(req.user.id);
  ensureUserData(req.user.id);
  
  const requests = friendRequests.get(req.user.id) || [];
  if (!requests.includes(username)) {
    return res.status(400).json({ error: 'No friend request from this user' });
  }
  
  friendRequests.set(req.user.id, requests.filter(r => r !== username));
  
  ensureUserData(req.user.id);
  const userFriends = friends.get(req.user.id) || [];
  friends.set(req.user.id, [...userFriends, username]);
  
  const targetUser = users.get(username);
  if (targetUser) {
    ensureUserData(targetUser.id);
    const targetFriends = friends.get(targetUser.id) || [];
    friends.set(targetUser.id, [...targetFriends, req.user.username]);
    
    const targetSocket = userSockets.get(targetUser.id);
    if (targetSocket) {
      const currentUser = users.get(req.user.username);
      targetSocket.emit('friendAccepted', {
        id: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar
      });
    }
  }
  
  res.json({ success: true, message: 'Friend request accepted' });
});

app.post('/api/friends/reject', verifyToken, (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  ensureUserData(req.user.id);
  const requests = friendRequests.get(req.user.id) || [];
  friendRequests.set(req.user.id, requests.filter(r => r !== username));
  
  res.json({ success: true, message: 'Friend request rejected' });
});

const https = require('https');

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
const KIMI_API_KEY = process.env.KIMI_API_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const ZHIPU_BASE = 'open.bigmodel.cn';
const KIMI_BASE = 'api.moonshot.cn';
const DEEPSEEK_BASE = 'api.deepseek.com';

// 调用智谱AI OpenAI兼容接口
function callAI(messages, model, callback) {
  if (!ZHIPU_API_KEY) {
    return callback(new Error('ZHIPU_API_KEY 未配置'));
  }
  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    max_tokens: 1024,
    temperature: 0.7
  });
  const options = {
    hostname: ZHIPU_BASE,
    port: 443,
    path: '/api/paas/v4/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const req = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(e, data);
      }
    });
  });
  req.on('error', err => callback(err, null));
  req.write(body);
  req.end();
}

// 备用通道：Pollinations.ai（完全免费、无需 key）
function callPollinations(messages, callback) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const prompt = lastUser?.content || '你好';
  const systemMsg = messages.find(m => m.role === 'system');
  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast&system=${encodeURIComponent(systemMsg?.content || '你是友好的AI助手')}`;
  
  https.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      if (response.statusCode === 200 && data && !data.includes('Queue full')) {
        callback(null, { reply: data.trim(), model: 'pollinations' });
      } else {
        callback(new Error(`Pollinations 限速: ${response.statusCode}`), null);
      }
    });
  }).on('error', err => callback(err, null));
}

// 调用Kimi AI
function callKimiAI(messages, model, callback) {
  if (!KIMI_API_KEY) {
    return callback(new Error('KIMI_API_KEY 未配置'));
  }
  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    max_tokens: 1024,
    temperature: 0.7
  });
  const options = {
    hostname: KIMI_BASE,
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const req = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        callback(null, json);
      } catch (e) {
        callback(new Error('Kimi 响应解析失败'), null);
      }
    });
  }).on('error', err => callback(err, null));
}

const DEEPSEEK_MODEL_MAP = {
  'deepseek-v4-flash': 'deepseek-chat',
  'deepseek-v4-pro': 'deepseek-reasoner'
};

// 调用 DeepSeek AI
function callDeepSeekAI(messages, model, callback) {
  if (!DEEPSEEK_API_KEY) {
    return callback(new Error('DEEPSEEK_API_KEY 未配置'));
  }
  const apiModel = 'deepseek-chat'; // 始终使用 deepseek-chat
  const body = JSON.stringify({
    model: apiModel,
    messages,
    stream: false,
    max_tokens: 1024,
    temperature: 0.7
  });
  const options = {
    hostname: 'api.deepseek.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 60000 // 60秒超时
  };
  const req = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        callback(null, json);
      } catch (e) {
        callback(new Error('DeepSeek 响应解析失败: ' + data.substring(0, 100)), null);
      }
    });
  });
  req.on('timeout', () => {
    req.destroy();
    callback(new Error('DeepSeek 请求超时'), null);
  });
  req.on('error', err => callback(err, null));
  req.write(body);
  req.end();
}

// AI 聊天代理（每个用户独立会话上下文）
const aiConversations = new Map(); // userId -> [{role, content}, ...]

app.post('/api/ai/chat', verifyToken, (req, res) => {
  const { message, model, reset } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: '消息不能为空' });
  }
  
  const useModel = model || 'glm-4-flash';
  const userId = req.user.id;
  
  // 初始化会话
  if (reset || !aiConversations.has(userId)) {
    aiConversations.set(userId, [
      { role: 'system', content: '你是一个友好、乐于助人的AI助手，用简洁清晰的中文回答用户问题。' }
    ]);
  }
  
  const history = aiConversations.get(userId);
  history.push({ role: 'user', content: message });
  
  if (history.length > 21) {
    aiConversations.set(userId, [history[0], ...history.slice(-20)]);
  }
  
  // === 免费模型（glm-4-flash）：跳过余额检查 ===
  const user = Array.from(users.values()).find(u => u.id === userId);
  const isAdmin = user?.username === 'admin';
  
  // admin 管理员跳过余额检查，免费使用付费AI
  if (useModel !== 'glm-4-flash' && !isAdmin) {
    const balance = user?.balance || 0;
    if (balance < AI_CALL_PRICE) {
      return res.status(402).json({ 
        error: '余额不足', 
        hint: `当前余额 ¥${balance.toFixed(2)}，需要 ¥${AI_CALL_PRICE.toFixed(2)}/次`,
        balance,
        required: AI_CALL_PRICE,
        rechargeUrl: '/api/recharge/request'
      });
    }
  }
  
  // 检查是否是Kimi模型
  const isKimiModel = useModel.startsWith('moonshot-') || useModel.startsWith('kimi-');
  // 检查是否是DeepSeek模型
  const isDeepSeekModel = useModel.startsWith('deepseek-');
  
  // 无 key 时走 Pollinations（免费，不扣费）
  if (!ZHIPU_API_KEY && !KIMI_API_KEY && !DEEPSEEK_API_KEY) {
    return callPollinations(history, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'AI 调用失败: ' + err.message, hint: '请配置 API_KEY' });
      }
      history.push({ role: 'assistant', content: result.reply });
      res.json({ reply: result.reply, model: result.model, provider: 'pollinations', balance });
    });
  }
  
  // 使用Kimi模型
  if (isKimiModel) {
    if (!KIMI_API_KEY) {
      return callPollinations(history, (err, result) => {
        if (err) {
          return res.status(500).json({ error: '请配置 KIMI_API_KEY' });
        }
        history.push({ role: 'assistant', content: result.reply });
        res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'Kimi Key未配置，已切换免key通道' });
      });
    }
    
    return callKimiAI(aiConversations.get(userId), useModel, (err, json) => {
      if (err) {
        console.error('Kimi调用失败:', err.message);
        return callPollinations(history, (err2, result) => {
          if (err2) {
            return res.status(500).json({ error: 'Kimi 调用失败: ' + err.message });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'Kimi调用失败，已切换免key通道' });
        });
      }
      
      if (json.error) {
        const msg = json.error.message || 'AI 返回错误';
        const code = json.error.code;
        return callPollinations(history, (err2, result) => {
          if (err2) {
            return res.status(500).json({ error: msg, code });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: `Kimi ${msg}，已切换免key通道` });
        });
      }
      
      const reply = json.choices?.[0]?.message?.content || '（无回复）';
      if (!reply || reply === '（无回复）') {
        return callPollinations(history, (err2, result) => {
          if (err2) {
            history.push({ role: 'assistant', content: reply });
            return res.json({ reply, model: useModel, provider: 'kimi' });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'Kimi无回复，已切换免key通道' });
        });
      }
      
      history.push({ role: 'assistant', content: reply });
      
      // 扣费（admin 管理员不扣费）
      if (user && !isAdmin) {
        user.balance = (user.balance || 0) - AI_CALL_PRICE;
        users.set(user.username, user);
      }
      
      res.json({ reply, model: useModel, provider: 'kimi', usage: json.usage || null, balance: user?.balance || 0 });
    });
  }
  
  // 使用DeepSeek模型
  if (isDeepSeekModel) {
    if (!DEEPSEEK_API_KEY) {
      return callPollinations(history, (err, result) => {
        if (err) {
          return res.status(500).json({ error: '请配置 DEEPSEEK_API_KEY' });
        }
        history.push({ role: 'assistant', content: result.reply });
        res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'DeepSeek Key未配置，已切换免key通道' });
      });
    }
    
    return callDeepSeekAI(aiConversations.get(userId), useModel, (err, json) => {
      if (err) {
        console.error('DeepSeek调用失败:', err.message);
        return callPollinations(history, (err2, result) => {
          if (err2) {
            return res.status(500).json({ error: 'DeepSeek 调用失败: ' + err.message });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'DeepSeek调用失败，已切换免key通道' });
        });
      }
      
      if (json.error) {
        const msg = json.error.message || 'AI 返回错误';
        const code = json.error.code;
        return callPollinations(history, (err2, result) => {
          if (err2) {
            return res.status(500).json({ error: msg, code });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: `DeepSeek ${msg}，已切换免key通道` });
        });
      }
      
      const reply = json.choices?.[0]?.message?.content || '（无回复）';
      if (!reply || reply === '（无回复）') {
        return callPollinations(history, (err2, result) => {
          if (err2) {
            history.push({ role: 'assistant', content: reply });
            return res.json({ reply, model: useModel, provider: 'deepseek' });
          }
          history.push({ role: 'assistant', content: result.reply });
          res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: 'DeepSeek无回复，已切换免key通道' });
        });
      }
      
      history.push({ role: 'assistant', content: reply });
      
      // 扣费（admin 管理员不扣费）
      if (user && !isAdmin) {
        user.balance = (user.balance || 0) - AI_CALL_PRICE;
        users.set(user.username, user);
      }
      
      res.json({ reply, model: useModel, provider: 'deepseek', usage: json.usage || null, balance: user?.balance || 0 });
    });
  }
  
  // 使用智谱模型
  callAI(aiConversations.get(userId), useModel, (err, json) => {
    if (err) {
      console.error('智谱AI调用失败:', err.message);
      return callPollinations(history, (err2, result) => {
        if (err2) {
          return res.status(500).json({ error: 'AI 调用失败: ' + err.message });
        }
        history.push({ role: 'assistant', content: result.reply });
        res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: '智谱AI调用失败，已切换免key通道' });
      });
    }
    
    // 智谱AI错误格式
    if (json.error) {
      const msg = json.error.message || 'AI 返回错误';
      const code = json.error.code;
      let hint = '';
      if (code === 'invalid_api_key' || code === 401) {
        hint = 'API Key无效，请检查 server/.env 中的 ZHIPU_API_KEY';
      } else if (msg.includes('quota') || msg.includes('balance') || msg.includes('额度')) {
        hint = 'API额度不足，请及时充值';
        return res.status(403).json({ error: msg, code, hint, rechargeUrl: 'https://bigmodel.cn/usercenter/mymodelpay' });
      } else if (code === 'rate_limit') {
        hint = '请求过于频繁，请稍后再试';
      }
      return callPollinations(history, (err2, result) => {
        if (err2) {
          return res.status(500).json({ error: msg, code, hint });
        }
        history.push({ role: 'assistant', content: result.reply });
        res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: `智谱AI ${msg}，已切换免key通道` });
      });
    }
    
    const reply = json.choices?.[0]?.message?.content || '（无回复）';
    if (!reply || reply === '（无回复）') {
      return callPollinations(history, (err2, result) => {
        if (err2) {
          history.push({ role: 'assistant', content: reply });
          return res.json({ reply, model: useModel, provider: 'zhipu' });
        }
        history.push({ role: 'assistant', content: result.reply });
        res.json({ reply: result.reply, model: result.model, provider: 'pollinations', warning: '智谱AI无回复，已切换免key通道' });
      });
    }
    history.push({ role: 'assistant', content: reply });
    
    // 扣费（免费模型不扣，admin 管理员不扣）
    if (user && useModel !== 'glm-4-flash' && !isAdmin) {
      user.balance = (user.balance || 0) - AI_CALL_PRICE;
      users.set(user.username, user);
    }
    
    res.json({ reply, model: useModel, provider: 'zhipu', usage: json.usage || null, balance: user?.balance || 0 });
  });
});

app.post('/api/ai/reset', verifyToken, (req, res) => {
  aiConversations.delete(req.userId);
  res.json({ ok: true });
});

app.get('/api/ai/models', verifyToken, (req, res) => {
  res.json({
    models: [
      { id: 'glm-4-flash', name: '智谱 GLM-4-Flash（免费）', free: true, desc: '快速免费' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4-Flash', free: false, desc: 'DeepSeek 快速模型' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4-Pro', free: false, desc: 'DeepSeek 推理增强模型' },
      { id: 'glm-4-plus', name: '智谱 GLM-4-Plus', free: false, desc: '更强推理' }
    ]
  });
});

function biliRequest(path, callback) {
  const url = `https://api.bilibili.com${path}`;
  const options = {
    headers: {
      'Referer': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    }
  };
  https.get(url, options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        callback(null, JSON.parse(data));
      } catch (e) {
        callback(e, data);
      }
    });
  }).on('error', (err) => {
    callback(err, null);
  });
}

app.get('/api/bilibili/search', verifyToken, (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    return res.status(400).json({ error: 'Keyword required' });
  }
  const path = `/x/web-interface/wbi/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=1&page_size=20`;
  biliRequest(path, (err, json) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(json);
  });
});

app.get('/api/bilibili/popular', verifyToken, (req, res) => {
  biliRequest('/x/web-interface/popular/precious?page=1&page_size=20', (err, json) => {
    if (err) {
      return res.json({ code: -1, data: { list: [] } });
    }
    res.json(json);
  });
});

app.get('/api/bilibili/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid url' });
  }
  https.get(imageUrl, {
    headers: {
      'Referer': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, (response) => {
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

app.get('/api/rooms', verifyToken, (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    type: room.type,
    memberCount: room.members.length,
    lastMessage: room.messages[room.messages.length - 1] || null
  }));
  res.json(roomList);
});

app.post('/api/rooms', verifyToken, (req, res) => {
  const { name, type, members } = req.body;
  const room = {
    id: uuidv4(),
    name,
    type: type || 'group',
    members: members || [req.user.username],
    messages: [],
    createdBy: req.user.username,
    createdAt: new Date()
  };
  rooms.set(room.id, room);
  io.emit('roomCreated', room);
  res.json(room);
});

app.get('/api/rooms/:roomId/messages', verifyToken, (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const start = (page - 1) * limit;
  const messages = room.messages.slice(start, start + limit);
  res.json({ messages, hasMore: room.messages.length > start + limit });
});

app.post('/api/upload/init', verifyToken, (req, res) => {
  const { filename, totalChunks, fileSize, mimeType } = req.body;
  const uploadId = uuidv4();
  chunksStore.set(uploadId, {
    filename,
    totalChunks,
    fileSize,
    mimeType,
    chunks: [],
    uploadedSize: 0,
    createdAt: Date.now()
  });
  res.json({ uploadId });
});

app.post('/api/upload/chunk', verifyToken, upload.single('chunk'), (req, res) => {
  const { uploadId, chunkIndex } = req.body;
  const uploadData = chunksStore.get(uploadId);
  if (!uploadData) {
    return res.status(400).json({ error: 'Upload not found or expired' });
  }
  const chunkPath = path.join(__dirname, 'uploads', 'chunks', uploadId);
  if (!fs.existsSync(chunkPath)) {
    fs.mkdirSync(chunkPath, { recursive: true });
  }
  const chunkFileName = `chunk_${chunkIndex}`;
  fs.writeFileSync(path.join(chunkPath, chunkFileName), req.file.buffer);
  uploadData.chunks.push(parseInt(chunkIndex));
  uploadData.uploadedSize += req.file.size;
  res.json({ received: true, progress: Math.round((uploadData.uploadedSize / uploadData.fileSize) * 100) });
});

app.post('/api/upload/complete', verifyToken, (req, res) => {
  const { uploadId } = req.body;
  const uploadData = chunksStore.get(uploadId);
  if (!uploadData) {
    return res.status(400).json({ error: 'Upload not found' });
  }
  if (uploadData.chunks.length !== uploadData.totalChunks) {
    return res.status(400).json({ error: 'Not all chunks uploaded' });
  }
  const chunkPath = path.join(__dirname, 'uploads', 'chunks', uploadId);
  const ext = path.extname(uploadData.filename);
  const finalFileName = `${uploadId}${ext}`;
  const finalPath = path.join(__dirname, 'uploads', finalFileName);
  const writeStream = fs.createWriteStream(finalPath);
  for (let i = 0; i < uploadData.totalChunks; i++) {
    const chunkFile = path.join(chunkPath, `chunk_${i}`);
    const chunkData = fs.readFileSync(chunkFile);
    writeStream.write(chunkData);
  }
  writeStream.end();
  writeStream.on('finish', () => {
    fs.rmSync(chunkPath, { recursive: true });
    chunksStore.delete(uploadId);
    const fileUrl = `/uploads/${finalFileName}`;
    res.json({ url: fileUrl, filename: uploadData.filename });
  });
});

app.post('/api/upload/simple', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.originalname });
});

app.post('/api/upload/avatar', verifyToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (user) {
    user.avatar = `/uploads/${req.file.filename}`;
    users.set(user.username, user);
  }
  res.json({ avatar: `/uploads/${req.file.filename}` });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      onlineUsers.set(decoded.id, { id: decoded.id, username: decoded.username, socketId: socket.id });
      userSockets.set(decoded.id, socket);
      socket.emit('authenticated', { user: { id: decoded.id, username: decoded.username } });
      io.emit('userOnline', { id: decoded.id, username: decoded.username });
      
      ensureUserData(decoded.id);
      
      const globalRoom = rooms.get('global');
      if (globalRoom) {
        socket.join('global');
        socket.currentRoom = 'global';
        socket.emit('joinedRoom', { roomId: 'global', messages: globalRoom.messages.slice(-100) });
        socket.emit('roomCreated', { id: 'global', name: '全局聊天', type: 'public' });
      }
      
      console.log(`User ${decoded.username} authenticated`);
    } catch (err) {
      socket.emit('authError', { error: 'Invalid token' });
    }
  });

  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.join(roomId);
      socket.currentRoom = roomId;
      socket.emit('joinedRoom', { roomId, messages: room.messages.slice(-100) });
    }
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    socket.currentRoom = null;
  });

  socket.on('sendMessage', (data) => {
    const { roomId, content, type, fileUrl, filename, fileSize, mimeType, replyTo, mentions } = data;
    const room = rooms.get(roomId);
    if (!room) return;
    const message = {
      id: uuidv4(),
      content,
      type: type || 'text',
      fileUrl,
      filename,
      fileSize,
      mimeType,
      replyTo: replyTo || null,
      mentions: mentions || [],
      sender: {
        id: socket.userId,
        username: socket.username,
        avatar: users.get(socket.username)?.avatar
      },
      roomId,
      timestamp: new Date(),
      readBy: [socket.userId],
      edited: false,
      pinned: false
    };
    room.messages.push(message);
    if (room.messages.length > 500) {
      room.messages = room.messages.slice(-500);
    }
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', message);
    
    // 通知被@的用户
    if (mentions && mentions.length > 0) {
      mentions.forEach(mentionId => {
        const userSocket = onlineUsers.get(mentionId);
        if (userSocket && userSocket !== socket.id) {
          io.to(userSocket).emit('mentionNotification', {
            messageId: message.id,
            roomId,
            roomName: room.name,
            sender: message.sender.username
          });
        }
      });
    }
  });

  // 消息已读回执
  socket.on('markMessageRead', ({ roomId, messageId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.readBy.includes(socket.userId)) {
      msg.readBy.push(socket.userId);
      rooms.set(roomId, room);
      io.to(roomId).emit('messageReadUpdate', { messageId, userId: socket.userId, readBy: msg.readBy });
    }
  });

  // 批量标记已读
  socket.on('markAllRead', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.messages.forEach(msg => {
      if (!msg.readBy.includes(socket.userId)) {
        msg.readBy.push(socket.userId);
      }
    });
    rooms.set(roomId, room);
    io.to(roomId).emit('allMessagesRead', { roomId, userId: socket.userId });
  });

  // 撤回消息
  socket.on('recallMessage', ({ roomId, messageId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msgIndex = room.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = room.messages[msgIndex];
    // 只允许消息发送者撤回
    if (msg.sender.id !== socket.userId) return;
    // 只允许撤回 5 分钟内的消息
    const now = Date.now();
    const msgTime = new Date(msg.timestamp).getTime();
    if (now - msgTime > 5 * 60 * 1000) {
      socket.emit('recallError', { error: '只能撤回5分钟内的消息' });
      return;
    }
    msg.recalled = true;
    room.messages[msgIndex] = msg;
    rooms.set(roomId, room);
    io.to(roomId).emit('messageRecalled', { messageId, roomId });
  });

  // 编辑消息
  socket.on('editMessage', ({ roomId, messageId, content }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msgIndex = room.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = room.messages[msgIndex];
    if (msg.sender.id !== socket.userId) return;
    // 只允许编辑 30 分钟内的消息
    const now = Date.now();
    const msgTime = new Date(msg.timestamp).getTime();
    if (now - msgTime > 30 * 60 * 1000) {
      socket.emit('editError', { error: '只能编辑30分钟内的消息' });
      return;
    }
    msg.content = content;
    msg.edited = true;
    msg.editedAt = new Date();
    room.messages[msgIndex] = msg;
    rooms.set(roomId, room);
    io.to(roomId).emit('messageEdited', { messageId, content, editedAt: msg.editedAt });
  });

  // 发送红包
  socket.on('sendRedPacket', ({ roomId, amount, count, message, distribution }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // 检查用户余额
    const user = users.get(socket.username);
    if (!user) return;
    if (user.balance < amount) {
      socket.emit('redPacketError', { error: '余额不足' });
      return;
    }
    
    // 扣减余额
    user.balance = parseFloat((user.balance - amount).toFixed(2));
    users.set(socket.username, user);
    
    const packet = {
      id: uuidv4(),
      type: 'redPacket',
      amount: parseFloat(amount),
      count: parseInt(count),
      message: message || '恭喜发财，大吉大利',
      sender: { id: socket.userId, username: socket.username },
      roomId,
      timestamp: new Date(),
      claimed: [],
      claimedDetails: [],
      remaining: parseInt(count),
      distribution: distribution || []
    };
    room.messages.push(packet);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', packet);
  });

  // 抢红包
  socket.on('claimRedPacket', ({ roomId, packetId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const packet = room.messages.find(m => m.id === packetId);
    if (!packet || packet.type !== 'redPacket') return;
    if (packet.remaining <= 0) {
      socket.emit('redPacketEmpty', { packetId });
      return;
    }
    if (packet.claimed.includes(socket.userId)) {
      socket.emit('alreadyClaimed', { packetId });
      return;
    }
    
    // 使用预分配的金额
    let share = 0;
    if (packet.distribution && packet.distribution.length > 0) {
      const claimIndex = packet.claimed.length;
      if (claimIndex < packet.distribution.length) {
        share = packet.distribution[claimIndex];
      } else {
        // 如果没有预分配，平均分配
        share = parseFloat((packet.amount / packet.count).toFixed(2));
      }
    } else {
      // 没有预分配，平均分配
      share = parseFloat((packet.amount / packet.count).toFixed(2));
    }
    
    packet.claimed.push(socket.userId);
    packet.remaining--;
    packet.claimedDetails.push({ userId: socket.userId, amount: share });
    
    // 增加用户余额
    const user = users.get(socket.username);
    if (user) {
      user.balance = parseFloat((user.balance + share).toFixed(2));
      users.set(socket.username, user);
    }
    
    rooms.set(roomId, room);
    io.to(roomId).emit('redPacketClaimed', { packetId, userId: socket.userId, share });
  });

  // 发送投票
  socket.on('createPoll', ({ roomId, question, options }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const poll = {
      id: uuidv4(),
      type: 'poll',
      question,
      options: options.map(opt => ({ text: opt, votes: [] })),
      sender: { id: socket.userId, username: socket.username },
      roomId,
      timestamp: new Date()
    };
    room.messages.push(poll);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', poll);
  });

  // 投票
  socket.on('votePoll', ({ roomId, pollId, optionIndex }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const poll = room.messages.find(m => m.id === pollId);
    if (!poll || poll.type !== 'poll') return;
    if (!poll.options[optionIndex]) return;
    // 检查是否已投
    const alreadyVoted = poll.options.some(opt => opt.votes.includes(socket.userId));
    if (alreadyVoted) return;
    poll.options[optionIndex].votes.push(socket.userId);
    io.to(roomId).emit('pollUpdated', { pollId, optionIndex, userId: socket.userId });
  });

  // 发送骰子
  socket.on('sendDice', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const value = Math.floor(Math.random() * 6) + 1;
    const diceMsg = {
      id: uuidv4(),
      type: 'dice',
      value,
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      roomId,
      timestamp: new Date()
    };
    room.messages.push(diceMsg);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', diceMsg);
  });

  // 发送猜拳
  socket.on('sendRockPaperScissors', ({ roomId, choice }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const choices = ['石头', '剪刀', '布'];
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result = '平局';
    if ((choice === '石头' && botChoice === '剪刀') ||
        (choice === '剪刀' && botChoice === '布') ||
        (choice === '布' && botChoice === '石头')) {
      result = '你赢了';
    } else if (choice !== botChoice) {
      result = '你输了';
    }
    const gameMsg = {
      id: uuidv4(),
      type: 'rockPaperScissors',
      userChoice: choice,
      botChoice,
      result,
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      roomId,
      timestamp: new Date()
    };
    room.messages.push(gameMsg);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', gameMsg);
  });

  // 设置群公告
  socket.on('setAnnouncement', ({ roomId, announcement }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.createdBy !== socket.username) {
      socket.emit('announcementError', { error: '只有群主可以设置公告' });
      return;
    }
    room.announcement = announcement;
    rooms.set(roomId, room);
    io.to(roomId).emit('announcementUpdated', { roomId, announcement });
  });

  // 踢人
  socket.on('kickMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.createdBy !== socket.username) {
      socket.emit('kickError', { error: '只有群主可以踢人' });
      return;
    }
    room.members = room.members.filter(m => m !== username);
    rooms.set(roomId, room);
    io.to(roomId).emit('memberKicked', { roomId, username });
    // 通知被踢用户
    const userSocket = [...onlineUsers.values()].find(s => s.username === username);
    if (userSocket) {
      io.to(userSocket.id).emit('youWereKicked', { roomId, roomName: room.name });
    }
  });

  // 禁言
  socket.on('muteMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.createdBy !== socket.username) {
      socket.emit('muteError', { error: '只有群主可以禁言' });
      return;
    }
    if (!room.mutedMembers) room.mutedMembers = [];
    if (!room.mutedMembers.includes(username)) {
      room.mutedMembers.push(username);
      rooms.set(roomId, room);
      io.to(roomId).emit('memberMuted', { roomId, username });
    }
  });

  // 解除禁言
  socket.on('unmuteMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.createdBy !== socket.username) return;
    if (room.mutedMembers) {
      room.mutedMembers = room.mutedMembers.filter(m => m !== username);
      rooms.set(roomId, room);
      io.to(roomId).emit('memberUnmuted', { roomId, username });
    }
  });

  // 发布朋友圈
  socket.on('publishMoment', ({ content, images }) => {
    const moment = {
      id: uuidv4(),
      content,
      images: images || [],
      author: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      timestamp: new Date(),
      likes: [],
      comments: []
    };
    io.emit('newMoment', moment);
  });

  // 点赞朋友圈
  socket.on('likeMoment', ({ momentId }) => {
    io.emit('momentLiked', { momentId, userId: socket.userId });
  });

  // 评论朋友圈
  socket.on('commentMoment', ({ momentId, content }) => {
    const comment = {
      id: uuidv4(),
      content,
      author: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      timestamp: new Date()
    };
    io.emit('momentComment', { momentId, comment });
  });

  // 导出聊天记录
  socket.on('exportChat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const exportData = room.messages.map(m => ({
      sender: m.sender?.username || '系统',
      content: m.content || `[${m.type}]`,
      timestamp: m.timestamp,
      type: m.type
    }));
    socket.emit('chatExport', { roomId, roomName: room.name, messages: exportData });
  });

  // 获取统计
  socket.on('getStats', () => {
    let totalMessages = 0;
    let todayCount = 0;
    const today = new Date().toDateString();
    rooms.forEach(room => {
      totalMessages += room.messages.length;
      room.messages.forEach(m => {
        if (new Date(m.timestamp).toDateString() === today) todayCount++;
      });
    });
    socket.emit('statsResult', {
      totalMessages,
      todayMessages: todayCount,
      activeUsers: onlineUsers.size,
      totalRooms: rooms.size
    });
  });

  socket.on('typing', (roomId) => {
    socket.to(roomId).emit('userTyping', { username: socket.username });
  });

  socket.on('stopTyping', (roomId) => {
    socket.to(roomId).emit('userStopTyping', { username: socket.username });
  });

  socket.on('createGroup', ({ name, members }) => {
    const room = {
      id: uuidv4(),
      name,
      type: 'group',
      members: [...members, socket.username],
      messages: [],
      createdBy: socket.username,
      createdAt: new Date()
    };
    rooms.set(room.id, room);
    io.emit('roomCreated', room);
    socket.emit('groupCreated', room);
  });

  socket.on('addToGroup', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (room && room.createdBy === socket.username) {
      if (!room.members.includes(username)) {
        room.members.push(username);
        rooms.set(roomId, room);
        io.to(roomId).emit('memberAdded', { username, roomId });
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      userSockets.delete(socket.userId);
      io.emit('userOffline', { id: socket.userId });
    }
    console.log('User disconnected:', socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [uploadId, data] of chunksStore.entries()) {
    if (now - data.createdAt > 3600000) {
      const chunkPath = path.join(__dirname, 'uploads', 'chunks', uploadId);
      if (fs.existsSync(chunkPath)) {
        fs.rmSync(chunkPath, { recursive: true });
      }
      chunksStore.delete(uploadId);
    }
  }
}, 300000);

app.use(express.static(path.join(__dirname, '../client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down, saving data...');
  db.flushAll(collections);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down, saving data...');
  db.flushAll(collections);
  process.exit(0);
});
