const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILES = {
  users: 'users.json',
  friendRequests: 'friendRequests.json',
  friends: 'friends.json',
  rooms: 'rooms.json',
  recharges: 'recharges.json',
  transfers: 'transfers.json',
  dailyReport: 'dailyReport.json',
  pushTokens: 'pushTokens.json',
  favorites: 'favorites.json',
  offlineBriefings: 'offlineBriefings.json'
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJson(filename) {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error loading ${filename}:`, e.message);
    // 尝试从备份恢复
    const bak = filePath + '.bak';
    if (fs.existsSync(bak)) {
      try {
        console.log(`Attempting restore from ${bak}`);
        const bakData = fs.readFileSync(bak, 'utf-8');
        fs.writeFileSync(filePath, bakData, 'utf-8');
        return JSON.parse(bakData);
      } catch (e2) {
        console.error(`Backup restore also failed:`, e2.message);
      }
    }
    return null;
  }
}

// 原子写入：先写临时文件，再重命名，防止写一半崩溃导致数据损坏
const writeLocks = {};
function saveJson(filename, data) {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  // 串行化同文件写入
  if (writeLocks[filename]) {
    writeLocks[filename] = writeLocks[filename].then(() => doWrite());
  } else {
    writeLocks[filename] = doWrite();
  }

  function doWrite() {
    return new Promise((resolve) => {
      try {
        // 1. 备份现有文件
        if (fs.existsSync(filePath)) {
          try { fs.copyFileSync(filePath, bakPath); } catch {}
        }
        // 2. 写入临时文件
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
        // 3. 原子重命名
        fs.renameSync(tmpPath, filePath);
      } catch (e) {
        console.error(`Error saving ${filename}:`, e.message);
      }
      resolve();
    });
  }
}

const saveQueues = {};   // collection -> { timer, data }（data 用于退出时同步刷盘）
function debouncedSave(collection, data, delay = 200) {
  if (saveQueues[collection]) {
    clearTimeout(saveQueues[collection].timer);
  }
  saveQueues[collection] = {
    data,
    timer: setTimeout(() => {
      saveJson(FILES[collection], data);
      delete saveQueues[collection];
    }, delay)
  };
}

// 同步原子写入：仅用于进程退出时刷盘（exit 回调无法等待异步写入）
function saveJsonSync(filename, data) {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';
  try {
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, bakPath); } catch {}
    }
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error(`Error saving ${filename} on exit:`, e.message);
  }
}

let autoFlushTimer = null;

function startAutoFlush(collections, intervalMs = 3000) {
  if (autoFlushTimer) clearInterval(autoFlushTimer);
  autoFlushTimer = setInterval(() => {
    flushAll(collections);
  }, intervalMs);
  autoFlushTimer.unref();
}

function stopAutoFlush() {
  if (autoFlushTimer) {
    clearInterval(autoFlushTimer);
    autoFlushTimer = null;
  }
}

class Collection {
  constructor(name) {
    this.name = name;
    this._data = new Map();
    this._dirty = false;
  }

  load() {
    const raw = loadJson(FILES[this.name]);
    if (raw) {
      if (Array.isArray(raw)) {
        this._data = new Map(raw);
      } else if (typeof raw === 'object' && raw !== null) {
        this._data = new Map(Object.entries(raw));
      }
    }
    return this;
  }

  save() {
    const obj = {};
    for (const [key, value] of this._data.entries()) {
      obj[key] = value;
    }
    saveJson(FILES[this.name], obj);
    this._dirty = false;
  }

  saveDebounced() {
    this._dirty = true;
    const obj = {};
    for (const [key, value] of this._data.entries()) {
      obj[key] = value;
    }
    debouncedSave(this.name, obj);
  }

  has(key) { return this._data.has(key); }
  get(key) { return this._data.get(key); }
  set(key, value) { this._data.set(key, value); this.saveDebounced(); }
  delete(key) { this._data.delete(key); this.saveDebounced(); }
  values() { return this._data.values(); }
  keys() { return this._data.keys(); }
  entries() { return this._data.entries(); }
  get size() { return this._data.size; }
  forEach(callback) { this._data.forEach(callback); }

  find(predicate) {
    for (const value of this._data.values()) {
      if (predicate(value)) return value;
    }
    return undefined;
  }

  findAll(predicate) {
    const results = [];
    for (const value of this._data.values()) {
      if (predicate(value)) results.push(value);
    }
    return results;
  }

  toArray() { return Array.from(this._data.values()); }
  map(fn) { return Array.from(this._data.values()).map(fn); }
  filter(fn) { return Array.from(this._data.values()).filter(fn); }

  flush() {
    if (saveQueues[this.name]) {
      clearTimeout(saveQueues[this.name].timer);
      delete saveQueues[this.name];
    }
    if (this._dirty) {
      this.save();
    }
  }

  // 同步刷盘：用于进程退出/优雅关闭，立即写盘不排队
  flushSync() {
    if (saveQueues[this.name]) {
      clearTimeout(saveQueues[this.name].timer);
      delete saveQueues[this.name];
    }
    if (this._dirty) {
      const obj = {};
      for (const [key, value] of this._data.entries()) {
        obj[key] = value;
      }
      saveJsonSync(FILES[this.name], obj);
      this._dirty = false;
    }
  }
}

// ===== 数据结构自检（只读诊断：不阻止启动、不改变数据，异常仅告警） =====
const SCHEMAS = {
  users: { required: ['id', 'username'] },
  rooms: { required: ['id', 'name', 'type'], arrayFields: ['members', 'messages'] },
  recharges: { required: ['id', 'userId', 'amount'] },
  transfers: { required: ['id', 'fromUserId', 'toUserId', 'amount'] },
  friends: { valueType: 'array' },
  friendRequests: { valueType: 'array' }
};

function validateCollections(collections) {
  const warnings = [];
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const col = collections[name];
    if (!col) continue;
    for (const [key, value] of col.entries()) {
      if (value === null || value === undefined) {
        warnings.push(`${name}[${key}] 值为空`);
        continue;
      }
      if (schema.valueType === 'array' && !Array.isArray(value)) {
        warnings.push(`${name}[${key}] 应为数组，实际为 ${typeof value}`);
        continue;
      }
      if (schema.required) {
        if (typeof value !== 'object' || Array.isArray(value)) {
          warnings.push(`${name}[${key}] 应为对象，实际为 ${typeof value}`);
          continue;
        }
        for (const field of schema.required) {
          if (value[field] === undefined || value[field] === null) {
            warnings.push(`${name}[${key}] 缺少必需字段 "${field}"`);
          }
        }
        if (schema.arrayFields) {
          for (const field of schema.arrayFields) {
            if (value[field] !== undefined && value[field] !== null && !Array.isArray(value[field])) {
              warnings.push(`${name}[${key}] 字段 "${field}" 应为数组`);
            }
          }
        }
      }
    }
  }
  return warnings;
}

function init() {
  ensureDir();

  const collections = {
    users: new Collection('users').load(),
    friendRequests: new Collection('friendRequests').load(),
    friends: new Collection('friends').load(),
    rooms: new Collection('rooms').load(),
    recharges: new Collection('recharges').load(),
    transfers: new Collection('transfers').load(),
    dailyReport: new Collection('dailyReport').load(),
    pushTokens: new Collection('pushTokens').load()
  };

  if (!collections.rooms.has('global')) {
    collections.rooms.set('global', {
      id: 'global',
      name: '全局聊天',
      type: 'public',
      members: [],
      messages: []
    });
  }

  // 启动自检：只读诊断，发现异常仅告警，不中断启动
  const warnings = validateCollections(collections);
  if (warnings.length) {
    console.warn(`[SCHEMA] 数据自检发现 ${warnings.length} 处异常:`);
    warnings.slice(0, 20).forEach(w => console.warn(`  - ${w}`));
    if (warnings.length > 20) console.warn(`  ... 其余 ${warnings.length - 20} 处省略`);
  }

  return collections;
}

function flushAll(collections, { sync = false } = {}) {
  for (const name of Object.keys(FILES)) {
    if (collections[name]) {
      if (sync) collections[name].flushSync();
      else collections[name].flush();
    }
  }
}

process.on('exit', () => {
  // 退出前把防抖队列里未落盘的数据同步写入，避免丢数据
  for (const name of Object.keys(FILES)) {
    const pending = saveQueues[name];
    if (pending) {
      clearTimeout(pending.timer);
      saveJsonSync(FILES[name], pending.data);
      delete saveQueues[name];
    }
  }
});

module.exports = { init, flushAll, startAutoFlush, stopAutoFlush, Collection, validateCollections, DATA_DIR };
