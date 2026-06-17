import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './Icon';

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clampTime(value, duration) {
  const next = Number(value) || 0;
  if (Number.isFinite(duration) && duration > 0) return Math.max(0, Math.min(next, duration));
  return Math.max(0, next);
}

export default function SyncMediaRoom({ roomId, socketRef, user, showToast }) {
  const mediaRef = useRef(null);
  const [media, setMedia] = useState(null);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);

  const isHost = useMemo(() => {
    return Boolean(media && user && (media.hostId === user.id || media.hostUsername === user.username));
  }, [media, user]);

  const targetTimeFor = (state) => {
    if (!state) return 0;
    const elapsed = state.isPlaying ? Math.max(0, (Date.now() - (state.receivedAt || Date.now())) / 1000) : 0;
    return clampTime((state.currentTime || 0) + elapsed, mediaRef.current?.duration);
  };

  const alignToState = (state, force = false) => {
    const el = mediaRef.current;
    if (!el || !state?.url) return;
    const target = targetTimeFor(state);
    if (force || Math.abs(el.currentTime - target) > 0.35) {
      try { el.currentTime = target; } catch {}
    }
    setLocalTime(target);
    if (state.isPlaying) {
      el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    } else {
      el.pause();
      setNeedsTap(false);
    }
  };

  useEffect(() => {
    if (!roomId || !socketRef?.current) return;
    const socket = socketRef.current;
    const onState = (state) => {
      if (!state || state.roomId !== roomId) return;
      if (state.active === false) {
        setMedia(null);
        setNeedsTap(false);
        return;
      }
      const next = { ...state, receivedAt: Date.now() };
      setMedia(next);
      window.setTimeout(() => alignToState(next, true), 60);
    };
    const onError = ({ error }) => {
      if (error) showToast?.(error, 'error');
    };
    socket.on('syncMediaState', onState);
    socket.on('syncMediaError', onError);
    socket.emit('syncMediaJoin', { roomId });
    return () => {
      socket.off('syncMediaState', onState);
      socket.off('syncMediaError', onError);
    };
  }, [roomId, socketRef]);

  useEffect(() => {
    if (!media || isHost) return;
    const timer = window.setInterval(() => alignToState(media), 1600);
    return () => window.clearInterval(timer);
  }, [media, isHost]);

  const emitControl = (action, time) => {
    if (!roomId || !media || !isHost) return;
    socketRef.current?.emit('syncMediaControl', {
      roomId,
      action,
      currentTime: clampTime(time ?? mediaRef.current?.currentTime ?? localTime, duration),
    });
  };

  const togglePlay = () => {
    if (!media) return;
    emitControl(media.isPlaying ? 'pause' : 'play');
  };

  const handleSeek = (event) => {
    const next = Number(event.target.value);
    setLocalTime(next);
    if (mediaRef.current) mediaRef.current.currentTime = next;
    emitControl('seek', next);
  };

  const joinPlayback = () => {
    if (!media) return;
    alignToState(media, true);
  };

  const stopSync = () => {
    if (!roomId || !isHost) return;
    socketRef.current?.emit('syncMediaControl', { roomId, action: 'stop', currentTime: localTime });
  };

  if (!media?.url) return null;

  const progress = duration > 0 ? Math.min(100, Math.max(0, (localTime / duration) * 100)) : 0;
  const MediaTag = media.mediaType === 'video' ? 'video' : 'audio';

  return (
    <div className={`sync-media-room ${media.isPlaying ? 'is-playing' : ''}`} style={{ '--sync-progress': `${progress}%` }}>
      <MediaTag
        ref={mediaRef}
        className="sync-media-element"
        src={media.url}
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setLocalTime(e.currentTarget.currentTime || 0)}
      />
      <div className="sync-cover-wrap">
        {media.cover ? (
          <img src={media.cover} alt="" className="sync-cover" />
        ) : (
          <div className="sync-cover sync-cover-fallback"><I name={media.mediaType === 'video' ? 'video' : 'music'} size={20} /></div>
        )}
      </div>
      <div className="sync-copy">
        <div className="sync-kicker">
          <I name="headphones" size={13} />
          <span>{media.mediaType === 'video' ? '一起看' : '一起听'} · {media.hostUsername || '房主'} 主控</span>
        </div>
        <div className="sync-title">{media.title || '同步媒体房'}</div>
        <div className="sync-wave"><span /><span /><span /><span /><span /></div>
      </div>
      <div className="sync-progress-wrap">
        <input
          className="sync-range"
          type="range"
          min="0"
          max={duration || Math.max(localTime, media.currentTime || 1, 1)}
          step="0.1"
          value={Math.min(localTime, duration || localTime || 0)}
          onChange={handleSeek}
          disabled={!isHost || !duration}
          aria-label="同步播放进度"
        />
        <div className="sync-time">{formatClock(localTime)} / {duration ? formatClock(duration) : '--:--'}</div>
      </div>
      <div className="sync-actions">
        {needsTap && !isHost && (
          <button className="sync-action sync-join" type="button" onClick={joinPlayback} title="加入同步">
            <I name="play" size={15} />
            <span>跟上</span>
          </button>
        )}
        {isHost ? (
          <>
            <button className="sync-action" type="button" onClick={togglePlay} title={media.isPlaying ? '暂停' : '播放'}>
              <I name={media.isPlaying ? 'pause' : 'play'} size={16} />
            </button>
            <button className="sync-action" type="button" onClick={stopSync} title="结束同步">
              <I name="close" size={16} />
            </button>
          </>
        ) : (
          <button className="sync-action" type="button" onClick={joinPlayback} title="校准进度">
            <I name="reset" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
