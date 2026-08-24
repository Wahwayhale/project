# Changelog

## [4.0.0] - 2026-08-24

### 功能
- AI 文档解析：后端新增 `/api/ai/parse-document` 端点（pdf-parse + mammoth），前端 AI 面板加文档上传入口，解析文本作为 system 上下文一次性喂给 AI。
- 沉浸光感设计深化：新增 `aurora-glass.css`，全局多层径向渐变光晕背景、毛玻璃组件扩展（模糊半径随层级递增）、mask-image 动态模糊边界、@supports 降级。
- Windows 桌面端：新建 `desktop/` 目录（Electron + electron-builder NSIS），复用 ngrok Web + OTA，出 `ChatRoom-Setup-4.0.0.exe`。

### 修复
- 修复 `--glass-blur` CSS 变量被引用但未定义，导致现有毛玻璃 backdrop-filter 静默失效的问题。

### 设计原理
- 光感设计遵循「全场景渐变模糊 + 柔和边界」方向，模糊半径随组件层级递增（Tab 8px → 输入 6px → 卡片 10px → 侧边栏 12px → 弹窗 16px）。
- 桌面端复用现有 Web 资产，零侵入，不动 capacitor.config.ts，exe 独立版本号。

### 注意事项
- 本次 webBuild 237 → 239（AI 文档解析 +1、光感设计 +1；Electron 是独立 exe 产物不影响 webBuild）。
- nativeBuild 不变（4），无需新 APK；已装 APK 下次打开自动 OTA 加载新 Web。
- Windows exe 需在 desktop/ 目录单独 `npm install && npm run dist` 构建，不在 Web build 流程内。

## [Unreleased] - 2026-08-21

### 功能
- 全面重设计前端视觉系统：新色板、新字体、新圆角与阴影体系。
- 侧边栏聊天列表改为卡片化、圆角头像、hover 抬升、更清晰的置顶区分。
- 底部 Tab 导航新增活跃指示器、图标弹跳、更明确的触摸反馈。
- 启动闪屏改为品牌 SVG 图标 + 毛玻璃卡片 + 浮动动画。
- 登录页使用电光青/琥珀渐变光晕 + 毛玻璃卡片。
- 聊天窗口消息气泡更新为 cyan 渐变（己方）与浅灰（对方），头像统一为 squircle。
- 发现页在桌面端改为彩色功能卡片网格，移动端保持列表。
- 通讯录、我的页面头部与菜单项统一为新卡片风格。
- 弹窗、Toast、空状态、输入框统一为新 token 与动效。
- 新增 favicon.svg 与 manifest.json，完善 PWA 元信息。

### 修复与调整
- 修复聊天页输入框被顶到顶部的问题：给 `.chat-thread` 和 `.messages-container` 补上 flex 伸缩。
- 聊天输入框改为均匀一圈的柔和光晕，移除不均匀的径向渐变背景。
- 功能面板（+ 号抽屉）增加「返回」箭头 + 标题 + 关闭按钮，更像二级页面/弹窗。
- 发现页与功能面板图标改为更成熟的浅色描边风格，去掉高饱和渐变方块。
- Tamagotchi 宠物状态从 emoji（❤️🍎⭐💤）替换为 Lucide 图标。
- 替换其他界面 emoji 图标：频道标识、文件摘要、只读提示、错误边界警告。
- 新增 `heart`、`apple` 两个图标到图标库。

### 设计原理
- 整体方向定为「活泼年轻 / 社交感」，同时避免女性化色调与 AI 设计 cliché。
- 主色从薄荷绿改为电光青（#0ea5e9）到青绿（#06b6d4）的渐变，强调色用琥珀（#f59e0b）。
- 标题字体引入 Space Grotesk，正文保留优质中文回退栈。
- 间距、字号、圆角全部基于 8px 网格与 CSS 变量，确保跨页面一致。

