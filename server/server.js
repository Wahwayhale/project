const express = require('express');
// 支持通过 ENV_FILE 指定配置文件（如 ENV_FILE=.env.app 或 ENV_FILE=.env.web）
const envFile = process.env.ENV_FILE || '.env';
require('dotenv').config({ path: require('path').join(__dirname, envFile) });
console.log(`[SERVER] Using config: ${envFile}, Port: ${process.env.PORT || 3001}`);
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

const JWT_SECRET = 'wechat-secret-key-2024';
const PORT = process.env.PORT || 3001;

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

const onlineUsers = new Map(); // userId -> { id, username, socketIds: Set }
const userSockets = new Map(); // userId -> socket (最新连接)
const userConnectionCount = new Map(); // userId -> count
const chunksStore = new Map();

// 更新用户余额并通知前端
function updateUserBalance(username, newBalance) {
  const user = users.get(username);
  if (!user) return;
  user.balance = newBalance;
  users.set(username, user);
  users.save();
  // WebSocket 通知该用户余额已变更
  const userSocket = userSockets.get(user.id);
  if (userSocket) {
    userSocket.emit('balanceUpdated', { balance: newBalance });
  }
}

// 检查用户是否为房间成员
function isRoomMember(room, username) {
  return room && room.members && room.members.includes(username);
}

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
  // 支持大小写不敏感的 Authorization header
  const token = req.headers['authorization'] || req.headers['Authorization'];
  if (!token) {
    console.log('No token in headers:', req.headers);
    return res.status(401).json({ error: 'No token provided' });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('Token verification failed:', err.message);
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
  // 检查是否已发送好友请求
  const targetRequests = friendRequests.get(user.id) || [];
  const requestSent = targetRequests.includes(req.user.username);
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    sixDigitId: user.sixDigitId,
    bio: user.bio,
    online: onlineUsers.has(user.id),
    isFriend,
    requestSent
  });
});

