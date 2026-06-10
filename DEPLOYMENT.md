# Deployment

## Delivery Model

The app is deployed as:
- **Web**: Express server on `localhost:3001`, accessible via ngrok tunnel
- **APK**: Capacitor bundled Android package, distributed via server download

## Quick Start

```bash
# One-click launch
start.bat

# Or manual:
cd server && set ENV_FILE=.env.web && node server.js
ngrok http 3001
```

## Production (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Commands:
- `pm2 status` — check running processes
- `pm2 logs` — view logs
- `pm2 restart wechat-server`

## APK Build

```bash
cd client
npm run build                    # Build web + auto-copy APK to releases/
npx cap sync android             # Sync to Android project
cd android && ./gradlew clean assembleDebug  # Build APK
cp app/build/outputs/apk/debug/app-debug.apk ../releases/WeChat-v2.0.apk
```

## Release a New Version

1. Bump version in `client/public/ota-version.json`
2. Update `appVersion` in `client/src/App.js`
3. `npm run build` + APK build (see above)
4. Commit + tag: `git tag -a vX.Y.Z`
5. Old APKs auto-detect via OTA on next launch

## Server Config

| File | Port | Usage |
|------|------|-------|
| `.env.web` | 3001 | Browser + ngrok tunnel |
| `.env.app` | 3002 | APK direct (optional) |

All config via `ENV_FILE` env var: `set ENV_FILE=.env.web && node server.js`

## APK Download

```
https://parakeet-nimble-cage.ngrok-free.dev/releases/WeChat-v2.0.apk
```

## Health Check

```
GET /health → {"status":"ok","uptime":1234,"memory":"82MB","users":10,...}
```
