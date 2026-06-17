// 环境检测与服务器配置
export var isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform;
export var SERVER_URL = 'https://parakeet-nimble-cage.ngrok-free.dev';
export var API_URL = isCapacitor ? SERVER_URL : '';

// 版本信息
export var APP_VERSION = '3.0.0';
export var MAJOR_VERSION = '3';
export var WEB_BUILD = 235; // was 234
export var NATIVE_BUILD = 4;

// 文件分片
export var CHUNK_SIZE = 2 * 1024 * 1024;

// 默认头像 SVG data URI
export var DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#e0e0e0"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">👤</text></svg>'
);

// EMOJIS 表情列表
export var EMOJIS = ['😀','😂','🤣','😍','🥰','😘','😜','😎','🤩','😋','🤔','😅','😊','😢','😭','😤','😡','🥺','👍','👎','👏','🙌','💪','🤝','❤️','💔','🔥','⭐','🎉','🎊','🌸','🌺','🍀','☕','🍰','🎂','🐱','🐶','🌈','✨','💯','✅','❌','⏰','📌','📍','🗑️','💡','🔑','🎵','📷'];
