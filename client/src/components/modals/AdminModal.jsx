import React from 'react';
import { I } from '../Icon';

export default function AdminModal({ showAdminModal, setShowAdminModal, fetchAdminDashboard, adminDashboardLoading, adminDashboard, aiStatus, aiStatusLoading, fetchAiStatus, pendingRecharges, fetchPendingRecharges, confirmRecharge, rejectRecharge }) {
  if (!showAdminModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
      <div className="modal admin-center-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="crown" size={20} /> 管理中心</h3>
        <div className="admin-section-head">
          <span>运营概览</span>
          <button className="mini-text-btn" onClick={fetchAdminDashboard} disabled={adminDashboardLoading}>
            {adminDashboardLoading ? '刷新中' : '刷新'}
          </button>
        </div>
        <div className="admin-metric-grid">
          {[
            ['用户', adminDashboard?.stats?.users ?? '-'],
            ['在线', adminDashboard?.stats?.onlineUsers ?? '-'],
            ['房间', adminDashboard?.stats?.rooms ?? '-'],
            ['今日消息', adminDashboard?.stats?.todayMessages ?? '-'],
            ['待充值', adminDashboard?.stats?.pendingRecharges ?? '-'],
            ['今日充值', `¥${(adminDashboard?.stats?.todayRechargeAmount || 0).toFixed(2)}`]
          ].map(([label, value]) => (
            <div key={label} className="admin-metric">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="admin-section-head">
          <span>AI 稳定性中心</span>
          <button className="mini-text-btn" onClick={fetchAiStatus} disabled={aiStatusLoading}>
            {aiStatusLoading ? '检测中' : '刷新'}
          </button>
        </div>
        <div className="ai-status-grid">
          {(aiStatus?.providers || []).map(p => (
            <div key={p.id} className={`ai-status-card ${p.configured ? 'configured' : 'missing'} ${p.ok === false ? 'failed' : ''}`}>
              <div className="ai-status-top">
                <span>{p.name}</span>
                <span className="ai-status-dot" />
              </div>
              <div className="ai-status-desc">
                {!p.configured ? '未配置 Key' : p.ok === false ? (p.detail || '最近调用失败') : p.ok === true ? '最近调用正常' : '已配置，等待调用检测'}
              </div>
              {p.checkedAt && <div className="ai-status-time">{new Date(p.checkedAt).toLocaleTimeString()}</div>}
            </div>
          ))}
          {!aiStatus && (
            <div className="ai-status-empty">点击刷新查看 AI 通道状态</div>
          )}
        </div>
        <div className="admin-section-head">
          <span>待确认充值</span>
          <button className="mini-text-btn" onClick={fetchPendingRecharges}>刷新</button>
        </div>
        {pendingRecharges.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
            暂无待确认的充值请求
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {pendingRecharges.map(r => (
              <div key={r.id} style={{ padding: 12, background: 'var(--bg-color)', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{r.username}</div>
                    <div style={{ fontSize: 18, color: '#07c160' }}>¥{r.amount}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => confirmRecharge(r.id)}
                      style={{ padding: '6px 12px', fontSize: 12, background: '#07c160', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                      确认
                    </button>
                    <button
                      onClick={() => rejectRecharge(r.id)}
                      style={{ padding: '6px 12px', fontSize: 12, background: '#fa5151', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="admin-section-head">
          <span>最近审计</span>
        </div>
        <div className="audit-list">
          {(adminDashboard?.audit || []).length === 0 ? (
            <div className="ai-status-empty">暂无审计记录</div>
          ) : adminDashboard.audit.map(item => (
            <div key={item.id} className="audit-item">
              <span>{item.action}</span>
              <strong>{item.actor}</strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowAdminModal(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
