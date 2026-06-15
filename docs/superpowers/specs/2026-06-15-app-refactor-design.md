# App 全面重构设计

> 日期: 2026-06-15 | 状态: 已确认 | 方案: B — 全面架构重构

## 目标

对 5261 行单文件 App.js + 6577 行 CSS 进行全面架构重构，同时优化交互、性能和 UI 一致性。

## 当前问题

| 类别 | 问题 | 严重度 |
|------|------|--------|
| 代码结构 | App.js 5261行单文件，150+ useState | 🔴 |
| 规范违反 | 数百处内联 style={{}} 写颜色/字号/间距 | 🔴 |
| 交互 | window.prompt() 阻塞UI、按钮无loading反馈 | 🟡 |
| 图标 | 混用emoji和Lucide | 🟡 |
| 硬编码色 | #07c160 #fa5151 #888 未使用CSS变量 | 🟡 |
| 性能 | JSX中大量内联函数，无useCallback/useMemo | 🟡 |
| 深色模式 | 切换图标错误，内联style无法响应dark mode | 🟡 |
| 错误处理 | index.js用document.body.innerHTML=破坏性覆盖 | 🟠 |
| 移动端 | 部分触控区<44px | 🟠 |

## 新文件结构

```
client/src/
  App.js                  → 精简为 ~200行，只做路由和顶层布局
  index.js                → 入口 + ErrorBoundary（修复 innerHTML 问题）
  index.css               → 全局变量 + 基础 reset + 布局
  styles/
    auth.css, sidebar.css, chat.css, contacts.css, discover.css,
    me.css, ai.css, panels.css, modals.css, components.css,
    themes.css, responsive.css
  hooks/
    useAuth.js, useSocket.js, useChat.js, useRooms.js, useFriends.js,
    useAI.js, usePanels.js, useWallet.js, useSocial.js, useCall.js,
    useSettings.js, useToast.js
  components/
    AuthScreen.jsx, MainLayout.jsx, Sidebar.jsx, RoomList.jsx,
    RoomItem.jsx, ChatView.jsx, ChatHeader.jsx, MessageItem.jsx,
    ChatInput.jsx, ContactsView.jsx, DiscoverView.jsx, MeView.jsx,
    AiView.jsx, BilibiliView.jsx, BottomTabBar.jsx
    ui/  (EmptyState, FeatureItem, MeMenuItem, AvatarImg, RoomAvatar,
          Toast, ImageViewer, SplashScreen, Modal)
    panels/ (MusicPanel, GifPanel, NewsPanel, WeatherPanel, MapPanel,
             MomentsPanel)
    modals/ (ProfileModal, AddFriendModal, CreateGroupModal,
             RechargeModal, AdminModal, RoomManageModal, RedPacketModal,
             PollModal, GameModal, MusicShareModal, ForwardModal,
             BackupModal, ImageGenModal, CheckInModal, WrappedModal,
             BotModal, PolishModal, DailyDigestModal, SolitaireModal,
             ResetPwModal, PhoneModal, MajorUpdateModal)
    call/ (CallOverlay, CallIncoming)
  utils/
    format.js, bilibili.js, avatar.js, constants.js
```

## 数据流设计

### Context 分层

| Context | 内容 | 消费者 |
|---------|------|--------|
| AuthContext | user, token, isAuthenticated | 全局 |
| SocketContext | socketRef, onlineUsers | ChatView, RoomList |
| RoomsContext | rooms, currentRoom, unreadCounts | Sidebar, ChatHeader |
| ToastContext | showToast() | 全局 |
| SettingsContext | darkMode, fontSize, themePreset | 全局 |

### 状态归属

- **Context**: 跨组件共享的核心状态
- **Hooks**: 组件内状态逻辑封装（useChat, useAI, usePanels...）
- **Local state**: UI 开关类（showEmojiPicker, showXxxModal）

## CSS 重构策略

- 所有内联 style={{}} 中的静态值 → CSS class
- 新增 CSS 变量补全缺失颜色
- 媒体查询集中到 responsive.css
- Class 命名：BEM 风格

## 交互优化清单

1. window.prompt() → Modal 内输入框
2. 所有异步按钮加 loading 状态
3. 消息发送乐观更新（半透明→实色→失败红色+重试）
4. 深色模式切换图标修正
5. 聊天删除加确认弹窗
6. Toast 图标用 Lucide 替代 emoji
7. onKeyPress → onKeyDown
8. 红包/投票/接龙加即时反馈
9. 图片查看器触控热区扩大至 44×44px
10. 添加"↓ 新消息"浮动按钮
11. 语音录制加"上滑取消"提示
12. 群公告编辑替换 prompt()

## 实施计划

| Phase | 内容 | 验证 |
|-------|------|------|
| 1 - 基础设施 | 目录结构、utils/、基础hooks、ui组件、CSS变量补全 | npm run build |
| 2 - Hooks层 | 逐个提取12个hooks，App.js中替换 | 每次构建通过 |
| 3 - 组件拆分 | 提取所有View/Panel/Modal组件 | 每次构建+交互正常 |
| 4 - CSS重构 | inline style→CSS class，拆分CSS文件 | 视觉回归+构建 |
| 5 - 交互打磨 | 12项交互优化 + useCallback/useMemo + 全面测试 | 手动全功能测试 |

## 风险控制

- 每 Phase 一个 git 分支
- App.js 保留到 Phase 4，渐进替换
- 每 Phase 后执行 npm run build + node --check server.js
- 不修改 server.js
