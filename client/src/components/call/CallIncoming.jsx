import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../Icon';

export default function CallIncoming({ callState, hangUp, acceptCall }) {
  const [ringing, setRinging] = useState(0);

  useEffect(() => {
    if (callState?.status === 'incoming') {
      const timer = setInterval(() => setRinging(r => (r + 1) % 3), 500);
      return () => clearInterval(timer);
    }
  }, [callState?.status]);

  if (!callState || callState.status !== 'incoming') return null;

  const overlay = (
    <div className="call-incoming-overlay">
      <div className="incoming-bg-pulse"></div>
      <div className="incoming-content">
        <div className="incoming-avatar">
          <div className="incoming-avatar-ring"></div>
          <I name="user" size={48} color="rgba(255,255,255,0.9)" />
        </div>
        <div className="incoming-name">{callState.caller?.username || '未知用户'}</div>
        <div className="incoming-type">
          {callState.type === 'video' ? '视频通话' : '语音通话'}
          <span className="ringing-dots">{'.'.repeat(ringing + 1)}</span>
        </div>
        <div className="incoming-actions">
          <button className="incoming-btn reject" onClick={hangUp}>
            <I name="phoneOff" size={24} />
            <span>拒绝</span>
          </button>
          <button className="incoming-btn accept" onClick={acceptCall}>
            <I name="phone" size={24} />
            <span>接听</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
