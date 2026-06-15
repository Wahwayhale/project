# Changelog

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
