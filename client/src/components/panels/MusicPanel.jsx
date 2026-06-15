import React from 'react';
import { I } from '../Icon';

export default function MusicPanel({
  showMusicPanel,
  setShowMusicPanel,
  musicSearch,
  setMusicSearch,
  musicLoading,
  searchMusic,
  musicResults,
  currentSong,
  isPlaying,
  togglePlay,
  shareSongToChat,
  playSong,
  musicLyric,
  audioRef,
  setIsPlaying,
}) {
  if (!showMusicPanel) return null;

  return (
    <>
      <div className="modal-overlay" onClick={() => setShowMusicPanel(false)}>
        <div className="modal music-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
          <div className="music-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}><I name="music" size={20} /> 网易云音乐</h3>
            <button onClick={() => setShowMusicPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><I name="close" size={20} /></button>
          </div>
          {/* 搜索框 */}
          <form onSubmit={searchMusic} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={musicSearch}
              onChange={e => setMusicSearch(e.target.value)}
              placeholder="搜索歌曲、歌手..."
              style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }}
            />
            <button type="submit" disabled={musicLoading} style={{ padding: '10px 18px', background: 'linear-gradient(135deg, #ec4141, #e03a3a)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {musicLoading ? '搜索中...' : '搜索'}
            </button>
          </form>
          {/* 迷你播放器 */}
          {currentSong && (
            <div className="mini-player" style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={currentSong.pic || ''} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSong.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{currentSong.artist}</div>
              </div>
              <button onClick={togglePlay} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, width: 36, height: 36, cursor: 'pointer', fontSize: 16, color: '#fff' }}>
                {isPlaying ? <I name="stop" size={18} color="#fff" /> : <I name="send" size={18} color="#fff" />}
              </button>
              <button onClick={() => shareSongToChat(currentSong)} title="分享到聊天" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, padding: '4px 8px', color: '#fff', display: 'flex', alignItems: 'center' }}><I name="forward" size={15} color="#fff" /></button>
            </div>
          )}
          {/* 歌词 */}
          {musicLyric && isPlaying && (
            <div className="lyric-box" style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 12, maxHeight: 120, overflowY: 'auto', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {musicLyric.split('\n').slice(0, 10).join('\n')}
            </div>
          )}
          {/* 搜索结果 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {musicResults.length === 0 && !musicLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <div style={{ opacity: 0.25, marginBottom: 12 }}><I name="music" size={48} /></div>
                <div>输入关键词搜索歌曲</div>
              </div>
            )}
            {musicResults.map((song, i) => (
              <div key={song.id || i} className="music-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: currentSong?.id === song.id ? 'var(--hover)' : 'transparent', borderRadius: 8 }}
                onClick={() => playSong(song)}
              >
                <img src={song.pic || ''} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--bg)' }} onError={e => { e.target.style.display = 'none'; }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{song.artist}{song.album ? ` · ${song.album}` : ''}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); playSong(song); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="播放">▶️</button>
                <button onClick={(e) => { e.stopPropagation(); shareSongToChat(song); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="分享"><I name="forward" size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} style={{ display: 'none' }} />
    </>
  );
}
