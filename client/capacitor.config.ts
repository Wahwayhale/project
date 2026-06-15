import type { CapacitorConfig } from '@capacitor/cli';

/*
 * ngrok OTA 模式:
 * - APK 作为原生壳，启动后加载固定 ngrok 域名上的 Web 资源
 * - UI/CSS/React/普通业务逻辑更新只需要重新 build 并重启 3001 服务
 * - Capacitor 配置、Android 权限、原生插件变化仍然必须重新构建 APK
 */
const config: CapacitorConfig = {
  appId: 'com.wechatapp.project',
  appName: '聊天室',
  version: '3.0.0',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    url: 'https://parakeet-nimble-cage.ngrok-free.dev',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
