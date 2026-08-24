// Electron main process for ChatRoom desktop wrapper.
// The exe is a thin shell: it loads the same Web app hosted on ngrok
// (or http://localhost:3001 as a fallback) inside a BrowserWindow.
// OTA updates are handled by the Web app itself — the exe never checks
// versions, so a Web-only update needs no new installer.

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const https = require('https');

const NGROK_URL = 'https://parakeet-nimble-cage.ngrok-free.dev';
const LOCAL_URL = 'http://localhost:3001';
const PROBE_TIMEOUT_MS = 3000;

let mainWindow = null;

// Probe ngrok reachability with a short HEAD request.
// Resolves to true if the host responds within the timeout, false otherwise.
function probeNgrok() {
  return new Promise((resolve) => {
    const req = https.request(
      NGROK_URL,
      { method: 'HEAD', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        // Any HTTP response means the tunnel is up.
        res.destroy();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function createWindow(loadUrl) {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 768,
    minWidth: 360,
    minHeight: 600,
    title: '聊天室',
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Hide the native menu bar for a cleaner mobile-like look.
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(loadUrl);

  // If the primary URL fails to load, fall back to localhost once.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
    if (validatedURL && validatedURL.startsWith(NGROK_URL) && errorCode !== -3) {
      // -3 is ERR_ABORTED (navigation cancelled), ignore it.
      mainWindow.loadURL(LOCAL_URL);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  const useNgrok = await probeNgrok();
  createWindow(useNgrok ? NGROK_URL : LOCAL_URL);
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // macOS keeps apps running without a window, all other platforms quit.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: re-create a window when the dock icon is clicked.
  if (mainWindow === null) {
    bootstrap();
  }
});