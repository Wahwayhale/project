import type { CapacitorConfig } from '@capacitor/cli';

/*
 * 构建模式:
 *
 * 生产模式 (打包): 使用本地捆绑文件
 *   - npx cap copy && npx cap sync && cd android && ./gradlew assembleDebug
 *   - App 加载本地资源，通过 HTTP/WebSocket 连接服务器
 *
 * 开发模式 (OTA): 使用服务器URL
 *   - 取消下方 server.url 注释，设为你的公网地址
 *   - 更新服务器后无需重新构建APK
 *   - 缺点：原生功能更新仍需新APK
 */
const config: CapacitorConfig = {
  appId: 'com.wechatapp.project',
  appName: 'WeChat 2.0',
  version: '2.0.0',
  webDir: 'build',
  bundledWebRuntime: false,
  // === OTA 模式 (注释掉即使用本地打包模式) ===
  // server: {
  //   url: 'https://parakeet-nimble-cage.ngrok-free.dev',
  //   cleartext: true,
  //   androidScheme: 'https'
  // },
  android: {
    allowMixedContent: true
  }
};

export default config;
