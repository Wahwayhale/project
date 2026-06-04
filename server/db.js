const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  users: 'users.json',
  friendRequests: 'friendRequests.json',
  friends: 'friends.json',
  rooms: 'rooms.json',
  recharges: 'recharges.json'
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
    return null;
  }
}

function saveJson(filename, data) {
  ensureDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const saveQueues = {};
function debouncedSave(collection, data, delay = 200) {
  if (saveQueues[collection]) {
    clearTimeout(saveQueues[collection]);
  }
  saveQueues[collection] = setTimeout(() => {
    saveJson(FILES[collection], data);
    delete saveQueues[collection];
  }, delay);
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

  has(key) {
    return this._data.has(key);
  }

  get(key) {
    return this._data.get(key);
  }

  set(key, value) {
    this._data.set(key, value);
    this.saveDebounced();
  }

  delete(key) {
    this._data.delete(key);
    this.saveDebounced();
  }

  values() {
    return this._data.values();
  }

  keys() {
    return this._data.keys();
  }

  entries() {
    return this._data.entries();
  }

  get size() {
    return this._data.size;
  }

  forEach(callback) {
    this._data.forEach(callback);
  }

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

  toArray() {
    return Array.from(this._data.values());
  }

  map(fn) {
    return Array.from(this._data.values()).map(fn);
  }

  filter(fn) {
    return Array.from(this._data.values()).filter(fn);
  }

  flush() {
    if (saveQueues[this.name]) {
      clearTimeout(saveQueues[this.name]);
      delete saveQueues[this.name];
    }
    if (this._dirty) {
      this.save();
    }
  }
}

function init() {
  ensureDir();

  const collections = {
    users: new Collection('users').load(),
    friendRequests: new Collection('friendRequests').load(),
    friends: new Collection('friends').load(),
    rooms: new Collection('rooms').load(),
    recharges: new Collection('recharges').load()
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

  return collections;
}

function flushAll(collections) {
  for (const name of Object.keys(FILES)) {
    if (collections[name]) {
      collections[name].flush();
    }
  }
}

process.on('exit', () => {
  // exit handler only runs for clean exits, not SIGKILL
  for (const name of Object.keys(FILES)) {
    if (saveQueues[name]) {
      clearTimeout(saveQueues[name]);
      delete saveQueues[name];
    }
  }
});

module.exports = { init, flushAll, startAutoFlush, stopAutoFlush, Collection };