### 注意事项
- 本次改动仅涉及视觉层与交互层，未修改业务逻辑、socket、钱包、AI 等功能。
- 桌面端隐藏底部 Tab 导航，继续使用左侧边栏；移动端使用底部导航。
- `glass-theme.css` 不再被 `index.css` 引用，其中旧色板不影响当前渲染。
- 后续如需进一步打磨，可重点优化深色模式完整性与 AI 视图、视频视图等子页面。

## v3.0.1 - 2026-06-15

### 重构
- App.js 从 5261 行拆分为 ~70 个文件（组件 + hooks + utils + styles）
- CSS 从 6577 行拆分为模块文件（themes.css, auth.css, responsive.css）
- 提取 12 个自定义 hooks（useAuth, useSocket, useChat, useRooms, useFriends, useAI, usePanels, useWallet, useSocial, useCall, useSettings, useToast）
- 提取 30+ 组件（ChatView, ContactsView, DiscoverView, MeView, 23 个 Modal/Panel + BottomTabBar, SplashScreen, ImageViewer）
- 修复 ErrorBoundary 破坏性错误处理（document.body.innerHTML → console.error）
- 修复深色模式切换图标（search/star → moon/sun）
- 修复 onKeyPress → onKeyDown

## v2.0.2 (2026-06-10)

### Fixed
- 24 `alert()` calls replaced with non-blocking `showToast()`
- Mobile back button added to chat header
- Map: click-to-open in system browser instead of iframe (APK)
- OTA check simplified: `serverVer !== appVersion`

### Added
- Optimistic message send (instant display)
- APK: auto-relogin on startup with saved credentials
- `start-prod.bat` for PM2 production launch

## v2.0.1 (2026-06-10)

### Added
- Amap (高德) POI search + interactive map via Amap JS API
- API key hot-reload (`POST /api/admin/reload-config`)
- Message delete (per-chat deletion)
- Desktop notifications (Browser Notification API)
- Group events with 5-min reminders
- Enhanced message search with type filter
- Theme presets (green/blue/purple/orange)
- Image compression before upload (>500KB → Canvas resize)

### Changed
- Map: OpenStreetMap → Amap (高德)
- Weather: client-direct → server proxy
- Socket: WebSocket-only transport + per-message deflate

## v2.0.0 (2026-06-09)

### Added
- AI: smart-reply, text polish, daily digest, title generator
- AI: image recognition (GLM-4V), translate-message (13 langs)
- Netease Cloud Music (search/play/lyric via API)
- GIF search (GIPHY), weather (wttr.in), news (Zhihu Daily)
- QR code generator (local), random quotes, link preview
- Lucide React icon system (1.2px stroke, 24×24, 70+ icons)
- Capacitor bundled APK mode with geolocation plugin
- Chunked file upload with progress (>2MB auto-chunk)
- HTTP gzip compression (88% on messages API)
- Atomic file writes with backup recovery
- Rate limiting (120/min global, 10/min login)
- Health check endpoint `/health`
- Hourly automated backup (24h retention)
- PM2 ecosystem config for production
- Dual server support: Web (3001) + App (3002)

### Changed
- Message limit: 500 → 3000
- Emojis → Lucide linear icons (all UI chrome)
- iOS/Android full mobile layout adaptation
- Chat privacy: `isRoomMember()` enforcement on all room ops
- DeepSeek R1: Tencent MAS proxy endpoint

### Fixed
- Balance display crash when `null`
- `allMessagesRead` crash on messages without `readBy` field
- Bilibili cover images protocol-relative URL fix
- Discover page scroll on mobile
- Infinite render loop in video lazy loading
- JSON file corruption via atomic writes

## v1.0.0 (2026-06-04)

### Initial Release
- Real-time chat (WebSocket)
- Friend system (6-digit ID)
- JWT auth, bcrypt passwords
- AI chat (Zhipu GLM-4-Flash)
- Bilibili video search
- Recharge system
- Red packets, polls, dice, rock-paper-scissors
- WebRTC video calls
- Bots with auto-reply
- JSON file persistence
