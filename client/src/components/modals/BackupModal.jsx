import React from 'react';
import { I } from '../Icon';

export default function BackupModal({ showBackupModal, setShowBackupModal, exportChat, messageStats }) {
  if (!showBackupModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowBackupModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h3><I name="backup" size={20} /> 聊天记录管理</h3>
        <div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            聊天记录存储在服务器上，登录后自动同步
          </div>
          <button className="confirm" onClick={() => { exportChat(); setShowBackupModal(false); }} style={{ marginBottom: 8 }}>
            导出聊天记录
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
            {messageStats.totalMessages > 0 && `当前聊天记录: ${messageStats.totalMessages} 条消息`}
          </div>
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowBackupModal(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
