const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function resolveEnvConfig() {
  const preferred = process.env.ENV_FILE || '.env';
  const candidates = preferred === '.env'
    ? ['.env', '.env.web', '.env.app']
    : [preferred, '.env'];

  for (const name of candidates) {
    const fullPath = path.join(__dirname, name);
    if (fs.existsSync(fullPath)) {
      return { name, fullPath };
    }
  }

  return {
    name: preferred,
    fullPath: path.join(__dirname, preferred)
  };
}

const envConfigFile = resolveEnvConfig();
dotenv.config({ path: envConfigFile.fullPath });
console.log(`[SERVER] Using config: ${envConfigFile.name}, Port: ${process.env.PORT || 3001}`);
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 100 * 1024 * 1024,
  transports: ['websocket'],          // 仅 WebSocket，不用 HTTP 轮询
  pingInterval: 25000,                // 25s 心跳
  pingTimeout: 20000,                 // 20s 超时
  connectTimeout: 10000,              // 10s 连接超时
  allowUpgrades: false,               // 禁止降级到轮询
  perMessageDeflate: true,            // WebSocket 压缩
  maxDisconnectionDuration: 120000    // 2分钟断线缓冲
});

// ========== 生产级中间件 ==========
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // SPA 内联样式多，关闭 CSP
})); // 安全头：XSS/点击劫持/嗅探防护
app.use(compression({ level: 6, threshold: 256 }));
app.use(cors());

// 全局限流：每个 IP 每分钟 120 次
app.use(rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后重试' }
}));

// API 限流：登录/注册每分钟 10 次
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: '操作频繁，请稍后再试' } });
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use(express.json({ limit: '10mb' }));
// 静态文件缓存
const staticOpts = { maxAge: '7d', etag: true, lastModified: true, setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); } };
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOpts));
app.use('/releases', express.static(path.join(__dirname, '..', 'client', 'releases'), staticOpts));

const JWT_SECRET = 'wechat-secret-key-2024';
const PORT = process.env.PORT || 3001;

const collections = db.init();
const DATA_DIR = db.DATA_DIR;
const users = collections.users;
const friendRequests = collections.friendRequests;
const friends = collections.friends;
const rooms = collections.rooms;
const recharges = collections.recharges;
const transfers = collections.transfers;
const dailyReport = collections.dailyReport;
const pushTokens = collections.pushTokens;
const AUDIT_FILE = path.join(DATA_DIR, 'adminAudit.json');
let auditLog = [];

try {
  if (fs.existsSync(AUDIT_FILE)) {
    auditLog = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
  }
} catch (e) {
  console.error('[AUDIT] load failed:', e.message);
  auditLog = [];
}

function saveAuditLog() {
  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLog.slice(-500), null, 2), 'utf-8');
  } catch (e) {
    console.error('[AUDIT] save failed:', e.message);
  }
}

function addAudit(action, actor, detail = {}) {
  auditLog.push({
    id: uuidv4(),
    action,
    actor: actor?.username || actor || 'system',
    detail,
    createdAt: new Date().toISOString()
  });
  if (auditLog.length > 500) auditLog = auditLog.slice(-500);
  saveAuditLog();
}

// Start auto-flush to prevent data loss on crash
db.startAutoFlush(collections);

// Graceful shutdown: flush data on exit
// ========== 优雅关闭 ==========
let isShuttingDown = false;
function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal} received, saving data...`);
  db.flushAll(collections);
  db.stopAutoFlush();
  io.close(() => {
    server.close(() => {
      console.log('[SHUTDOWN] Server closed. Goodbye.');
      process.exit(0);
    });
  });
  // 5 秒超时强制退出
  setTimeout(() => { console.log('[SHUTDOWN] Force exit'); process.exit(0); }, 5000);
}
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGUSR2', () => handleShutdown('SIGUSR2')); // PM2 reload

// ========== 自动备份（每小时） ==========
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_FILES = ['users.json', 'friendRequests.json', 'friends.json', 'rooms.json', 'recharges.json', 'transfers.json', 'pushTokens.json'];
setInterval(() => {
  try {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(BACKUP_DIR, now);
    fs.mkdirSync(backupDir, { recursive: true });
    for (const filename of BACKUP_FILES) {
      const src = path.join(DATA_DIR, filename);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupDir, filename));
      }
    }
    // 保留最近 24 个备份
    const backups = fs.readdirSync(BACKUP_DIR).sort().reverse();
    backups.slice(24).forEach(d => {
      fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
    });
  } catch (e) { console.error('[BACKUP] Error:', e.message); }
}, 60 * 60 * 1000);
console.log('[BACKUP] Hourly backup enabled (keeps 24h)');

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

function canAccessRoom(room, username) {
  return room && (room.type === 'public' || room.type === 'treehole' || isRoomMember(room, username));
}

// ========== 匿名树洞房 ==========
const TREEHOLE_TTL = 24 * 60 * 60 * 1000;   // 消息保留 24 小时
const TREEHOLE_ROOM_TTL = 72 * 60 * 60 * 1000; // 房间无消息 72 小时后回收
const crypto = require('crypto');

// 树洞匿名身份：同一用户在同一房间恒定（基于 hash，不落盘真实身份）
function getTreeholeAnon(roomId, userId) {
  const h = crypto.createHash('sha256').update(`${roomId}:${userId}`).digest('hex');
  const tag = (parseInt(h.slice(0, 4), 16) % 9000 + 1000).toString(); // 1000-9999 稳定编号
  const ANON_NAMES = ['夜风', '星尘', '孤岛', '月光', '深海', '萤火', '浮云', '细雨', '微风', '落叶'];
  const name = `${ANON_NAMES[parseInt(h.slice(4, 6), 16) % ANON_NAMES.length]}·${tag}`;
  return {
    id: 'anon-' + h.slice(0, 8),
    name,
    avatar: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${h.slice(0, 12)}`
  };
}

// 树洞定时焚毁：清理过期消息 + 回收沉寂房间
setInterval(() => {
  try {
    const now = Date.now();
    let purged = 0, removedRooms = 0;
    rooms.forEach((room, roomId) => {
      if (room.type !== 'treehole') return;
      const before = (room.messages || []).length;
      room.messages = (room.messages || []).filter(m => now - new Date(m.timestamp).getTime() < TREEHOLE_TTL);
      const lastMsg = room.messages[room.messages.length - 1];
      const lastAt = lastMsg ? new Date(lastMsg.timestamp).getTime() : new Date(room.createdAt || 0).getTime();
      if (now - lastAt > TREEHOLE_ROOM_TTL) {
        rooms.delete(roomId);
        removedRooms++;
        io.emit('chatDeleted', { roomId });
        return;
      }
      if (room.messages.length !== before) {
        rooms.set(roomId, room);
        purged += before - room.messages.length;
      }
    });
    if (purged > 0 || removedRooms > 0) {
      rooms.save();
      console.log(`[TREEHOLE] purged ${purged} msgs, removed ${removedRooms} rooms`);
    }
  } catch (e) { console.error('[TREEHOLE] cleanup error:', e.message); }
}, 30 * 60 * 1000).unref();

// 频道（channel）相关判断
function isChannelRoom(room) {
  return room && room.type === 'channel';
}

function isChannelAdmin(room, username) {
  return isChannelRoom(room) && (room.owner === username || (room.admins || []).includes(username));
}

function isChannelSubscriber(room, username) {
  return isChannelRoom(room) && (room.members || []).includes(username);
}

// 话题（thread）序列化：仅返回元数据 + 最近 100 条消息，避免全量下发
function serializeThread(thread) {
  return {
    id: thread.id,
    title: thread.title,
    creator: thread.creator,
    createdAt: thread.createdAt,
    messageCount: (thread.messages || []).length,
    messages: (thread.messages || []).slice(-100)
  };
}

function serializeThreads(room) {
  return (room.threads || []).map(serializeThread);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ========== 健康检查 ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    users: users.size,
    rooms: rooms.size,
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

// ========== 请求日志 ==========
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path.startsWith('/api') || req.path === '/health') {
      console.log(`${res.statusCode} ${req.method} ${req.path} ${ms}ms`);
    }
  });
  next();
});

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

// 简单文件上传用内存存储（前端仅 <2MB 走此路径），解析直接用 buffer 避开落盘竞态
const simpleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
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
  addAudit('recharge.confirm', user, { username: recharge.username, amount: recharge.amount, rechargeId });
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

  addAudit('recharge.reject', user, { username: recharge.username, amount: recharge.amount, rechargeId, reason: recharge.rejectReason });
  res.json({ success: true, recharge });
});

// ========== 用户间转账 ==========
// 校验转账金额：正数、最多两位小数
function isValidTransferAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return false;
  // 最多两位小数
  return Math.round(n * 100) === n * 100;
}

app.post('/api/transfer', verifyToken, (req, res) => {
  const { toUsername, amount, note } = req.body || {};
  const fromUsername = req.user.username;

  // 校验收款人
  if (!toUsername || typeof toUsername !== 'string') {
    return res.status(400).json({ error: '请指定收款人用户名' });
  }
  const toUsernameTrimmed = toUsername.trim();
  if (toUsernameTrimmed === fromUsername) {
    return res.status(400).json({ error: '不能转账给自己' });
  }
  const toUser = users.get(toUsernameTrimmed);
  if (!toUser) {
    return res.status(404).json({ error: '收款人不存在' });
  }

  // 校验金额
  if (!isValidTransferAmount(amount)) {
    return res.status(400).json({ error: '转账金额必须为正数且最多两位小数' });
  }
  const amountNum = Math.round(Number(amount) * 100) / 100;

  // 校验转出方余额
  const fromUser = users.get(fromUsername);
  if (!fromUser) {
    return res.status(401).json({ error: '转出用户不存在' });
  }
  const fromBalance = fromUser.balance || 0;
  if (fromBalance < amountNum) {
    return res.status(400).json({ error: `余额不足，当前余额 ¥${fromBalance.toFixed(2)}` });
  }

  // 原子执行：同一步内扣款 + 加款 + 记录（单进程同步，无并发竞态）
  const newFromBalance = Math.round((fromBalance - amountNum) * 100) / 100;
  const newToBalance = Math.round(((toUser.balance || 0) + amountNum) * 100) / 100;

  fromUser.balance = newFromBalance;
  users.set(fromUsername, fromUser);
  toUser.balance = newToBalance;
  users.set(toUsernameTrimmed, toUser);
  users.save(); // 立即持久化，防止重启丢款

  const transfer = {
    id: uuidv4(),
    fromUserId: fromUser.id,
    fromUsername,
    toUserId: toUser.id,
    toUsername: toUsernameTrimmed,
    amount: amountNum,
    note: (note && typeof note === 'string' && note.trim()) ? note.trim().slice(0, 100) : '',
    createdAt: new Date().toISOString()
  };
  transfers.set(transfer.id, transfer);
  transfers.save();

  // 通知双方余额变更
  const fromSocket = userSockets.get(fromUser.id);
  if (fromSocket) fromSocket.emit('balanceUpdated', { balance: newFromBalance });
  const toSocket = userSockets.get(toUser.id);
  if (toSocket) toSocket.emit('balanceUpdated', { balance: newToBalance });

  addAudit('transfer', req.user, { fromUsername, toUsername: toUsernameTrimmed, amount: amountNum, note: transfer.note });

  console.log(`[TRANSFER] ${fromUsername} → ${toUsernameTrimmed} ¥${amountNum}`);
  res.json({
    success: true,
    transfer,
    newBalance: newFromBalance
  });
});

app.get('/api/transfer/history', verifyToken, (req, res) => {
  const myId = req.user.id;
  const records = transfers
    .filter(t => t.fromUserId === myId || t.toUserId === myId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(records.slice(0, 100));
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
let QIANFAN_API_KEY = process.env.QIANFAN_API_KEY || '';
const ZHIPU_BASE = 'open.bigmodel.cn';
const KIMI_BASE = 'api.moonshot.ai';
const DEEPSEEK_BASE = 'api.deepseek.com';
const QIANFAN_BASE = 'qianfan.baidubce.com';

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
  req.write(body);
  req.end();
}

let DEEPSEEK_R1_API_KEY = process.env.DEEPSEEK_R1_API_KEY || '';
const DEEPSEEK_MODEL_MAP = {
  'deepseek-v4-flash': 'deepseek-chat',
  'deepseek-v4-pro': 'deepseek-reasoner',
  'deepseek-r1': 'deepseek-reasoner'
};

// 调用 DeepSeek AI
function callDeepSeekAI(messages, model, callback) {
  const isR1 = model === 'deepseek-r1';
  // R1 可使用独立 Key，其余模型使用 DeepSeek 直连 Key。
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
    hostname: DEEPSEEK_BASE,
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

// 调用百度千帆 OpenAI 兼容接口
function callQianfanAI(messages, model, callback) {
  if (!QIANFAN_API_KEY) {
    return callback(new Error('QIANFAN_API_KEY 未配置'));
  }
  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    max_tokens: 2048,
    temperature: 0.7
  });
  const options = {
    hostname: QIANFAN_BASE,
    port: 443,
    path: '/v2/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QIANFAN_API_KEY}`,
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 60000
  };
  const req = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        callback(null, json);
      } catch (e) {
        callback(new Error('千帆响应解析失败: ' + data.substring(0, 100)), null);
      }
    });
  });
  req.on('timeout', () => {
    req.destroy();
    callback(new Error('千帆请求超时'), null);
  });
  req.on('error', err => callback(err, null));
  req.write(body);
  req.end();
}

function extractAIError(json) {
  const raw = json?.error || json?.error_msg || json?.message;
  if (!raw) return null;
  if (typeof raw === 'string') return { message: raw, code: json?.code || json?.error_code || '' };
  return {
    message: raw.message || raw.msg || 'AI 返回错误',
    code: raw.code || json?.code || json?.error_code || ''
  };
}

function getProviderHint(provider, message, code) {
  const text = `${message || ''} ${code || ''}`.toLowerCase();
  if (text.includes('insufficient balance') || text.includes('suspended') || text.includes('quota') || text.includes('balance') || text.includes('额度') || text.includes('余额')) {
    return `${provider} 账号余额不足或服务被暂停，请到对应平台充值/恢复后再试`;
  }
  if (text.includes('invalid') || text.includes('authentication') || text.includes('unauthorized') || String(code) === '401') {
    return `${provider} API Key 无效，请更换有效 Key 后重启服务器或使用后台热重载`;
  }
  return '';
}

function getAssistantReply(json) {
  return json?.choices?.[0]?.message?.content || json?.result || json?.reply || '';
}