// 按用户名搜索
app.get('/api/users/searchByName/:username', verifyToken, (req, res) => {
  const { username } = req.params;
  const user = users.get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const userFriends = friends.get(req.user.id) || [];
  const isFriend = userFriends.includes(user.username);
  const targetRequests = friendRequests.get(user.id) || [];
  const requestSent = targetRequests.includes(req.user.username);
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    sixDigitId: user.sixDigitId,
    bio: user.bio,
    online: onlineUsers.has(user.id),
    isFriend,
    requestSent
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
    online: onlineUsers.has(user.id),
    balance: user.balance || 0
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
  recharges.save(); // 立即持久化充值状态，防止重启丢数据

  // 增加用户余额（立即持久化）
  const targetUser = Array.from(users.values()).find(u => u.id === recharge.userId);
  if (!targetUser) {
    console.error(`[RECHARGE ERROR] 目标用户不存在: userId=${recharge.userId}, username=${recharge.username}, rechargeId=${rechargeId}`);
    return res.status(404).json({ error: '目标用户不存在，可能已被删除' });
  }

  targetUser.balance = (targetUser.balance || 0) + recharge.amount;
  users.set(targetUser.username, targetUser);
  users.save(); // 立即写入磁盘，防止数据丢失

  // 通过 WebSocket 通知收款方余额已更新
  const targetSocket = userSockets.get(targetUser.id);
  if (targetSocket) {
    targetSocket.emit('balanceUpdated', { balance: targetUser.balance });
    targetSocket.emit('rechargeConfirmed', {
      rechargeId,
      amount: recharge.amount,
      newBalance: targetUser.balance
    });
  }

  console.log(`[RECHARGE] admin 确认充值: ${recharge.username} +¥${recharge.amount}, 新余额: ¥${targetUser.balance}`);
  res.json({ success: true, recharge, newBalance: targetUser.balance });
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
  recharges.save(); // 立即持久化

  // 通知用户充值被拒绝
  const targetUser = Array.from(users.values()).find(u => u.id === recharge.userId);
  if (targetUser) {
    const targetSocket = userSockets.get(targetUser.id);
    if (targetSocket) {
      targetSocket.emit('rechargeRejected', {
        rechargeId,
        amount: recharge.amount,
        reason: recharge.rejectReason
      });
    }
  }

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

let ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || '';
let KIMI_API_KEY = process.env.KIMI_API_KEY || '';
let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
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

let DEEPSEEK_R1_API_KEY = process.env.DEEPSEEK_R1_API_KEY || '';
const DEEPSEEK_MODEL_MAP = {
  'deepseek-v4-flash': 'deepseek-chat',
  'deepseek-v4-pro': 'deepseek-reasoner',
  'deepseek-r1': 'deepseek-v3-0324'
};

// 调用 DeepSeek AI
function callDeepSeekAI(messages, model, callback) {
  const isR1 = model === 'deepseek-r1';
  // R1 使用腾讯 MAS 代理 + 独立 Key，其他模型使用 DeepSeek 直连
  const apiKey = isR1 && DEEPSEEK_R1_API_KEY ? DEEPSEEK_R1_API_KEY : DEEPSEEK_API_KEY;
  if (!apiKey) {
    return callback(new Error('DEEPSEEK_API_KEY 未配置'));
  }
  const apiModel = DEEPSEEK_MODEL_MAP[model] || 'deepseek-chat';
  const body = JSON.stringify({
    model: apiModel,
    messages,
    stream: false,
    max_tokens: 4096,
    temperature: 0.7
  });
  const options = {
    hostname: isR1 ? 'tokenhub.tencentmaas.com' : 'api.deepseek.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
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
        const msg = (typeof json.error === 'string' ? json.error : json.error?.message) || 'AI 返回错误';
        const code = (typeof json.error === 'object' ? json.error?.code : json.code) || '';
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
        updateUserBalance(user.username, (user.balance || 0) - AI_CALL_PRICE);
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
        // DeepSeek error 可能是字符串或 { message, code } 对象
        const msg = (typeof json.error === 'string' ? json.error : json.error?.message) || 'AI 返回错误';
        const code = (typeof json.error === 'object' ? json.error?.code : json.code) || '';
        return callPollinations(history, (err2, result) => {
          if (err2) {
            return res.status(500).json({ error: msg, code, hint: 'DeepSeek API 和备用免费通道均调用失败，请检查 API Key 或稍后重试' });
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
        updateUserBalance(user.username, (user.balance || 0) - AI_CALL_PRICE);
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
      const msg = (typeof json.error === 'string' ? json.error : json.error?.message) || 'AI 返回错误';
      const code = (typeof json.error === 'object' ? json.error?.code : json.code) || '';
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
      updateUserBalance(user.username, (user.balance || 0) - AI_CALL_PRICE);
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
      { id: 'deepseek-r1', name: 'DeepSeek R1（独立Key）', free: false, desc: 'DeepSeek 最新推理模型' },
      { id: 'glm-4-plus', name: '智谱 GLM-4-Plus', free: false, desc: '更强推理' }
    ]
  });
});

// 热重载 .env 配置（无需重启服务器）
app.post('/api/admin/reload-config', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envConfig = require('dotenv').parse(envContent);
    // 更新全局 API Key 变量
    if (envConfig.ZHIPU_API_KEY !== undefined) process.env.ZHIPU_API_KEY = envConfig.ZHIPU_API_KEY;
    if (envConfig.KIMI_API_KEY !== undefined) process.env.KIMI_API_KEY = envConfig.KIMI_API_KEY;
    if (envConfig.DEEPSEEK_API_KEY !== undefined) process.env.DEEPSEEK_API_KEY = envConfig.DEEPSEEK_API_KEY;
    if (envConfig.DEEPSEEK_R1_API_KEY !== undefined) process.env.DEEPSEEK_R1_API_KEY = envConfig.DEEPSEEK_R1_API_KEY;
    // 同时更新模块级变量
    ZHIPU_API_KEY = envConfig.ZHIPU_API_KEY || '';
    KIMI_API_KEY = envConfig.KIMI_API_KEY || '';
    DEEPSEEK_API_KEY = envConfig.DEEPSEEK_API_KEY || '';
    DEEPSEEK_R1_API_KEY = envConfig.DEEPSEEK_R1_API_KEY || '';
    console.log('[CONFIG] .env 热重载成功');
    res.json({ success: true, message: '配置已重新加载，新增/修改的 Key 已生效' });
  } catch (e) {
    res.status(500).json({ error: '重载失败: ' + e.message });
  }
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
  let imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Invalid url' });
  }
  // 协议相对 URL → 补全 https:
  if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
  if (!imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid url' });
  }
  https.get(imageUrl, {
    headers: {
      'Referer': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, (response) => {
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 浏览器缓存24小时
    response.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

app.get('/api/rooms', verifyToken, (req, res) => {
  const roomList = Array.from(rooms.values())
    .filter(room => room.type === 'public' || isRoomMember(room, req.user.username))
    .map(room => ({
      id: room.id,
      name: room.name,
      type: room.type,
      memberCount: room.members ? room.members.length : 0,
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
  // 私有房间只允许成员访问
  if (room.type !== 'public' && !isRoomMember(room, req.user.username)) {
    return res.status(403).json({ error: '无权访问该房间' });
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

// ========== 手机号绑定（验证码流程） ==========

// 手机号格式校验（中国手机号）
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

// 脱敏手机号
function maskPhone(phone) {
  if (!phone) return null;
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

// 验证码存储: Map<phone, { code, expiresAt, userId }>
const verificationCodes = new Map();

// 生成 6 位随机码
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 清理过期验证码（定时）
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(phone);
    }
  }
}, 60000);

// 发送验证码
app.post('/api/user/send-code', verifyToken, (req, res) => {
  const { phone } = req.body;
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  // 检查手机号是否已被其他用户绑定
  const existingUser = Array.from(users.values()).find(u => u.phone === phone && u.id !== user.id);
  if (existingUser) {
    return res.status(400).json({ error: '该手机号已被绑定' });
  }
  // 检查频率限制（60 秒内只能发一次）
  const existing = verificationCodes.get(phone);
  if (existing && Date.now() < existing.expiresAt - 4 * 60 * 1000) {
    return res.status(429).json({ error: '请 60 秒后再试' });
  }
  
  const code = generateCode();
  verificationCodes.set(phone, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 分钟有效
    userId: user.id
  });
  
  // 尝试发送短信（可配置，失败不影响流程）
  sendSms(phone, code).catch(err => console.error('短信发送失败(不影响验证):', err.message));
  
  // 始终返回成功，前端只需提示用户查看手机
  res.json({ success: true, message: '验证码已发送' });
});

// 可配置的短信发送函数（从 .env 读取配置）
async function sendSms(phone, code) {
  const smsApiUrl = process.env.SMS_API_URL;
  const smsApiKey = process.env.SMS_API_KEY;
  const smsTemplate = process.env.SMS_TEMPLATE || '您的验证码是: {code}，5分钟内有效。';
  
  if (!smsApiUrl || !smsApiKey) {
    // 未配置短信服务 → 打印到控制台 + 写入文件，供用户手动发送
    const content = smsTemplate.replace(/\{code\}/g, code).replace(/\{phone\}/g, phone);
    const logLine = `\n[${new Date().toLocaleString()}] 📱 收件人: ${phone}  验证码: ${code}  内容: ${content}`;
    console.log(logLine);
    // 同时写入 codes.log 文件，方便直接打开查看
    try {
      fs.appendFileSync(path.join(__dirname, 'codes.log'), logLine);
    } catch (e) { /* ignore */ }
    console.log('========================================\n');
    return;
  }
  
  // 已配置短信服务 → 调用 API
  const axios = require('axios');
  const content = smsTemplate.replace(/\{code\}/g, code).replace(/\{phone\}/g, phone);
  await axios.post(smsApiUrl, {
    phone,
    content,
    code
  }, {
    headers: { 'Authorization': `Bearer ${smsApiKey}` }
  });
}

// 校验验证码并绑定手机号
app.post('/api/user/verify-and-bind', verifyToken, (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '请输入 6 位验证码' });
  }
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const stored = verificationCodes.get(phone);
  if (!stored) {
    return res.status(400).json({ error: '请先获取验证码' });
  }
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(phone);
    return res.status(400).json({ error: '验证码已过期，请重新获取' });
  }
  if (stored.code !== code) {
    return res.status(400).json({ error: '验证码错误' });
  }
  if (stored.userId !== user.id) {
    return res.status(400).json({ error: '验证码与用户不匹配' });
  }
  
  // 校验通过，绑定手机号
  verificationCodes.delete(phone);
  user.phone = phone;
  user.phoneBoundAt = new Date().toISOString();
  users.set(user.username, user);
  res.json({ phone: maskPhone(phone), phoneBoundAt: user.phoneBoundAt });
});

// 解绑手机号
app.post('/api/user/unbind-phone', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (!user.phone) {
    return res.status(400).json({ error: '未绑定手机号' });
  }
  user.phone = undefined;
  user.phoneBoundAt = undefined;
  users.set(user.username, user);
  res.json({ success: true });
});

// 获取绑定的手机号（脱敏）
app.get('/api/user/phone', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ 
    phone: maskPhone(user.phone),
    phoneBound: !!user.phone,
    phoneBoundAt: user.phoneBoundAt || null
  });
});

