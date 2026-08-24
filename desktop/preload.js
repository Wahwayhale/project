// Preload script: expose a minimal, safe surface to the renderer.
// contextIsolation is enabled and nodeIntegration is disabled, so the
// renderer cannot touch Node APIs directly — only what we expose here.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // The Web app can read these to detect that it is running inside the
  // Windows exe and branch behaviour accordingly (e.g. hide APK-only
  // features). No sensitive Node APIs are exposed.
  appVersion: '4.0.0',
  platform: 'win32'
});