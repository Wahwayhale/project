# App 全面重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 5261 行单文件 App.js + 6577 行 CSS 重构为模块化架构，同时修复交互bug、性能问题和UI不一致。

**Architecture:** React 18 + Context/hooks 模式。App.js 精简为布局壳，状态逻辑提取到 12 个自定义 hooks，UI 拆分为 ~50 个独立组件。CSS 拆分为 12 个功能文件 + 全局变量体系。

**Tech Stack:** React 18, Socket.io Client, Axios, Lucide React, CRA (react-scripts)

---

## Phase 1: 基础设施

### Task 1.1: 创建目录结构

**Files:**
- Create: `client/src/utils/`, `client/src/hooks/`, `client/src/components/ui/`, `client/src/components/panels/`, `client/src/components/modals/`, `client/src/components/call/`, `client/src/styles/`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p client/src/utils client/src/hooks
mkdir -p client/src/components/ui client/src/components/panels client/src/components/modals client/src/components/call
mkdir -p client/src/styles
```

- [ ] **Step 2: 验证目录结构**

Run: `ls -d client/src/utils/ client/src/hooks/ client/src/components/ui/ client/src/styles/`
Expected: All paths exist

- [ ] **Step 3: Commit**

```bash
git add client/src/utils client/src/hooks client/src/components client/src/styles
git commit -m "feat: create module directory structure

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.2: 提取 constants.js

**Files:**
- Create: `client/src/utils/constants.js`
- Modify: `client/src/App.js:6-14,53-54`

- [ ] **Step 1: 创建 constants.js**

```js
// 环境检测与服务器配置
export const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform;
export const SERVER_URL = 'https://parakeet-nimble-cage.ngrok-free.dev';
export const API_URL = isCapacitor ? SERVER_URL : '';

// 版本信息
export const APP_VERSION = '3.0.0';
export const MAJOR_VERSION = '3';
export const WEB_BUILD = 225;
export const NATIVE_BUILD = 4;

// 文件分片
export const CHUNK_SIZE = 2 * 1024 * 1024;

// 默认头像 SVG data URI
export const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#e0e0e0"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>'
);

// EMOJIS 表情列表
export const EMOJIS = ['😀','😂','🤣','😍','🥰','😘','😜','😎','🤩','😋','🤔','😅','😊','😢','😭','😤','😡','🥺','👍','👎','👏','🙌','💪','🤝','❤️','💔','🔥','⭐','🎉','🎊','🌸','🌺','🍀','☕','🍰','🎂','🐱','🐶','🌈','✨','💯','✅','❌','⏰','📌','📍','🗑️','💡','🔑','🎵','📷'];
```

- [ ] **Step 2: 在 App.js 中替换导入**

Add at top of App.js after React imports:
```js
import { isCapacitor, SERVER_URL, API_URL, APP_VERSION, MAJOR_VERSION, WEB_BUILD, NATIVE_BUILD, CHUNK_SIZE, DEFAULT_AVATAR, EMOJIS } from './utils/constants';
```

Remove lines 6-14 and 53-54 in App.js (the const definitions that are now in constants.js).

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/constants.js client/src/App.js
git commit -m "feat: extract constants to utils/constants.js

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.3: 提取 format.js 工具函数

**Files:**
- Create: `client/src/utils/format.js`
- Modify: `client/src/App.js:139-171,173-182`

- [ ] **Step 1: 创建 format.js**

