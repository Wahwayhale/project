# Deployment and OTA

## Delivery Model

This project uses a single ngrok public domain for Web, API, Socket.io, OTA metadata, and APK downloads:

```text
https://parakeet-nimble-cage.ngrok-free.dev
  -> localhost:3001
  -> Express server
     - /                 React build
     - /api/*            REST API
     - /socket.io        Socket.io
     - /ota-version.json OTA metadata
     - /releases/*.apk   APK download
     - /health           Health check
```

The Android APK is a Capacitor native shell. In OTA mode it loads Web resources from the fixed ngrok domain configured in `client/capacitor.config.ts`.

## Start

```bat
start.bat
```

Manual start:

```bat
cd server
set ENV_FILE=.env.web && node server.js
ngrok http 3001 --domain=parakeet-nimble-cage.ngrok-free.dev
```

If ngrok is started without `--domain`, installed APKs will not follow the new random URL.

## OTA Metadata

`client/public/ota-version.json` is copied into `client/build/ota-version.json` during `npm run build`.

```json
{
  "appVersion": "3.0.0",
  "majorVersion": "3",
  "webBuild": 225,
  "nativeBuild": 4,
  "minNativeBuild": 1,
  "apkUrl": "/releases/ChatRoom-v3.0.0.apk",
  "apkSize": "5.3MB",
  "forceUpdate": false,
  "showMajorUpdate": true,
  "updateTitle": "聊天室焕新上线",
  "updateNotes": ["应用正式更名为「聊天室」。"]
}
```

Fields:

| Field | Meaning |
|---|---|
| `appVersion` | User-visible version string |
| `majorVersion` | Major version key used for one-time update notes |
| `webBuild` | Web build number. Increment for Web/CSS/React/API behavior updates |
| `nativeBuild` | APK/native shell build number. Increment only when rebuilding APK |
| `minNativeBuild` | Minimum allowed native shell build. Older APKs must update |
| `apkUrl` | APK download URL, relative to ngrok domain or absolute |
| `apkSize` | Display text for APK size |
| `showMajorUpdate` | If true, show major update notes once per major version |
| `updateTitle` / `updateNotes` | User-facing major update notes |

## Web OTA Release

Use this for CSS, UI, React logic, ordinary API changes, AI feature changes, and server business logic that remains compatible with the current APK.

1. Update code.
2. Increment `webBuild`.
3. Run:

```bat
cd client
npm run build
```

4. Restart the Express server or PM2 process.
5. Keep ngrok pointing to `localhost:3001`.

No APK rebuild is required. Installed apps load the latest Web bundle from ngrok on next launch.

## Native APK Release

Required for:

- `client/capacitor.config.ts` changes
- Android permission changes
- `client/android/` changes
- Installing or calling new Capacitor plugins
- Native app identity/version changes

Steps:

1. Increment `webBuild`.
2. Increment `nativeBuild`.
3. Update `appVersion` if user-visible version changes.
4. Update `client/capacitor.config.ts` `version`.
5. Update `client/android/app/build.gradle` `versionCode` and `versionName`.
6. Build Web and sync Android:

```bat
cd client
npm run build
npx cap sync android
cd android
gradlew clean assembleDebug
```

7. Copy APK to `client/releases/ChatRoom-v<appVersion>.apk`.
8. Make sure `apkUrl` and `apkSize` in `ota-version.json` match.
9. Restart server.

## Compatibility Rules

| Change | `webBuild` | `nativeBuild` | New APK |
|---|---:|---:|---|
| CSS / UI | +1 | unchanged | No |
| React page logic | +1 | unchanged | No |
| API endpoint / AI logic | +1 | unchanged | No |
| Socket event compatible change | +1 | unchanged | No |
| Capacitor config | +1 | +1 | Yes |
| Android permission | +1 | +1 | Yes |
| New Capacitor plugin | +1 | +1 | Yes |
| Calling plugin unavailable in old APK | +1 | +1 | Yes |
| Force old APK users to update | +1 | +1 | Yes, raise `minNativeBuild` |

## Health Check

```text
GET /health
```
