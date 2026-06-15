import { isCapacitor, API_URL, DEFAULT_AVATAR } from './constants';

export function getAvatarUrl(avatar) {
  if (!avatar) return DEFAULT_AVATAR;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  if (avatar.startsWith('/')) return `${API_URL}${avatar}`;
  return avatar;
}
