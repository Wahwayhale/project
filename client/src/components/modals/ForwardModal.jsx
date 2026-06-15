import React from 'react';
import { I } from '../Icon';

export default function ForwardModal({ showForwardModal, setShowForwardModal, setForwardMsg, rooms, forwardMessage }) {
  if (!showForwardModal) return null;
  return (
    <div className="modal-overlay" onClick={() => { setShowForwardModal(false); setForwardMsg(null); }}>
      <div className="modal forward-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="forward" size={20} /> 转发消息</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          选择要转发到的聊天
        </p>
        <div className="forward-list">
          {rooms?.filter(r => r.type !== 'private')?.map(room => (
            <div key={room.id} className="forward-item" onClick={() => forwardMessage(room)}>
              <div className="forward-avatar">{(room.name || '群')[0]}</div>
              <span>{room.name}</span>
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowForwardModal(false); setForwardMsg(null); }}>取消</button>
        </div>
      </div>
    </div>
  );
}
