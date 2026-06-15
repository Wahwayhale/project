import React from 'react';
import { getAvatarUrl } from '../utils/avatar';
import AvatarImg from './ui/AvatarImg';

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
}) {
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
            {groups[letter].map(friend => (
              <div key={friend.id || friend.username} className="contact-item" onClick={() => { if (!friend.isRequest) startChatWithFriend(friend); }}>
                <AvatarImg src={getAvatarUrl(friend.avatar)} alt="" className="contact-avatar" />
                <div className="contact-info">
                  <div className="contact-name">{friend.username}</div>
                  {!friend.isRequest && <div className="contact-desc">在线</div>}
                </div>
              </div>
            ))}
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
