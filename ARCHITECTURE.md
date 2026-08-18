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
│  REST API (100 endpoints)                │
│  Socket.io (WebSocket-only, 68 events)   │
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
| Tunnel | ngrok (free tier, fixed domain) |
| Process | PM2 (production) |

## Codebase Scale

| Artifact | Size |
|----------|------|
| `server/server.js` | ~3,800 lines (single file) |
| `client/src/App.js` | ~1,600 lines (orchestrator) |
| Frontend components | 60 files (`components/`) |
| Custom hooks | 13 files (`hooks/`) |
| Modular CSS | 24 files (`styles/`) |
| Frontend source total | ~105 files (js/jsx/css) |

## Data Flow

```
User Action → React State → axios/socket.io → Express Route/Socket Handler
    → Collection.set() → saveDebounced(200ms) → Atomic File Write
    → Response/Event → React State Update → UI Render
```

## Key Design Decisions

1. **Modular React** — App.js orchestrates 13 hooks + 60 components; the old
   single-file (~5,000 line) App.js was split in v3.0.1 for maintainability.
2. **JSON persistence** — Map-based `Collection` class with debounced atomic
   writes (tmp → rename); sufficient for a single-server, personal deployment.
3. **WebSocket-only** — No HTTP polling fallback; reduces latency and bandwidth.
4. **Capacitor ngrok OTA** — APK loads Web resources from the fixed ngrok
   domain; Web changes do not require APK rebuilds.
5. **ngrok tunneling** — One fixed public URL proxies Web, API, Socket.io, OTA
   metadata, and APK downloads to port 3001.
6. **Runtime data untracked** — `server/data/` (accounts, messages, recharges,
   hourly backups) and runtime logs are git-ignored; they are regenerated at
   runtime and must never be version-controlled to avoid data loss on rollback.

## Directory Map

```
project-master/
├── client/                    # React frontend
│   ├── src/
│   │   ├── App.js             # Orchestrator (~1,600 lines)
│   │   ├── index.js           # Entry + ErrorBoundary
│   │   ├── index.css          # Global styles + design tokens
│   │   ├── components/        # 60 components (views/modals/panels/ui/call)
│   │   ├── hooks/             # 13 custom hooks
│   │   ├── styles/            # 24 modular CSS files
│   │   ├── config/            # Icon map
│   │   └── utils/             # constants, format, avatar, e2e
│   ├── public/                # HTML, OTA config, changelog
│   ├── android/               # Capacitor Android project
│   ├── releases/              # APK downloads (git-ignored)
│   └── package.json
├── server/                    # Express backend
│   ├── server.js              # Main server (~3,800 lines)
│   ├── db.js                  # JSON persistence layer
│   ├── data/                  # Runtime JSON + hourly backups (git-ignored)
│   ├── uploads/               # User uploads (git-ignored)
│   ├── .env / .env.web / .env.app
│   └── package.json
├── start.bat                  # One-click dev launcher
├── start-prod.bat             # PM2 production launcher
├── ecosystem.config.js        # PM2 config
├── deploy.sh                  # Linux server deploy (legacy naming, see plan)
├── huashu-design.md           # Design system
├── CLAUDE.md / AGENTS.md      # Dev conventions
└── PRODUCT_SPEC.md / ARCHITECTURE.md / etc.
```