// ========== 密码找回 ==========
app.post('/api/user/send-reset-code', (req, res) => {
  const { phone } = req.body;
  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  const user = Array.from(users.values()).find(u => u.phone === phone);
  if (!user) {
    return res.status(404).json({ error: '该手机号未绑定任何账号' });
  }
  const existing = verificationCodes.get(phone);
  if (existing && Date.now() < existing.expiresAt - 4 * 60 * 1000) {
    return res.status(429).json({ error: '请 60 秒后再试' });
  }
  const code = generateCode();
  verificationCodes.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000, userId: user.id });
  sendSms(phone, code).catch(err => console.error('短信发送失败:', err.message));
  res.json({ success: true, message: '验证码已发送' });
});

app.post('/api/user/reset-password', async (req, res) => {
  const { phone, code, newPassword } = req.body;
  if (!phone || !code || !newPassword) {
    return res.status(400).json({ error: '缺少参数' });
  }
  if (newPassword.length < 3) {
    return res.status(400).json({ error: '密码至少3位' });
  }
  const user = Array.from(users.values()).find(u => u.phone === phone);
  if (!user) {
    return res.status(404).json({ error: '该手机号未绑定任何账号' });
  }
  const stored = verificationCodes.get(phone);
  if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
    return res.status(400).json({ error: '验证码错误或已过期' });
  }
  user.password = await bcrypt.hash(newPassword, 10);
  users.set(user.username, user);
  verificationCodes.delete(phone);
  res.json({ success: true, message: '密码已重置，请使用新密码登录' });
});

// ========== AI 聊天摘要 ==========
app.post('/api/ai/summarize', verifyToken, (req, res) => {
  const { roomId, messageCount } = req.body;
  if (!roomId) return res.status(400).json({ error: '缺少房间ID' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: '聊天室不存在' });
  const count = Math.min(messageCount || 30, 100);
  const recentMessages = room.messages.slice(-count);
  const chatText = recentMessages
    .filter(m => m.type === 'text' && !m.recalled)
    .map(m => `${m.sender?.username || '匿名'}: ${m.content}`)
    .join('\n');
  if (!chatText || chatText.trim().length < 10) return res.status(400).json({ error: '消息太少，无法生成摘要。请先发送一些消息再试。' });
  const messages = [
    { role: 'system', content: '你是一个聊天记录总结助手。请用简洁的中文总结以下聊天记录，包含：1)主要话题 2)关键决定/结论 3)参与人员。用要点形式列出，不超过300字。' },
    { role: 'user', content: `总结以下聊天记录：\n${chatText}` }
  ];
  // Try ZHIPU first, fallback to Pollinations
  if (ZHIPU_API_KEY) {
    return callAI(messages, 'glm-4-flash', (err, json) => {
      if (!err && json?.choices?.[0]?.message?.content) {
        return res.json({ summary: json.choices[0].message.content, model: 'glm-4-flash' });
      }
      callPollinations(messages, (err2, result) => {
        if (err2) return res.status(500).json({ error: 'AI摘要失败' });
        res.json({ summary: result.reply, model: 'pollinations' });
      });
    });
  }
  callPollinations(messages, (err, result) => {
    if (err) return res.status(500).json({ error: 'AI摘要失败' });
    res.json({ summary: result.reply, model: 'pollinations' });
  });
});

// ========== 头像上传 ==========
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

// ========== AI 图片生成 ==========
app.post('/api/ai/generate-image', verifyToken, (req, res) => {
  const { prompt, style } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: '请输入图片描述词' });
  }
  const fullPrompt = `${prompt} ${style || ''}`.trim();

  // Lorem Flickr: 免费、无需 key、支持搜索词
  const imageUrl = `https://loremflickr.com/512/512/${encodeURIComponent(prompt)}?random=${Date.now()}`;
  res.json({
    imageUrl,
    prompt: fullPrompt,
    provider: 'loremflickr'
  });
});

// ========== AI 翻译 ==========
app.post('/api/ai/translate', verifyToken, (req, res) => {
  const { text, targetLang } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '请输入要翻译的文字' });
  }
  const lang = targetLang || 'zh';
  const langNames = { zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西班牙文', ru: '俄文', ar: '阿拉伯文', pt: '葡萄牙文' };
  const langName = langNames[lang] || lang;
  const messages = [
    { role: 'system', content: `你是一个翻译助手。将用户输入的文字翻译成${langName}。只输出翻译结果，不要加任何解释。` },
    { role: 'user', content: text }
  ];
  const doTranslate = () => {
    if (ZHIPU_API_KEY) {
      return callAI(messages, 'glm-4-flash', (err, json) => {
        if (!err && json?.choices?.[0]?.message?.content) {
          return res.json({ translation: json.choices[0].message.content, source: text, targetLang: lang });
        }
        callPollinations(messages, (err2, result) => {
          if (err2) return res.status(500).json({ error: '翻译失败' });
          res.json({ translation: result.reply, source: text, targetLang: lang });
        });
      });
    }
    callPollinations(messages, (err, result) => {
      if (err) return res.status(500).json({ error: '翻译失败' });
      res.json({ translation: result.reply, source: text, targetLang: lang });
    });
  };
  doTranslate();
});

// ========== 网易云音乐 API ==========
const { cloudsearch, song_url, lyric: getLyric } = require('NeteaseCloudMusicApi');

// 搜索歌曲
app.get('/api/music/search', verifyToken, async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: '请输入搜索关键词' });
  try {
    const result = await cloudsearch({ keywords: keyword, limit: 20, type: 1 });
    if (result.status !== 200 || !result.body?.result?.songs) {
      return res.json({ songs: [] });
    }
    const songs = result.body.result.songs.map(s => ({
      id: s.id.toString(),
      name: s.name,
      artist: (s.ar || s.artists || []).map(a => a.name).join('/'),
      album: (s.al || s.album || {}).name || '',
      pic: (s.al || s.album || {}).picUrl || ''
    }));
    res.json({ songs });
  } catch (err) {
    console.error('Music search error:', err.message);
    res.json({ songs: [] });
  }
});

// 获取歌曲播放 URL
app.get('/api/music/url/:songId', verifyToken, async (req, res) => {
  const { songId } = req.params;
  try {
    const result = await song_url({ id: songId, br: 128000 });
    if (result.status !== 200 || !result.body?.data?.[0]?.url) {
      return res.status(500).json({ error: '暂无播放地址' });
    }
    res.json({ url: result.body.data[0].url });
  } catch (err) {
    res.status(500).json({ error: '获取播放地址失败' });
  }
});