const AI_MODELS = [
  { id: 'glm-4-flash', name: '智谱 GLM-4-Flash（免费）', free: true, desc: '快速免费', provider: 'zhipu' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4-Flash', free: false, desc: 'DeepSeek 快速模型', provider: 'deepseek' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4-Pro', free: false, desc: 'DeepSeek 推理增强模型', provider: 'deepseek' },
  { id: 'deepseek-r1', name: 'DeepSeek R1（独立Key）', free: false, desc: 'DeepSeek 最新推理模型', provider: 'deepseek' },
  { id: 'moonshot-v1-8k', name: 'Kimi Moonshot-8K', free: false, desc: 'Kimi 长文本模型', provider: 'kimi' },
  { id: 'moonshot-v1-32k', name: 'Kimi Moonshot-32K', free: false, desc: 'Kimi 长上下文模型', provider: 'kimi' },
  { id: 'moonshot-v1-128k', name: 'Kimi Moonshot-128K', free: false, desc: 'Kimi 超长上下文模型', provider: 'kimi' },
  { id: 'ernie-4.5-turbo-128k', name: '百度千帆 ERNIE 4.5 Turbo', free: false, desc: '百度千帆 OpenAI 兼容模型', provider: 'qianfan' },
  { id: 'glm-4-plus', name: '智谱 GLM-4-Plus', free: false, desc: '更强推理', provider: 'zhipu' }
];

const aiProviderStatus = new Map();

function getAIModelMeta(model) {
  return AI_MODELS.find(m => m.id === model) || AI_MODELS[0];
}

function isProviderConfigured(provider, model) {
  if (provider === 'zhipu') return Boolean(ZHIPU_API_KEY);
  if (provider === 'kimi') return Boolean(KIMI_API_KEY);
  if (provider === 'qianfan') return Boolean(QIANFAN_API_KEY);
  if (provider === 'deepseek') {
    return model === 'deepseek-r1'
      ? Boolean(DEEPSEEK_R1_API_KEY || DEEPSEEK_API_KEY)
      : Boolean(DEEPSEEK_API_KEY);
  }
  return false;
}

function updateAIProviderStatus(provider, ok, detail = '') {
  aiProviderStatus.set(provider, {
    ok,
    detail,
    checkedAt: new Date().toISOString()
  });
}

function callProviderModel(messages, model, callback) {
  const meta = getAIModelMeta(model);
  if (meta.provider === 'zhipu') return callAI(messages, model, callback);
  if (meta.provider === 'kimi') return callKimiAI(messages, model, callback);
  if (meta.provider === 'deepseek') return callDeepSeekAI(messages, model, callback);
  if (meta.provider === 'qianfan') return callQianfanAI(messages, model, callback);
  return callback(new Error('不支持的 AI 模型'));
}

function invokeModel(messages, model) {
  return new Promise((resolve) => {
    const meta = getAIModelMeta(model);
    if (!isProviderConfigured(meta.provider, model)) {
      return resolve({
        ok: false,
        model,
        provider: meta.provider,
        error: `${meta.name} 未配置 API Key`,
        code: 'missing_key',
        hint: `${meta.name} 未配置 API Key`
      });
    }

    callProviderModel(messages, model, (err, json) => {
      if (err) {
        updateAIProviderStatus(meta.provider, false, err.message);
        return resolve({
          ok: false,
          model,
          provider: meta.provider,
          error: err.message,
          hint: getProviderHint(meta.name, err.message, '')
        });
      }

      const aiError = extractAIError(json);
      if (aiError) {
        const hint = getProviderHint(meta.name, aiError.message, aiError.code);
        updateAIProviderStatus(meta.provider, false, aiError.message);
        return resolve({
          ok: false,
          model,
          provider: meta.provider,
          error: aiError.message,
          code: aiError.code,
          hint
        });
      }

      const reply = getAssistantReply(json);
      if (!reply) {
        updateAIProviderStatus(meta.provider, false, '无回复');
        return resolve({
          ok: false,
          model,
          provider: meta.provider,
          error: 'AI 无回复'
        });
      }

      updateAIProviderStatus(meta.provider, true, '');
      resolve({
        ok: true,
        model,
        provider: meta.provider,
        reply,
        usage: json?.usage || null,
        free: meta.free
      });
    });
  });
}

async function callSelectedAIModel(messages, model) {
  const selected = getAIModelMeta(model).id;
  return invokeModel(messages, selected);
}

function chargeAICall(user, isAdmin) {
  if (!user || isAdmin) return user?.balance || 0;
  const nextBalance = parseFloat(((user.balance || 0) - AI_CALL_PRICE).toFixed(2));
  updateUserBalance(user.username, nextBalance);
  return nextBalance;
}

// AI 聊天代理（每个用户独立会话上下文）
const aiConversations = new Map(); // userId -> [{role, content}, ...]

app.post('/api/ai/chat', verifyToken, async (req, res) => {
  const { message, model, reset, systemContext } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: '消息不能为空' });
  }
  if (systemContext !== undefined && typeof systemContext !== 'string') {
    return res.status(400).json({ error: 'systemContext 必须为字符串' });
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
  
  const user = Array.from(users.values()).find(u => u.id === userId);
  const isAdmin = user?.username === 'admin';
  const balance = user?.balance || 0;
  const selectedMeta = getAIModelMeta(useModel);

  if (!selectedMeta.free && !isAdmin && balance < AI_CALL_PRICE) {
    return res.status(402).json({
      error: '余额不足',
      hint: `当前余额 ¥${balance.toFixed(2)}，${selectedMeta.name} 需要 ¥${AI_CALL_PRICE.toFixed(2)}/次`,
      balance,
      required: AI_CALL_PRICE,
      rechargeUrl: '/api/recharge/request'
    });
  }

  // 构造本次调用上下文：若传入文档 systemContext，临时注入一条 system message，不污染持久会话
  let callMessages = history;
  if (systemContext && systemContext.trim()) {
    const docSystem = {
      role: 'system',
      content: `以下是用户上传的文档内容，请据此回答用户接下来的问题：\n\n${systemContext.trim()}`
    };
    callMessages = [history[0], docSystem, ...history.slice(1)];
  }

  const result = await callSelectedAIModel(callMessages, useModel);

  if (!result.ok) {
    return res.status(500).json({
      error: 'AI 调用失败',
      hint: result.hint || result.error || `${selectedMeta.name} 暂不可用，请检查该模型配置或稍后再试`,
      model: selectedMeta.id,
      provider: selectedMeta.provider
    });
  }

  history.push({ role: 'assistant', content: result.reply });
  const usedMeta = getAIModelMeta(result.model);
  const nextBalance = usedMeta.free ? balance : chargeAICall(user, isAdmin);

  res.json({
    reply: result.reply,
    model: result.model,
    requestedModel: useModel,
    provider: result.provider,
    usage: result.usage || null,
    balance: nextBalance
  });
});

app.post('/api/ai/reset', verifyToken, (req, res) => {
  aiConversations.delete(req.user.id);
  res.json({ ok: true });
});

app.get('/api/ai/models', verifyToken, (req, res) => {
  res.json({ models: AI_MODELS });
});

app.get('/api/admin/ai-status', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  res.json({
    success: true,
    providers: [
      { id: 'zhipu', name: '智谱', configured: Boolean(ZHIPU_API_KEY), ...(aiProviderStatus.get('zhipu') || {}) },
      { id: 'qianfan', name: '百度千帆', configured: Boolean(QIANFAN_API_KEY), ...(aiProviderStatus.get('qianfan') || {}) },
      { id: 'kimi', name: 'Kimi', configured: Boolean(KIMI_API_KEY), ...(aiProviderStatus.get('kimi') || {}) },
      { id: 'deepseek', name: 'DeepSeek', configured: Boolean(DEEPSEEK_API_KEY || DEEPSEEK_R1_API_KEY), ...(aiProviderStatus.get('deepseek') || {}) }
    ],
    models: AI_MODELS
  });
});

app.get('/api/admin/dashboard', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  const today = new Date().toISOString().slice(0, 10);
  let totalMessages = 0;
  let todayMessages = 0;
  rooms.forEach(room => {
    const msgs = room.messages || [];
    totalMessages += msgs.length;
    todayMessages += msgs.filter(m => String(m.timestamp || '').slice(0, 10) === today).length;
  });

  const rechargeList = recharges.toArray();
  const todayRechargeAmount = rechargeList
    .filter(r => r.status === 'confirmed' && String(r.confirmedAt || r.createdAt || '').slice(0, 10) === today)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  res.json({
    success: true,
    stats: {
      users: users.size,
      onlineUsers: onlineUsers.size,
      rooms: rooms.size,
      connections: io.engine.clientsCount,
      totalMessages,
      todayMessages,
      pendingRecharges: rechargeList.filter(r => r.status === 'pending').length,
      todayRechargeAmount: Number(todayRechargeAmount.toFixed(2))
    },
    audit: auditLog.slice(-10).reverse()
  });
});

// 热重载 .env 配置（无需重启服务器）
app.post('/api/admin/reload-config', verifyToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    const resolved = resolveEnvConfig();
    const envContent = fs.readFileSync(resolved.fullPath, 'utf-8');
    const envConfig = dotenv.parse(envContent);
    // 更新全局 API Key 变量
    if (envConfig.ZHIPU_API_KEY !== undefined) process.env.ZHIPU_API_KEY = envConfig.ZHIPU_API_KEY;
    if (envConfig.KIMI_API_KEY !== undefined) process.env.KIMI_API_KEY = envConfig.KIMI_API_KEY;
    if (envConfig.DEEPSEEK_API_KEY !== undefined) process.env.DEEPSEEK_API_KEY = envConfig.DEEPSEEK_API_KEY;
    if (envConfig.DEEPSEEK_R1_API_KEY !== undefined) process.env.DEEPSEEK_R1_API_KEY = envConfig.DEEPSEEK_R1_API_KEY;
    if (envConfig.QIANFAN_API_KEY !== undefined) process.env.QIANFAN_API_KEY = envConfig.QIANFAN_API_KEY;
    // 同时更新模块级变量
    ZHIPU_API_KEY = envConfig.ZHIPU_API_KEY || '';
    KIMI_API_KEY = envConfig.KIMI_API_KEY || '';
    DEEPSEEK_API_KEY = envConfig.DEEPSEEK_API_KEY || '';
    DEEPSEEK_R1_API_KEY = envConfig.DEEPSEEK_R1_API_KEY || '';
    QIANFAN_API_KEY = envConfig.QIANFAN_API_KEY || '';
    console.log(`[CONFIG] Reloaded ${resolved.name}`);
    addAudit('config.reload', user, { keys: ['ZHIPU_API_KEY', 'KIMI_API_KEY', 'DEEPSEEK_API_KEY', 'DEEPSEEK_R1_API_KEY', 'QIANFAN_API_KEY'] });
    res.json({ success: true, message: `配置已重新加载（${resolved.name}），新增/修改的 Key 已生效` });
  } catch (e) {
    res.status(500).json({ error: '重载失败: ' + e.message });
  }
});

// ========== 更新公告（changelog + OTA） ==========
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');
let changelogData = null; // { releases: [], ota: {} }

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map(n => {
    if (typeof n === 'string') return { type: 'improve', text: n };
    if (n && typeof n === 'object' && n.text) {
      return { type: ['new', 'fix', 'improve'].includes(n.type) ? n.type : 'improve', text: String(n.text) };
    }
    return null;
  }).filter(Boolean);
}

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`[CHANGELOG] read ${filePath} failed:`, e.message);
  }
  return null;
}

function saveChangelog() {
  try {
    const tmp = CHANGELOG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(changelogData, null, 2), 'utf-8');
    fs.renameSync(tmp, CHANGELOG_FILE);
  } catch (e) {
    console.error('[CHANGELOG] save failed:', e.message);
  }
}

function loadChangelog() {
  changelogData = readJsonSafe(CHANGELOG_FILE);
  if (!changelogData || !Array.isArray(changelogData.releases)) {
    // 首次启动：从静态文件 seed（旧格式自动迁移到新格式）
    const pubDir = path.join(__dirname, '..', 'client', 'public');
    const buildDir = path.join(__dirname, '..', 'client', 'build');
    const staticChangelog = readJsonSafe(path.join(pubDir, 'changelog.json')) || readJsonSafe(path.join(buildDir, 'changelog.json')) || { releases: [] };
    const staticOta = readJsonSafe(path.join(pubDir, 'ota-version.json')) || readJsonSafe(path.join(buildDir, 'ota-version.json')) || {};
    const releases = (staticChangelog.releases || []).map((r, i, arr) => ({
      version: r.version || staticOta.appVersion || '1.0.0',
      webBuild: r.webBuild || 0,
      prevWebBuild: r.prevWebBuild ?? (i + 1 < arr.length ? arr[i + 1].webBuild : (staticOta.webBuild || 0) - 1),
      date: r.date || '',
      title: r.title || '版本更新',
      tags: Array.isArray(r.tags) ? r.tags : [],
      notes: normalizeNotes(r.notes)
    }));
    changelogData = { releases, ota: { ...staticOta } };
    saveChangelog();
    console.log(`[CHANGELOG] seeded ${releases.length} releases from static files`);
  }
  if (!changelogData.ota) changelogData.ota = {};
}

loadChangelog();

// 公开：公告列表（历史版本公告弹窗）
app.get('/api/changelog', (req, res) => {
  res.json({ releases: changelogData.releases || [] });
});

// 公开：OTA 版本信息（App 登录时检查更新用，字段兼容原 ota-version.json）
app.get('/api/ota', (req, res) => {
  res.json(changelogData.ota || {});
});

// 已读公告状态（按用户同步，跨设备不重复弹窗）
app.get('/api/me/seen-updates', verifyToken, (req, res) => {
  const user = users.get(req.user.username);
  res.json({ seen: Array.isArray(user?.seenUpdates) ? user.seenUpdates : [] });
});

app.post('/api/me/seen-updates', verifyToken, (req, res) => {
  const updateId = req.body && req.body.updateId;
  if (!updateId) return res.status(400).json({ error: 'updateId required' });
  const user = users.get(req.user.username);
  if (user) {
    if (!Array.isArray(user.seenUpdates)) user.seenUpdates = [];
    if (!user.seenUpdates.includes(updateId)) {
      user.seenUpdates.push(updateId);
      if (user.seenUpdates.length > 50) user.seenUpdates = user.seenUpdates.slice(-50);
      if (typeof users.saveDebounced === 'function') users.saveDebounced();
    }
  }
  res.json({ ok: true });
});

function requireAdmin(req, res) {
  const user = Array.from(users.values()).find(u => u.id === req.user.id);
  if (!user || user.username !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return null;
  }
  return user;
}

// 管理：公告列表
app.get('/api/admin/changelog', verifyToken, (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ releases: changelogData.releases || [] });
});