```js
export function formatFileSize(bytes) {
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

export function getFileIcon(mimeType, filename) {
  if (!mimeType && !filename) return '📄';
  const ext = (filename?.split('.').pop() || mimeType?.split('/').pop() || '').toLowerCase();
  const iconMap = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗',
    ppt: '📙', pptx: '📙', zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
    txt: '📄', json: '📋', xml: '📋', html: '🌐', css: '🎨', js: '📜', ts: '📜',
    mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵',
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', wmv: '🎬',
    exe: '⚙️', msi: '⚙️', dmg: '⚙️', apk: '📱', ipa: '📱'
  };
  if (iconMap[ext]) return iconMap[ext];
  if (mimeType?.startsWith('image/')) return '🖼️';
  if (mimeType?.startsWith('video/')) return '🎬';
  if (mimeType?.startsWith('audio/')) return '🎵';
  if (mimeType?.includes('pdf')) return '📕';
  if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return '🗜️';
  return '📄';
}

export function parseBilibiliUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV\w+)/i);
  if (match) return match[1];
  const shortMatch = text.match(/https?:\/\/b23\.tv\/(\w+)/i);
  if (shortMatch) return shortMatch[1];
  const bareMatch = text.match(/^BV\w{10}$/);
  if (bareMatch) return bareMatch[0];
  return null;
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  if (date >= today) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date >= yesterday) return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('zh-CN');
}

export function formatRecordingTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatMessagePreview(lastMessage) {
  if (!lastMessage) return '';
  if (lastMessage.recalled) return '[消息已撤回]';
  const type = lastMessage.type;
  if (type === 'image') return '[图片]';
  if (type === 'video') return '[视频]';
  if (type === 'audio') return '[语音]';
  if (type === 'file') return '[文件]';
  if (type === 'redPacket') return '[红包]';
  if (type === 'poll') return '[投票]';
  if (type === 'dice') return '[骰子]';
  if (type === 'rockPaperScissors') return '[猜拳]';
  if (type === 'location') return '[位置]';
  if (type === 'checkIn') return '[打卡]';
  if (type === 'announcement') return '[群公告]';
  if (type === 'solitaire') return '[群接龙]';
  if (type === 'music') return '[音乐]';
  const content = lastMessage.content || '';
  return content.length > 50 ? content.slice(0, 50) + '...' : content;
}
```

- [ ] **Step 2: 在 App.js 中添加导入，删除原地定义**

Add import:
```js
import { formatFileSize, getFileIcon, parseBilibiliUrl, formatTime, formatRecordingTime, formatMessagePreview } from './utils/format';
```

Delete the original function definitions at lines 139-182 in App.js.

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/format.js client/src/App.js
git commit -m "feat: extract format utilities to utils/format.js

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.4: 提取 avatar.js 工具函数

**Files:**
- Create: `client/src/utils/avatar.js`
- Modify: `client/src/App.js:57-62`

- [ ] **Step 1: 创建 avatar.js**

```js
import { isCapacitor, API_URL, DEFAULT_AVATAR } from './constants';

export function getAvatarUrl(avatar) {
  if (!avatar) return DEFAULT_AVATAR;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  if (avatar.startsWith('/')) return `${API_URL}${avatar}`;
  return avatar;
}
```

- [ ] **Step 2: 在 App.js 中替换**

Add import: `import { getAvatarUrl } from './utils/avatar';`
Remove the `getAvatarUrl` function definition (lines 57-62).

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/utils/avatar.js client/src/App.js
git commit -m "feat: extract avatar utility to utils/avatar.js

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.5: 提取 Base UI 组件 (AvatarImg, RoomAvatar, EmptyState, FeatureItem, MeMenuItem)

**Files:**
- Create: `client/src/components/ui/AvatarImg.jsx`
- Create: `client/src/components/ui/RoomAvatar.jsx`
- Create: `client/src/components/ui/EmptyState.jsx`
- Create: `client/src/components/ui/FeatureItem.jsx`
- Create: `client/src/components/ui/MeMenuItem.jsx`
- Modify: `client/src/App.js:65-137`

- [ ] **Step 1: 创建 AvatarImg.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { isCapacitor, DEFAULT_AVATAR } from '../../utils/constants';

export default function AvatarImg({ src, alt, className, style }) {
  const [imgSrc, setImgSrc] = useState(src);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src || src === DEFAULT_AVATAR || !src.startsWith('http')) {
      setImgSrc(src || DEFAULT_AVATAR);
      return;
    }
    if (isCapacitor) {
      axios.get(src, { responseType: 'blob' })
        .then(res => {
          const blobUrl = URL.createObjectURL(res.data);
          setImgSrc(blobUrl);
          setError(false);
        })
        .catch(() => {
          setError(true);
          setImgSrc(DEFAULT_AVATAR);
        });
    } else {
      setImgSrc(src);
    }
  }, [src]);

  if (error) {
    return <img src={DEFAULT_AVATAR} alt={alt} className={className} style={style} />;
  }
  return <img src={imgSrc} alt={alt} className={className} style={style} onError={(e) => { e.target.src = DEFAULT_AVATAR; }} />;
}
```

- [ ] **Step 2: 创建 RoomAvatar.jsx**

```jsx
import React from 'react';

