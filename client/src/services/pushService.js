import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { API_URL } from '../utils/constants';

/**
 * pushService — FCM 推送注册（原生 App）
 *
 * 降级链：Web 浏览器 → 跳过（浏览器通知走 useSocket 的 Notification API）
 *        旧 APK（无原生插件）→ isPluginAvailable 检测后静默跳过
 * 流程：登录后 registerPush() → 请求通知权限 → 拿 FCM token → 上报服务端。
 * 前台收到推送时，socket 已实时收到消息，静默处理避免重复打扰。
 */

async function reportToken(token) {
  try {
    await fetch(`${API_URL}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform?.() || 'android' })
    });
  } catch { /* 网络异常下次再报 */ }
}

export async function registerPush() {
  try {
    // Web 环境或旧 APK（原生层未注册插件）直接跳过
    if (!Capacitor.isNativePlatform?.() || !Capacitor.isPluginAvailable?.('PushNotifications')) {
      return false;
    }

    let status = (await PushNotifications.checkPermissions())?.display;
    if (status === 'prompt') {
      status = (await PushNotifications.requestPermissions())?.display;
    }
    if (status !== 'granted') return false;

    await PushNotifications.addListener('registration', (token) => {
      reportToken(token.value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Push] registration error:', err);
    });

    // 前台收到通知：App 活着时 socket 已实时收到消息，无需重复弹通知
    await PushNotifications.addListener('pushNotificationReceived', () => {});

    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      // 点击通知 → 跳到对应房间
      try {
        const data = notification?.notification?.data || {};
        if (data.roomId) {
          window.dispatchEvent(new CustomEvent('push:openRoom', { detail: { roomId: data.roomId, roomName: data.roomName } }));
        }
      } catch {}
    });

    await PushNotifications.register();
    return true;
  } catch (e) {
    console.warn('[Push] init failed:', e);
    return false;
  }
}