// 管理：在线发布新公告（自动 webBuild +1、更新 OTA 弹窗信息）
app.post('/api/admin/changelog', verifyToken, (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const { title, notes, tags } = req.body || {};
  const normalized = normalizeNotes(notes);
  if (!title || typeof title !== 'string' || !title.trim() || normalized.length === 0) {
    return res.status(400).json({ error: '标题和至少一条更新说明必填' });
  }
  const prev = changelogData.releases[0];
  const prevWebBuild = prev?.webBuild || changelogData.ota?.webBuild || 0;
  const webBuild = prevWebBuild + 1;
  const release = {
    version: changelogData.ota?.appVersion || '3.0.0',
    webBuild,
    prevWebBuild,
    date: new Date().toISOString().slice(0, 10),
    title: title.trim(),
    tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string').slice(0, 5) : [],
    notes: normalized
  };
  changelogData.releases.unshift(release);
  changelogData.ota = {
    ...changelogData.ota,
    webBuild,
    updateId: `web-${webBuild}-${Date.now().toString(36)}`,
    updateTitle: release.title,
    updateNotes: normalized.map(n => n.text),
    showMajorUpdate: true,
    forceUpdate: false
  };
  saveChangelog();
  addAudit('changelog.publish', admin, { webBuild, title: release.title });
  try {
    io.emit('changelog:updated', { ota: changelogData.ota, releases: changelogData.releases || [] });
  } catch (e) { console.error('[CHANGELOG] broadcast failed:', e.message); }
  res.json({ success: true, release, ota: changelogData.ota });
});

// 管理：删除公告
app.delete('/api/admin/changelog/:webBuild', verifyToken, (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const wb = Number(req.params.webBuild);
  const idx = (changelogData.releases || []).findIndex(r => r.webBuild === wb);
  if (idx === -1) return res.status(404).json({ error: '公告不存在' });
  const [removed] = changelogData.releases.splice(idx, 1);
  saveChangelog();
  addAudit('changelog.delete', admin, { webBuild: wb, title: removed.title });
  try {
    io.emit('changelog:updated', { ota: changelogData.ota, releases: changelogData.releases || [] });
  } catch (e) { console.error('[CHANGELOG] broadcast failed:', e.message); }
  res.json({ success: true });
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
  const path = `/x/web-interface/wbi/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=1&page_size=10`;
  biliRequest(path, (err, json) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(json);
  });
});

app.get('/api/bilibili/popular', verifyToken, (req, res) => {
  biliRequest('/x/web-interface/popular/precious?page=1&page_size=10', (err, json) => {
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
    .filter(room => room.type === 'public' || room.type === 'channel' || room.type === 'treehole' || isRoomMember(room, req.user.username))
    .map(room => ({
      id: room.id,
      name: room.name,
      type: room.type,
      owner: room.owner || room.createdBy || null,
      admins: room.admins || [],
      members: room.members || [],
      memberCount: room.members ? room.members.length : 0,
      threadCount: room.threads ? room.threads.length : 0,
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
  if (room.type !== 'public' && room.type !== 'channel' && room.type !== 'treehole' && !isRoomMember(room, req.user.username)) {
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

// 分片上传使用内存存储
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/upload/chunk', verifyToken, chunkUpload.single('chunk'), (req, res) => {
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

// ========== 文档解析（PDF/Word/文本） ==========
const DOC_PARSE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

// 文档解析直接从内存 buffer 读取（pdf-parse 2.x / mammoth）
async function extractDocumentText(buffer, ext) {
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return (result.text || '').trim();
  }
  if (ext === '.docx' || ext === '.doc') {
    // mammoth 原生仅支持 .docx；.doc 会自然抛错并由调用方返回具体错误
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  }
  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf-8').trim();
  }
  return '';
}

app.post('/api/upload/simple', verifyToken, simpleUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // memoryStorage 不自动落盘，手动同步写盘（确保 fileUrl 可用）
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const filename = `${Date.now()}-${uuidv4()}${ext}`;
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, req.file.buffer);

  const fileUrl = `/uploads/${filename}`;
  const response = { url: fileUrl, filename: req.file.originalname };

  // 文档自动解析：PDF/Word/文本上传后生成 AI 摘要（解析失败不阻断上传，降级为普通文件消息）
  if (DOC_PARSE_EXTENSIONS.includes(ext)) {
    try {
      const text = await extractDocumentText(req.file.buffer, ext);
      if (text && text.length > 10) {
        const truncated = text.slice(0, 4000);
        const messages = [
          { role: 'system', content: '你是文档摘要助手。请用简洁中文总结文档核心内容，100字以内，直接输出要点，不要多余解释。' },
          { role: 'user', content: `请总结以下文档内容：\n${truncated}` }
        ];
        const result = await callSelectedAIModel(messages, 'glm-4-flash');
        if (result.ok && result.reply) {
          response.documentSummary = result.reply;
        }
      }
    } catch (e) {
      console.error('[DOC-PARSE] 解析失败:', e.message);
    }
  }

  res.json(response);
});

// ========== AI 文档解析端点（PDF/Word/TXT → 纯文本，供前端作为 system 上下文喂给 AI） ==========
// 仅做本地文档解析，不调用 AI 模型，因此不扣费（admin 与普通用户一致）。
// 复用现有 upload 中间件（diskStorage，500MB 上限），解析后删除临时文件。
const AI_DOC_PARSE_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

app.post('/api/ai/parse-document', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '未收到文件' });
  }
  const originalName = req.file.originalname || '';
  const ext = path.extname(originalName).toLowerCase();
  if (!AI_DOC_PARSE_EXTENSIONS.includes(ext)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({
      success: false,
      error: `不支持的文件类型: ${ext || '无扩展名'}，仅支持 pdf/docx/doc/txt`
    });
  }
  try {
    const buffer = fs.readFileSync(req.file.path);
    const text = await extractDocumentText(buffer, ext);
    if (!text) {
      return res.status(422).json({ success: false, error: '文档解析结果为空，可能是扫描件或格式异常' });
    }
    const truncated = text.slice(0, 50000);
    res.json({
      success: true,
      data: { text: truncated, filename: originalName, size: req.file.size }
    });
  } catch (e) {
    console.error('[AI-PARSE-DOC] 解析失败:', e.message);
    res.status(500).json({ success: false, error: `文档解析失败: ${e.message || '未知错误'}` });
  } finally {
    // 解析完成后删除临时文件，避免 uploads 堆积
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
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
      fs.appendFileSync(path.join(DATA_DIR, 'codes.log'), logLine);
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
  if (!canAccessRoom(room, req.user.username)) return res.status(403).json({ error: '无权访问该房间' });
  const count = Math.min(Math.max(parseInt(messageCount, 10) || 50, 50), 100);
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
  callSelectedAIModel(messages, 'glm-4-flash').then(result => {
    if (!result.ok) return res.status(500).json({ error: 'AI摘要失败', hint: result.error });
    res.json({ summary: result.reply, model: result.model, provider: result.provider });
  });
});

// ========== 头像上传 ==========
app.post('/api/ai/tldr', verifyToken, (req, res) => {
  const { roomId, messageCount } = req.body || {};
  if (!roomId) return res.status(400).json({ error: '缺少房间ID' });
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: '聊天室不存在' });
  if (!canAccessRoom(room, req.user.username)) return res.status(403).json({ error: '无权访问该房间' });

  const count = Math.min(Math.max(parseInt(messageCount, 10) || 50, 50), 100);
  const chatText = room.messages
    .slice(-count)
    .filter(m => m.type === 'text' && m.content && !m.recalled)
    .map(m => {
      const time = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false });
      return `[${time}] ${m.sender?.username || '匿名'}: ${m.content}`;
    })
    .join('\n');

  if (chatText.trim().length < 10) {
    return res.status(400).json({ error: '消息太少，无法生成摘要' });
  }

  const prompt = [
    { role: 'system', content: '你是群聊 TL;DR 助手。请只用中文输出两段：第一段以“提要：”开头，后面是 50 字以内极简总结；第二段以“任务：”开头，列出谁需要做什么，没有任务就写“暂无”。不要输出多余解释。' },
    { role: 'user', content: `请总结以下聊天记录：\n${chatText}` }
  ];

  callAIFree(prompt, (err, reply) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ summary: reply.trim(), messageCount: count, model: 'glm-4-flash' });
  });
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
  callSelectedAIModel(messages, 'glm-4-flash').then(result => {
    if (!result.ok) return res.status(500).json({ error: '翻译失败', hint: result.error });
    res.json({ translation: result.reply, source: text, targetLang: lang, model: result.model, provider: result.provider });
  });
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