export default function RoomAvatar({ name, size = 'md' }) {
  return (
    <div className={`room-avatar room-avatar-${size}`}>
      {(name || '群')[0]}
    </div>
  );
}
```

- [ ] **Step 3: 创建 EmptyState.jsx**

```jsx
import React from 'react';
import { I } from '../Icon';

export default function EmptyState({ icon = 'chat', title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><I name={icon} size={44} /></div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  );
}
```

- [ ] **Step 4: 创建 FeatureItem.jsx**

```jsx
import React from 'react';
import { I } from '../Icon';

export default function FeatureItem({ icon, tone, title, desc, onClick, loading }) {
  return (
    <button className="feature-item" onClick={onClick}>
      <span className={`feature-icon feature-${tone}`}><I name={icon} size={20} /></span>
      <span className="feature-copy">
        <span className="feature-title">{title}</span>
        <span className="feature-desc">{loading || desc}</span>
      </span>
      <I name="arrowRight" size={17} className="feature-arrow" />
    </button>
  );
}
```

- [ ] **Step 5: 创建 MeMenuItem.jsx**

```jsx
import React from 'react';
import { I } from '../Icon';

export default function MeMenuItem({ icon, tone, label, meta, onClick }) {
  return (
    <button className="me-menu-item" onClick={onClick}>
      <span className={`menu-icon menu-${tone}`}><I name={icon} size={18} /></span>
      <span>{label}</span>
      {meta ? <span className="menu-badge">{meta}</span> : <I name="arrowRight" size={17} className="menu-arrow" />}
    </button>
  );
}
```

- [ ] **Step 6: 在 App.js 中替换导入，删除原地定义**

Add imports:
```js
import AvatarImg from './components/ui/AvatarImg';
import RoomAvatar from './components/ui/RoomAvatar';
import EmptyState from './components/ui/EmptyState';
import FeatureItem from './components/ui/FeatureItem';
import MeMenuItem from './components/ui/MeMenuItem';
```

Remove the original component definitions (lines 65-137) and the `getAvatarUrl` usage within old AvatarImg.

- [ ] **Step 7: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add client/src/components/ui/ client/src/App.js
git commit -m "feat: extract base UI components (AvatarImg, RoomAvatar, EmptyState, FeatureItem, MeMenuItem)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.6: 创建 useToast hook + Toast 组件

**Files:**
- Create: `client/src/hooks/useToast.js`
- Create: `client/src/components/ui/Toast.jsx`
- Modify: `client/src/App.js:317-324` (toast state removal)

- [ ] **Step 1: 创建 useToast.js**

```js
import { useState, useRef, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}
```

- [ ] **Step 2: 创建 Toast.jsx**

```jsx
import React from 'react';
import { I } from '../Icon';

export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      {toast.type === 'success' && <I name="checkin" size={14} />}
      {toast.type === 'error' && <I name="close" size={14} />}
      {toast.type === 'info' && <I name="info" size={14} />}
      <span>{toast.message}</span>
    </div>
  );
}
```

Note: Need to add `info` to iconMap in `client/src/config/icons.js` — map to `Info` from lucide-react.

- [ ] **Step 3: 更新 icons.js 添加 info 图标**

In `client/src/config/icons.js`:
```js
// Add to imports:
import { ..., Info } from 'lucide-react';

// Add to iconMap:
info: Info,
```

- [ ] **Step 4: 在 App.js 中替换**

Add import: `import { useToast } from './hooks/useToast';`
Add import: `import Toast from './components/ui/Toast';`

Replace the inline toast state and showToast (lines 317-324) with:
```js
const { toast, showToast } = useToast();
```

Replace the inline toast JSX at the bottom of render (lines 5249-5256) with:
```jsx
<Toast toast={toast} />
```

- [ ] **Step 5: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/useToast.js client/src/components/ui/Toast.jsx client/src/config/icons.js client/src/App.js
git commit -m "feat: extract Toast system (useToast hook + Toast component)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.7: 创建 useSettings hook

**Files:**
- Create: `client/src/hooks/useSettings.js`
- Modify: `client/src/App.js:216-232,238-240,338-341,497` (settings state removal)

- [ ] **Step 1: 创建 useSettings.js**

```js
import { useState, useEffect, useCallback } from 'react';

