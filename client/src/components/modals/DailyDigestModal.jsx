import React from 'react';
import { I } from '../Icon';

export default function DailyDigestModal({ showDailyDigest, setShowDailyDigest, setDailyDigest, dailyDigestLoading, dailyDigest }) {
  if (!showDailyDigest) return null;
  return (
    <div className="modal-overlay" onClick={() => { setShowDailyDigest(false); setDailyDigest(null); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3><I name="digest" size={20} /> AI 每日摘要</h3>
        {dailyDigestLoading ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ opacity: 0.25, marginBottom: 12 }}><I name="ai" size={48} /></div>
            <div>AI 正在分析你今天的聊天记录...</div>
          </div>
        ) : dailyDigest ? (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div className="stat-chip" style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{dailyDigest.stats?.totalMessages || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>今日消息</div>
              </div>
              <div className="stat-chip" style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{dailyDigest.stats?.activeRooms || 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>活跃群聊</div>
              </div>
            </div>
            <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 10, marginBottom: 14, lineHeight: 1.7, fontSize: 14 }}>
              {dailyDigest.digest}
            </div>
            {dailyDigest.highlightMessages?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>📌 最新消息</div>
                {dailyDigest.highlightMessages.map((m, i) => (
                  <div key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>[{m.room}]</span> <strong>{m.sender}</strong>: {m.content?.slice(0, 40)}{(m.content?.length > 40) ? '...' : ''}
                    <span style={{ float: 'right', color: 'var(--text-secondary)', fontSize: 11 }}>{m.time}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>生成失败</div>
        )}
        <div className="modal-buttons">
          <button className="confirm" onClick={() => { setShowDailyDigest(false); setDailyDigest(null); }}>关闭</button>
        </div>
      </div>
    </div>
  );
}
