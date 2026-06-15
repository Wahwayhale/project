import React from 'react';
import { I } from '../Icon';

export default function CallIncoming({ callState, hangUp, acceptCall }) {
  if (!callState || callState.status !== 'incoming') return null;

  return (
    <div className="call-incoming-overlay">
      <div style={{ fontSize: 36, marginBottom: 8 }}><I name="video" size={36} /></div>
      <div style={{ fontWeight: 700 }}>{callState.caller?.username} 邀请你{callState.type === 'video' ? '视频' : '语音'}通话</div>
      <div className="call-incoming-actions">
        <button className="call-btn hangup" onClick={hangUp} style={{ width: 48, height: 48 }}><I name="micOff" size={20} color="currentColor" /></button>
        <button className="call-btn" onClick={acceptCall} style={{ background: '#10b981', color: 'white', width: 48, height: 48, boxShadow: '0 4px 16px rgba(16,185,129,0.4)' }}>📞</button>
      </div>
    </div>
  );
}
