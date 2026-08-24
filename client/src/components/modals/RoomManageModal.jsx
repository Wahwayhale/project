import React, { useState } from 'react';
import { I } from '../Icon';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';
import RoomAvatar from '../ui/RoomAvatar';

export default function RoomManageModal({
  showRoomManage, setShowRoomManage, currentRoom, allUsers, roomAnnouncements, currentRoomId,
  isRoomOwner, isRoomAdmin, setAnnouncement, unmuteRoomMember, muteRoomMember, kickRoomMember,
  setGroupAdmin, transferOwnership, setMuteAll, renameGroup, setRoomDescription,
  inviteMembers, disbandGroup, setWelcomeMessage,
  user, onlineUsers, setChannelAdmins, friends, showToast
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteSelected, setInviteSelected] = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');

  if (!showRoomManage || !currentRoom) return null;
  const onlineIds = new Set((onlineUsers || []).map(u => u.id));
  const isChannel = currentRoom.type === 'channel';
  const isGroup = currentRoom.type === 'group';
  const owner = currentRoom.owner || currentRoom.createdBy;
  const admins = currentRoom.admins || [];
  const mutedMembers = currentRoom.mutedMembers || [];
  const muteAll = currentRoom.muteAll;
  const canManage = isRoomOwner() || isRoomAdmin();

  const toggleAdmin = (username) => {
    if (isChannel) {
      const next = admins.includes(username) ? admins.filter(a => a !== username) : [...admins, username];
      setChannelAdmins(next);
    } else {
      setGroupAdmin(username, !admins.includes(username));
    }
  };

  const handleRename = () => {
    if (!nameValue.trim()) { showToast('群名不能为空', 'error'); return; }
    renameGroup(nameValue.trim());
    setEditingName(false);
    setNameValue('');
  };

  const handleSetDesc = () => {
    setRoomDescription(descValue);
    setEditingDesc(false);
  };

  const handleInvite = () => {
    if (inviteSelected.length === 0) { showToast('请选择要邀请的成员', 'error'); return; }
    inviteMembers(inviteSelected);
    showToast(`已邀请 ${inviteSelected.length} 人加入群聊`, 'success');
    setShowInvite(false);
    setInviteSelected([]);
    setInviteSearch('');
  };

  const inviteCandidates = (friends || []).filter(f =>
    !currentRoom.members?.includes(f.username) &&
    f.username.toLowerCase().includes(inviteSearch.toLowerCase())
  );

  const getRoleLabel = (username) => {
    if (username === owner) return isChannel ? '频道主' : '群主';
    if (admins.includes(username)) return '管理员';
    if (mutedMembers.includes(username)) return '已禁言';
    if (onlineIds.has(allUsers.find(u => u.username === username)?.id)) return '在线';
    return '离线';
  };

  return (
    <div className="modal-overlay" onClick={() => setShowRoomManage(false)}>
      <div className="modal room-manage-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="settings" size={20} /> {isChannel ? '频道管理' : '群聊管理'}</h3>

        <div className="room-manage-summary">
          <RoomAvatar name={currentRoom.name} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 15, background: 'var(--bg)', color: 'var(--text)' }}
                  autoFocus
                />
                <button className="mini-text-btn" onClick={handleRename}>确定</button>
                <button className="mini-text-btn" onClick={() => { setEditingName(false); setNameValue(''); }}>取消</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>{currentRoom.name}</strong>
                {canManage && isGroup && (
                  <button className="mini-text-btn" onClick={() => { setEditingName(true); setNameValue(currentRoom.name); }}>改名</button>
                )}
              </div>
            )}
            <span>{currentRoom.members?.length || 0} 位{isChannel ? '订阅者' : '成员'}{currentRoom.maxMembers ? ` / 上限 ${currentRoom.maxMembers}` : ''}</span>
          </div>
        </div>

        {isGroup && currentRoom.description != null && (
          <div className="admin-section-head">
            <span>群简介</span>
            {canManage && <button className="mini-text-btn" onClick={() => { setEditingDesc(true); setDescValue(currentRoom.description || ''); }}>编辑</button>}
          </div>
        )}
        {isGroup && editingDesc ? (
          <div style={{ padding: '0 0 8px' }}>
            <textarea
              value={descValue}
              onChange={e => setDescValue(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }}
              placeholder="输入群简介..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className="mini-text-btn" onClick={handleSetDesc}>确定</button>
              <button className="mini-text-btn" onClick={() => setEditingDesc(false)}>取消</button>
            </div>
          </div>
        ) : isGroup && currentRoom.description ? (
          <div className="room-announcement-box" style={{ marginBottom: 8 }}>{currentRoom.description}</div>
        ) : null}

        {!isChannel && (
          <>
            <div className="admin-section-head">
              <span>群公告</span>
              {canManage && <button className="mini-text-btn" onClick={setAnnouncement}>编辑</button>}
            </div>
            <div className="room-announcement-box">
              {currentRoom.announcement || roomAnnouncements[currentRoomId] || '暂无公告'}
            </div>
          </>
        )}

        {isGroup && canManage && (
          <>
            <div className="admin-section-head">
              <span>群设置</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!muteAll}
                  onChange={e => setMuteAll(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                />
                <span style={{ fontSize: 14, color: 'var(--text)' }}>全员禁言（仅群主和管理员可发言）</span>
              </label>
              <button
                className="mini-text-btn"
                onClick={() => {
                  const msg = window.prompt('设置入群欢迎语（留空清除）：', currentRoom.welcomeMessage || '');
                  if (msg !== null) setWelcomeMessage(msg);
                }}
                style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              >
                <I name="chat" size={14} /> {currentRoom.welcomeMessage ? '修改欢迎语' : '设置入群欢迎语'}
              </button>
              <button
                className="mini-text-btn"
                onClick={() => setShowInvite(true)}
                style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              >
                <I name="userPlus" size={14} /> 邀请成员入群
              </button>
            </div>
          </>
        )}

        {showInvite && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>邀请成员</strong>
              <button className="mini-text-btn" onClick={() => { setShowInvite(false); setInviteSelected([]); }}>关闭</button>
            </div>
            <input
              type="text"
              placeholder="搜索好友..."
              value={inviteSearch}
              onChange={e => setInviteSearch(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg-elevated)', color: 'var(--text)', marginBottom: 6 }}
            />
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {inviteCandidates.length > 0 ? inviteCandidates.map(f => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={inviteSelected.includes(f.username)}
                    onChange={() => setInviteSelected(s => s.includes(f.username) ? s.filter(u => u !== f.username) : [...s, f.username])}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                  />
                  <AvatarImg src={getAvatarUrl(f.avatar)} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{f.username}</span>
                </label>
              )) : (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>无可邀请的好友</div>
              )}
            </div>
            <button className="mini-text-btn" onClick={handleInvite} disabled={inviteSelected.length === 0} style={{ width: '100%', marginTop: 6 }}>
              邀请 {inviteSelected.length} 人
            </button>
          </div>
        )}

        <div className="admin-section-head">
          <span>{isChannel ? '订阅者 / 管理员' : '群成员'}</span>
        </div>
        <div className="room-member-list">
          {(currentRoom.members || []).map(username => {
            const member = allUsers.find(u => u.username === username);
            const muted = mutedMembers.includes(username);
            const isOnline = member && onlineIds.has(member.id);
            const isAdminRole = admins.includes(username);
            const isOwnerRole = username === owner;
            const roleLabel = getRoleLabel(username);
            return (
              <div key={username} className="room-member-row">
                <AvatarImg src={getAvatarUrl(member?.avatar)} alt="" />
                <div className="room-member-copy">
                  <strong>{username}</strong>
                  <span>{roleLabel}</span>
                </div>
                {canManage && username !== owner && (
                  <div className="room-member-actions" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {isRoomOwner() && isGroup && (
                      <button className="mini-text-btn" onClick={() => toggleAdmin(username)}>
                        {isAdminRole ? '取消管理' : '设管理员'}
                      </button>
                    )}
                    {isChannel && isRoomOwner() && (
                      <button className="mini-text-btn" onClick={() => toggleAdmin(username)}>
                        {isAdminRole ? '取消管理' : '设管理员'}
                      </button>
                    )}
                    {!isOwnerRole && (
                      <>
                        <button className="mini-text-btn" onClick={() => muted ? unmuteRoomMember(username) : muteRoomMember(username)}>
                          {muted ? '解禁' : '禁言'}
                        </button>
                        <button className="mini-text-btn danger" onClick={() => kickRoomMember(username)}>移出</button>
                      </>
                    )}
                    {isRoomOwner() && isGroup && !isOwnerRole && (
                      <button className="mini-text-btn" onClick={() => transferOwnership(username)} style={{ color: 'var(--primary)' }}>转群主</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isRoomOwner() && isGroup && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button
              className="mini-text-btn danger"
              onClick={disbandGroup}
              style={{ width: '100%', padding: '8px', fontSize: 14, border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)' }}
            >
              <I name="delete" size={14} /> 解散此群聊
            </button>
          </div>
        )}

        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowRoomManage(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