// 获取歌词
app.get('/api/music/lyric/:songId', verifyToken, async (req, res) => {
  const { songId } = req.params;
  try {
    const result = await getLyric({ id: songId });
    if (result.status !== 200) {
      return res.status(500).json({ error: '获取歌词失败' });
    }
    const lrc = (result.body?.lrc?.lyric || result.body?.lyric || '').replace(/\[/g, '[');
    res.json({ lyric: lrc });
  } catch (err) {
    res.status(500).json({ error: '获取歌词失败' });
  }
});

// ========== AI 统一调用辅助（优先 Pollinations 免费通道） ==========
function callAIFree(messages, callback) {
  // 优先使用智谱免费模型
  if (ZHIPU_API_KEY) {
    return callAI(messages, 'glm-4-flash', (err, json) => {
      if (!err && json?.choices?.[0]?.message?.content) {
        return callback(null, json.choices[0].message.content);
      }
      // 降级到 Pollinations
      callPollinations(messages, (err2, result) => {
        if (err2) return callback(new Error('所有 AI 通道均失败'));
        callback(null, result.reply);
      });
    });
  }
  // 无 API key，直接用 Pollinations
  callPollinations(messages, (err, result) => {
    if (err) return callback(new Error('AI 调用失败: ' + err.message));
    callback(null, result.reply);
  });
}

// ========== AI 智能快捷回复 ==========
app.post('/api/ai/smart-reply', verifyToken, (req, res) => {
  const { roomId, context } = req.body || {};
  if (!context || typeof context !== 'string') {
    return res.status(400).json({ error: '缺少对话上下文' });
  }

  const messages = [
    { role: 'system', content: '你是一个聊天助手。根据最近聊天内容，生成3条简短自然的快捷回复（每条约5-15字），用中文回复。只输出3条回复，每行一条，不要编号，不要引号，不要解释。' },
    { role: 'user', content: `最近聊天：\n${context}\n\n请给出3条快捷回复：` }
  ];

  callAIFree(messages, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    // 解析回复为数组
    const replies = reply.split('\n').filter(r => r.trim()).slice(0, 3);
    res.json({ replies: replies.length > 0 ? replies : ['好的', '收到', '没问题'] });
  });
});

// ========== AI 消息翻译（增强版，支持更多语言） ==========
app.post('/api/ai/translate-message', verifyToken, (req, res) => {
  const { text, targetLang } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '请输入要翻译的文字' });
  }

  const langNames = { zh: '中文', en: '英文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西班牙文', ru: '俄文', ar: '阿拉伯文', pt: '葡萄牙文', th: '泰文', vi: '越南文', it: '意大利文' };
  const langName = langNames[targetLang] || '中文';

  const messages = [
    { role: 'system', content: `你是翻译助手。将用户输入直接翻译成${langName}。只输出翻译结果，不加任何解释、引号或额外文字。` },
    { role: 'user', content: text }
  ];

  callAIFree(messages, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ translation: reply.trim(), original: text, targetLang: targetLang || 'zh' });
  });
});

// ========== AI 消息润色 ==========
app.post('/api/ai/polish-message', verifyToken, (req, res) => {
  const { text, tone } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '请输入要润色的文字' });
  }

  const toneMap = {
    formal: '正式、礼貌',
    casual: '轻松、口语化',
    funny: '幽默、有趣',
    concise: '简洁、精炼'
  };
  const toneDesc = toneMap[tone] || '流畅自然';

  const messages = [
    { role: 'system', content: `你是文字润色助手。将用户输入改写为${toneDesc}的风格。保持原意不变。只输出改写后的文本，不要加任何解释、引号或额外文字。` },
    { role: 'user', content: text }
  ];

  callAIFree(messages, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ polished: reply.trim(), original: text, tone: tone || 'natural' });
  });
});

// ========== AI 聊天标题生成 ==========
app.post('/api/ai/generate-title', verifyToken, (req, res) => {
  const { messages } = req.body || {};
  if (!messages || typeof messages !== 'string') {
    return res.status(400).json({ error: '缺少聊天内容' });
  }

  const prompt = [
    { role: 'system', content: '你是聊天标题生成助手。根据聊天内容生成一个简短的标题（5-15字）。只输出标题，不要加引号或解释。' },
    { role: 'user', content: `聊天内容：\n${messages}\n\n请为这段对话生成一个标题：` }
  ];

  callAIFree(prompt, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ title: reply.trim().slice(0, 30) });
  });
});

// ========== AI 每日摘要 ==========
app.post('/api/ai/daily-digest', verifyToken, (req, res) => {
  const username = req.user.username;
  const today = new Date().toDateString();

  // 收集用户所在所有房间的今日消息
  let allTodayMessages = [];
  rooms.forEach(room => {
    if (!isRoomMember(room, username)) return;
    room.messages.forEach(msg => {
      if (msg.recalled || msg.isBot) return;
      if (new Date(msg.timestamp).toDateString() === today) {
        allTodayMessages.push({
          room: room.name,
          sender: msg.sender?.username || '匿名',
          content: msg.content || `[${msg.type}]`,
          time: new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        });
      }
    });
  });

  if (allTodayMessages.length === 0) {
    return res.json({ digest: '今天还没有新消息，去和朋友打个招呼吧！', highlightMessages: [], stats: { totalMessages: 0, activeRooms: 0 } });
  }

  // 统计
  const roomSet = new Set(allTodayMessages.map(m => m.room));
  const stats = { totalMessages: allTodayMessages.length, activeRooms: roomSet.size };

  // 构建摘要上下文
  const chatText = allTodayMessages.slice(-50).map(m => `[${m.room}] ${m.sender}: ${m.content}`).join('\n');
  const messages = [
    { role: 'system', content: '你是聊天摘要助手。请用3-6句话总结以下今日聊天记录，包含主要话题和有趣的内容。语气轻松友善。只输出摘要，不超过200字。' },
    { role: 'user', content: `今日聊天记录：\n${chatText}\n\n请总结：` }
  ];

  callAIFree(messages, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    // 取最近3条作为高亮
    const highlights = allTodayMessages.slice(-3).reverse();
    res.json({
      digest: reply.trim(),
      highlightMessages: highlights,
      stats
    });
  });
});

// ========== Phase 1 新功能 ==========

