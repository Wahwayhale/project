import React from 'react';
import { I } from '../Icon';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';

export default function TransferModal({
  showTransferModal,
  setShowTransferModal,
  user,
  balance,
  friends,
  transferToUsername,
  setTransferToUsername,
  transferAmount,
  setTransferAmount,
  transferNote,
  setTransferNote,
  transferHistory,
  sendTransfer,
}) {
  if (!showTransferModal) return null;

  const close = () => {
    setShowTransferModal(false);
    setTransferToUsername('');
    setTransferAmount('');
    setTransferNote('');
  };

  const matchedFriend = (friends || []).find(f => f.username === transferToUsername);

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3><I name="transfer" size={20} /> 转账</h3>
        <div className="transfer-balance">
          当前余额：<strong>¥{(balance || 0).toFixed(2)}</strong>
        </div>

        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>收款人</label>
        <input
          type="text"
          placeholder="输入收款人用户名"
          value={transferToUsername}
          onChange={e => setTransferToUsername(e.target.value)}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 4, marginBottom: 12 }}
        />

        {(friends || []).length > 0 && (
          <div className="transfer-friends">
            <div className="transfer-friends-title">或从好友中选择</div>
            <div className="transfer-friends-list">
              {friends.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`transfer-friend ${transferToUsername === f.username ? 'active' : ''}`}
                  onClick={() => setTransferToUsername(f.username)}
                >
                  <AvatarImg src={getAvatarUrl(f.avatar)} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  <span>{f.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>金额（元）</label>
        <input
          type="number"
          placeholder="0.00"
          value={transferAmount}
          onChange={e => setTransferAmount(e.target.value)}
          min="0.01"
          step="0.01"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 4, marginBottom: 12 }}
        />

        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>备注（可选）</label>
        <input
          type="text"
          placeholder="转账说明"
          value={transferNote}
          onChange={e => setTransferNote(e.target.value)}
          maxLength={100}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 4, marginBottom: 12 }}
        />

        {matchedFriend && (
          <div className="transfer-confirm-hint">
            将转账给 <strong>{matchedFriend.username}</strong>
          </div>
        )}

        <button
          className="confirm"
          onClick={sendTransfer}
          disabled={!transferToUsername.trim() || !transferAmount}
          style={{ width: '100%', marginBottom: 12 }}
        >
          确认转账
        </button>

        {transferHistory.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>转账记录</div>
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {transferHistory.slice(0, 10).map(t => {
                const isOut = t.fromUsername === user?.username;
                const counterpart = isOut ? t.toUsername : t.fromUsername;
                return (
                  <div key={t.id} style={{ padding: 8, background: 'var(--bg-color)', borderRadius: 4, marginBottom: 4, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {isOut ? `转给 ${counterpart}` : `来自 ${counterpart}`}
                        {t.note && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · {t.note}</span>}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(t.createdAt).toLocaleString()}</div>
                    </div>
                    <span style={{ color: isOut ? '#fa5151' : '#07c160', fontWeight: 700 }}>
                      {isOut ? '-' : '+'}¥{(t.amount || 0).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-buttons">
          <button className="cancel" onClick={close}>关闭</button>
        </div>
      </div>
    </div>
  );
}
