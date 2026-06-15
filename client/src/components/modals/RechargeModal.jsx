import React from 'react';
import { I } from '../Icon';

export default function RechargeModal({ showRechargeModal, setShowRechargeModal, setRechargePayCode, setRechargeAmount, rechargePayCode, rechargeAmount, requestRecharge, rechargeHistory }) {
  if (!showRechargeModal) return null;
  return (
    <div className="modal-overlay" onClick={() => { setShowRechargeModal(false); setRechargePayCode(null); setRechargeAmount(''); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
        <h3><I name="wallet" size={20} /> 充值余额</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>充值金额（元）</label>
          <input
            type="number"
            placeholder="输入充值金额，最少1元"
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(e.target.value)}
            min="1"
            step="1"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', marginTop: 4 }}
          />
        </div>

        {!rechargePayCode && (
          <button
            className="confirm"
            onClick={requestRecharge}
            style={{ width: '100%', marginBottom: 12 }}
          >
            提交充值请求
          </button>
        )}

        {rechargePayCode && (
          <div style={{ padding: 16, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
              充值金额: ¥{rechargePayCode.amount}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              请使用微信扫描以下收款码转账：
            </div>
            <img
              src={rechargePayCode.payCode}
              alt="微信收款码"
              style={{ width: 200, height: 200, borderRadius: 8 }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              ⏳ 转账后等待管理员确认，确认后余额自动增加
            </div>
          </div>
        )}

        {rechargeHistory.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>充值记录</div>
            <div style={{ maxHeight: 150, overflowY: 'auto' }}>
              {rechargeHistory.slice(0, 5).map(r => (
                <div key={r.id} style={{ padding: 8, background: 'var(--bg-color)', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>¥{r.amount}</span>
                    <span style={{ color: r.status === 'confirmed' ? '#07c160' : r.status === 'rejected' ? '#fa5151' : '#888' }}>
                      {r.status === 'confirmed' ? '已确认' : r.status === 'rejected' ? '已拒绝' : '待确认'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(r.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowRechargeModal(false); setRechargePayCode(null); setRechargeAmount(''); }}>关闭</button>
        </div>
      </div>
    </div>
  );
}