// ========== AI 统一调用辅助（仅使用已配置供应商） ==========
function callAIFree(messages, callback) {
  callSelectedAIModel(messages, 'glm-4-flash').then(result => {
    if (!result.ok) return callback(new Error(result.error || '所有已配置 AI 通道均失败'));
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
app.get('/api/qrcode', (req, res) => {
  const { text } = req.query;
  if (!text) return res.status(400).json({ error: '请提供 text 参数' });
  QRCode.toBuffer(text.substring(0, 500), { width: 300, margin: 2, type: 'png' }, (err, buffer) => {
    if (err) return res.status(500).json({ error: '二维码生成失败' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });
});

// ========== AI 日报频道 ==========
function fetchHttpsJson(url, headers = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, timeout }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function fetchDailyWeather(city) {
  try {
    const json = await fetchHttpsJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`);
    const now = json.current_condition?.[0] || {};
    const today = json.weather?.[0] || {};
    return `${city}：${now.lang_zh?.[0]?.value || ''} ${now.temp_C}°C（${today.mintempC}~${today.maxtempC}°C），体感 ${now.FeelsLikeC}°C，湿度 ${now.humidity}%`;
  } catch { return null; }
}

async function fetchDailyNews() {
  try {
    const json = await fetchHttpsJson('https://news-at.zhihu.com/api/4/news/latest');
    return (json.stories || []).slice(0, 5).map(s => s.title);
  } catch { return null; }
}

async function fetchDailyQuote() {
  try {
    const json = await fetchHttpsJson('https://v1.hitokoto.cn/?c=a&c=b&c=d&c=i&c=k');
    return { quote: json.hitokoto, from: json.from || '' };
  } catch { return null; }
}

function getDailyReportConfig() {
  return dailyReport.get('config') || { enabled: false, roomId: null, hour: 8, minute: 0, city: '北京', lastRun: null };
}

function saveDailyReportConfig(config) {
  dailyReport.set('config', config);
  dailyReport.save();
}

async function generateDailyReportPost(test = false) {
  const config = getDailyReportConfig();
  const targetRoom = rooms.get(config.roomId);
  if (!targetRoom) return { ok: false, error: '日报房间不存在' };
  // 并行抓取素材
  const [weather, news, quote] = await Promise.all([fetchDailyWeather(config.city), fetchDailyNews(), fetchDailyQuote()]);
  // 房间昨日聊天摘要
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const chatMsgs = (targetRoom.messages || []).filter(m =>
    m.type === 'text' && m.content && !m.recalled && !m.isBot &&
    new Date(m.timestamp) >= yesterdayStart && new Date(m.timestamp) < dayStart
  ).slice(-60);
  const chatLog = chatMsgs.map(m => `${m.sender?.username || '匿名'}: ${m.content}`).join('\n');
  // AI 生成日报
  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const prompt = `你是聊天室的 AI 日报编辑。请根据素材生成一份今日日报，纯文本（不用 markdown 标记），结构如下：
【AI 日报】${todayStr}
一、天气：${weather || '暂无数据'}（一句话穿衣/出行建议）
二、热搜速览：${news ? news.join('；') : '暂无数据'}（挑 3 条一句话点评，语气轻松）
三、群聊回顾：${chatLog ? `以下是昨日聊天记录，总结 2-3 句有趣的看点：\n${chatLog}` : '昨天群里很安静，一句话调侃一下'}
四、今日一句：${quote ? `"${quote.quote}" —— ${quote.from}` : '自己写一句正能量金句'}
结尾加一句简短的早安问候。整体控制在 300 字内，语气像朋友，不要 AI 腔。`;
  const result = await callSelectedAIModel([{ role: 'user', content: prompt }], 'glm-4-flash');
  const content = result.ok && result.reply ? result.reply.trim() : null;
  if (!content) return { ok: false, error: 'AI 生成失败：' + (result.error || '未知错误') };
  const msg = {
    id: uuidv4(), type: 'dailyReport', content,
    sender: { id: 'ai-daily', username: 'AI 日报', avatar: null },
    roomId: config.roomId, timestamp: new Date(), readBy: [], isBot: true,
    isDailyReport: true
  };
  targetRoom.messages.push(msg);
  if (targetRoom.messages.length > 3000) targetRoom.messages = targetRoom.messages.slice(-3000);
  rooms.set(config.roomId, targetRoom);
  io.to(config.roomId).emit('newMessage', msg);
  if (!test) {
    config.lastRun = new Date().toISOString().slice(0, 10);
    saveDailyReportConfig(config);
  }
  console.log(`[DAILY-REPORT] posted to ${config.roomId}${test ? ' (test)' : ''}`);
  return { ok: true };
}

// 管理端：获取/配置日报
app.get('/api/admin/daily-report', verifyToken, (req, res) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: '仅管理员' });
  const config = getDailyReportConfig();
  res.json({ ...config, roomName: rooms.get(config.roomId)?.name || null });
});

app.post('/api/admin/daily-report', verifyToken, async (req, res) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: '仅管理员' });
  const { enabled, roomId, hour, minute, city, test } = req.body || {};
  const config = getDailyReportConfig();
  if (typeof enabled === 'boolean') config.enabled = enabled;
  if (roomId) config.roomId = roomId;
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) config.hour = hour;
  if (Number.isInteger(minute) && minute >= 0 && minute <= 59) config.minute = minute;
  if (city) config.city = String(city).slice(0, 20);
  // 启用时房间不存在 → 自动创建「AI 日报」频道
  if (config.enabled && !rooms.get(config.roomId)) {
    const room = {
      id: uuidv4(), name: 'AI 日报', type: 'channel',
      owner: 'admin', admins: ['admin'], members: ['admin'],
      description: '每天一份 AI 生成的新鲜日报', messages: [], threads: [],
      createdBy: 'admin', createdAt: new Date()
    };
    rooms.set(room.id, room);
    rooms.save();
    io.emit('roomCreated', room);
    config.roomId = room.id;
  }
  saveDailyReportConfig(config);
  if (test) {
    const result = await generateDailyReportPost(true);
    return res.json({ ...config, roomName: rooms.get(config.roomId)?.name || null, testResult: result });
  }
  res.json({ ...config, roomName: rooms.get(config.roomId)?.name || null });
});

// 日报调度：每分钟检查是否到点
setInterval(async () => {
  try {
    const config = getDailyReportConfig();
    if (!config.enabled || !config.roomId) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (config.lastRun === today) return;
    if (now.getHours() === config.hour && now.getMinutes() === config.minute) {
      await generateDailyReportPost(false);
    }
  } catch (e) { console.error('[DAILY-REPORT] scheduler error:', e.message); }
}, 60 * 1000).unref();

// ========== FCM 推送（Firebase Cloud Messaging v1） ==========
// .env 配置：FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY（service account）
// 可选 FCM_PROXY=http://127.0.0.1:7897：Google 域名直连超时时走本地代理
// 未配置时推送静默跳过，不影响其他功能
const querystring = require('querystring');
let fcmAccessToken = { token: null, expiresAt: 0 };

let fcmHttpAgent = null;
try {
  const fcmProxy = process.env.FCM_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (fcmProxy) {
    fcmHttpAgent = new (require('https-proxy-agent'))(fcmProxy);
    console.log('[FCM] using proxy:', fcmProxy);
  }
} catch (e) { console.warn('[FCM] proxy agent init failed, direct connection:', e.message); }

function getFcmPrivateKey() {
  const raw = process.env.FCM_PRIVATE_KEY || '';
  // 支持 \n 转义（.env 单行写法）
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function buildFcmJwt() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(getFcmPrivateKey(), 'base64url');
  return `${unsigned}.${signature}`;
}

function getFcmAccessToken() {
  return new Promise((resolve, reject) => {
    if (!process.env.FCM_PROJECT_ID || !process.env.FCM_CLIENT_EMAIL || !getFcmPrivateKey()) {
      return reject(new Error('FCM 未配置'));
    }
    if (fcmAccessToken.token && Date.now() < fcmAccessToken.expiresAt - 60000) {
      return resolve(fcmAccessToken.token);
    }
    const postData = querystring.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildFcmJwt()
    });
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 8000,
      agent: fcmHttpAgent || undefined
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.access_token) return reject(new Error('token 响应异常'));
          fcmAccessToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
          resolve(json.access_token);
        } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('token 超时')); });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sendFcmPush(token, title, body, data = {}) {
  return new Promise(async (resolve) => {
    try {
      const accessToken = await getFcmAccessToken();
      const message = {
        message: {
          token,
          notification: { title: title.substring(0, 60), body: (body || '').substring(0, 120) },
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          android: { priority: 'high' }
        }
      };
      const postData = JSON.stringify(message);
      const req = https.request({
        hostname: 'fcm.googleapis.com',
        path: `/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000,
        agent: fcmHttpAgent || undefined
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) return resolve({ ok: true });
          // 无效 token（已卸载/过期）→ 移除
          if (res.statusCode === 404 || res.statusCode === 400) {
            removePushToken(token);
          }
          resolve({ ok: false, status: res.statusCode });
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
      req.on('error', () => resolve({ ok: false }));
      req.write(postData);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function removePushToken(token) {
  pushTokens.forEach((tokens, username) => {
    const filtered = tokens.filter(t => t !== token);
    if (filtered.length !== tokens.length) {
      if (filtered.length === 0) pushTokens.delete(username);
      else pushTokens.set(username, filtered);
    }
  });
}

// 给一批用户推送（只推离线且有 token 的）
const pushRateLimit = new Map(); // `${username}:${roomId}` -> last push ts（群聊限频 5 分钟）
async function pushToUsers(usernames, title, body, data, rateLimitKey = null) {
  for (const username of new Set(usernames)) {
    try {
      const userObj = users.get(username);
      if (!userObj) continue;
      // 在线用户不推送
      if ((userConnectionCount.get(userObj.id) || 0) > 0) continue;
      const tokens = pushTokens.get(username);
      if (!tokens || tokens.length === 0) continue;
      if (rateLimitKey) {
        const key = `${username}:${rateLimitKey}`;
        const last = pushRateLimit.get(key) || 0;
        if (Date.now() - last < 5 * 60 * 1000) continue;
        pushRateLimit.set(key, Date.now());
      }
      for (const token of tokens.slice(0, 3)) {
        await sendFcmPush(token, title, body, data);
      }
    } catch (e) { /* 单个用户失败不影响其他 */ }
  }
}

// sendMessage 钩子：通知离线成员
function notifyOfflineMembers(room, message, senderUsername) {
  if (room.type === 'treehole') return; // 树洞房不推送（匿名保护）
  const isDM = room.type === 'group' && (room.members || []).length === 2;
  const preview = message.type === 'text' && message.content
    ? message.content
    : `[${({ image: '图片', video: '视频', audio: '语音', file: '文件', redPacket: '红包' })[message.type] || '新消息'}]`;
  const title = isDM ? senderUsername : `${senderUsername} · ${room.name}`;
  // 私聊：对方离线立即推；群聊：离线成员限频推送
  if (isDM) {
    const other = room.members.find(m => m !== senderUsername);
    if (other) pushToUsers([other], title, preview, { roomId: room.id, roomName: room.name });
  } else {
    const recipients = (room.members || []).filter(m => m !== senderUsername);
    pushToUsers(recipients, title, preview, { roomId: room.id, roomName: room.name }, room.id);
  }
}

// 设备 token 注册
app.post('/api/push/register', verifyToken, (req, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string' || token.length > 512) {
    return res.status(400).json({ error: '无效的 token' });
  }
  const tokens = pushTokens.get(req.user.username) || [];
  if (!tokens.includes(token)) {
    tokens.push(token);
  }
  // 每用户最多保留 5 台设备
  pushTokens.set(req.user.username, tokens.slice(-5));
  pushTokens.save();
  res.json({ success: true });
});

app.post('/api/push/unregister', verifyToken, (req, res) => {
  const { token } = req.body || {};
  if (token) {
    const tokens = (pushTokens.get(req.user.username) || []).filter(t => t !== token);
    if (tokens.length === 0) pushTokens.delete(req.user.username);
    else pushTokens.set(req.user.username, tokens);
    pushTokens.save();
  }
  res.json({ success: true });
});

// 管理端推送测试
app.post('/api/push/test', verifyToken, async (req, res) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: '仅管理员' });
  const result = await sendFcmPush(String(req.body?.token || ''), '测试推送', '如果你看到这条通知，说明 FCM 配置成功！', { test: '1' });
  res.json(result);
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

// 2.2 地图 POI 搜索 + 静态地图 (高德地图 AMap)
const AMAP_KEY = process.env.AMAP_KEY || '';

app.get('/api/map/poi', verifyToken, (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: '请输入搜索关键词' });
  if (!AMAP_KEY) return res.status(500).json({ error: 'AMAP_KEY 未配置' });

  const url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(keyword)}&key=${AMAP_KEY}&offset=15`;
  const mapReq = https.get(url, { timeout: 8000 }, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status !== '1') return res.json({ pois: [] });
        const pois = (json.pois || []).map(p => ({
          name: p.name,
          fullName: p.address || p.name,
          lat: parseFloat(p.location?.split(',')[1] || 0),
          lng: parseFloat(p.location?.split(',')[0] || 0),
          type: p.type || '', category: p.typecode || ''
        }));
        res.json({ pois });
      } catch { res.json({ pois: [] }); }
    });
  });
  mapReq.on('timeout', () => { mapReq.destroy(); res.status(500).json({ error: '地图搜索超时' }); });
  mapReq.on('error', () => res.json({ pois: [] }));
});

// 高德静态地图 (无需 Key 的 HTML iframe，使用高德 JS API)
app.get('/api/map/static', (req, res) => {
  const { lat, lng, zoom } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: '缺少坐标' });
  const z = zoom || 15;
  const akScript = AMAP_KEY ? `<script src="https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}"></script>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0}html,body{width:100%;height:100%}#map{width:100%;height:100%}</style>
${akScript}</head><body><div id="map"></div>
<script>
var m = new AMap.Map('map', { center: [${lng},${lat}], zoom: ${z}, resizeEnable: true });
var marker = new AMap.Marker({ position: [${lng},${lat}] });
m.add(marker);
m.setFitView(null, false, [60, 60, 60, 60]);
</script></body></html>`;
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

// ========== 谁是卧底 ==========
const undercoverGames = new Map(); // roomId -> { phase: lobby|speaking|voting|ended, players, votes, wordPair, round, host, startedAt }

const UNDERCOVER_WORDS = [
  ['苹果', '梨'], ['可乐', '雪碧'], ['奶茶', '咖啡'], ['火锅', '麻辣烫'], ['饺子', '馄饨'],
  ['蚊子', '苍蝇'], ['口红', '唇膏'], ['洗发水', '沐浴露'], ['牙刷', '牙膏'], ['雨伞', '雨衣'],
  ['地铁', '公交车'], ['飞机', '高铁'], ['出租车', '网约车'], ['自行车', '电动车'], ['红绿灯', '斑马线'],
  ['微信', 'QQ'], ['淘宝', '拼多多'], ['抖音', '快手'], ['微博', '朋友圈'], ['B站', '爱奇艺'],
  ['篮球', '排球'], ['足球', '橄榄球'], ['乒乓球', '羽毛球'], ['跑步', '跳绳'], ['游泳', '潜水'],
  ['医生', '护士'], ['老师', '教授'], ['警察', '保安'], ['厨师', '服务员'], ['演员', '明星'],
  ['太阳', '月亮'], ['星星', '萤火虫'], ['彩虹', '极光'], ['地震', '海啸'], ['晴天', '阴天'],
  ['猫', '老虎'], ['狗', '狼'], ['仓鼠', '兔子'], ['企鹅', '北极熊'], ['鲨鱼', '鲸鱼'],
  ['玫瑰', '月季'], ['荷花', '睡莲'], ['仙人掌', '多肉'], ['柳树', '杨树'], ['竹子', '芦苇'],
  ['筷子', '勺子'], ['碗', '盘子'], ['杯子', '瓶子'], ['沙发', '躺椅'], ['床', '榻榻米'],
  ['手机', '平板'], ['电脑', '笔记本'], ['键盘', '钢琴'], ['耳机', '音箱'], ['相机', '摄像机'],
  ['镜子', '玻璃'], ['钻石', '水晶'], ['黄金', '黄铜'], ['丝绸', '棉布'], ['皮鞋', '运动鞋'],
  ['口红', '腮红'], ['香水', '花露水'], ['面膜', '面霜'], ['发卡', '发箍'], ['戒指', '耳环']
];

function getUndercoverStateFor(game, username) {
  const me = game.players.find(p => p.username === username);
  return {
    roomId: game.roomId,
    phase: game.phase,
    round: game.round,
    host: game.host,
    players: game.players.map(p => ({
      username: p.username,
      avatar: p.avatar,
      alive: p.alive,
      voted: !!game.votes[p.username],
      isSpy: game.phase === 'ended' ? p.isSpy : undefined
    })),
    votes: game.phase === 'ended' ? game.votes : {},
    myWord: me ? me.word : null,
    amIAlive: me ? me.alive : false,
    amIInGame: !!me,
    wordPair: game.phase === 'ended' ? game.wordPair : null,
    winner: game.winner || null,
    startedAt: game.startedAt
  };
}

function sendUndercoverState(roomId, socket) {
  const game = undercoverGames.get(roomId);
  if (!game) {
    socket.emit('undercover:state', { roomId, phase: 'none' });
    return;
  }
  socket.emit('undercover:state', getUndercoverStateFor(game, socket.username));
}

function broadcastUndercoverState(roomId) {
  const game = undercoverGames.get(roomId);
  if (!game) return;
  // 每个玩家拿到的状态不同（只有自己知道自己的词），逐 socket 下发
  const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
  if (!socketsInRoom) return;
  for (const socketId of socketsInRoom) {
    const s = io.sockets.sockets.get(socketId);
    if (s && s.username) sendUndercoverState(roomId, s);
  }
}

// 游戏事件以系统消息形式进房间留痕
function pushUndercoverEvent(roomId, text) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = {
    id: uuidv4(), type: 'undercoverEvent', content: text,
    sender: { id: 'undercover-host', username: '谁是卧底', avatar: null },
    roomId, timestamp: new Date(), readBy: [], isBot: true
  };
  room.messages.push(msg);
  if (room.messages.length > 3000) room.messages = room.messages.slice(-3000);
  rooms.set(roomId, room);
  io.to(roomId).emit('newMessage', msg);
}

function startUndercoverGame(roomId) {
  const game = undercoverGames.get(roomId);
  if (!game) return;
  const pair = UNDERCOVER_WORDS[Math.floor(Math.random() * UNDERCOVER_WORDS.length)];
  const [civilianWord, spyWord] = pair;
  // 洗牌决定卧底（4人以下1卧底，5人以上2卧底）
  const indices = game.players.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const spyCount = game.players.length >= 5 ? 2 : 1;
  const spyIdx = new Set(indices.slice(0, spyCount));
  game.players.forEach((p, i) => {
    p.isSpy = spyIdx.has(i);
    p.word = p.isSpy ? spyWord : civilianWord;
    p.alive = true;
  });
  game.wordPair = pair;
  game.votes = {};
  game.round = 1;
  game.phase = 'speaking';
  game.startedAt = new Date();
  pushUndercoverEvent(roomId, `游戏开始！共 ${game.players.length} 人，卧底 ${spyCount} 名。每人一句话描述自己的词，然后进入投票（直接在聊天区发言描述）`);
  broadcastUndercoverState(roomId);
}

function settleUndercoverVote(roomId) {
  const game = undercoverGames.get(roomId);
  if (!game || game.phase !== 'voting') return;
  // 统计票数
  const tally = {};
  Object.values(game.votes).forEach(target => { tally[target] = (tally[target] || 0) + 1; });
  let maxVotes = 0;
  Object.values(tally).forEach(v => { maxVotes = Math.max(maxVotes, v); });
  const top = Object.keys(tally).filter(u => tally[u] === maxVotes);
  if (top.length > 1) {
    // 平票：无人出局，直接下一轮
    pushUndercoverEvent(roomId, `投票平票（${top.map(u => `${u} ${maxVotes}票`).join(' / ')}），无人出局，进入第 ${game.round + 1} 轮`);
    game.round += 1;
    game.votes = {};
    game.phase = 'speaking';
    broadcastUndercoverState(roomId);
    return;
  }
  const outUsername = top[0];
  const outPlayer = game.players.find(p => p.username === outUsername);
  outPlayer.alive = false;
  pushUndercoverEvent(roomId, `${outUsername} 被投出局（${maxVotes}票），${outPlayer.isSpy ? '他是卧底！' : '他是平民…'}`);
  if (checkUndercoverEnd(roomId)) return;
  game.round += 1;
  game.votes = {};
  game.phase = 'speaking';
  broadcastUndercoverState(roomId);
}

function checkUndercoverEnd(roomId) {
  const game = undercoverGames.get(roomId);
  if (!game || (game.phase !== 'speaking' && game.phase !== 'voting')) return false;
  const alive = game.players.filter(p => p.alive);
  const aliveSpies = alive.filter(p => p.isSpy);
  const spiesTotal = game.players.filter(p => p.isSpy).length;
  let winner = null;
  if (aliveSpies.length === 0) winner = 'civilian';
  else if (alive.length <= 2 + (spiesTotal - 1)) winner = 'spy'; // 卧底存活到只剩 2 人（1卧底）即胜
  if (!winner) return false;
  game.phase = 'ended';
  game.winner = winner;
  const spyNames = game.players.filter(p => p.isSpy).map(p => p.username).join('、');
  const wordText = `平民词「${game.wordPair[0]}」/ 卧底词「${game.wordPair[1]}」`;
  pushUndercoverEvent(roomId, winner === 'civilian'
    ? `游戏结束！平民获胜，卧底 ${spyNames} 全部出局。${wordText}`
    : `游戏结束！卧底 ${spyNames} 获胜。${wordText}`);
  broadcastUndercoverState(roomId);
  return true;
}

// 房主（第一个加入者）发起游戏报名
function ensureUndercoverLobby(roomId, username) {
  if (undercoverGames.has(roomId)) return undercoverGames.get(roomId);
  const game = {
    roomId,
    phase: 'lobby',
    host: username,
    players: [],
    votes: {},
    wordPair: null,
    round: 0,
    winner: null,
    startedAt: null
  };
  undercoverGames.set(roomId, game);
  return game;
}

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
  callSelectedAIModel(messages, 'glm-4-flash').then(result => {
    if (result.ok) reply(`🤖 ${result.reply}`);
    else reply(`🤖 你好！我是 ${bot.name}，主人暂时不在，我来陪你聊天~`);
  });
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

// ========== AI 数字分身 ==========
const twinProfiles = new Map(); // username -> { enabled, personality, styleAnalysis, createdAt, updatedAt }

app.get('/api/ai/twin/config', verifyToken, (req, res) => {
  const config = twinProfiles.get(req.user.username) || { enabled: false, personality: 'default', styleAnalysis: null };
  res.json(config);
});

app.post('/api/ai/twin/config', verifyToken, (req, res) => {
  const { enabled, personality, autoReply } = req.body || {};
  const existing = twinProfiles.get(req.user.username) || { enabled: false, personality: 'default', styleAnalysis: null, autoReply: false };
  const config = {
    ...existing,
    enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
    personality: personality || existing.personality,
    autoReply: typeof autoReply === 'boolean' ? autoReply : (existing.autoReply || false),
    updatedAt: new Date()
  };
  twinProfiles.set(req.user.username, config);
  res.json(config);
});

// ========== 赛博遗产：离线 AI 代聊 ==========
const twinAutoReplyAt = new Map(); // roomId -> 上次代聊时间戳（限频 5 分钟）

function triggerTwinAutoReply(username, roomId, triggerMessage) {
  const config = twinProfiles.get(username);
  if (!config || !config.enabled || !config.autoReply) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const userObj = users.get(username);
  const recentMessages = [];
  room.messages.slice(-30).forEach(msg => {
    if (msg.type === 'text' && msg.content && !msg.recalled) {
      recentMessages.push(`${msg.sender?.username || '匿名'}: ${msg.content}`);
    }
  });
  const personalityMap = {
    default: '你是一个普通人，用自然随意的方式聊天',
    formal: '你说话正式得体，像职场精英',
    humorous: '你风趣幽默，喜欢开玩笑和用梗',
    warm: '你温暖友善，关心他人，回复体贴',
    cool: '你话少但精准，高冷风格',
    enthusiastic: '你热情洋溢，充满正能量'
  };
  const styleHint = config.styleAnalysis
    ? `\n用户的说话风格：${config.styleAnalysis.style || ''}，语气：${config.styleAnalysis.tone || '自然'}，常用口头禅：${(config.styleAnalysis.catchphrases || []).join('、')}`
    : '';
  const messages = [
    { role: 'system', content: `你是 ${username} 的数字分身（赛博遗产模式）。主人现在离线，你代替主人回复私聊消息。${personalityMap[config.personality] || personalityMap.default}。${styleHint}\n规则：1. 不要暴露自己是AI 2. 回复要简短自然 3. 不要用markdown 4. 像真人聊天一样 5. 如果对方问的事情你不确定，自然地带过` },
    { role: 'user', content: recentMessages.length > 0 ? `最近的聊天记录：\n${recentMessages.join('\n')}\n\n有人对你说：${triggerMessage}\n请以主人的身份回复：` : `有人对你说：${triggerMessage}\n请以主人的身份回复：` }
  ];
  callSelectedAIModel(messages, 'glm-4-flash').then(result => {
    if (!result.ok || !result.reply) return;
    const replyRoom = rooms.get(roomId);
    if (!replyRoom) return;
    const msg = {
      id: uuidv4(), type: 'text', content: result.reply.trim(),
      sender: { id: userObj?.id || username, username, avatar: userObj?.avatar },
      roomId, timestamp: new Date(), readBy: [], isTwin: true
    };
    replyRoom.messages.push(msg);
    rooms.set(roomId, replyRoom);
    io.to(roomId).emit('newMessage', msg);
    console.log(`[TWIN] 赛博遗产代聊: ${username} -> ${roomId}`);
  }).catch(e => console.error('Twin auto-reply error:', e.message));
}

app.post('/api/ai/twin/analyze', verifyToken, async (req, res) => {
  const username = req.user.username;
  const userMessages = [];
  rooms.forEach(room => {
    if (!room.messages) return;
    room.messages.forEach(msg => {
      if (msg.sender?.username === username && msg.type === 'text' && msg.content && !msg.recalled) {
        userMessages.push(msg.content);
      }
    });
  });
  if (userMessages.length < 5) {
    return res.json({ analysis: null, message: '消息数量不足（至少需要5条），无法分析说话风格' });
  }
  const recentMessages = userMessages.slice(-100);
  const messages = [
    { role: 'system', content: '你是一个语言风格分析师。分析以下用户的消息，提取其说话风格特征。输出JSON格式：{"style":"风格描述(一句话)","traits":["特征1","特征2","特征3"],"tone":"语气(如：轻松/正式/幽默)","catchphrases":["常用口头禅"],"emojiUsage":"表情使用习惯(如：喜欢/偶尔/不用)","avgLength":"平均句子长度(如：短句/中等/长句)"}。只输出JSON，不要其他内容。' },
    { role: 'user', content: `以下是用户 ${username} 的近期消息：\n${recentMessages.join('\n')}` }
  ];
  try {
    const result = await callSelectedAIModel(messages, 'glm-4-flash');
    if (!result.ok) return res.status(500).json({ error: result.error });
    let analysis;
    try {
      const match = result.reply.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(match ? match[0] : result.reply);
    } catch { analysis = { style: result.reply.slice(0, 200), traits: [], tone: '自然', catchphrases: [], emojiUsage: '未知', avgLength: '未知' }; }
    const config = twinProfiles.get(username) || { enabled: false, personality: 'default' };
    config.styleAnalysis = analysis;
    config.analyzedAt = new Date();
    config.sampleCount = recentMessages.length;
    twinProfiles.set(username, config);
    res.json({ analysis, sampleCount: recentMessages.length });
  } catch (err) {
    res.status(500).json({ error: '分析失败: ' + err.message });
  }
});

app.post('/api/ai/twin/reply', verifyToken, async (req, res) => {
  const { roomId, triggerMessage } = req.body || {};
  if (!triggerMessage) return res.status(400).json({ error: '缺少触发消息' });
  const username = req.user.username;
  let config = twinProfiles.get(username);
  if (!config || !config.enabled) {
    // 自动启用分身
    config = config || { personality: 'default', styleAnalysis: null };
    config.enabled = true;
    config.updatedAt = new Date();
    twinProfiles.set(username, config);
  }
  const recentMessages = [];
  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      room.messages.slice(-30).forEach(msg => {
        if (msg.type === 'text' && msg.content && !msg.recalled) {
          recentMessages.push(`${msg.sender?.username || '匿名'}: ${msg.content}`);
        }
      });
    }
  }
  const personalityMap = {
    default: '你是一个普通人，用自然随意的方式聊天',
    formal: '你说话正式得体，像职场精英',
    humorous: '你风趣幽默，喜欢开玩笑和用梗',
    warm: '你温暖友善，关心他人，回复体贴',
    cool: '你话少但精准，高冷风格',
    enthusiastic: '你热情洋溢，充满正能量'
  };
  const styleHint = config.styleAnalysis
    ? `\n用户的说话风格：${config.styleAnalysis.style || ''}，语气：${config.styleAnalysis.tone || '自然'}，常用口头禅：${(config.styleAnalysis.catchphrases || []).join('、')}，表情习惯：${config.styleAnalysis.emojiUsage || '偶尔'}`
    : '';
  const messages = [
    { role: 'system', content: `你是 ${username} 的数字分身。${personalityMap[config.personality] || personalityMap.default}。你要模仿主人的说话方式来回复消息。${styleHint}\n规则：1. 不要暴露自己是AI 2. 回复要简短自然 3. 不要用markdown 4. 像真人聊天一样` },
    { role: 'user', content: recentMessages.length > 0 ? `最近的聊天记录：\n${recentMessages.join('\n')}\n\n有人对你说：${triggerMessage}\n请以主人的身份回复：` : `有人对你说：${triggerMessage}\n请以主人的身份回复：` }
  ];
  try {
    const result = await callSelectedAIModel(messages, 'glm-4-flash');
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json({ reply: result.reply.trim(), isTwin: true });
  } catch (err) {
    res.status(500).json({ error: '分身回复失败: ' + err.message });
  }
});

// ========== 实时翻译频道 ==========
const autoTranslateSettings = new Map(); // roomId -> { enabled, targetLang }

app.post('/api/ai/auto-translate/toggle', verifyToken, (req, res) => {
  const { roomId, enabled, targetLang } = req.body || {};
  if (!roomId) return res.status(400).json({ error: '缺少房间ID' });
  const room = rooms.get(roomId);
  if (!room || !isRoomMember(room, req.user.username)) {
    return res.status(403).json({ error: '无权操作此房间' });
  }
  const setting = autoTranslateSettings.get(roomId) || { enabled: false, targetLang: 'en' };
  setting.enabled = typeof enabled === 'boolean' ? enabled : !setting.enabled;
  if (targetLang) setting.targetLang = targetLang;
  autoTranslateSettings.set(roomId, setting);
  res.json(setting);
});

app.get('/api/ai/auto-translate/:roomId', verifyToken, (req, res) => {
  const setting = autoTranslateSettings.get(req.params.roomId) || { enabled: false, targetLang: 'en' };
  res.json(setting);
});

app.post('/api/ai/auto-translate/translate', verifyToken, async (req, res) => {
  const { text, targetLang } = req.body || {};
  if (!text) return res.status(400).json({ error: '缺少翻译文本' });
  const langNames = { en: 'English', ja: '日本語', ko: '한국어', zh: '中文', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };
  const messages = [
    { role: 'system', content: `你是专业翻译。将用户消息翻译成${langNames[targetLang] || targetLang}。只输出翻译结果，不加解释。保持原文的语气和情感。如果已经是目标语言则输出原文。` },
    { role: 'user', content: text }
  ];
  try {
    const result = await callSelectedAIModel(messages, 'glm-4-flash');
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json({ translated: result.reply.trim(), from: 'auto', to: targetLang });
  } catch (err) {
    res.status(500).json({ error: '翻译失败: ' + err.message });
  }
});

// ========== AI 情报站 ==========
const intelligenceProfiles = new Map(); // username -> { interests[], keywords[], lastFetchAt }

const INTELLIGENCE_SOURCES = {
  tech: { name: '科技', api: 'https://tenapi.cn/v2/toutiaohot', api2: 'https://api.vvhan.com/api/hotlist/wbHot' },
  finance: { name: '财经', api: 'https://api.vvhan.com/api/hotlist/wbHot' },
  hot: { name: '热搜', api: 'https://api.vvhan.com/api/hotlist/wbHot' },
  world: { name: '国际', api: 'https://api.vvhan.com/api/hotlist/wbHot' },
  science: { name: '科学', api: 'https://api.vvhan.com/api/hotlist/wbHot' },
  sports: { name: '体育', api: 'https://api.vvhan.com/api/hotlist/wbHot' },
  entertainment: { name: '娱乐', api: 'https://api.vvhan.com/api/hotlist/wbHot' }
};

// 多源实时新闻抓取
const fetchRealtimeNews = async () => {
  const fetchUrl = (url, headers = {}) => new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...headers } }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });

  const allStories = [];

  // 1. 微博热搜 (codelife.cc - 稳定可用)
  try {
    const weiboData = await fetchUrl('https://api.codelife.cc/api/top/list?lang=cn&id=KqndgxeLl9');
    if (weiboData?.code === 200 && weiboData.data) {
      weiboData.data.forEach((item, i) => {
        allStories.push({
          id: `weibo_${i}_${Date.now()}`,
          title: item.title || '',
          url: item.link || '',
          source: '微博热搜',
          category: 'hot',
          heat: item.hotValue || ''
        });
      });
    }
  } catch {}

  // 2. 头条热榜 (toutiao.com - 直接可用)
  try {
    const ttData = await fetchUrl('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc');
    if (ttData?.data) {
      ttData.data.slice(0, 30).forEach((item, i) => {
        allStories.push({
          id: `toutiao_${i}_${Date.now()}`,
          title: item.Title || '',
          url: item.Url || '',
          source: '头条热榜',
          category: 'hot',
          heat: item.HotValue || ''
        });
      });
    }
  } catch {}

  // 3. 知乎热榜 (知乎 API 直接获取)
  try {
    const zhihuData = await fetchUrl('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=30', { 'Referer': 'https://www.zhihu.com/' });
    if (zhihuData?.data) {
      zhihuData.data.slice(0, 30).forEach((item, i) => {
        const target = item.target || {};
        allStories.push({
          id: `zhihu_${i}_${Date.now()}`,
          title: target.title || '',
          url: `https://www.zhihu.com/question/${target.id || ''}`,
          source: '知乎热榜',
          category: 'hot',
          heat: item.detail_text || ''
        });
      });
    }
  } catch {}

  return allStories.filter(s => s.title);
};

