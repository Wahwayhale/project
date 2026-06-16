import React from 'react';
import { I } from '../Icon';

export default function CallOverlay({ callState, toggleMute, hangUp }) {
  if (!callState || !callState.status || callState.status === 'incoming') return null;

  return (
    <div className="call-overlay">
      <div className="call-remote-video">
        {callState.remoteStream ? (
          <video ref={el => { if (el && callState?.remoteStream) { try { el.srcObject = callState.remoteStream; el.play().catch(() => {}); } catch(e) {} } }} autoPlay playsInline />
        ) : (
          <div className="call-waiting">
            {(callState.status === 'calling' || callState.status === 'connecting') ? (callState.status === 'calling' ? '正在呼叫...' : '连接中...') : '通话中'}
          </div>
        )}
      </div>
      {callState.localStream && (
        <div className="call-local-video">
          <video ref={el => { if (el && callState?.localStream) { try { el.srcObject = callState.localStream; el.play().catch(() => {}); } catch(e) {} } }} autoPlay playsInline muted />
        </div>
      )}
      <div className="call-controls">
        <button className="call-btn mute" onClick={toggleMute}>{callState?.muted ? <I name="micOff" size={20} color="#fff" /> : <I name="mic" size={20} color="#fff" />}</button>
        <button className="call-btn hangup" onClick={hangUp}><I name="micOff" size={20} color="currentColor" /></button>
      </div>
    </div>
  );
}
