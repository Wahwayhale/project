export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function getFileIcon(mimeType, filename) {
  if (!mimeType && !filename) return '[FILE]';
  const ext = (filename?.split('.').pop() || mimeType?.split('/').pop() || '').toLowerCase();
  const iconMap = {
    pdf: 'PDF', doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS', csv: 'CSV',
    ppt: 'PPT', pptx: 'PPT', zip: 'ZIP', rar: 'RAR', '7z': '7Z', tar: 'TAR', gz: 'GZ',
    txt: 'TXT', json: 'JSON', xml: 'XML', html: 'HTML', css: 'CSS', js: 'JS', ts: 'TS',
    mp3: 'MP3', wav: 'WAV', flac: 'FLAC', aac: 'AAC', ogg: 'OGG',
    mp4: 'MP4', avi: 'AVI', mkv: 'MKV', mov: 'MOV', wmv: 'WMV',
    exe: 'EXE', msi: 'MSI', dmg: 'DMG', apk: 'APK', ipa: 'IPA'
  };
  if (iconMap[ext]) return iconMap[ext];
  if (mimeType?.startsWith('image/')) return 'IMG';
  if (mimeType?.startsWith('video/')) return 'VIDEO';
  if (mimeType?.startsWith('audio/')) return 'AUDIO';
  if (mimeType?.includes('pdf')) return 'PDF';
  if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return 'ZIP';
  return '[FILE]';
}

export function parseBilibiliUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV\w+)/i);
  if (match) return match[1];
  const shortMatch = text.match(/https?:\/\/b23\.tv\/(\w+)/i);
  if (shortMatch) return shortMatch[1];
  const bareMatch = text.match(/^BV\w{10}$/);
  if (bareMatch) return bareMatch[0];
  return null;
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today - 86400000);
  if (date >= today) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date >= yesterday) return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('zh-CN');
}

export function formatRecordingTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatMessagePreview(lastMessage) {
  if (!lastMessage) return '';
  if (lastMessage.recalled) return '[消息已撤回]';
  const type = lastMessage.type;
  if (type === 'image') return '[图片]';
  if (type === 'video') return '[视频]';
  if (type === 'audio') return '[语音]';
  if (type === 'file') return '[文件]';
  if (type === 'redPacket') return '[红包]';
  if (type === 'poll') return '[投票]';
  if (type === 'dice') return '[骰子]';
  if (type === 'rockPaperScissors') return '[猜拳]';
  if (type === 'location') return '[位置]';
  if (type === 'checkIn') return '[打卡]';
  if (type === 'announcement') return '[群公告]';
  if (type === 'solitaire') return '[群接龙]';
  if (type === 'music') return '[音乐]';
  if (type === 'canvasCard') return '[涂鸦卡片]';
  const content = lastMessage.content || '';
  return content.length > 50 ? content.slice(0, 50) + '...' : content;
}
