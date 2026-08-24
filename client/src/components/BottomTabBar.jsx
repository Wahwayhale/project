import React from 'react';
import { I } from './Icon';

const tabs = [
  { key: 'chats', label: '聊天', icon: 'chat' },
  { key: 'contacts', label: '通讯录', icon: 'contacts' },
  { key: 'discover', label: '发现', icon: 'discover' },
  { key: 'me', label: '我', icon: 'me' },
];

export default function BottomTabBar({ bottomTab, setBottomTab, friendRequests, fetchFriendRequests }) {
  const handleTabClick = (key) => {
    setBottomTab(key);
    if (key === 'contacts') fetchFriendRequests();
  };

  return (
    <nav className="bottom-tab-bar" aria-label="主导航">
      {tabs.map(tab => {
        const isActive = bottomTab === tab.key;
        const showBadge = tab.key === 'contacts' && friendRequests.length > 0;

        return (
          <button
            key={tab.key}
            type="button"
            className={`bottom-tab ${isActive ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.key)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="tab-icon-wrap">
              <span className="tab-icon"><I name={tab.icon} size={22} /></span>
              {isActive && <span className="tab-active-indicator" aria-hidden="true" />}
            </span>
            <span className="tab-label">{tab.label}</span>
            {showBadge && <span className="tab-badge">{friendRequests.length}</span>}
          </button>
        );
      })}
    </nav>
  );
}
