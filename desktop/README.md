# ChatRoom Desktop (Windows exe)

A thin Electron wrapper that loads the ChatRoom Web app from
`https://parakeet-nimble-cage.ngrok-free.dev` (falling back to
`http://localhost:3001` if the tunnel is unreachable). Because the Web app
is loaded remotely, **OTA updates need no new installer** — a Web-only
update ships through ngrok and is picked up the next time the exe starts.

The exe has its own version (`4.0.0`) independent of the Android APK's
`nativeBuild`. This directory is zero-intrusion: it does not touch
`client/`, `server/`, or `capacitor.config.ts`.

## Layout

```
desktop/
  main.js        # Electron main process (window + URL selection)
  preload.js     # contextBridge: exposes window.desktop = { appVersion, platform }
  package.json   # electron + electron-builder config (NSIS installer)
  README.md
```

## Develop

```bash
cd desktop
npm install
npm start          # opens the 420x768 window against ngrok/localhost:3001
```

## Build

### Option A — Green portable exe (recommended, no installer toolchain)

```bash
cd desktop
npm install
npm run packager   # produces dist-packager/ChatRoom-win32-x64/ChatRoom.exe
```

This bundles the Electron runtime + `main.js` + `preload.js` into a
portable directory. Run `ChatRoom.exe` directly — no installation needed.
`client/` is intentionally excluded; the Web payload comes from ngrok at
runtime, so the exe stays ~172 MB regardless of Web build size.

### Option B — NSIS installer (requires compatible system)

```bash
cd desktop
npm install
npm run dist       # produces dist/ChatRoom-Setup-4.0.0.exe (NSIS installer)
```

Note: `electron-builder`'s `app-builder.exe` crashes with
`STATUS_STACK_BUFFER_OVERRUN` on some newer Windows 11 builds
(e.g. 26200). If `npm run dist` fails, use Option A instead.

## Environment detection

The renderer can detect the desktop wrapper via the global injected by
`preload.js`:

```js
if (window.desktop?.platform === 'win32') {
  // running inside the Windows exe
}
```