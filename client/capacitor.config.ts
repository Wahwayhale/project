import type { CapacitorConfig } from '@capacitor/cli';

/*
 * 构建模式:
 * 
 * 开发模式 (默认): 使用本地捆绑文件
 *   - npx cap copy && npx cap open android
 * 
 * 生产模式 (OTA): 使用服务器URL
 *   - 将下方 server.url 设为你的公网地址 (如 ngrok)
 *   - 示例: url: 'https://parakeet-nimble-cage.ngrok-free.dev'
 *   - 然后构建APK -> 每次更新服务器，用户自动获取最新版
 *   - 无需重新构建APK！
 */
const config: CapacitorConfig = {
  appId: 'com.wechatapp.project',
  appName: 'WeChatApp',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    // === OTA 模式 (启用) ===
    // 用户打开APP时将直接加载服务器上的最新版本
    // 更新服务器代码后用户自动获取最新版，无需重新构建APK
    url: 'https://parakeet-nimble-cage.ngrok-free.dev',
    cleartext: true,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;