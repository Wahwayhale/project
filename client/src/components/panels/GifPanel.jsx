import React from 'react';
import { I } from '../Icon';

export default function GifPanel({
  showGifPanel,
  setShowGifPanel,
  setGifSearch,
  setGifResults,
  gifSearch,
  gifLoading,
  searchGif,
  gifResults,
  sendGif,
}) {
  if (!showGifPanel) return null;

  return (
    <div className="modal-overlay" onClick={() => { setShowGifPanel(false); setGifSearch(''); setGifResults([]); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}><I name="image" size={20} /> GIF 表情包</h3>
          <button onClick={() => { setShowGifPanel(false); setGifSearch(''); setGifResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
        </div>
        <form onSubmit={searchGif} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="text" value={gifSearch} onChange={e => setGifSearch(e.target.value)} placeholder="搜索 GIF..." style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
          <button type="submit" disabled={gifLoading} style={{ padding: '10px 18px', background: 'linear-gradient(135deg, #fb7299, #cc66cc)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>{gifLoading ? '搜索中' : '搜索'}</button>
        </form>
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {gifResults.length === 0 && !gifLoading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>输入关键词搜索 GIF</div>
          )}
          {gifResults.map((gif, i) => (
            <div key={gif.id || i} onClick={() => sendGif(gif)} style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)' }}>
              <img src={gif.preview || gif.url} alt={gif.title} style={{ width: '100%', height: 120, objectFit: 'cover' }} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