export function useSettings() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('chatFontSize') || '15'));
  const [themePreset, setThemePreset] = useState(() => localStorage.getItem('themePreset') || 'mint');
  const [chatBackgrounds, setChatBackgrounds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chatBackgrounds') || '{}'); } catch { return {}; }
  });
  const [mutedRooms, setMutedRooms] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mutedRooms') || '[]')); } catch { return new Set(); }
  });
  const [starredMessages, setStarredMessages] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('starredMessages') || '[]')); } catch { return new Set(); }
  });
  const [pinnedMessages, setPinnedMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedMessages') || '{}'); } catch { return {}; }
  });
  const [roomAnnouncements, setRoomAnnouncements] = useState(() => {
    try { return JSON.parse(localStorage.getItem('roomAnnouncements') || '{}'); } catch { return {}; }
  });
  const [pinnedChats, setPinnedChats] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinnedChats') || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => { localStorage.setItem('chatFontSize', fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem('themePreset', themePreset); }, [themePreset]);
  useEffect(() => { localStorage.setItem('chatBackgrounds', JSON.stringify(chatBackgrounds)); }, [chatBackgrounds]);
  useEffect(() => { localStorage.setItem('mutedRooms', JSON.stringify([...mutedRooms])); }, [mutedRooms]);
  useEffect(() => { localStorage.setItem('starredMessages', JSON.stringify([...starredMessages])); }, [starredMessages]);
  useEffect(() => { localStorage.setItem('pinnedMessages', JSON.stringify(pinnedMessages)); }, [pinnedMessages]);
  useEffect(() => { localStorage.setItem('roomAnnouncements', JSON.stringify(roomAnnouncements)); }, [roomAnnouncements]);
  useEffect(() => { localStorage.setItem('pinnedChats', JSON.stringify([...pinnedChats])); }, [pinnedChats]);

  const toggleDarkMode = useCallback(() => setDarkMode(d => !d), []);
  const toggleStarMessage = useCallback((id) => {
    setStarredMessages(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const togglePinChat = useCallback((id) => {
    setPinnedChats(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  return {
    darkMode, toggleDarkMode, fontSize, setFontSize,
    themePreset, setThemePreset,
    chatBackgrounds, setChatBackgrounds,
    mutedRooms, setMutedRooms,
    starredMessages, toggleStarMessage,
    pinnedMessages, setPinnedMessages,
    roomAnnouncements, setRoomAnnouncements,
    pinnedChats, togglePinChat,
  };
}
```

- [ ] **Step 2: 在 App.js 中替换**

Add import: `import { useSettings } from './hooks/useSettings';`

Replace the individual useState declarations (lines 216-232, 238-240, 293-295, 338-339, 341, 347-349, 497) with:
```js
const {
  darkMode, toggleDarkMode, fontSize, setFontSize,
  themePreset, setThemePreset,
  chatBackgrounds, setChatBackgrounds,
  mutedRooms, setMutedRooms,
  starredMessages, toggleStarMessage,
  pinnedMessages, setPinnedMessages,
  roomAnnouncements, setRoomAnnouncements,
  pinnedChats, togglePinChat,
} = useSettings();
```

Remove the original localStorage useEffect hooks (lines 409-410, 691-719) — these are now in useSettings.

Remove the `toggleDarkMode`, `toggleStarMessage`, `togglePinChat` function definitions in App.js — now provided by useSettings.

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useSettings.js client/src/App.js
git commit -m "feat: extract settings logic to useSettings hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2: Hooks 层

### Task 2.1: 创建 useAuth hook

**Files:**
- Create: `client/src/hooks/useAuth.js`
- Modify: `client/src/App.js:185-191,562-627,629-633` (auth state removal)

- [ ] **Step 1: 创建 useAuth.js**

```js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { isCapacitor, API_URL } from '../utils/constants';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '');
  const [password, setPassword] = useState(localStorage.getItem('savedPassword') || '');
  const [error, setError] = useState('');
  const [diag, setDiag] = useState('');

  // APK 启动自动登录
  useEffect(() => {
    const startup = async () => {
      if (isCapacitor) {
        const u = localStorage.getItem('savedUsername');
        const p = localStorage.getItem('savedPassword');
        if (u && p) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: u, password: p }, { timeout: 10000 });
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + '🔐 OK | ');
          } catch {
            localStorage.removeItem('token'); localStorage.removeItem('user');
            setToken(null); setUser(null);
            setDiag(d => d + '🔐 FAIL | ');
          }
        }
      }
      if (isCapacitor) {
        try {
          await axios.get(`${API_URL}/api/ai/models`, { timeout: 5000 });
          setDiag(d => d + '✅ | ');
        } catch {
          setDiag(d => d + '❌ | ');
        }
      }
    };
    startup();

    const checkAuth = async () => {
      const savedToken = localStorage.getItem('token');
      if (!savedToken) return;
      try {
        await axios.get(`${API_URL}/api/profile`, { headers: { Authorization: savedToken } });
      } catch (err) {
        const savedUser = localStorage.getItem('savedUsername');
        const savedPass = localStorage.getItem('savedPassword');
        if (savedUser && savedPass) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: savedUser, password: savedPass });
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + 'Auto-relogin OK | ');
            return;
          } catch (e2) {
            setDiag(d => d + 'Auto-relogin FAILED | ');
          }
        }
        localStorage.removeItem('token'); localStorage.removeItem('user');
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

  const validateToken = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/profile`, { headers: { Authorization: token } });
      setUser(res.data);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
    }
  }, [token]);

  const handleAuth = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (authMode === 'register') {
        await axios.post(`${API_URL}/api/register`, { username, password });
        const res = await axios.post(`${API_URL}/api/login`, { username, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('savedUsername', username);
        localStorage.setItem('savedPassword', password);
        setToken(res.data.token);
        setUser(res.data.user);
        setIsAuthenticated(true);
      } else {
        const res = await axios.post(`${API_URL}/api/login`, { username, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('savedUsername', username);
        localStorage.setItem('savedPassword', password);
        setToken(res.data.token);
        setUser(res.data.user);
        setIsAuthenticated(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || '操作失败');
    }
  }, [authMode, username, password]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('savedPassword');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated, user, token, setUser, setToken,
    authMode, setAuthMode, username, setUsername,
    password, setPassword, error, setError,
    handleAuth, handleLogout, diag,
  };
}
```

