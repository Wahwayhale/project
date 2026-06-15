import React from 'react';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';

export default function AddFriendModal({ showSearchModal, setShowSearchModal, setSearchId, setSearchResult, searchId, searchResult, searchUser, user, showToast, friendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest }) {
  if (!showSearchModal) return null;
  return (
    <div className="modal-overlay" onClick={() => { setShowSearchModal(false); setSearchId(''); setSearchResult(null); }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>添加好友</h3>
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--primary-bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          我的ID：<strong style={{ color: 'var(--primary)', fontSize: 16, letterSpacing: 3 }}>{user?.sixDigitId}</strong>
          <span style={{ marginLeft: 8, cursor: 'pointer', color: 'var(--primary)' }}
            onClick={() => { navigator.clipboard?.writeText(user?.sixDigitId || ''); showToast('ID已复制', 'success'); }}>📋复制</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="输入好友用户名或6位ID"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            maxLength={6}
            style={{ flex: 1 }}
          />
          <button className="confirm" onClick={searchUser}>搜索</button>
        </div>
        {searchResult && (
          <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AvatarImg src={getAvatarUrl(searchResult.avatar)} alt="" style={{ width: 50, height: 50, borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>{searchResult.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {searchResult.sixDigitId}</div>
                {searchResult.bio && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{searchResult.bio}</div>}
              </div>
              {searchResult.isFriend ? (
                <span style={{ color: 'green' }}>已是好友</span>
              ) : searchResult.requestSent ? (
                <span style={{ color: 'orange' }}>已发送请求</span>
              ) : (
                <button className="confirm" onClick={() => sendFriendRequest(searchResult.username)}>添加</button>
              )}
            </div>
          </div>
        )}
        {friendRequests.length > 0 && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>好友请求 ({friendRequests.length})</div>
            {friendRequests?.map(request => (
              <div key={request.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 8 }}>
                <AvatarImg src={getAvatarUrl(request.avatar)} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>{request.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ID: {request.sixDigitId}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="confirm" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => acceptFriendRequest(request.username)}>接受</button>
                  <button className="cancel" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => rejectFriendRequest(request.username)}>拒绝</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowSearchModal(false); setSearchId(''); setSearchResult(null); }}>关闭</button>
        </div>
      </div>
    </div>
  );
}
