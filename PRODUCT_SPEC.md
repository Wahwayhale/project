# Product Spec

## Product

- Name: WeChat App (你无只因)
- Tagline: 现代化即时通讯平台
- Type: Mobile-first chat application with AI capabilities

## Users

| Role | Description |
|------|-------------|
| End User | Chat with friends, use AI tools, discover content |
| Admin | Manage recharges, monitor system, reload config |

## Features

### Core Messaging
- Real-time text/image/video/file messaging via WebSocket
- Message recall (5min), edit (30min), delete
- Read receipts, typing indicators, @mentions
- Reply-to, forward, pin, star, reactions

### AI Suite
- Multi-model chat (Zhipu GLM / Kimi / DeepSeek / Pollinations)
- Smart reply suggestions, text polish, daily digest
- AI translation (13 languages), chat summarization
- AI image recognition (GLM-4V), image generation, title generator

### Social
- Friend system (6-digit ID + username search)
- Moments (social feed with likes/comments)
- Group chats with announcements, mute, kick
- Red packets, polls, dice, rock-paper-scissors, solitaire

### Discovery
- Bilibili video search & share
- Netease Cloud Music search/play/lyric
- GIF search (GIPHY), weather query, news headlines
- Amap GPS location sharing, QR code generator
- Random quotes, link preview

### Platform
- Capacitor Android APK (bundled mode)
- OTA auto-update with version check
- Desktop notification (browsers)
- Dark mode, theme presets
- Bots (auto-reply + scheduled messages)
- WebRTC video/voice calls
- Group events with reminders

## Pricing

- Free AI: glm-4-flash, Pollinations
- Paid AI: ¥0.02/call (DeepSeek, Kimi, GLM-4-Plus)
- Admin exempt from charges