- [ ] **Step 2: 在 App.js 中替换**

Add import: `import { useAuth } from './hooks/useAuth';`

Replace auth state declarations (lines 185-191) and the 3 auth-related useEffects (lines 562-633) with:
```js
const {
  isAuthenticated, user, token, setUser, setToken,
  authMode, setAuthMode, username, setUsername,
  password, setPassword, error, setError,
  handleAuth, handleLogout, diag,
} = useAuth();
```

Delete the original `validateToken`, `handleAuth`, `handleLogout` function definitions in App.js.

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useAuth.js client/src/App.js
git commit -m "feat: extract auth logic to useAuth hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 2.2—2.12: 继续提取其余 hooks

以下每个 hook 遵循相同模式：创建 hook 文件 → 在 App.js 中替换 → 构建验证 → 提交。

**Hook 清单** (因篇幅原因，此处列出签名和职责，实现时按需展开):

- `useSocket.js` — socketRef, onlineUsers, connectSocket, socket event setup/teardown
- `useRooms.js` — rooms, currentRoom, currentRoomId, setCurrentRoom/setCurrentRoomId, handleRoomClick, createGroup, unreadCounts
- `useChat.js` — messages, newMessage, sendMessage, recallMessage, editMessage, deleteMessage, replyToMessage, reactions, file upload
- `useFriends.js` — friends, friendRequests, searchUser, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, contactsGrouped
- `useAI.js` — aiMessages, aiInput, aiModel, aiModels, sendAiMessage, smartReplies, polishMessage, fetchDailyDigest, imageGen, imageDesc, translateMessage
- `usePanels.js` — music, GIF, news, weather, map, bilibili search state and actions
- `useWallet.js` — balance, recharge, redPackets, rechargeHistory, pendingRecharges
- `useSocial.js` — moments, polls, solitaire, checkIn, game
- `useCall.js` — WebRTC callState, peerRef, startCall, acceptCall, hangUp, location sharing

**每个 hook 完成后必须:**
1. `cd client && npm run build` 零错误
2. 功能手动验证 (登录/聊天/AI等核心流程)
3. Git commit

---

## Phase 3: 组件拆分

### Task 3.1: 创建 AuthScreen 组件

**Files:**
- Create: `client/src/components/AuthScreen.jsx`
- Modify: `client/src/App.js:2963-3013` (auth render block)

- [ ] **Step 1: 创建 AuthScreen.jsx**

