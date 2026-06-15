import React from 'react';
import { I } from './Icon';

export default function BottomTabBar({ bottomTab, setBottomTab, friendRequests, fetchFriendRequests }) {
  return (
    <div className="bottom-tab-bar">
      <button className={`bottom-tab ${bottomTab === 'chats' ? 'active' : ''}`} onClick={() => { setBottomTab('chats'); }}>
        <span className="tab-icon"><I name="chat" size={22} /></span>
        <span className="tab-label">聊天</span>
      </button>
      <button className={`bottom-tab ${bottomTab === 'contacts' ? 'active' : ''}`} onClick={() => { setBottomTab('contacts'); fetchFriendRequests(); }}>
        <span className="tab-icon"><I name="contacts" size={22} /></span>
        <span className="tab-label">通讯录</span>
        {friendRequests.length > 0 && <span className="tab-badge">{friendRequests.length}</span>}
      </button>
      <button className={`bottom-tab ${bottomTab === 'discover' ? 'active' : ''}`} onClick={() => setBottomTab('discover')}>
        <span className="tab-icon"><I name="discover" size={22} /></span>
        <span className="tab-label">发现</span>
      </button>
      <button className={`bottom-tab ${bottomTab === 'me' ? 'active' : ''}`} onClick={() => setBottomTab('me')}>
        <span className="tab-icon"><I name="me" size={22} /></span>
        <span className="tab-label">我</span>
      </button>
    </div>
  );
}
