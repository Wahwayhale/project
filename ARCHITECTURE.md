# Architecture

## System Shape

聊天室 is a single-server Express + Socket.io backend serving a React SPA frontend, packaged as a Capacitor Android APK.

```
┌─ Browser ─────────────┐  ┌─ Android APK ────────────┐
│  React SPA (web)       │  │  Capacitor native shell    │
│  axios → localhost:3001│  │  WebView → ngrok Web SPA  │
│  socket.io → :3001     │  │  API/socket.io → ngrok    │
└────────────────────────┘  └───────────────────────────┘
           │                          │
           ▼                          ▼
┌─ ngrok tunnel ──────────────────────────┐
│  https://parakeet-nimble-cage.ngrok-free.dev → :3001
└─────────────────────────────────────────┘
                    │
                    ▼
┌─ Express Server (:3001) ────────────────┐
│  helmet → compression → cors → rate-limit│
│  REST API (57 endpoints)                 │
│  Socket.io (WebSocket-only, 47 events)   │
│  JSON file persistence (atomic writes)   │
└─────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, axios, socket.io-client, Lucide React |
| Backend | Express 4, Socket.io 4, JWT, bcryptjs, multer |
| AI | Zhipu GLM-4V / Kimi / DeepSeek R1 / 百度千帆 |
| Storage | JSON files (atomic write: tmp → rename) |
| Mobile | Capacitor 8, Android WebView, @capacitor/geolocation |
| Tunnel | ngrok (free tier) |
| Process | PM2 (production) |

## Data Flow

```
User Action → React State → axios/socket.io → Express Route/Socket Handler
    → Collection.set() → saveDebounced(200ms) → Atomic File Write
    → Response/Event → React State Update → UI Render
```

## Key Design Decisions

1. **Single-file React** — App.js holds all UI state; avoids prop drilling complexity for this scale
2. **JSON persistence** — Map-based Collection class with debounced atomic writes; sufficient for single-server
3. **WebSocket-only** — No HTTP polling fallback; reduces latency and bandwidth
4. **Capacitor ngrok OTA** — APK loads Web resources from the fixed ngrok domain; Web changes do not require APK rebuilds
5. **ngrok tunneling** — One fixed public URL proxies Web, API, Socket.io, OTA metadata, and APK downloads to port 3001

## Directory Map

```
project-master/
├── client/                    # React frontend
│   ├── src/
│   │   ├── App.js             # Main component (~4500 lines)
│   │   ├── index.js           # Entry point
│   │   ├── index.css          # All styles + design tokens
│   │   ├── components/        # Icon component
│   │   ├── config/            # Icon map
│   │   └── hooks/             # Custom hooks
│   ├── public/                # HTML, PWA manifest, OTA config
│   ├── android/               # Capacitor Android project
│   ├── releases/              # APK downloads
│   └── package.json
├── server/                    # Express backend
│   ├── server.js              # Main server (~2688 lines)
│   ├── db.js                  # JSON persistence layer
│   ├── data/                  # JSON data files + backups
│   ├── uploads/               # User uploads
│   ├── .env / .env.web / .env.app
│   └── package.json
├── start.bat                  # One-click launcher
├── ecosystem.config.js        # PM2 config
├── huashu-design.md           # Design system
├── CLAUDE.md                  # Dev conventions
└── PRODUCT_SPEC.md / ARCHITECTURE.md / etc.
```
