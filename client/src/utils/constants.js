// 环境检测与服务器配置
export const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform;
export const SERVER_URL = 'https://parakeet-nimble-cage.ngrok-free.dev';
export const API_URL = isCapacitor ? SERVER_URL : '';

// 版本信息
export const APP_VERSION = '3.0.0';
export const MAJOR_VERSION = '3';
export const WEB_BUILD = 225;
export const NATIVE_BUILD = 4;

// 文件分片
export const CHUNK_SIZE = 2 * 1024 * 1024;

// 默认头像 SVG data URI
export const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#e0e0e0"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>'
);

// EMOJIS 表情列表
export const EMOJIS = ['😀','😂','🤣','😍','🥰','😘','😜','😎','🤩','😋','🤔','😅','😊','😢','😭','😤','😡','🥺','👍','👎','👏','🙌','💪','🤝','❤️','💔','🔥','⭐','🎉','🎊','🌸','🌺','🍀','☕','🍰','🎂','🐱','🐶','🌈','✨','💯','✅','❌','⏰','📌','📍','🗑️','💡','🔑','🎵','📷'];
