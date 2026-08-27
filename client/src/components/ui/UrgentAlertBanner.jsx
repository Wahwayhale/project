import React, { useEffect } from 'react';
import { I } from '../Icon';
import AvatarImg from './AvatarImg';
import { getAvatarUrl } from '../../utils/avatar';
import { formatTime } from '../../utils/format';

export default function UrgentAlertBanner({ alertData, onDismiss, onOpenChat }) {
  useEffect(() => {
    if (alertData && navigator.vibrate) {
      try {
        navigator.vibrate([300, 150, 300, 150, 400]);
      } catch (e) {}
    }
  }, [alertData]);

  if (!alertData) return null;

  const { sender, content, timestamp, roomId } = alertData;

  return (
    <div className="urgent-alert-overlay" onClick={onDismiss}>
      <div className="urgent-alert-modal" onClick={(e) => e.stopPropagation()}>
        <div className="urgent-pulse-ring" />
        <div className="urgent-alert-icon-wrap">
          <I name="bell" size={28} color="white" />
        </div>
        <div className="urgent-alert-header">
          <span className="urgent-badge">⚠️ 强提醒</span>
          <h2 className="urgent-title">收到来自 {sender?.username || '重要联系人'} 的紧急消息</h2>
        </div>
        <div className="urgent-card-content">
          <div className="urgent-sender-info">
            <AvatarImg src={getAvatarUrl(sender?.avatar)} alt="" className="urgent-sender-avatar" />
            <div>
              <div className="urgent-sender-name">{sender?.username}</div>
              <div className="urgent-msg-time">{formatTime(timestamp || Date.now())}</div>
            </div>
          </div>
          <div className="urgent-msg-body">
            {content || '[多媒体消息]'}
          </div>
        </div>
        <div className="urgent-alert-actions">
          <button type="button" className="urgent-btn dismiss" onClick={onDismiss}>
            稍后处理
          </button>
          <button
            type="button"
            className="urgent-btn enter"
            onClick={() => {
              onDismiss();
              onOpenChat?.(roomId, sender);
            }}
          >
            <I name="chat" size={16} /> 立即查看并回复
          </button>
        </div>
      </div>
    </div>
  );
}
