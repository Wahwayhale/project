import React from 'react';
import { I } from '../Icon';
import { getAvatarUrl } from '../../utils/avatar';
import { formatTime } from '../../utils/format';
import AvatarImg from '../ui/AvatarImg';

export default function MomentsPanel({ showMoments, setShowMoments, newMoment, setNewMoment, publishMoment, moments, likeMoment, commentMoment }) {
  if (!showMoments) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowMoments(false)}>
      <div className="modal moments-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="camera" size={20} /> 朋友圈</h3>
        <div className="moment-input">
          <textarea value={newMoment} onChange={e => setNewMoment(e.target.value)} placeholder="分享你的动态..." />
          <button onClick={publishMoment}>发布</button>
        </div>
        <div className="moments-list">
          {moments.map(m => (
            <div key={m.id} className="moment-item">
              <div className="moment-header">
                <AvatarImg src={getAvatarUrl(m.author?.avatar)} alt="" />
                <span>{m.author?.username}</span>
                <span className="moment-time">{formatTime(m.timestamp)}</span>
              </div>
              <div className="moment-content">{m.content}</div>
              <div className="moment-actions">
                <button onClick={() => likeMoment(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><I name="star" size={14} /> {(m.likes || []).length}</button>
                <button onClick={() => commentMoment(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><I name="chat" size={14} /> {(m.comments || []).length}</button>
              </div>
              {(m.comments || []).length > 0 && (
                <div className="moment-comments">
                  {(m.comments || []).map(c => (
                    <div key={c.id} className="comment-item">
                      <strong>{c.author?.username}:</strong> {c.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowMoments(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