// 1.1 GIF 搜索 (GIPHY API)
app.get('/api/giphy/search', verifyToken, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ gifs: [] });
  const GIPHY_KEY = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // 公共测试 Key
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g&lang=zh`;
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const gifs = (json.data || []).map(g => ({
          id: g.id,
          url: g.images?.fixed_height?.url || g.images?.original?.url || '',
          preview: g.images?.fixed_height_small?.url || '',
          title: g.title || ''
        }));
        res.json({ gifs });
      } catch { res.json({ gifs: [] }); }
    });
  }).on('error', () => res.json({ gifs: [] }));
});

// 1.2 天气查询
app.get('/api/weather/:city', verifyToken, (req, res) => {
  const { city } = req.params;
  // 使用 wttr.in 免费天气 API，无需 Key
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
  const weatherReq = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const now = json.current_condition?.[0] || {};
        const today = json.weather?.[0] || {};
        res.json({
          city: json.nearest_area?.[0]?.areaName?.[0]?.value || city,
          temp: now.temp_C,
          desc: now.lang_zh?.[0]?.value || now.weatherDesc?.[0]?.value || '',
          humidity: now.humidity,
          wind: (now.winddir16Point || '') + ' ' + (now.windspeedKmph || '') + 'km/h',
          feelsLike: now.FeelsLikeC,
          high: today.maxtempC, low: today.mintempC,
          icon: now.weatherCode || ''
        });
      } catch { res.status(500).json({ error: '天气数据解析失败，请简化搜索词（如"北京"代替"北京市朝阳区"）' }); }
    });
  });
  weatherReq.on('timeout', () => { weatherReq.destroy(); res.status(500).json({ error: '天气查询超时，请检查网络连接' }); });
  weatherReq.on('error', () => res.status(500).json({ error: '天气服务不可用，请稍后重试' }));
});

// 1.3 新闻热搜 (知乎日报)
app.get('/api/news/hot', verifyToken, (req, res) => {
  https.get('https://news-at.zhihu.com/api/4/news/latest', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const stories = (json.stories || []).slice(0, 15).map(s => ({
          id: s.id,
          title: s.title,
          image: s.images?.[0] || '',
          url: s.url || `https://daily.zhihu.com/story/${s.id}`
        }));
        res.json({ stories });
      } catch { res.json({ stories: [] }); }
    });
  }).on('error', () => res.json({ stories: [] }));
});

// 1.4 二维码生成
const QRCode = require('qrcode');
app.get('/api/qrcode', verifyToken, (req, res) => {
  const { text } = req.query;
  if (!text) return res.status(400).json({ error: '请提供 text 参数' });
  QRCode.toBuffer(text.substring(0, 500), { width: 300, margin: 2, type: 'png' }, (err, buffer) => {
    if (err) return res.status(500).json({ error: '二维码生成失败' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });
});

// 1.6 一言随机语录
app.get('/api/quote/random', verifyToken, (req, res) => {
  https.get('https://v1.hitokoto.cn/?c=a&c=b&c=c&c=d&c=e&c=f&c=g&c=h&c=i&c=j&c=k&c=l', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json({
          quote: json.hitokoto,
          from: json.from || '',
          author: json.from_who || ''
        });
      } catch { res.json({ quote: '生活不止眼前的苟且，还有诗和远方。', from: '', author: '' }); }
    });
  }).on('error', () => res.json({ quote: '今天也是充满希望的一天！', from: '', author: '' }));
});

// 1.10 链接预览 (Open Graph)
app.get('/api/link-preview', verifyToken, (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '请提供 url 参数' });
  const targetUrl = url.startsWith('http') ? url : 'https://' + url;
  https.get(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkPreview/1.0)' },
    timeout: 5000
  }, (response) => {
    let html = '';
    response.on('data', chunk => { html += chunk; if (html.length > 50000) response.destroy(); });
    response.on('end', () => {
      const getMeta = (name) => {
        const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
        const match = html.match(regex);
        return match ? match[1] : '';
      };
      const title = getMeta('og:title') || (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
      const desc = getMeta('og:description') || getMeta('description') || '';
      const image = getMeta('og:image') || '';
      res.json({ title: title.substring(0, 200), description: desc.substring(0, 300), image });
    });
  }).on('error', () => res.status(500).json({ error: '抓取失败' }));
});

