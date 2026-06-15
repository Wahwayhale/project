import React from 'react';
import { I } from '../Icon';

export default function NewsPanel({
  showNewsPanel,
  setShowNewsPanel,
  setNewsStories,
  newsStories,
  newsLoading,
  shareNews,
}) {
  if (!showNewsPanel) return null;

  return (
    <div className="modal-overlay" onClick={() => { setShowNewsPanel(false); setNewsStories([]); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}><I name="digest" size={20} /> 今日热搜</h3>
          <button onClick={() => { setShowNewsPanel(false); setNewsStories([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {newsLoading ? (
            <div style={{ textAlign: 'center', padding: 30 }}>加载中...</div>
          ) : newsStories.map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => shareNews(s)}>
              {s.image && <img src={s.image} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>点击分享到聊天</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
