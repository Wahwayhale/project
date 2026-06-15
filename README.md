# 聊天室 v3.0.0

青春小清新的现代化即时通讯平台，支持 AI、音乐、地图等 30+ 功能。

## 快速启动

```bash
# 一键启动（自动安装依赖 + 构建 + 启动服务器 + ngrok）
start.bat
```

浏览器打开 `http://localhost:3001`

## 功能

| 分类 | 功能 |
|------|------|
| 聊天 | 文字/图片/视频/文件/GIF，撤回/编辑/删除，已读回执，@提醒 |
| AI | 多模型对话、智能回复、文字润色、每日摘要、翻译(13语言)、图片识别 |
| 社交 | 好友系统、朋友圈、红包、投票、骰子、猜拳、接龙 |
| 娱乐 | B站视频、网易云音乐、GIF搜索、天气、热搜 |
| 工具 | 高德地图、二维码、链接预览、一言语录 |
| 办公 | 群日程提醒、群公告、禁言、踢人 |
| App | Android APK (Capacitor)、OTA自动更新、GPS定位 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Socket.io + Lucide Icons |
| 后端 | Express + Socket.io + JWT + bcrypt |
| AI | 智谱 GLM-4V / Kimi / DeepSeek R1 / 百度千帆 |
| 移动 | Capacitor 8 + Android WebView |
| 部署 | PM2 + ngrok |

## 文档

| 文档 | 内容 |
|------|------|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | 产品规格 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统架构 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 部署指南 |
| [SECURITY.md](SECURITY.md) | 安全策略 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [huashu-design.md](huashu-design.md) | 设计系统 |
| [CLAUDE.md](CLAUDE.md) | 开发规范 |

## APK 下载

```text
https://parakeet-nimble-cage.ngrok-free.dev/releases/ChatRoom-v3.0.0.apk
```

## 许可证

MIT
