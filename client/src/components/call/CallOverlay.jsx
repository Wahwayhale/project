import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../Icon';
import ArMaskOverlay from '../ArMaskOverlay';

export default function CallOverlay({ callState, toggleMute, hangUp }) {
  const [arMask, setArMask] = useState(false);
  const [callTime, setCallTime] = useState(0);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (callState?.status === 'connected') {
      const timer = setInterval(() => setCallTime(t => t + 1), 1000);
      return () => clearInterval(timer);
    }
    setCallTime(0);
  }, [callState?.status]);

  // 管理远程视频流
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && callState?.remoteStream) {
      try {
        if (el.srcObject !== callState.remoteStream) {
          el.srcObject = callState.remoteStream;
        }
        el.play().catch(() => {});
      } catch (e) {}
    }
  }, [callState?.remoteStream]);

  // 管理本地视频流
  useEffect(() => {
    const el = localVideoRef.current;
    if (el && callState?.localStream) {
      try {
        if (el.srcObject !== callState.localStream) {
          el.srcObject = callState.localStream;
        }
        el.play().catch(() => {});
      } catch (e) {}
    }
  }, [callState?.localStream]);

  if (!callState || !callState.status || callState.status === 'incoming') return null;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const overlay = (
    <div className="call-overlay">
      <div className="call-remote-video">
        {callState.remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline />
        ) : (
          <div className="call-waiting">
            <div className="call-avatar-ring">
              <div className="call-avatar-pulse"></div>
              <I name="user" size={48} color="rgba(255,255,255,0.8)" />
            </div>
            <div className="call-status-text">
              {callState.status === 'calling' ? '正在呼叫...' : callState.status === 'connecting' ? '连接中...' : '通话中'}
            </div>
            {callState.status === 'connected' && (
              <div className="call-timer">{formatTime(callTime)}</div>
            )}
          </div>
        )}
      </div>
      {callState.localStream && (
        <div className="call-local-video">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <ArMaskOverlay videoStream={callState.localStream} enabled={arMask} />
        </div>
      )}
      <div className="call-info-bar">
        <span className="call-peer-name">{callState.peerName || '对方'}</span>
        {callState.status === 'connected' && (
          <span className="call-duration">{formatTime(callTime)}</span>
        )}
      </div>
      <div className="call-controls">
        <button className={`call-btn ar-mask${arMask ? ' active' : ''}`} onClick={() => setArMask(!arMask)} title="AR 面具">
          <I name="sparkles" size={20} />
        </button>
        <button className={`call-btn mute${callState?.muted ? ' active' : ''}`} onClick={toggleMute}>
          {callState?.muted ? <I name="micOff" size={22} /> : <I name="mic" size={22} />}
        </button>
        <button className="call-btn hangup" onClick={hangUp}>
          <I name="phone" size={22} />
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