app.get('/api/ai/intelligence/interests', verifyToken, (req, res) => {
  const profile = intelligenceProfiles.get(req.user.username) || { interests: ['hot'], keywords: [], lastFetchAt: null };
  res.json(profile);
});

app.post('/api/ai/intelligence/interests', verifyToken, (req, res) => {
  const { interests, keywords } = req.body || {};
  const existing = intelligenceProfiles.get(req.user.username) || { interests: ['hot'], keywords: [], lastFetchAt: null };
  if (Array.isArray(interests)) existing.interests = interests;
  if (Array.isArray(keywords)) existing.keywords = keywords;
  intelligenceProfiles.set(req.user.username, existing);
  res.json(existing);
});

app.post('/api/ai/intelligence/fetch', verifyToken, async (req, res) => {
  const username = req.user.username;
  const profile = intelligenceProfiles.get(username) || { interests: ['hot'], keywords: [], lastFetchAt: null };
  const categories = profile.interests.length > 0 ? profile.interests : ['hot'];

  const allStories = await fetchRealtimeNews();
  if (allStories.length === 0) return res.status(500).json({ error: '获取实时新闻失败' });

  const categoryMap = { hot: 'hot', tech: 'tech', finance: 'finance', world: 'world', science: 'science', sports: 'sports', entertainment: 'entertainment' };
  const keywordFilters = {
    tech: /科技|AI|人工智能|手机|苹果|谷歌|微软|芯片|算法|编程|开发|互联网|数码|5G|机器人/i,
    finance: /股票|基金|投资|经济|金融|市场|央行|GDP|贸易|房价|银行|A股|比特币/i,
    world: /美国|欧洲|日本|韩国|俄罗斯|联合国|外交|贸易|国际|中东|战争|峰会/i,
    science: /科学|研究|太空|量子|基因|物理|天文|生物|实验|NASA|论文/i,
    sports: /体育|足球|篮球|奥运|世界杯|NBA|欧冠|比赛|赛事|运动员|冠军/i,
    entertainment: /电影|音乐|明星|综艺|剧|演唱会|娱乐|热搜|微博|抖音|网红/i
  };

  const filtered = allStories.filter(s => {
    return categories.some(cat => {
      if (cat === 'hot') return true;
      const filter = keywordFilters[cat];
      return filter && filter.test(s.title);
    });
  });

  const stories = (filtered.length > 0 ? filtered : allStories).slice(0, 20);
  const newsText = stories.map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.heat ? ' (热度:' + s.heat + ')' : ''}`).join('\n');
  const keywordHint = profile.keywords.length > 0 ? `\n用户特别关注的关键词：${profile.keywords.join('、')}` : '';

  const messages = [
    { role: 'system', content: `你是AI情报分析师。根据今日实时热搜为用户生成个性化情报简报。要求：1. 分为"必看""关注""了解"三个优先级 2. 每条用一句话概括 3. 末尾给出今日洞察 4. 语气简洁专业${keywordHint}` },
    { role: 'user', content: `今日实时热搜（来源：微博/知乎/抖音/百度）：\n${newsText}\n\n请生成个性化情报简报：` }
  ];

  try {
    const result = await callSelectedAIModel(messages, 'glm-4-flash');
    if (!result.ok) return res.status(500).json({ error: result.error });
    profile.lastFetchAt = new Date();
    intelligenceProfiles.set(username, profile);
    res.json({
      digest: result.reply.trim(),
      stories: stories.map(s => ({ id: s.id, title: s.title, image: s.image, url: s.url, source: s.source, category: s.category, heat: s.heat })),
      fetchedAt: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: '情报生成失败: ' + err.message });
  }
});

// ========== Phase 2: 端到端加密 + 关系图谱 ==========

// --- E2E 加密：密钥交换 ---
const e2eKeys = new Map(); // username -> { publicKey, encryptedPrivateKey, updatedAt }

app.post('/api/e2e/keys', verifyToken, (req, res) => {
  const { publicKey } = req.body || {};
  if (!publicKey) return res.status(400).json({ error: '缺少公钥' });
  e2eKeys.set(req.user.username, { publicKey, updatedAt: new Date() });
  res.json({ success: true });
});

app.get('/api/e2e/keys/:username', verifyToken, (req, res) => {
  const key = e2eKeys.get(req.params.username);
  if (!key) return res.status(404).json({ error: '用户未注册加密密钥' });
  res.json({ publicKey: key.publicKey, username: req.params.username });
});

app.get('/api/e2e/keys-batch', verifyToken, (req, res) => {
  const { usernames } = req.query;
  if (!usernames) return res.json({});
  const names = usernames.split(',');
  const result = {};
  names.forEach(n => {
    const k = e2eKeys.get(n);
    if (k) result[n] = k.publicKey;
  });
  res.json(result);
});

// E2E 加密消息存储
const e2eMessages = new Map(); // chatId -> [{ sender, content, timestamp }]

app.get('/api/e2e/messages/:chatId', verifyToken, (req, res) => {
  const msgs = e2eMessages.get(req.params.chatId) || [];
  res.json({ messages: msgs.slice(-100) });
});

app.post('/api/e2e/messages', verifyToken, (req, res) => {
  const { chatId, content, recipient } = req.body || {};
  if (!chatId || !content) return res.status(400).json({ error: '参数缺失' });
  if (!e2eMessages.has(chatId)) e2eMessages.set(chatId, []);
  const msg = { sender: req.user.username, content, timestamp: new Date() };
  e2eMessages.get(chatId).push(msg);
  if (e2eMessages.get(chatId).length > 500) {
    e2eMessages.set(chatId, e2eMessages.get(chatId).slice(-500));
  }
  // 通过 socket 推送给接收者
  const recipientUser = Array.from(onlineUsers.values()).find(u => u.username === recipient);
  if (recipientUser) {
    const recipientSocket = userSockets.get(recipientUser.id);
    if (recipientSocket) {
      recipientSocket.emit('e2eMessage', { ...msg, chatId });
    }
  }
  res.json({ success: true });
});

// --- 关系图谱 ---
app.post('/api/ai/social-graph', verifyToken, async (req, res) => {
  const username = req.user.username;
  const interactions = {}; // user -> { count, rooms, topics }

  rooms.forEach(room => {
    if (!room.messages) return;
    const myMsgs = room.messages.filter(m => m.sender?.username === username && m.type === 'text' && !m.recalled);
    const otherMsgs = room.messages.filter(m => m.sender?.username !== username && m.type === 'text' && !m.recalled);

    otherMsgs.forEach(msg => {
      const other = msg.sender?.username;
      if (!other) return;
      if (!interactions[other]) interactions[other] = { count: 0, rooms: new Set(), msgs: [] };
      interactions[other].count++;
      interactions[other].rooms.add(room.name);
      interactions[other].msgs.push(msg.content);
    });

    myMsgs.forEach(msg => {
      const replyTo = msg.replyTo;
      if (replyTo) {
        const orig = room.messages.find(m => m.id === replyTo);
        if (orig && orig.sender?.username !== username) {
          const other = orig.sender?.username;
          if (!interactions[other]) interactions[other] = { count: 0, rooms: new Set(), msgs: [] };
          interactions[other].count += 2;
        }
      }
    });
  });

  const nodes = [{ id: username, label: username, self: true, size: 30 }];
  const edges = [];
  const maxCount = Math.max(...Object.values(interactions).map(i => i.count), 1);

  Object.entries(interactions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30)
    .forEach(([user, data]) => {
      const strength = data.count / maxCount;
      nodes.push({
        id: user, label: user,
        size: 12 + strength * 18,
        rooms: Array.from(data.rooms),
        messageCount: data.count
      });
      edges.push({
        source: username, target: user,
        weight: strength,
        label: `${data.count} 条消息`
      });
    });

  // AI 生成关系洞察
  const topUsers = Object.entries(interactions)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([u, d]) => `${u}(${d.count}条, ${Array.from(d.rooms).join('/')}群)`)
    .join('、');

  let insight = '';
  if (topUsers) {
    const messages = [
      { role: 'system', content: '你是社交分析专家。根据用户的聊天互动数据，用2-3句话给出社交关系洞察。语气轻松。' },
      { role: 'user', content: `用户 ${username} 的社交数据：互动最多的人：${topUsers}。总互动人数：${Object.keys(interactions).length}。` }
    ];
    try {
      const result = await callSelectedAIModel(messages, 'glm-4-flash');
      if (result.ok) insight = result.reply.trim();
    } catch {}
  }

  res.json({ nodes, edges, insight, totalUsers: Object.keys(interactions).length });
});

// ========== Phase 3: 协作画板 + 语音房 ==========

// --- 协作画板 ---
const whiteboardStates = new Map(); // roomId -> { strokes: [], users: Set }
const canvasCardStates = new Map(); // cardId -> { roomId, points: [], users: Set }
const syncMediaRooms = new Map(); // roomId -> media sync state

// --- 赛博电子宠物 ---
const roomPets = new Map(); // roomId -> { hunger, mood, level, totalInteract }

function getOrCreatePet(roomId) {
  if (!roomPets.has(roomId)) {
    roomPets.set(roomId, { hunger: 60, mood: 60, level: 1, totalInteract: 0 });
  }
  return roomPets.get(roomId);
}

function calcLevel(totalInteract) {
  // 每 30 次互动升一级，缓升曲线
  return Math.floor(Math.sqrt(totalInteract / 10)) + 1;
}

function broadcastPetState(roomId) {
  const pet = roomPets.get(roomId);
  if (pet) io.to(roomId).emit('petState', { roomId, ...pet });
}

// 宠物状态衰减（每 60 秒，缓慢下降）
setInterval(() => {
  roomPets.forEach((pet, roomId) => {
    pet.hunger = Math.max(0, pet.hunger - 1);
    pet.mood = Math.max(0, pet.mood - 1);
    broadcastPetState(roomId);
  });
}, 60000);

function serializeSyncMediaState(roomId) {
  const state = syncMediaRooms.get(roomId);
  if (!state) return { roomId, active: false, serverNow: Date.now() };
  const now = Date.now();
  const elapsed = state.isPlaying ? (now - state.updatedAt) / 1000 : 0;
  return {
    ...state,
    currentTime: Math.max(0, safeNumber(state.currentTime) + elapsed),
    serverNow: now,
    active: true,
  };
}

function emitSyncMediaState(roomId) {
  io.to(roomId).emit('syncMediaState', serializeSyncMediaState(roomId));
}

function ensureCanvasCardState(roomId, cardId) {
  const state = canvasCardStates.get(cardId) || { roomId, points: [], users: new Set() };
  state.roomId = roomId;
  canvasCardStates.set(cardId, state);
  return state;
}

app.post('/api/whiteboard/clear', verifyToken, (req, res) => {
  const { roomId } = req.body || {};
  if (roomId) whiteboardStates.set(roomId, { strokes: [], users: new Set() });
  res.json({ success: true });
});

app.post('/api/whiteboard/ai-beautify', verifyToken, async (req, res) => {
  const { description } = req.body || {};
  if (!description) return res.status(400).json({ error: '缺少描述' });
  const messages = [
    { role: 'system', content: '你是一个创意绘画助手。用户会给你一段描述，你来生成一个SVG矢量图的代码。要求：1. 只输出SVG代码，不要解释 2. 使用简洁的path和基础图形 3. 使用明亮的颜色 4. 宽高400x400 viewBox 5. 风格可爱卡通' },
    { role: 'user', content: description }
  ];
  try {
    const result = await callSelectedAIModel(messages, 'glm-4-flash');
    if (!result.ok) return res.status(500).json({ error: result.error });
    const svgMatch = result.reply.match(/<svg[\s\S]*?<\/svg>/i);
    res.json({ svg: svgMatch ? svgMatch[0] : result.reply.trim() });
  } catch (err) { res.status(500).json({ error: 'AI 美化失败' }); }
});

// --- 语音房 ---
const voiceRooms = new Map(); // roomId -> { host, participants: Map<username, { muted, joinedAt }>, createdAt }

function serializeVoiceParticipants(room) {
  if (!room) return {};
  const entries = [];
  room.participants.forEach((info, username) => {
    const profile = users.get(username) || {};
    entries.push([username, {
      ...info,
      username,
      userId: profile.id || null,
      joinedAt: info.joinedAt
    }]);
  });
  return Object.fromEntries(entries);
}

function emitVoiceParticipantUpdate(roomId) {
  const room = voiceRooms.get(roomId);
  if (!room) return;
  io.to(`voice_${roomId}`).emit('voiceParticipantUpdate', {
    participants: serializeVoiceParticipants(room),
    host: room.host
  });
}

function getVoiceSockets(roomId) {
  const socketIds = io.sockets.adapter.rooms.get(`voice_${roomId}`) || new Set();
  return Array.from(socketIds)
    .map(id => io.sockets.sockets.get(id))
    .filter(s => s && s.userId);
}

function emitToVoicePeer(roomId, toUserId, eventName, payload) {
  const target = getVoiceSockets(roomId).find(s => String(s.userId) === String(toUserId));
  if (target) {
    target.emit(eventName, payload);
    return true;
  }
  const fallback = userSockets.get(toUserId);
  if (fallback) {
    fallback.emit(eventName, payload);
    return true;
  }
  return false;
}

function cleanupVoiceSocket(socket, roomId = socket.voiceRoomId) {
  if (!roomId || !socket.username) return;
  socket.leave(`voice_${roomId}`);
  socket.voiceRoomId = null;

  const room = voiceRooms.get(roomId);
  if (!room) return;
  room.participants.delete(socket.username);
  socket.to(`voice_${roomId}`).emit('voicePeerLeft', {
    roomId,
    userId: socket.userId,
    username: socket.username
  });
  if (room.participants.size === 0) {
    voiceRooms.delete(roomId);
  } else {
    emitVoiceParticipantUpdate(roomId);
  }
}

function joinVoiceSocket(socket, roomId) {
  if (!roomId) return false;
  if (!socket.userId || !socket.username) {
    socket.pendingVoiceRoomId = roomId;
    return false;
  }

  const room = voiceRooms.get(roomId);
  if (!room) {
    socket.emit('voiceError', { error: '语音房不存在' });
    return false;
  }

  if (socket.voiceRoomId && socket.voiceRoomId !== roomId) {
    cleanupVoiceSocket(socket, socket.voiceRoomId);
  }

  room.participants.set(socket.username, room.participants.get(socket.username) || { muted: false, joinedAt: new Date() });
  socket.voiceRoomId = roomId;
  socket.pendingVoiceRoomId = null;
  socket.join(`voice_${roomId}`);

  const peers = getVoiceSockets(roomId)
    .filter(s => s.id !== socket.id)
    .map(s => ({ userId: s.userId, username: s.username }));

  socket.emit('voicePeers', { roomId, peers });
  socket.to(`voice_${roomId}`).emit('voicePeerJoined', {
    roomId,
    userId: socket.userId,
    username: socket.username
  });
  emitVoiceParticipantUpdate(roomId);
  return true;
}

app.post('/api/voice/create', verifyToken, (req, res) => {
  const { roomId } = req.body || {};
  const rid = roomId || `voice_${uuidv4().slice(0, 8)}`;
  if (!voiceRooms.has(rid)) {
    voiceRooms.set(rid, {
      host: req.user.username,
      participants: new Map([[req.user.username, { muted: false, joinedAt: new Date() }]]),
      createdAt: new Date()
    });
  }
  const room = voiceRooms.get(rid);
  res.json({ roomId: rid, host: room.host, participants: serializeVoiceParticipants(room) });
});

app.get('/api/voice/list', verifyToken, (req, res) => {
  const list = [];
  voiceRooms.forEach((room, id) => {
    list.push({ id, host: room.host, participantCount: room.participants.size, participants: serializeVoiceParticipants(room), createdAt: room.createdAt });
  });
  res.json(list);
});

app.post('/api/voice/join', verifyToken, (req, res) => {
  const { roomId } = req.body || {};
  const room = voiceRooms.get(roomId);
  if (!room) return res.status(404).json({ error: '语音房不存在' });
  room.participants.set(req.user.username, { muted: false, joinedAt: new Date() });
  emitVoiceParticipantUpdate(roomId);
  res.json({ roomId, host: room.host, participants: serializeVoiceParticipants(room) });
});

app.post('/api/voice/leave', verifyToken, (req, res) => {
  const { roomId } = req.body || {};
  const room = voiceRooms.get(roomId);
  if (!room) return res.json({ success: true });
  room.participants.delete(req.user.username);
  if (room.participants.size === 0) { voiceRooms.delete(roomId); }
  else emitVoiceParticipantUpdate(roomId);
  res.json({ success: true });
});

app.post('/api/voice/mute', verifyToken, (req, res) => {
  const { roomId, muted } = req.body || {};
  const room = voiceRooms.get(roomId);
  if (!room) return res.status(404).json({ error: '语音房不存在' });
  const p = room.participants.get(req.user.username);
  if (p) p.muted = typeof muted === 'boolean' ? muted : !p.muted;
  emitVoiceParticipantUpdate(roomId);
  res.json({ muted: p?.muted });
});

app.post('/api/voice/kick', verifyToken, (req, res) => {
  const { roomId, username } = req.body || {};
  const room = voiceRooms.get(roomId);
  if (!room || room.host !== req.user.username) return res.status(403).json({ error: '需要房主权限' });
  room.participants.delete(username);
  res.json({ success: true });
});

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
      if (socket.pendingVoiceRoomId) {
        joinVoiceSocket(socket, socket.pendingVoiceRoomId);
      }
      
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
    if (room.type !== 'public' && room.type !== 'channel' && room.type !== 'treehole' && !isRoomMember(room, socket.username)) {
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
    socket.emit('joinedRoom', { roomId, messages: room.messages.slice(-100), threads: serializeThreads(room) });
    socket.emit('syncMediaState', serializeSyncMediaState(roomId));
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
    const { roomId, content, type, fileUrl, filename, fileSize, mimeType, replyTo, mentions, documentSummary } = data;
    const room = rooms.get(roomId);
    if (!room) return;
    // 频道权限：仅频道主和管理员可发言（游客也会收到明确提示）
    if (isChannelRoom(room) && !isChannelAdmin(room, socket.username)) {
      socket.emit('sendError', { error: '仅频道主和管理员可在频道发言' });
      return;
    }
    // 验证发送者是房间成员（树洞房公开，无需成员身份）
    if (room.type !== 'treehole' && !isRoomMember(room, socket.username)) return;
    // 禁言检查
    if (room.mutedMembers && room.mutedMembers.includes(socket.username)) {
      socket.emit('sendError', { error: '你已被禁言，无法发送消息' });
      return;
    }
    if (room.muteAll && room.owner !== socket.username && !(room.admins || []).includes(socket.username)) {
      socket.emit('sendError', { error: '全员禁言中，仅群主和管理员可发言' });
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
      documentSummary: documentSummary || null,
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
    // 树洞房：匿名化发送者（真实身份不落盘、不下发）
    if (room.type === 'treehole') {
      const anon = getTreeholeAnon(roomId, socket.userId);
      message.sender = { id: anon.id, username: anon.name, avatar: anon.avatar };
      message.isAnonymous = true;
      message.mentions = [];
    }
    room.messages.push(message);
    if (room.messages.length > 3000) {
      room.messages = room.messages.slice(-3000);
    }
    rooms.set(roomId, room);
    rooms.save(); // 立即持久化
    io.to(roomId).emit('newMessage', message);

    // 赛博宠物：每条消息增加心情值
    if (roomPets.has(roomId)) {
      const pet = roomPets.get(roomId);
      pet.mood = Math.min(100, pet.mood + 1);
      pet.totalInteract += 1;
      pet.level = calcLevel(pet.totalInteract);
      broadcastPetState(roomId);
    }

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

    // 实时翻译：如果房间开启了自动翻译，异步翻译并推送翻译结果
    try {
      const translateSetting = autoTranslateSettings.get(roomId);
      if (translateSetting?.enabled && message.type === 'text' && message.content) {
        const langNames = { en: 'English', ja: '日本語', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский' };
        const targetLang = translateSetting.targetLang || 'en';
        const translateMessages = [
          { role: 'system', content: `你是专业翻译。将消息翻译成${langNames[targetLang] || targetLang}。只输出翻译结果，不加解释。保持语气。` },
          { role: 'user', content: message.content }
        ];
        callSelectedAIModel(translateMessages, 'glm-4-flash').then(tResult => {
          if (tResult.ok && tResult.reply) {
            io.to(roomId).emit('translatedMessage', {
              messageId: message.id,
              translated: tResult.reply.trim(),
              targetLang,
              sender: message.sender.username
            });
          }
        }).catch(() => {});
      }
    } catch(e) { console.error('Auto-translate error:', e.message); }

    // 赛博遗产：私聊对方离线且开启代聊 → 分身自动回复（限频 5 分钟/房间）
    try {
      if (room.type === 'group' && (room.members || []).length === 2 && message.type === 'text' && message.content) {
        const otherUsername = room.members.find(m => m !== socket.username);
        const otherUserObj = otherUsername ? users.get(otherUsername) : null;
        const otherOnline = otherUserObj && (userConnectionCount.get(otherUserObj.id) || 0) > 0;
        const otherTwin = otherUsername ? twinProfiles.get(otherUsername) : null;
        if (otherUserObj && otherTwin?.enabled && otherTwin?.autoReply && !otherOnline) {
          const now = Date.now();
          const lastAt = twinAutoReplyAt.get(roomId) || 0;
          if (now - lastAt > 5 * 60 * 1000) {
            twinAutoReplyAt.set(roomId, now);
            triggerTwinAutoReply(otherUsername, roomId, message.content);
          }
        }
      }
    } catch (e) { console.error('Legacy auto-reply hook error:', e.message); }

    // FCM 推送：离线成员收消息通知
    try {
      notifyOfflineMembers(room, message, socket.username);
    } catch (e) { console.error('Push hook error:', e.message); }
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
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('announcementError', { error: '只有群主或管理员可以设置公告' });
      return;
    }
    room.announcement = announcement;
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('announcementUpdated', { roomId, announcement });
  });

  // 踢人
  socket.on('kickMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('kickError', { error: '只有群主或管理员可以踢人' });
      return;
    }
    if (isOwner && username === (room.owner || room.createdBy)) {
      socket.emit('kickError', { error: '不能踢出群主' });
      return;
    }
    room.members = room.members.filter(m => m !== username);
    if (room.admins) room.admins = room.admins.filter(a => a !== username);
    if (room.mutedMembers) room.mutedMembers = room.mutedMembers.filter(m => m !== username);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('memberKicked', { roomId, username });
    const userSocket = [...onlineUsers.values()].find(s => s.username === username);
    if (userSocket) {
      io.to(userSocket.id).emit('youWereKicked', { roomId, roomName: room.name });
    }
  });

  // 禁言
  socket.on('muteMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('muteError', { error: '只有群主或管理员可以禁言' });
      return;
    }
    if (!room.mutedMembers) room.mutedMembers = [];
    if (!room.mutedMembers.includes(username)) {
      room.mutedMembers.push(username);
      rooms.set(roomId, room);
      rooms.save();
      io.to(roomId).emit('memberMuted', { roomId, username });
    }
  });

  // 解除禁言
  socket.on('unmuteMember', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) return;
    if (room.mutedMembers) {
      room.mutedMembers = room.mutedMembers.filter(m => m !== username);
      rooms.set(roomId, room);
      rooms.save();
      io.to(roomId).emit('memberUnmuted', { roomId, username });
    }
  });

  // 设置/取消管理员（仅群主）
  socket.on('setGroupAdmin', ({ roomId, username, isAdmin }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    if (!isOwner) {
      socket.emit('adminError', { error: '只有群主可以设置管理员' });
      return;
    }
    if (!room.admins) room.admins = [];
    if (isAdmin) {
      if (!room.admins.includes(username)) room.admins.push(username);
    } else {
      room.admins = room.admins.filter(a => a !== username);
    }
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('groupAdminUpdated', { roomId, username, isAdmin });
  });

  // 转让群主（仅群主）
  socket.on('transferOwnership', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    if (!isOwner) {
      socket.emit('transferError', { error: '只有群主可以转让群主' });
      return;
    }
    if (!room.members.includes(username)) {
      socket.emit('transferError', { error: '该用户不是群成员' });
      return;
    }
    room.owner = username;
    room.createdBy = username;
    if (room.admins) room.admins = room.admins.filter(a => a !== username);
    if (!room.admins) room.admins = [];
    if (!room.admins.includes(socket.username)) room.admins.push(socket.username);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('ownershipTransferred', { roomId, newOwner: username, oldOwner: socket.username });
  });

  // 全员禁言/解除
  socket.on('setMuteAll', ({ roomId, muteAll }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('muteError', { error: '只有群主或管理员可以全员禁言' });
      return;
    }
    room.muteAll = muteAll;
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('muteAllUpdated', { roomId, muteAll });
  });

  // 修改群名
  socket.on('renameGroup', ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('renameError', { error: '只有群主或管理员可以修改群名' });
      return;
    }
    room.name = name.trim();
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('groupRenamed', { roomId, name: room.name });
  });

  // 设置群描述
  socket.on('setRoomDescription', ({ roomId, description }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) return;
    room.description = description;
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('roomDescriptionUpdated', { roomId, description });
  });

  // 邀请成员入群
  socket.on('inviteMembers', ({ roomId, usernames }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) {
      socket.emit('inviteError', { error: '只有群主或管理员可以邀请成员' });
      return;
    }
    const max = room.maxMembers || 500;
    const added = [];
    for (const username of usernames) {
      if (room.members.includes(username)) continue;
      if (room.members.length >= max) break;
      room.members.push(username);
      added.push(username);
    }
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('membersInvited', { roomId, added });
    for (const username of added) {
      const userSocket = [...onlineUsers.values()].find(s => s.username === username);
      if (userSocket) {
        io.to(userSocket.id).emit('invitedToGroup', { roomId, roomName: room.name });
      }
    }
  });

  // 解散群聊（仅群主）
  socket.on('disbandGroup', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    if (!isOwner) {
      socket.emit('disbandError', { error: '只有群主可以解散群聊' });
      return;
    }
    io.to(roomId).emit('groupDisbanded', { roomId, roomName: room.name });
    rooms.delete(roomId);
    rooms.save();
  });

  // 设置欢迎语
  socket.on('setWelcomeMessage', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const isOwner = room.owner === socket.username || room.createdBy === socket.username;
    const isAdmin = (room.admins || []).includes(socket.username);
    if (!isOwner && !isAdmin) return;
    room.welcomeMessage = message;
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('welcomeMessageUpdated', { roomId, message });
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

  socket.on('createGroup', ({ name, members, description }) => {
    const room = {
      id: uuidv4(),
      name,
      type: 'group',
      owner: socket.username,
      admins: [],
      members: [...members, socket.username],
      messages: [],
      createdBy: socket.username,
      createdAt: new Date(),
      description: description || '',
      announcement: '',
      mutedMembers: [],
      muteAll: false,
      maxMembers: 500,
      welcomeMessage: ''
    };
    rooms.set(room.id, room);
    rooms.save();
    io.emit('roomCreated', room);
    socket.emit('groupCreated', room);
  });

  // ===== 频道（Channel）=====
  socket.on('createChannel', ({ name, description }) => {
    const channelName = (name || '').trim();
    if (!channelName) {
      socket.emit('channelError', { error: '请输入频道名称' });
      return;
    }
    const room = {
      id: uuidv4(),
      name: channelName,
      type: 'channel',
      owner: socket.username,
      admins: [socket.username],
      members: [socket.username],
      description: description || '',
      messages: [],
      threads: [],
      createdBy: socket.username,
      createdAt: new Date()
    };
    rooms.set(room.id, room);
    rooms.save();
    socket.join(room.id);
    io.emit('roomCreated', room);
    socket.emit('channelCreated', room);
  });

  // ===== 匿名树洞房 =====
  socket.on('createTreehole', ({ name }) => {
    const holeName = (name || '').trim();
    if (!holeName) {
      socket.emit('treeholeError', { error: '请输入树洞名称' });
      return;
    }
    const room = {
      id: uuidv4(),
      name: holeName,
      type: 'treehole',
      owner: null,
      admins: [],
      members: [],
      description: '匿名树洞：发言自动匿名，消息 24 小时后自动焚毁',
      messages: [],
      createdBy: 'treehole',
      createdAt: new Date()
    };
    rooms.set(room.id, room);
    rooms.save();
    socket.join(room.id);
    io.emit('roomCreated', room);
    socket.emit('treeholeCreated', room);
  });

  // ===== 谁是卧底 =====
  socket.on('undercover:create', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (undercoverGames.has(roomId)) {
      socket.emit('undercover:error', { error: '本房间已有进行中的游戏' });
      return;
    }
    const game = ensureUndercoverLobby(roomId, socket.username);
    game.players.push({ username: socket.username, avatar: users.get(socket.username)?.avatar, alive: true, word: null, isSpy: false });
    pushUndercoverEvent(roomId, `${socket.username} 发起了「谁是卧底」！点击游戏面板报名加入（至少 3 人开局）`);
    broadcastUndercoverState(roomId);
  });

  socket.on('undercover:join', ({ roomId }) => {
    const game = undercoverGames.get(roomId);
    if (!game || game.phase !== 'lobby') {
      socket.emit('undercover:error', { error: '当前没有等待中的游戏' });
      return;
    }
    if (!game.players.find(p => p.username === socket.username)) {
      if (game.players.length >= 12) {
        socket.emit('undercover:error', { error: '玩家已满（12人）' });
        return;
      }
      game.players.push({ username: socket.username, avatar: users.get(socket.username)?.avatar, alive: true, word: null, isSpy: false });
      broadcastUndercoverState(roomId);
      pushUndercoverEvent(roomId, `${socket.username} 加入了游戏（${game.players.length} 人）`);
    }
  });

  socket.on('undercover:leave', ({ roomId }) => {
    const game = undercoverGames.get(roomId);
    if (!game) return;
    game.players = game.players.filter(p => p.username !== socket.username);
    if (game.phase === 'lobby' && game.players.length === 0) {
      undercoverGames.delete(roomId);
    } else if (game.phase === 'playing') {
      checkUndercoverEnd(roomId);
    }
    broadcastUndercoverState(roomId);
    pushUndercoverEvent(roomId, `${socket.username} 离开了游戏`);
  });

  socket.on('undercover:start', ({ roomId }) => {
    const game = undercoverGames.get(roomId);
    if (!game || game.phase !== 'lobby') return;
    if (game.players.length < 3) {
      socket.emit('undercover:error', { error: '至少需要 3 名玩家' });
      return;
    }
    startUndercoverGame(roomId);
  });

  socket.on('undercover:beginVote', ({ roomId }) => {
    const game = undercoverGames.get(roomId);
    if (!game || game.phase !== 'speaking') return;
    const me = game.players.find(p => p.username === socket.username && p.alive);
    if (!me) {
      socket.emit('undercover:error', { error: '只有存活玩家可以发起投票' });
      return;
    }
    game.phase = 'voting';
    game.votes = {};
    pushUndercoverEvent(roomId, `第 ${game.round} 轮描述结束，进入投票！点击存活玩家头像投票`);
    broadcastUndercoverState(roomId);
  });

  socket.on('undercover:vote', ({ roomId, target }) => {
    const game = undercoverGames.get(roomId);
    if (!game || game.phase !== 'voting') return;
    const voter = game.players.find(p => p.username === socket.username && p.alive);
    const targetPlayer = game.players.find(p => p.username === target && p.alive);
    if (!voter) return;
    if (!targetPlayer || target === socket.username) {
      socket.emit('undercover:error', { error: '投票目标无效（不能投自己）' });
      return;
    }
    game.votes[socket.username] = target;
    broadcastUndercoverState(roomId);
    // 所有存活玩家都投完 → 结算
    const alivePlayers = game.players.filter(p => p.alive);
    const allVoted = alivePlayers.every(p => game.votes[p.username]);
    if (allVoted) {
      setTimeout(() => settleUndercoverVote(roomId), 1200);
    }
  });

  socket.on('undercover:state', ({ roomId }) => {
    sendUndercoverState(roomId, socket);
  });

  socket.on('undercover:restart', ({ roomId }) => {
    const game = undercoverGames.get(roomId);
    if (!game) return;
    if (game.phase !== 'ended') return;
    game.phase = 'lobby';
    game.players = game.players.map(p => ({ ...p, alive: true, word: null, isSpy: false }));
    game.votes = {};
    game.round = 0;
    game.wordPair = null;
    broadcastUndercoverState(roomId);
    pushUndercoverEvent(roomId, '新一局开始报名，等待房主开局');
  });

  socket.on('subscribeChannel', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.type !== 'channel') return;
    if (!room.members) room.members = [];
    if (!room.members.includes(socket.username)) {
      room.members.push(socket.username);
      rooms.set(roomId, room);
      rooms.save();
    }
    socket.join(roomId);
    socket.emit('channelUpdated', {
      id: room.id,
      name: room.name,
      type: room.type,
      owner: room.owner,
      admins: room.admins || [],
      members: room.members || [],
      memberCount: room.members.length
    });
    io.to(roomId).emit('channelSubscribed', { roomId, username: socket.username, memberCount: room.members.length });
  });

  socket.on('unsubscribeChannel', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.type !== 'channel') return;
    if (socket.username === room.owner) {
      socket.emit('channelError', { error: '频道主不能退订自己的频道' });
      return;
    }
    room.members = (room.members || []).filter(m => m !== socket.username);
    room.admins = (room.admins || []).filter(a => a !== socket.username);
    rooms.set(roomId, room);
    rooms.save();
    socket.leave(roomId);
    socket.emit('channelUpdated', {
      id: room.id,
      name: room.name,
      type: room.type,
      owner: room.owner,
      admins: room.admins || [],
      members: room.members || [],
      memberCount: room.members.length
    });
    io.to(roomId).emit('channelUnsubscribed', { roomId, username: socket.username, memberCount: room.members.length });
  });

  socket.on('setChannelAdmins', ({ roomId, admins }) => {
    const room = rooms.get(roomId);
    if (!room || room.type !== 'channel') return;
    if (room.owner !== socket.username) {
      socket.emit('channelError', { error: '只有频道主可以设置管理员' });
      return;
    }
    room.admins = [socket.username, ...(admins || []).filter(a => a !== socket.username)];
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('channelAdminsUpdated', { roomId, admins: room.admins });
  });

  // ===== 群话题 Threads =====
  socket.on('createThread', ({ roomId, title, content }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!isRoomMember(room, socket.username)) return;
    const threadTitle = (title || '').trim();
    if (!threadTitle) {
      socket.emit('threadError', { error: '请输入话题标题' });
      return;
    }
    const thread = {
      id: uuidv4(),
      title: threadTitle,
      creator: socket.username,
      createdAt: new Date(),
      messages: []
    };
    if (content && content.trim()) {
      thread.messages.push({
        id: uuidv4(),
        content: content.trim(),
        type: 'text',
        sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
        timestamp: new Date()
      });
    }
    if (!room.threads) room.threads = [];
    room.threads.push(thread);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('threadCreated', { roomId, thread: serializeThread(thread) });
  });

  socket.on('sendThreadMessage', ({ roomId, threadId, content }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!isRoomMember(room, socket.username)) return;
    const thread = (room.threads || []).find(t => t.id === threadId);
    if (!thread) return;
    const text = (content || '').trim();
    if (!text) return;
    const message = {
      id: uuidv4(),
      content: text,
      type: 'text',
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      timestamp: new Date()
    };
    thread.messages.push(message);
    if (thread.messages.length > 500) thread.messages = thread.messages.slice(-500);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('threadMessage', { roomId, threadId, message });
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

  // ===== 赛博电子宠物 =====
  socket.on('petFeed', ({ roomId }) => {
    if (!socket.userId || !roomId) return;
    const pet = getOrCreatePet(roomId);
    pet.hunger = Math.min(100, pet.hunger + 20);
    pet.totalInteract += 1;
    pet.level = calcLevel(pet.totalInteract);
    broadcastPetState(roomId);
  });

  socket.on('petPet', ({ roomId }) => {
    if (!socket.userId || !roomId) return;
    const pet = getOrCreatePet(roomId);
    pet.mood = Math.min(100, pet.mood + 1);
    pet.totalInteract += 1;
    pet.level = calcLevel(pet.totalInteract);
    broadcastPetState(roomId);
  });

  socket.on('petGetState', ({ roomId }) => {
    if (!socket.userId || !roomId) return;
    const pet = getOrCreatePet(roomId);
    socket.emit('petState', { roomId, ...pet });
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

  // ===== 协作画板 =====
  socket.on('sendCanvasCard', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!canAccessRoom(room, socket.username)) return;
    const cardId = uuidv4();
    const message = {
      id: uuidv4(),
      type: 'canvasCard',
      content: '实时涂鸦卡片',
      cardId,
      sender: { id: socket.userId, username: socket.username, avatar: users.get(socket.username)?.avatar },
      roomId,
      timestamp: new Date(),
      readBy: [socket.userId],
    };
    ensureCanvasCardState(roomId, cardId);
    room.messages.push(message);
    if (room.messages.length > 3000) room.messages = room.messages.slice(-3000);
    rooms.set(roomId, room);
    rooms.save();
    io.to(roomId).emit('newMessage', message);
  });

  socket.on('canvasCardJoin', ({ roomId, cardId }) => {
    const room = rooms.get(roomId);
    if (!cardId || !canAccessRoom(room, socket.username)) return;
    const state = ensureCanvasCardState(roomId, cardId);
    state.users.add(socket.username);
    socket.join(`canvas_${cardId}`);
    socket.emit('canvasCardSync', { roomId, cardId, points: state.points, users: Array.from(state.users) });
  });

  socket.on('canvasCardDraw', ({ roomId, cardId, point }) => {
    const room = rooms.get(roomId);
    if (!cardId || !point || !canAccessRoom(room, socket.username)) return;
    const state = ensureCanvasCardState(roomId, cardId);
    const safePoint = {
      x: Math.max(0, Math.min(300, safeNumber(point.x))),
      y: Math.max(0, Math.min(300, safeNumber(point.y))),
      type: point.type === 'move' ? 'move' : 'draw',
      color: typeof point.color === 'string' ? point.color.slice(0, 24) : '#334155',
      size: Math.max(1, Math.min(12, safeNumber(point.size, 3))),
      userId: socket.userId,
    };
    state.points.push(safePoint);
    if (state.points.length > 4000) state.points = state.points.slice(-4000);
    socket.to(`canvas_${cardId}`).emit('canvasCardPoint', { roomId, cardId, point: safePoint, username: socket.username });
  });

  socket.on('canvasCardClear', ({ roomId, cardId }) => {
    const room = rooms.get(roomId);
    if (!cardId || !canAccessRoom(room, socket.username)) return;
    const state = ensureCanvasCardState(roomId, cardId);
    state.points = [];
    io.to(`canvas_${cardId}`).emit('canvasCardClear', { roomId, cardId });
  });

  socket.on('canvasCardLeave', ({ cardId }) => {
    if (!cardId) return;
    socket.leave(`canvas_${cardId}`);
    const state = canvasCardStates.get(cardId);
    if (state) state.users.delete(socket.username);
  });

  socket.on('syncMediaJoin', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!canAccessRoom(room, socket.username)) return;
    socket.emit('syncMediaState', serializeSyncMediaState(roomId));
  });

  socket.on('syncMediaStart', ({ roomId, media }) => {
    const room = rooms.get(roomId);
    if (!canAccessRoom(room, socket.username)) return;
    const url = typeof media?.url === 'string' ? media.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) {
      socket.emit('syncMediaError', { error: '媒体链接无效' });
      return;
    }
    syncMediaRooms.set(roomId, {
      roomId,
      hostId: socket.userId,
      hostUsername: socket.username,
      url,
      title: typeof media?.title === 'string' ? media.title.slice(0, 80) : '同步媒体房',
      cover: typeof media?.cover === 'string' ? media.cover.slice(0, 500) : '',
      mediaType: media?.mediaType === 'video' ? 'video' : 'audio',
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });
    emitSyncMediaState(roomId);
  });

  socket.on('syncMediaControl', ({ roomId, action, currentTime }) => {
    const room = rooms.get(roomId);
    const state = syncMediaRooms.get(roomId);
    if (!state || !canAccessRoom(room, socket.username)) return;
    if (state.hostId !== socket.userId) {
      socket.emit('syncMediaError', { error: '只有发起人可以控制同步播放' });
      return;
    }
    const adjusted = serializeSyncMediaState(roomId);
    state.currentTime = Math.max(0, safeNumber(currentTime, adjusted.currentTime));
    state.updatedAt = Date.now();
    if (action === 'play') state.isPlaying = true;
    if (action === 'pause' || action === 'seek') state.isPlaying = action === 'seek' ? state.isPlaying : false;
    if (action === 'stop') {
      syncMediaRooms.delete(roomId);
      io.to(roomId).emit('syncMediaState', { roomId, active: false, serverNow: Date.now() });
      return;
    }
    syncMediaRooms.set(roomId, state);
    emitSyncMediaState(roomId);
  });

  socket.on('whiteboardJoin', ({ roomId }) => {
    socket.join(`wb_${roomId}`);
    const state = whiteboardStates.get(roomId) || { strokes: [], users: new Set() };
    state.users.add(socket.username);
    whiteboardStates.set(roomId, state);
    socket.emit('whiteboardSync', { strokes: state.strokes, users: Array.from(state.users) });
  });

  socket.on('whiteboardStroke', ({ roomId, stroke }) => {
    const state = whiteboardStates.get(roomId);
    if (state) {
      state.strokes.push(stroke);
      if (state.strokes.length > 2000) state.strokes = state.strokes.slice(-2000);
    }
    socket.to(`wb_${roomId}`).emit('whiteboardStroke', { stroke, username: socket.username });
  });

  socket.on('whiteboardClear', ({ roomId }) => {
    whiteboardStates.set(roomId, { strokes: [], users: new Set() });
    io.to(`wb_${roomId}`).emit('whiteboardClear');
  });

  socket.on('whiteboardLeave', ({ roomId }) => {
    socket.leave(`wb_${roomId}`);
    const state = whiteboardStates.get(roomId);
    if (state) state.users.delete(socket.username);
  });

  // ===== 语音房信令 =====
  // ===== Voice room signaling =====
  socket.on('voiceJoin', ({ roomId }) => {
    joinVoiceSocket(socket, roomId);
  });

  socket.on('voiceLeave', ({ roomId }) => {
    cleanupVoiceSocket(socket, roomId);
  });

  socket.on('voiceOffer', ({ roomId, to, offer }) => {
    if (!socket.userId || !roomId || !to || !offer) return;
    emitToVoicePeer(roomId, to, 'voiceOffer', {
      roomId,
      from: socket.userId,
      fromUsername: socket.username,
      offer
    });
  });

  socket.on('voiceAnswer', ({ roomId, to, answer }) => {
    if (!socket.userId || !roomId || !to || !answer) return;
    emitToVoicePeer(roomId, to, 'voiceAnswer', {
      roomId,
      from: socket.userId,
      answer
    });
  });

  socket.on('voiceIce', ({ roomId, to, candidate }) => {
    if (!socket.userId || !roomId || !to || !candidate) return;
    emitToVoicePeer(roomId, to, 'voiceIce', {
      roomId,
      from: socket.userId,
      candidate
    });
  });
  socket.on('disconnect', () => {
    cleanupVoiceSocket(socket);
    if (socket.userId) {
      const count = (userConnectionCount.get(socket.userId) || 1) - 1;
      if (userSockets.get(socket.userId)?.id === socket.id) {
        const replacement = Array.from(io.sockets.sockets.values())
          .find(s => s.id !== socket.id && s.userId === socket.userId);
        if (replacement) userSockets.set(socket.userId, replacement);
        else userSockets.delete(socket.userId);
      }
      if (count <= 0) {
        // 所有连接都已断开：立即下线并广播（实时生效，无延迟）
        userConnectionCount.delete(socket.userId);
        onlineUsers.delete(socket.userId);
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
app.get('/releases/:filename', (req, res, next) => {
  const filename = req.params.filename;
  if (!/^(WeChat|ChatRoom)-v[\w.-]+\.apk$/.test(filename)) return next();
  const apkPath = path.join(__dirname, '..', 'client', 'releases', filename);
  if (fs.existsSync(apkPath)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(apkPath).pipe(res);
  } else {
    res.status(404).json({ error: 'APK not found' });
  }
});

app.get('/WeChat-v2.0.apk', (req, res) => {
  res.redirect(302, '/releases/ChatRoom-v3.0.0.apk');
});

const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io') && !req.path.startsWith('/uploads')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
