import React from 'react';
import { getAvatarUrl } from '../utils/avatar';
import AvatarImg from './ui/AvatarImg';
import { I } from './Icon';

function getContactsGrouped(friends, friendRequests) {
  const groups = {};
  const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  allLetters.forEach(l => groups[l] = []);

  (friends || []).forEach(f => {
    const firstChar = f.username.charAt(0).toUpperCase();
    const key = firstChar.match(/[A-Z]/) ? firstChar : '#';
    groups[key].push(f);
  });

  if (friendRequests.length > 0) {
    groups['邀请'] = friendRequests.map(r => ({ ...r, isRequest: true }));
  }

  return { groups, letters: allLetters.filter(l => groups[l]?.length > 0) };
};

export default function ContactsView({
  friends,
  friendRequests,
  searchQuery,
  setSearchQuery,
  setContactsLetter,
  startChatWithFriend,
  acceptFriendRequest,
  rejectFriendRequest,
  onlineUsers = [],
  urgentContacts = [],
  toggleUrgentContact,
}) {
  const onlineIds = new Set((onlineUsers || []).map(u => u.id));
  const filtered = searchQuery
    ? friends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()))
    : friends;

  const { groups, letters } = getContactsGrouped(filtered, friendRequests);

  return (
    <div className="contacts-page">
      <div className="contacts-header">
        <h2>通讯录</h2>
        <span className="contacts-count">{friends.length} 位联系人</span>
      </div>
      <div className="contacts-search">
        <input type="text" placeholder="搜索联系人..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>
      <div className="contacts-body">
        {friendRequests.length > 0 && (
          <div className="contacts-section">
            <div className="contacts-section-title">新的好友 <span className="badge">{friendRequests.length}</span></div>
            {friendRequests.map(r => (
              <div key={r.id} className="contact-item request-item">
                <AvatarImg src={getAvatarUrl(r.avatar)} alt="" className="contact-avatar" />
                <div className="contact-info">
                  <div className="contact-name">{r.username}</div>
                  <div className="contact-desc">想加你为好友</div>
                </div>
                <div className="contact-actions">
                  <button className="accept-btn" onClick={() => acceptFriendRequest(r.username)}>接受</button>
                  <button className="reject-btn" onClick={() => rejectFriendRequest(r.username)}>拒绝</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {letters.map(letter => (
          <div key={letter} className="contacts-section" id={`contact-${letter}`}>
            <div className="contacts-section-title">{letter}</div>
            {groups[letter].map(friend => {
              const isOnline = friend.id && onlineIds.has(friend.id);
              const isUrgent = urgentContacts.includes(friend.username);
              return (
                <div key={friend.id || friend.username} className="contact-item" onClick={() => { if (!friend.isRequest) startChatWithFriend(friend); }}>
                  <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" className="contact-avatar" />
                  <div className="contact-info">
                    <div className="contact-name">
                      <span>{friend.username}</span>
                      {friend.status && (
                        <span className="user-status-capsule mini" title={friend.status.text}>
                          <span>{friend.status.icon}</span>
                        </span>
                      )}
                    </div>
                    {!friend.isRequest && <div className={`contact-desc ${isOnline ? '' : 'offline'}`}>{isOnline ? '在线' : '离线'}</div>}
                  </div>
                  {!friend.isRequest && toggleUrgentContact && (
                    <button
                      type="button"
                      className={`contact-urgent-btn ${isUrgent ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUrgentContact(friend.username);
                      }}
                      title={isUrgent ? '已开启全屏强提醒（点击关闭）' : '开启全屏强提醒'}
                    >
                      <I name="bell" size={15} color={isUrgent ? 'var(--danger)' : 'var(--text-tertiary)'} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="contacts-index">
        {letters.map(l => (
          <span key={l} className="index-letter" onClick={() => {
            setContactsLetter(l);
            document.getElementById(`contact-${l}`)?.scrollIntoView({ behavior: 'smooth' });
          }}>{l}</span>
        ))}
      </div>
    </div>
  );
}
