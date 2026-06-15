import React from 'react';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';

export default function CreateGroupModal({ showCreateModal, setShowCreateModal, friends, createGroup }) {
  if (!showCreateModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>创建群聊</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          从好友列表中选择成员创建群聊
        </p>
        {friends.length > 0 ? (
          <div className="user-list">
            {friends.map(friend => (
              <label key={friend.id} className="user-checkbox">
                <input type="checkbox" />
                <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 8 }} />
                <span>{friend.username}</span>
              </label>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
            暂无好友，请先添加好友
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowCreateModal(false)}>取消</button>
          <button className="confirm" onClick={createGroup}>创建</button>
        </div>
      </div>
    </div>
  );
}
