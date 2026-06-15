import React from 'react';
import { I } from '../Icon';

export default function MusicShareModal({ showMusicModal, setShowMusicModal, musicUrl, setMusicUrl, currentRoomId, socketRef, showToast }) {
  if (!showMusicModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowMusicModal(false)}>
      <div className="modal music-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="music" size={20} /> 分享音乐</h3>
        <div className="form-group">
          <label>音乐链接</label>
          <input type="url" value={musicUrl} onChange={e => setMusicUrl(e.target.value)} placeholder="输入音乐链接" />
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowMusicModal(false)}>取消</button>
          <button className="confirm" onClick={() => {
            if (musicUrl && currentRoomId) {
              socketRef.current.emit('sendMessage', { roomId: currentRoomId, content: musicUrl, type: 'music' });
              setShowMusicModal(false);
              setMusicUrl('');
              showToast('音乐已分享', 'success');
            }
          }}>分享</button>
        </div>
      </div>
    </div>
  );
}