// 2.2 地图 POI 搜索 + 静态地图 (OpenStreetMap/Nominatim, 免费免 Key)
app.get('/api/map/poi', verifyToken, (req, res) => {
  const { keyword, lat, lng } = req.query;
  if (!keyword) return res.status(400).json({ error: '请提供搜索关键词' });
  const q = lat && lng
    ? `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=10&accept-language=zh&lat=${lat}&lon=${lng}&bounded=1`
    : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=10&accept-language=zh`;
  const mapReq = https.get(q, {
    headers: { 'User-Agent': 'WeChatApp/1.0', 'Accept-Language': 'zh' },
    timeout: 8000
  }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const pois = JSON.parse(data).map(p => ({
          name: p.display_name?.split(',')[0] || p.name || '',
          fullName: p.display_name || '',
          lat: parseFloat(p.lat), lng: parseFloat(p.lon),
          type: p.type || '', category: p.category || ''
        }));
        res.json({ pois });
      } catch { res.json({ pois: [] }); }
    });
  });
  mapReq.on('timeout', () => { mapReq.destroy(); res.status(500).json({ error: '地图搜索超时，请检查网络连接' }); });
  mapReq.on('error', () => res.json({ pois: [] }));
});

// 静态地图图片 (OpenStreetMap 瓦片拼图)
app.get('/api/map/static', verifyToken, (req, res) => {
  const { lat, lng, zoom } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: '缺少坐标' });
  const z = zoom || 15;
  // 使用免费 tile 服务生成静态地图 HTML
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0}html,body{width:100%;height:100%}#map{width:100%;height:100%}.marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:32px;z-index:1000;pointer-events:none}</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script></head><body>
<div id="map"></div><div class="marker">📍</div>
<script>var m=L.map('map').setView([${lat},${lng}],${z});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy;OSM'}).addTo(m);</script></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ========== Phase 2-3 新功能 ==========

// 2.1 AI 图片识别 (GLM-4V)
app.post('/api/ai/describe-image', verifyToken, (req, res) => {
  const { imageUrl } = req.body || {};
  if (!imageUrl) return res.status(400).json({ error: '请提供图片 URL' });

  const messages = [
    { role: 'user', content: [
      { type: 'text', text: '请用中文简要描述这张图片的内容，50字以内。' },
      { type: 'image_url', image_url: { url: imageUrl } }
    ]}
  ];

  if (!ZHIPU_API_KEY) return res.status(500).json({ error: 'ZHIPU_API_KEY 未配置' });

  const body = JSON.stringify({ model: 'glm-4v-flash', messages, max_tokens: 200, stream: false });
  const options = {
    hostname: ZHIPU_BASE, port: 443, path: '/api/paas/v4/chat/completions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ZHIPU_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
    timeout: 30000
  };
  const req2 = https.request(options, (response) => {
    let data = ''; response.on('data', c => data += c);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const desc = json.choices?.[0]?.message?.content || '无法识别';
        res.json({ description: desc });
      } catch { res.status(500).json({ error: '识别失败' }); }
    });
  });
  req2.on('error', e => res.status(500).json({ error: e.message }));
  req2.on('timeout', () => { req2.destroy(); res.status(500).json({ error: '请求超时' }); });
  req2.write(body); req2.end();
});

// 2.3 群日程/提醒
const groupEvents = new Map(); // eventId -> { id, roomId, title, time, creator, participants, reminded }
app.post('/api/events/create', verifyToken, (req, res) => {
  const { roomId, title, time } = req.body || {};
  if (!roomId || !title || !time) return res.status(400).json({ error: '缺少参数' });
  const room = rooms.get(roomId);
  if (!room || !isRoomMember(room, req.user.username)) return res.status(403).json({ error: '无权操作' });
  const event = { id: uuidv4(), roomId, title, time, creator: req.user.username, participants: [req.user.username], reminded: false, createdAt: new Date().toISOString() };
  groupEvents.set(event.id, event);
  // 发系统消息
  const msg = { id: uuidv4(), type: 'event', content: title, sender: { id: 'system', username: '系统', avatar: null }, roomId, timestamp: new Date(), readBy: [], eventTime: time, eventId: event.id };
  room.messages.push(msg); rooms.set(roomId, room); rooms.save();
  io.to(roomId).emit('newMessage', msg);
  res.json({ success: true, event });
});
app.get('/api/events/:roomId', verifyToken, (req, res) => {
  const events = Array.from(groupEvents.values()).filter(e => e.roomId === req.params.roomId);
  res.json({ events });
});
// 定时检查提醒（每分钟）
setInterval(() => {
  const now = Date.now();
  groupEvents.forEach(event => {
    if (event.reminded) return;
    const eventTime = new Date(event.time).getTime();
    if (now >= eventTime - 5 * 60 * 1000 && now < eventTime) {
      const room = rooms.get(event.roomId);
      if (room) {
        const msg = { id: uuidv4(), type: 'text', content: `🔔 提醒：${event.title} 将在 5 分钟后开始！`, sender: { id: 'system', username: '系统', avatar: null }, roomId: event.roomId, timestamp: new Date(), readBy: [], isBot: true };
        room.messages.push(msg); rooms.set(event.roomId, room); rooms.save();
        io.to(event.roomId).emit('newMessage', msg);
      }
      event.reminded = true;
      groupEvents.set(event.id, event);
    }
  });
}, 60000);

// 3.1 增强消息搜索
app.get('/api/rooms/:roomId/search', verifyToken, (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.type !== 'public' && !isRoomMember(room, req.user.username)) return res.status(403).json({ error: '无权访问' });
  const { q, type, limit: lim } = req.query;
  let results = room.messages.filter(m => {
    if (m.recalled) return false;
    if (type && m.type !== type) return false;
    if (q) {
      const searchText = (m.content || '') + (m.filename || '');
      return searchText.toLowerCase().includes(q.toLowerCase());
    }
    return true;
  });
  results = results.slice(-parseInt(lim || 50));
  res.json({ messages: results, total: results.length });
});

// ========== 年度统计 ==========
app.get('/api/stats/yearly', verifyToken, (req, res) => {
  const userId = req.user.id;
  const username = req.user.username;
  let totalSent = 0, totalReceived = 0;
  const byType = {}, byHour = {}, byFriend = {}, byDay = {};
  rooms.forEach(room => {
    // 只统计用户参与的聊天室
    if (!room.members || !room.members.includes(username)) return;
    room.messages.forEach(m => {
      if (m.recalled || m.isBot) return;
      const d = new Date(m.timestamp);
      const hour = d.getHours();
      const day = d.toDateString();
      byHour[hour] = (byHour[hour] || 0) + 1;
      byDay[day] = (byDay[day] || 0) + 1;
      if (m.sender?.id === userId) {
        totalSent++;
        byType[m.type || 'text'] = (byType[m.type || 'text'] || 0) + 1;
      } else if (m.sender?.username) {
        totalReceived++;
        byFriend[m.sender.username] = (byFriend[m.sender.username] || 0) + 1;
      }
    });
  });
  const topFriend = Object.entries(byFriend).sort((a,b) => b[1] - a[1])[0];
  const topHour = Object.entries(byHour).sort((a,b) => b[1] - a[1])[0];
  const mostType = Object.entries(byType).sort((a,b) => b[1] - a[1])[0];
  const activeDays = Object.keys(byDay).length;
  res.json({
    totalSent, totalReceived, total: totalSent + totalReceived,
    topFriend: topFriend ? { name: topFriend[0], count: topFriend[1] } : { name: '暂无', count: 0 },
    activeHour: topHour ? parseInt(topHour[0]) : 9,
    activeDays: activeDays || 1,
    favoriteType: mostType ? mostType[0] : 'text',
    byType, byHour, byFriend
  });
});

// ========== Bot 系统 ==========
const bots = new Map(); // botId -> { id, name, ownerId, ownerName, prompt, commands, enabled, createdAt }
const botTimers = new Map(); // botId -> interval timer

// 获取用户的机器人
app.get('/api/bots', verifyToken, (req, res) => {
  const userBots = Array.from(bots.values()).filter(b => b.ownerId === req.user.id);
  res.json(userBots);
});

// 创建机器人
app.post('/api/bots', verifyToken, (req, res) => {
  const { name, prompt, autoReply, schedule } = req.body || {};
  if (!name) return res.status(400).json({ error: '机器人名称不能为空' });
  const bot = {
    id: uuidv4(),
    name,
    prompt: prompt || '你是一个友好的聊天助手',
    autoReply: autoReply || false,
    schedule: schedule || null, // { cron: '0 9 * * *', message: '早上好！' }
    enabled: true,
    ownerId: req.user.id,
    ownerName: req.user.username,
    createdAt: new Date()
  };
  bots.set(bot.id, bot);
  // 自动加入全局聊天室
  const globalRoom = rooms.get('global');
  if (globalRoom && !globalRoom.members.includes(bot.name)) {
    globalRoom.members.push(bot.name);
    rooms.set('global', globalRoom);
  }
  // Start scheduled messages if configured
  if (bot.schedule) startBotSchedule(bot);
  res.json(bot);
});

// 删除机器人
app.delete('/api/bots/:botId', verifyToken, (req, res) => {
  const bot = bots.get(req.params.botId);
  if (!bot || bot.ownerId !== req.user.id) return res.status(404).json({ error: '机器人不存在' });
  stopBotSchedule(bot.id);
  bots.delete(bot.id);
  res.json({ success: true });
});

// 机器人自动回复（被socket事件触发）
function triggerBotReply(bot, roomId, triggerMessage) {
  if (!bot.enabled) return;
  const messages = [
    { role: 'system', content: bot.prompt },
    { role: 'user', content: triggerMessage }
  ];
  const reply = (text) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = {
      id: uuidv4(), type: 'text', content: text,
      sender: { id: bot.id, username: bot.name, avatar: null },
      roomId, timestamp: new Date(), readBy: [], isBot: true
    };
    room.messages.push(msg);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', msg);
  };
  if (ZHIPU_API_KEY) {
    callAI(messages, 'glm-4-flash', (err, json) => {
      if (!err && json?.choices?.[0]?.message?.content) {
        reply(`🤖 ${json.choices[0].message.content}`);
      } else {
        reply(`🤖 你好！我是 ${bot.name}，主人暂时不在，我来陪你聊天~`);
      }
    });
  } else {
    callPollinations(messages, (err, result) => {
      if (!err) reply(`🤖 ${result.reply}`);
      else reply(`🤖 你好！我是 ${bot.name}~`);
    });
  }
}

function startBotSchedule(bot) {
  if (!bot.schedule) return;
  // Simple interval-based scheduling (每分钟检查)
  const timer = setInterval(() => {
    const now = new Date();
    const [min, hour] = (bot.schedule.cron || '').split(' ').slice(0, 2);
    if (parseInt(min) === now.getMinutes() && parseInt(hour) === now.getHours()) {
      const globalRoom = rooms.get('global');
      if (globalRoom) {
        const msg = {
          id: uuidv4(), type: 'text', content: `🤖 ${bot.schedule.message || '定时消息'}`,
          sender: { id: bot.id, username: bot.name, avatar: null },
          roomId: 'global', timestamp: new Date(), readBy: [], isBot: true
        };
        globalRoom.messages.push(msg);
        rooms.set('global', globalRoom);
        io.to('global').emit('newMessage', msg);
      }
    }
  }, 60000);
  botTimers.set(bot.id, timer);
}

function stopBotSchedule(botId) {
  const timer = botTimers.get(botId);
  if (timer) { clearInterval(timer); botTimers.delete(botId); }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      // 追踪连接数，支持多端在线
      const prevCount = userConnectionCount.get(decoded.id) || 0;
      userConnectionCount.set(decoded.id, prevCount + 1);
      onlineUsers.set(decoded.id, { id: decoded.id, username: decoded.username });
      userSockets.set(decoded.id, socket);
      socket.emit('authenticated', { user: { id: decoded.id, username: decoded.username } });
      // 仅首次连接时广播上线事件
      if (prevCount === 0) {
        io.emit('userOnline', { id: decoded.id, username: decoded.username });
      }
      // 向新连接的客户端发送当前所有在线用户
      const onlineList = Array.from(onlineUsers.values()).map(u => ({ id: u.id, username: u.username }));
      socket.emit('onlineUsersList', onlineList);
      
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
    if (!room) {
      socket.emit('roomError', { error: '房间不存在' });
      return;
    }
    // 私有房间只允许成员加入
    if (room.type !== 'public' && !isRoomMember(room, socket.username)) {
      socket.emit('roomError', { error: '你不是该房间的成员' });
      return;
    }
    socket.join(roomId);
    socket.currentRoom = roomId;
    // Auto mark all as read when joining room
    let hasUnread = false;
    room.messages.forEach(msg => {
      if (!msg.readBy) msg.readBy = [];
      if (!msg.readBy.includes(socket.userId)) {
        msg.readBy.push(socket.userId);
        hasUnread = true;
      }
    });
    if (hasUnread) {
      rooms.set(roomId, room);
      io.to(roomId).emit('allMessagesRead', { roomId, userId: socket.userId });
    }
    socket.emit('joinedRoom', { roomId, messages: room.messages.slice(-100) });
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    socket.currentRoom = null;
  });

  // 删除/退出聊天（从房间成员中移除自己）
  socket.on('deleteChat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.members = (room.members || []).filter(m => m !== socket.username);
    rooms.set(roomId, room);
    rooms.save();
    socket.leave(roomId);
    socket.emit('chatDeleted', { roomId });
    console.log(`[CHAT] ${socket.username} 退出了聊天: ${room.name}`);
  });

  socket.on('sendMessage', (data) => {
    const { roomId, content, type, fileUrl, filename, fileSize, mimeType, replyTo, mentions } = data;
    const room = rooms.get(roomId);
    if (!room) return;
    // 验证发送者是房间成员
    if (!isRoomMember(room, socket.username)) return;
    // 禁言检查
    if (room.mutedMembers && room.mutedMembers.includes(socket.username)) {
      socket.emit('sendError', { error: '你已被禁言，无法发送消息' });
      return;
    }
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
    if (room.messages.length > 3000) {
      room.messages = room.messages.slice(-3000);
    }
    rooms.set(roomId, room);
    rooms.save(); // 立即持久化
    io.to(roomId).emit('newMessage', message);

    // 触发房间内的自动回复机器人（限频：每个bot每10秒最多回复一次）
    try {
      const now = Date.now();
      bots.forEach(bot => {
        if (bot.enabled && bot.autoReply && message.sender?.id !== bot.id) {
          const lastReply = bot._lastReplyTime || 0;
          if (now - lastReply > 10000) {
            bot._lastReplyTime = now;
            triggerBotReply(bot, roomId, message.content || '[非文本消息]');
          }
        }
      });
    } catch(e) { console.error('Bot trigger error:', e.message); }

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

  // 消息转发
  socket.on('forwardMessage', ({ roomId, originalMessage, forwardedFrom }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const message = {
      id: uuidv4(),
      content: originalMessage.content || '',
      type: originalMessage.type || 'text',
      fileUrl: originalMessage.fileUrl,
      filename: originalMessage.filename,
      mimeType: originalMessage.mimeType,
      fileSize: originalMessage.fileSize,
      forwardedFrom,
      sender: {
        id: socket.userId,
        username: socket.username,
        avatar: users.get(socket.username)?.avatar
      },
      roomId,
      timestamp: new Date(),
      readBy: [socket.userId],
      edited: false
    };
    room.messages.push(message);
    if (room.messages.length > 3000) {
      room.messages = room.messages.slice(-3000);
    }
    rooms.set(roomId, room);
    io.to(roomId).emit('messageForwarded', message);
  });

  // 消息已读回执
  socket.on('markMessageRead', ({ roomId, messageId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.readBy) msg.readBy = [];
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
      if (!msg.readBy) msg.readBy = [];
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

  // 删除消息
  socket.on('deleteMessage', ({ roomId, messageId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msgIndex = room.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const msg = room.messages[msgIndex];
    // 只允许消息发送者或群主删除
    if (msg.sender.id !== socket.userId && room.createdBy !== socket.username) {
      socket.emit('deleteError', { error: '只有发送者或群主可以删除消息' });
      return;
    }
    room.messages.splice(msgIndex, 1);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('messageDeleted', { messageId, roomId });
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
    updateUserBalance(socket.username, parseFloat((user.balance - amount).toFixed(2)));

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
      updateUserBalance(socket.username, parseFloat((user.balance + share).toFixed(2)));
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

  // ===== 消息反应 =====
  socket.on('addReaction', ({ roomId, messageId, emoji }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    if (!msg.reactions[emoji].includes(socket.userId)) {
      msg.reactions[emoji].push(socket.userId);
    }
    rooms.set(roomId, room);
    io.to(roomId).emit('reactionUpdated', { messageId, reactions: msg.reactions });
  });

  socket.on('removeReaction', ({ roomId, messageId, emoji }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg || !msg.reactions || !msg.reactions[emoji]) return;
    msg.reactions[emoji] = msg.reactions[emoji].filter(id => id !== socket.userId);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    rooms.set(roomId, room);
    io.to(roomId).emit('reactionUpdated', { messageId, reactions: msg.reactions || {} });
  });

  // ===== 群接龙 =====
  socket.on('createSolitaire', ({ roomId, title, format }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const solitaire = {
      id: uuidv4(),
      type: 'solitaire',
      title,
      format: format || '{序号}. {内容}',
      participants: [],
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      roomId,
      timestamp: new Date()
    };
    room.messages.push(solitaire);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', solitaire);
  });

  socket.on('joinSolitaire', ({ roomId, solitaireId, content }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const solitaire = room.messages.find(m => m.id === solitaireId);
    if (!solitaire || solitaire.type !== 'solitaire') return;
    if (solitaire.participants.find(p => p.userId === socket.userId)) {
      socket.emit('solitaireError', { error: '你已经接过龙了' });
      return;
    }
    const participant = {
      userId: socket.userId,
      username: socket.username,
      avatar: users.get(socket.username)?.avatar,
      content,
      index: solitaire.participants.length + 1,
      timestamp: new Date()
    };
    solitaire.participants.push(participant);
    rooms.set(roomId, room);
    io.to(roomId).emit('solitaireUpdated', { solitaireId, participants: solitaire.participants });
  });

  // ===== WebRTC 信令 =====
  socket.on('callUser', ({ toUserId, roomId, signal, callType }) => {
    const targetSocket = userSockets.get(toUserId);
    if (targetSocket) {
      targetSocket.emit('incomingCall', {
        from: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
        roomId, signal, callType: callType || 'video'
      });
    }
  });

  socket.on('answerCall', ({ toUserId, signal }) => {
    const targetSocket = userSockets.get(toUserId);
    if (targetSocket) {
      targetSocket.emit('callAccepted', { from: socket.userId, signal });
    }
  });

  socket.on('iceCandidate', ({ toUserId, candidate }) => {
    const targetSocket = userSockets.get(toUserId);
    if (targetSocket) {
      targetSocket.emit('iceCandidate', { from: socket.userId, candidate });
    }
  });

  socket.on('hangUp', ({ toUserId }) => {
    const targetSocket = userSockets.get(toUserId);
    if (targetSocket) {
      targetSocket.emit('callEnded', { from: socket.userId });
    }
  });

  // ===== 位置共享 =====
  const locationShares = new Map(); // userId -> { lat, lng, roomId, timestamp }
  socket.on('shareLocation', ({ roomId, lat, lng }) => {
    locationShares.set(socket.userId, { lat, lng, roomId, timestamp: new Date(), username: socket.username });
    io.to(roomId).emit('locationUpdate', {
      userId: socket.userId, username: socket.username, lat, lng, timestamp: new Date()
    });
  });

  socket.on('stopSharingLocation', ({ roomId }) => {
    locationShares.delete(socket.userId);
    io.to(roomId).emit('locationStopped', { userId: socket.userId });
  });

  socket.on('getLocations', ({ roomId }) => {
    const locations = [];
    locationShares.forEach((v, k) => {
      if (v.roomId === roomId) locations.push({ userId: k, ...v });
    });
    socket.emit('locationsList', locations);
  });

  // ===== 打卡签到 =====
  const checkIns = new Map(); // roomId -> [{ userId, username, timestamp, note }]
  socket.on('checkIn', ({ roomId, note }) => {
    if (!checkIns.has(roomId)) checkIns.set(roomId, []);
    const today = new Date().toDateString();
    const list = checkIns.get(roomId);
    if (list.find(c => c.userId === socket.userId && new Date(c.timestamp).toDateString() === today)) {
      socket.emit('checkInError', { error: '今天已打卡' });
      return;
    }
    const entry = { userId: socket.userId, username: socket.username, timestamp: new Date(), note: note || '' };
    list.push(entry);
    checkIns.set(roomId, list);
    io.to(roomId).emit('checkInUpdate', { roomId, entry, total: list.filter(c => new Date(c.timestamp).toDateString() === today).length });
  });

  socket.on('getCheckIns', ({ roomId }) => {
    const list = checkIns.get(roomId) || [];
    const today = new Date().toDateString();
    socket.emit('checkInList', {
      today: list.filter(c => new Date(c.timestamp).toDateString() === today),
      history: list.slice(-50)
    });
  });

  // ===== 增强投票 (覆盖原有 createPoll) =====
  socket.on('createPollEnhanced', ({ roomId, question, options, anonymous, deadline, image }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const poll = {
      id: uuidv4(),
      type: 'poll',
      question,
      options: options.map(opt => ({ text: opt.text || opt, votes: [], image: opt.image || null })),
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      roomId, timestamp: new Date(),
      anonymous: anonymous || false,
      deadline: deadline || null, // ISO string
      totalVoters: 0
    };
    room.messages.push(poll);
    rooms.set(roomId, room);
    io.to(roomId).emit('newMessage', poll);
  });

  // ===== Bot 触发回复 =====
  socket.on('triggerBot', ({ botId, roomId, message }) => {
    const bot = bots.get(botId);
    if (bot && bot.autoReply) triggerBotReply(bot, roomId, message);
  });

  // ===== 未读消息计数 =====
  socket.on('getUnreadCounts', () => {
    const counts = {};
    rooms.forEach(room => {
      if (room.members && room.members.includes(socket.username)) {
        const unread = room.messages.filter(m =>
          m.sender?.id !== socket.userId &&
          !m.readBy?.includes(socket.userId)
        ).length;
        if (unread > 0) counts[room.id] = unread;
      }
    });
    socket.emit('unreadCounts', counts);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const count = (userConnectionCount.get(socket.userId) || 1) - 1;
      if (count <= 0) {
        // 所有连接都已断开
        userConnectionCount.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        userSockets.delete(socket.userId);
        io.emit('userOffline', { id: socket.userId });
      } else {
        userConnectionCount.set(socket.userId, count);
      }
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

// 静态文件 + SPA 路由（在所有 API 路由之后，确保 API 优先匹配）
// APK 下载（放在 static 之前，确保正确的 MIME）
app.get('/WeChat-v2.0.apk', (req, res) => {
  const apkPath = path.join(__dirname, '..', 'client', 'build', 'WeChat-v2.0.apk');
  if (fs.existsSync(apkPath)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="WeChat-v2.0.apk"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(apkPath).pipe(res);
  } else {
    res.status(404).json({ error: 'APK not found' });
  }
});

const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// 全局错误处理，防止服务器崩溃
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack?.split('\n')[1]);
  // 不让进程退出，记录错误继续运行
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason?.message || reason);
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