```jsx
import React from 'react';
import { I } from './Icon';
import { isCapacitor, SERVER_URL } from '../utils/constants';

export default function AuthScreen({
  username, setUsername, password, setPassword,
  authMode, setAuthMode, error, handleAuth,
  setShowResetPw, setResetPwStep, setResetPwPhone,
  setResetPwCode, setResetPwNewPw, setResetPwCountdown
}) {
  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>聊天室</h1>
        <p className="auth-subtitle">清爽、轻快的即时聊天空间</p>
        <form className="auth-form" onSubmit={handleAuth}>
          <div className="input-group">
            <span className="input-icon"><I name="me" size={17} /></span>
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <span className="input-icon"><I name="security" size={17} /></span>
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="auth-btn" type="submit">
            {authMode === 'login' ? '登录' : '注册'}
          </button>
          <div className="switch-auth">
            {authMode === 'login' ? (
              <>没有账号？<a onClick={() => setAuthMode('register')}>注册</a></>
            ) : (
              <>已有账号？<a onClick={() => setAuthMode('login')}>登录</a></>
            )}
          </div>
          {isCapacitor && (
            <div className="server-info-row">
              服务器：{SERVER_URL}
            </div>
          )}
          {authMode === 'login' && (
            <span className="forgot-pw-link" onClick={() => {
              setShowResetPw(true); setResetPwStep(0);
              setResetPwPhone(''); setResetPwCode(''); setResetPwNewPw('');
            }}>
              忘记密码？
            </span>
          )}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.js 中替换**

Add import: `import AuthScreen from './components/AuthScreen';`

Replace the auth return block (lines 2963-3013) with:
```jsx
if (!isAuthenticated) {
  return (
    <AuthScreen
      username={username} setUsername={setUsername}
      password={password} setPassword={setPassword}
      authMode={authMode} setAuthMode={setAuthMode}
      error={error} handleAuth={handleAuth}
      setShowResetPw={setShowResetPw}
      setResetPwStep={setResetPwStep}
      setResetPwPhone={setResetPwPhone}
      setResetPwCode={setResetPwCode}
      setResetPwNewPw={setResetPwNewPw}
    />
  );
}
```

- [ ] **Step 3: 添加 CSS class `.server-info-row`**

In `client/src/styles/auth.css`:
```css
.server-info-row {
  margin-top: 12px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
}
```

- [ ] **Step 4: 构建验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AuthScreen.jsx client/src/styles/auth.css client/src/App.js
git commit -m "feat: extract AuthScreen component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 3.2—3.N: 继续拆分其余组件

遵循相同的提取模式（创建组件 → App.js 替换 → 添加CSS → 构建 → 提交）。

**组件提取顺序** (按依赖关系):
1. `SplashScreen.jsx` — 启动闪屏
2. `BottomTabBar.jsx` — 底部4Tab导航
3. `Sidebar.jsx` + `RoomList.jsx` + `RoomItem.jsx` — 侧边栏+聊天列表
4. `ContactsView.jsx` — 通讯录页面
5. `DiscoverView.jsx` — 发现页面
6. `MeView.jsx` — 我的页面
7. `AiView.jsx` — AI助手
8. `BilibiliView.jsx` — B站视频
9. `ChatView.jsx` + `ChatHeader.jsx` + `MessageItem.jsx` + `ChatInput.jsx` — 聊天核心
10. `ImageViewer.jsx` — 图片查看器
11. `Modal.jsx` — 通用弹窗容器
12. 各 Modal 组件 (ProfileModal, AddFriendModal, ...)
13. 各 Panel 组件 (MusicPanel, GifPanel, ...)
14. Call 组件 (CallOverlay, CallIncoming)

**每个组件提取的标准步骤**:
```bash
# 1. 创建组件文件(含所有 props)
# 2. 在 App.js 中 import 并替换 JSX 块
# 3. 提取相关 inline style 到对应 CSS 文件
# 4. cd client && npm run build (zero errors)
# 5. git add + git commit
```

---

## Phase 4: CSS 重构

### Task 4.1: 创建 CSS 文件骨架 + 在 index.css 中引入

**Files:**
- Create: All `client/src/styles/*.css` files
- Modify: `client/src/index.css`

- [ ] **Step 1: 创建 CSS 文件**

```bash
touch client/src/styles/auth.css
touch client/src/styles/layout.css
touch client/src/styles/sidebar.css
touch client/src/styles/chat.css
touch client/src/styles/contacts.css
touch client/src/styles/discover.css
touch client/src/styles/me.css
touch client/src/styles/ai.css
touch client/src/styles/panels.css
touch client/src/styles/modals.css
touch client/src/styles/components.css
touch client/src/styles/themes.css
touch client/src/styles/responsive.css
```

- [ ] **Step 2: 重构 index.css**

`index.css` 保留为 ~200行，只包含:
```css
/* ===== CSS 变量 ===== */
@import './styles/themes.css';

