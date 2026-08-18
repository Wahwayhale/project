# 聊天室 v3.0.0

青春小清新的现代化即时通讯平台，支持 AI、音乐、地图、协作等 30+ 功能，并可通过 Capacitor 打包为 Android APK。

## 快速启动

```bash
# 一键启动（自动安装依赖 + 构建 + 启动服务器 + ngrok）
start.bat
```

浏览器打开 `http://localhost:3001`

## 功能

| 分类 | 功能 |
|------|------|
| 聊天 | 文字/图片/视频/文件/GIF，撤回/编辑/删除，已读回执，@提醒，回复/转发/置顶/收藏/表情回应 |
| AI | 多模型对话、智能回复、文字润色、每日摘要、翻译(13语言)、图片识别、文生图、标题生成 |
| 社交 | 好友系统、朋友圈、红包、投票、骰子、猜拳、接龙 |
| 娱乐 | B站视频、网易云音乐、GIF搜索、天气、热搜 |
| 工具 | 高德地图、二维码、链接预览、一言语录 |
| 办公 | 群日程提醒、群公告、禁言、踢人 |
| 协作 | 语音房、白板、一起听/看同步播放、实时涂鸦卡片 |
| 增强 | 加密聊天、数字分身、社交图谱、电子宠物、代码沙箱、AR 面具 |
| App | Android APK (Capacitor)、OTA 自动更新、GPS 定位 |

## 项目结构

```
project-master/
├── client/                  # React 前端（已模块化拆分）
│   ├── src/
│   │   ├── App.js           # 主组件（编排 13 个 hooks + 60 个组件）
│   │   ├── index.js         # ReactDOM 入口 + ErrorBoundary
│   │   ├── components/      # 60 个组件（视图/弹窗/面板/UI/通话）
│   │   ├── hooks/           # 13 个自定义 hooks
│   │   ├── styles/          # 24 个模块化 CSS
│   │   ├── config/          # 图标映射
│   │   └── utils/           # 常量、格式化、头像、e2e 工具
│   ├── public/              # index.html + ota-version.json + changelog.json
│   ├── android/             # Capacitor 原生工程
│   └── releases/            # APK 产物
├── server/                  # Express 后端
│   ├── server.js            # 主服务（约 3800 行，REST + Socket.io）
│   ├── db.js                # JSON 持久化层（Collection 类，原子写入）
│   ├── data/                # 运行时数据（已被 git 忽略）
│   ├── uploads/             # 用户上传（已被 git 忽略）
│   └── .env / .env.web / .env.app
└── 文档 / 启动脚本 / PM2 配置
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Socket.io Client + Axios + Lucide Icons |
| 后端 | Express 4 + Socket.io 4 + JWT + bcryptjs（REST 100 端点 / Socket 68 事件）|
| AI | 智谱 GLM-4V / Kimi / DeepSeek R1 / 百度千帆 |
| 存储 | JSON 文件持久化（内存 Map + 防抖原子写入）|
| 移动 | Capacitor 8 + Android WebView |
| 部署 | PM2 + ngrok |

## 文档

| 文档 | 内容 |
|------|------|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | 产品规格 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统架构 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 部署与 OTA 指南 |
| [SECURITY.md](SECURITY.md) | 安全策略 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [huashu-design.md](huashu-design.md) | 设计系统 |
| [CLAUDE.md](CLAUDE.md) | 开发规范 |
| [OPTIMIZATION_PLAN.md](OPTIMIZATION_PLAN.md) | 优化方案与进度 |

## APK 下载

```text
https://parakeet-nimble-cage.ngrok-free.dev/releases/ChatRoom-v3.0.0.apk
```

## 许可证

MIT
