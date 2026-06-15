import React from 'react';
import { I } from './Icon';
import EmptyState from './ui/EmptyState';

export default function BilibiliView({
  setView,
  setBottomTab,
  bilibiliQuery,
  setBilibiliQuery,
  bilibiliLoading,
  searchBilibili,
  selectedBiliVideo,
  setSelectedBiliVideo,
  bilibiliResults,
  shareBilibiliToChat,
  observeVideo,
}) {
  return (
    /* ===== B站视频全屏视图 ===== */
    <div className="video-fullview">
      <div className="video-fullview-header">
        <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
        <h3><I name="bilibili" size={20} /> B站视频</h3>
      </div>
      <div className="panel-searchbar panel-bili-searchbar">
        <form onSubmit={searchBilibili}>
          <input type="text" placeholder="搜索B站视频..." value={bilibiliQuery} onChange={e => setBilibiliQuery(e.target.value)} />
          <button type="submit" disabled={bilibiliLoading}>{bilibiliLoading ? '搜索中' : '搜索'}</button>
        </form>
      </div>
      <div className="panel-scroll">
        {selectedBiliVideo ? (
          <div className="panel-detail">
            <div className="panel-detail-head">
              <button onClick={() => setSelectedBiliVideo(null)} className="panel-back">←</button>
              <span>{selectedBiliVideo.title}</span>
            </div>
            <div className="bilibili-embed">
              <iframe src={`https://player.bilibili.com/player.html?bvid=${selectedBiliVideo.bvid}`} title={selectedBiliVideo.title} allowFullScreen />
            </div>
            <div className="panel-meta">
              <div>{selectedBiliVideo.author} · ▶ {selectedBiliVideo.play}次 · {selectedBiliVideo.duration}</div>
            </div>
            <button onClick={() => shareBilibiliToChat(selectedBiliVideo)} className="panel-primary-btn"><I name="forward" size={15} color="#fff" /> 分享到聊天</button>
          </div>
        ) : bilibiliResults.length > 0 ? (
          bilibiliResults.map((video, idx) => (
            <div key={idx} onClick={() => setSelectedBiliVideo(video)} className="panel-list-item">
              <img src={video.pic} alt={video.title} className="panel-thumb" />
              <div className="panel-list-copy">
                <div className="panel-list-title">{video.title}</div>
                <div className="panel-list-sub">{video.author}</div>
                <div className="panel-list-meta">▶ {video.play} · {video.duration}</div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState icon="bilibili" title={bilibiliLoading ? '搜索中...' : '输入关键词搜索B站视频'} />
        )}
      </div>
    </div>
  );
}