/* ===== Reset & Base ===== */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { ... } /* current base styles */
::-webkit-scrollbar { ... } /* current scrollbar */

/* ===== 功能模块 ===== */
@import './styles/layout.css';
@import './styles/auth.css';
@import './styles/sidebar.css';
@import './styles/chat.css';
@import './styles/contacts.css';
@import './styles/discover.css';
@import './styles/me.css';
@import './styles/ai.css';
@import './styles/panels.css';
@import './styles/modals.css';
@import './styles/components.css';

/* ===== 响应式 ===== */
@import './styles/responsive.css';
```

- [ ] **Step 3: 将现有 CSS 按模块拆分到各文件**

根据原 index.css 中的注释分隔符 `/* ===== Section Name ===== */`，将对应样式移到对应的 CSS 文件。

- [ ] **Step 4: 提取所有内联 style 到 CSS**

扫描所有组件 JSX 中的 `style={{}}`：
- 静态值 → 提取为 CSS class
- 动态值（如 `width: ${p}%`）→ 保留
- 颜色值 → 用 CSS 变量替换

**需要新增的 CSS 变量** (在 themes.css 中):
```css
:root {
  --recharge-confirm: #07c160;
  --recharge-reject: #fa5151;
  --music-gradient: linear-gradient(135deg, #ec4141, #e03a3a);
  --gif-gradient: linear-gradient(135deg, #fb7299, #cc66cc);
  --weather-gradient: linear-gradient(135deg, #667eea, #764ba2);
  --glass-bg: rgba(255, 255, 255, 0.22);
  --glass-border: rgba(255, 255, 255, 0.34);
  --glass-blur: blur(12px);
  --mobile-tab-offset: 72px;
}
```

- [ ] **Step 5: 构建 + 视觉验证**

Run: `cd client && npm run build`
Expected: No errors, no visual regression

- [ ] **Step 6: Commit**

```bash
git add client/src/styles/ client/src/index.css client/src/components/
git commit -m "refactor: split CSS into modular files + extract inline styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5: 交互打磨 + 性能优化

### Task 5.1: 修复 ErrorBoundary 的破坏性错误处理

**Files:**
- Modify: `client/src/index.js:49-55`

- [ ] **Step 1: 替换 window.onerror 和 onunhandledrejection**

Replace lines 49-55 with:
```js
window.onerror = (msg, src, line, col, err) => {
  console.error('Global error:', { msg, src, line, col, err });
  return true; // prevent default browser error UI, ErrorBoundary handles it
};
window.onunhandledrejection = (e) => {
  console.error('Unhandled rejection:', e.reason);
};
```

- [ ] **Step 2: 验证**

Run: `cd client && npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/index.js
git commit -m "fix: replace destructive error handler in index.js

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 5.2: 修复交互问题 1-6

**Files:**
- Modify: Various component files

- [ ] **Step 1: 替换 Solitaire join 的 prompt()**

In `MessageItem.jsx` (or wherever solitaire join is rendered):
Replace `window.prompt()` call with a small inline form with text input and confirm/cancel buttons.

- [ ] **Step 2: 添加按钮 loading 状态**

为所有异步操作的按钮添加 `disabled={loading}` 和文本变化:
```jsx
<button disabled={loading}>
  {loading ? '发送中...' : '发送'}
</button>
```

- [ ] **Step 3: 修复深色模式切换图标**

在 `BottomTabBar.jsx` 或 App.js 中:
```jsx
<button onClick={toggleDarkMode}>
  {darkMode ? <I name="moon" size={15} /> : <I name="sun" size={15} />}
</button>
```

注意: 需要在 icons.js 中添加 `moon` 和 `sun` 图标映射（如 `Sun`, `Moon` from lucide-react）。

- [ ] **Step 4: Toast 图标替换为 Lucide**

Already done in Task 1.6. Verify `<I name="checkin">` / `<I name="close">` / info icon usage.

- [ ] **Step 5: 添加聊天删除确认弹窗**

在 `RoomItem.jsx` 的 delete 按钮中:
```jsx
const handleDelete = (roomId, e) => {
  e.stopPropagation();
  if (window.confirm('确定删除该聊天？所有聊天记录将被删除。')) {
    deleteChat(roomId);
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add client/src/
git commit -m "fix: interaction improvements (loading states, prompts, dark mode icon, delete confirm)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 5.3: 修复交互问题 7-12

- [ ] **Step 1: onKeyPress → onKeyDown**

Replace all `onKeyPress` with `onKeyDown` in input components.

- [ ] **Step 2: 红包/投票/接龙即时反馈**

Add toast notifications on action start and completion.

- [ ] **Step 3: 图片查看器触控区 ≥ 44px**

In ImageViewer CSS:
```css
.image-viewer-close { min-width: 44px; min-height: 44px; }
.image-viewer-nav { min-width: 44px; min-height: 44px; }
```

- [ ] **Step 4: 添加"↓ 新消息"浮动按钮**

In ChatView:
```jsx
const [showScrollDown, setShowScrollDown] = useState(false);
// IntersectionObserver on messagesContainer to detect when scrolled up
// Float button: onClick → scroll to bottom
```

- [ ] **Step 5: 语音录制"上滑取消"提示**

In ChatInput, add visual hint during recording:
```jsx
{isRecording && (
  <div className="recording-hint">
    <span>上滑取消发送</span>
  </div>
)}
```

- [ ] **Step 6: 群公告编辑替换 alert/prompt**

Replace any remaining `alert()` or `prompt()` calls with Modal-based alternatives.

- [ ] **Step 7: Commit**

```bash
git add client/src/
git commit -m "fix: interaction polish (onKeyDown, scroll-down button, recording hint, touch targets)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 5.4: 性能优化 — useCallback/useMemo

**Files:**
- Modify: All component files with inline functions

- [ ] **Step 1: 包装事件处理函数**

Scan all components for inline arrow functions in JSX props (`onClick={(e) => ...}`) and extract them to `useCallback`-wrapped named functions.

- [ ] **Step 2: 包装计算值**

Scan for computed values in render (filter, map, reduce) and wrap in `useMemo`.

- [ ] **Step 3: 构建验证**

Run: `cd client && npm run build`
Expected: No errors, no new lint warnings

- [ ] **Step 4: Commit**

```bash
git add client/src/
git commit -m "perf: add useCallback/useMemo optimizations

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 5.5: 最终全面测试

- [ ] **Step 1: 构建验证**

Run: `cd client && npm run build`
Expected: Zero errors

- [ ] **Step 2: 后端语法验证**

Run: `cd server && node --check server.js`
Expected: No syntax errors

- [ ] **Step 3: 功能清单逐项测试**

- [ ] 注册新用户 → 登录
- [ ] 添加好友（ID搜索）
- [ ] 创建群聊
- [ ] 文本消息发送/接收/撤回/编辑/删除
- [ ] 图片/文件上传
- [ ] 红包发送/领取
- [ ] 投票创建/投票
- [ ] 群接龙
- [ ] AI助手对话
- [ ] AI图片生成
- [ ] 音乐搜索/播放/分享
- [ ] GIF搜索/发送
- [ ] B站视频搜索
- [ ] 天气查询
- [ ] 地图搜索/GPS
- [ ] 朋友圈发布/点赞/评论
- [ ] 打卡签到
- [ ] 深色模式切换
- [ ] 移动端布局（768px/480px）
- [ ] 充值流程（用户申请 → admin确认）

- [ ] **Step 4: 版本号更新**

在 `client/src/utils/constants.js` 中:
```js
export const WEB_BUILD = 226; // +1 for this refactor
```

同步更新 `client/public/ota-version.json`:
```json
{ "appVersion": "3.0.0", "webBuild": 226, "nativeBuild": 4 }
```

- [ ] **Step 5: 更新 CHANGELOG.md**

```markdown
## v3.0.1 - 2026-06-15
### 重构
- App.js 从 5261 行拆分为 ~50 个组件 + 12 个 hooks
- CSS 从 6577 行单文件拆分为 12 个模块文件
- 所有内联 style 提取为 CSS class
- 修复 12 项交互问题
- 性能优化 (useCallback/useMemo)
```

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/constants.js client/public/ota-version.json CHANGELOG.md
git commit -m "chore: bump webBuild to 226 + update changelog

Co-Authored-By: Claude <noreply@anthropic.com>"
```
