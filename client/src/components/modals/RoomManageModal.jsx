import React from 'react';
import { I } from '../Icon';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';
import RoomAvatar from '../ui/RoomAvatar';

export default function RoomManageModal({ showRoomManage, setShowRoomManage, currentRoom, allUsers, roomAnnouncements, currentRoomId, isRoomOwner, setAnnouncement, unmuteRoomMember, muteRoomMember, kickRoomMember, user, onlineUsers }) {
  if (!showRoomManage || !currentRoom) return null;
  const onlineIds = new Set((onlineUsers || []).map(u => u.id));
  return (
    <div className="modal-overlay" onClick={() => setShowRoomManage(false)}>
      <div className="modal room-manage-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="settings" size={20} /> 聊天管理</h3>
        <div className="room-manage-summary">
          <RoomAvatar name={currentRoom.name} size="lg" />
          <div>
            <strong>{currentRoom.name}</strong>
            <span>{currentRoom.members?.length || 0} 位成员</span>
          </div>
        </div>
        <div className="admin-section-head">
          <span>群公告</span>
          {isRoomOwner() && <button className="mini-text-btn" onClick={setAnnouncement}>编辑</button>}
        </div>
        <div className="room-announcement-box">
          {roomAnnouncements[currentRoomId] || '暂无公告'}
        </div>
        <div className="admin-section-head">
          <span>成员</span>
        </div>
        <div className="room-member-list">
          {(currentRoom.members || []).map(username => {
            const member = allUsers.find(u => u.username === username);
            const muted = currentRoom.mutedMembers?.includes(username);
            const isOnline = member && onlineIds.has(member.id);
            return (
              <div key={username} className="room-member-row">
                <AvatarImg src={getAvatarUrl(member?.avatar)} alt="" />
                <div className="room-member-copy">
                  <strong>{username}</strong>
                  <span>{currentRoom.owner === username ? '群主' : muted ? '已禁言' : isOnline ? '在线' : '离线'}</span>
                </div>
                {isRoomOwner() && username !== user?.username && (
                  <div className="room-member-actions">
                    <button className="mini-text-btn" onClick={() => muted ? unmuteRoomMember(username) : muteRoomMember(username)}>
                      {muted ? '解禁' : '禁言'}
                    </button>
                    <button className="mini-text-btn danger" onClick={() => kickRoomMember(username)}>移出</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowRoomManage(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
