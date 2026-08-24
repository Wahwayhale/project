import React, { useState } from 'react';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';
import { I } from '../Icon';

export default function CreateGroupModal({ showCreateModal, setShowCreateModal, friends, socketRef, user, showToast }) {
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');

  if (!showCreateModal) return null;

  const toggle = (username) => {
    setSelected(s => s.includes(username) ? s.filter(u => u !== username) : [...s, username]);
  };

  const filtered = friends.filter(f => f.username.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = () => {
    if (!groupName.trim()) { showToast('请输入群聊名称', 'error'); return; }
    if (selected.length === 0) { showToast('请至少选择一位成员', 'error'); return; }
    socketRef.current?.emit('createGroup', {
      name: groupName.trim(),
      members: selected,
    });
    showToast('群聊创建成功', 'success');
    setGroupName('');
    setSelected([]);
    setSearch('');
    setShowCreateModal(false);
  };

  const handleClose = () => {
    setGroupName('');
    setSelected([]);
    setSearch('');
    setShowCreateModal(false);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>创建群聊</h3>
        <input
          className="auth-form-input"
          type="text"
          placeholder="请输入群聊名称"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          style={{ width: '100%', marginBottom: 12, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, background: 'var(--bg)', color: 'var(--text)' }}
        />
        <input
          type="text"
          placeholder="搜索好友..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
        />
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
          已选择 {selected.length} 人 · 共 {friends.length} 位好友
        </p>
        {filtered.length > 0 ? (
          <div className="user-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {filtered.map(friend => (
              <label key={friend.id} className="user-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.includes(friend.username)}
                  onChange={() => toggle(friend.username)}
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                />
                <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{friend.username}</span>
              </label>
            ))}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {friends.length === 0 ? '暂无好友，请先添加好友' : '未找到匹配的好友'}
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={handleClose}>取消</button>
          <button className="confirm" onClick={handleCreate} disabled={!groupName.trim() || selected.length === 0}>创建</button>
        </div>
      </div>
    </div>
  );
}
