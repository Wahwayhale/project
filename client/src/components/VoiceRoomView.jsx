import React, { useState, useEffect, useRef } from 'react';
import { I } from './Icon';
import { API_URL } from '../utils/constants';
import io from 'socket.io-client';

export default function VoiceRoomView({ showToast, onBack, user }) {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [participants, setParticipants] = useState({});
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const roomIdRef = useRef(null);
  const peersRef = useRef({}); // userId -> RTCPeerConnection
  const audioRefs = useRef({}); // userId -> audio element
  const pendingIceRef = useRef({}); // userId -> RTCIceCandidateInit[]

  useEffect(() => {
    const wsUrl = API_URL || window.location.origin;
    socketRef.current = io(wsUrl, { transports: ['websocket'] });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('authenticate', localStorage.getItem('token'));
      if (roomIdRef.current) socketRef.current.emit('voiceJoin', { roomId: roomIdRef.current });
    });
    socketRef.current.on('voiceParticipantUpdate', ({ participants: p, host }) => {
      setParticipants(p);
    });
    socketRef.current.on('voicePeers', async ({ roomId, peers = [] }) => {
      if (roomId !== roomIdRef.current || !localStreamRef.current) return;
      for (const peer of peers) {
        if (peer.userId && peer.userId !== user?.id) {
          await createOffer(peer.userId, peer.username);
        }
      }
    });
    socketRef.current.on('voicePeerJoined', async ({ userId, username }) => {
      if (userId && userId !== user?.id && localStreamRef.current) {
        await createOffer(userId, username);
      }
    });
    socketRef.current.on('voicePeerLeft', ({ userId }) => {
      closePeer(userId);
    });
    socketRef.current.on('voiceError', ({ error }) => {
      showToast(error || '语音房连接失败', 'error');
    });
    socketRef.current.on('voiceOffer', async ({ roomId, from, fromUsername, offer }) => {
      if (roomId !== roomIdRef.current) return;
      if (!localStreamRef.current) return;
      const pc = getPeerConnection(from, fromUsername);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingIce(from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('voiceAnswer', { roomId: roomIdRef.current, to: from, answer: pc.localDescription });
    });
    socketRef.current.on('voiceAnswer', async ({ roomId, from, answer }) => {
      if (roomId !== roomIdRef.current) return;
      const pc = peersRef.current[from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIce(from);
      }
    });
    socketRef.current.on('voiceIce', async ({ roomId, from, candidate }) => {
      if (roomId !== roomIdRef.current || !candidate) return;
      const pc = peersRef.current[from];
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIceRef.current[from] = [...(pendingIceRef.current[from] || []), candidate];
      }
    });
    fetchRooms();
    return () => { leaveRoom(); if (socketRef.current) { socketRef.current.disconnect(); } };
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/api/voice/list`, { headers: { Authorization: localStorage.getItem('token') } });
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };

  const closePeer = (peerId) => {
    if (!peerId) return;
    peersRef.current[peerId]?.close();
    delete peersRef.current[peerId];
    audioRefs.current[peerId]?.remove();
    delete audioRefs.current[peerId];
    delete pendingIceRef.current[peerId];
  };

  const flushPendingIce = async (peerId) => {
    const pc = peersRef.current[peerId];
    const queued = pendingIceRef.current[peerId] || [];
    if (!pc || !pc.remoteDescription || queued.length === 0) return;
    pendingIceRef.current[peerId] = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  };

  const getPeerConnection = (peerId, peerUsername) => {
    if (peersRef.current[peerId]) return peersRef.current[peerId];

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peersRef.current[peerId] = pc;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('voiceIce', { roomId: roomIdRef.current, to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (!audioRefs.current[peerId]) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.id = `voice_audio_${peerId}`;
        audio.dataset.peerName = peerUsername || '';
        document.body.appendChild(audio);
        audioRefs.current[peerId] = audio;
      }
      audioRefs.current[peerId].srcObject = e.streams[0];
      audioRefs.current[peerId].play?.().catch(() => {
        showToast('\u5df2\u63a5\u5165\u8bed\u97f3\uff0c\u8bf7\u70b9\u4e00\u4e0b\u9875\u9762\u4ee5\u5141\u8bb8\u64ad\u653e\u58f0\u97f3', 'info');
      });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        closePeer(peerId);
      }
    };
    return pc;
  };

  const createOffer = async (peerId, peerUsername) => {
    if (!roomIdRef.current || !localStreamRef.current || !peerId) return;
    const pc = getPeerConnection(peerId, peerUsername);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('voiceOffer', { roomId: roomIdRef.current, to: peerId, offer: pc.localDescription });
  };

  const joinRoom = async (room) => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u9ea6\u514b\u98ce\uff0c\u8bf7\u4f7f\u7528 HTTPS \u6216 localhost \u6253\u5f00', 'error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;
      const res = await fetch(`${API_URL}/api/voice/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ roomId: room.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '\u52a0\u5165\u8bed\u97f3\u623f\u5931\u8d25');
      roomIdRef.current = room.id;
      setCurrentRoom({ ...room, participants: data.participants || room.participants || {} });
      setParticipants(data.participants || {});
      socketRef.current?.emit('voiceJoin', { roomId: room.id });
    } catch (err) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      showToast(err.message || '\u65e0\u6cd5\u8bbf\u95ee\u9ea6\u514b\u98ce', 'error');
    }
  };

  const leaveRoom = async () => {
    const roomId = roomIdRef.current || currentRoom?.id;
    if (roomId) {
      await fetch(`${API_URL}/api/voice/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ roomId })
      }).catch(() => {});
      socketRef.current?.emit('voiceLeave', { roomId });
    }
    roomIdRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    Object.values(audioRefs.current).forEach(a => a.remove());
    audioRefs.current = {};
    pendingIceRef.current = {};
    setCurrentRoom(null);
    setParticipants({});
    setMuted(false);
    fetchRooms();
  };

  const toggleMute = async () => {
    const newMuted = !muted;
    setMuted(newMuted);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    await fetch(`${API_URL}/api/voice/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
      body: JSON.stringify({ roomId: roomIdRef.current || currentRoom?.id, muted: newMuted })
    }).catch(() => {});
  };

  const createRoom = async () => {
    try {
      const res = await fetch(`${API_URL}/api/voice/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({})
      });
      const data = await res.json();
      fetchRooms();
      if (data?.roomId) {
        await joinRoom({ id: data.roomId, host: data.host, participants: data.participants || {}, participantCount: Object.keys(data.participants || {}).length });
      }
      showToast('语音房已创建', 'success');
    } catch { showToast('创建失败', 'error'); }
  };

  // 语音房中
  if (currentRoom) {
    const participantList = Object.entries(participants);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div className="chat-header" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <button className="icon-btn" onClick={leaveRoom} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>语音房</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{participantList.length} 人在线</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
          {participantList.map(([username, info]) => (
            <div key={username} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: username === user?.username ? 'var(--primary)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 600, border: info.muted ? '3px solid var(--danger)' : '3px solid var(--border)', position: 'relative' }}>
                {username.charAt(0).toUpperCase()}
                {info.muted && <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I name="micOff" size={12} color="white" /></div>}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: username === user?.username ? 600 : 400 }}>{username}{username === user?.username ? ' (我)' : ''}</span>
            </div>
          ))}
          {participantList.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>等待其他人加入...</div>}
        </div>

        <div style={{ padding: 16, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <button onClick={toggleMute}
            style={{ width: 56, height: 56, borderRadius: 28, border: 'none', background: muted ? 'var(--danger)' : 'var(--bg-card)', color: muted ? '#fff' : 'var(--text)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I name={muted ? 'micOff' : 'mic'} size={24} />
          </button>
          <button onClick={leaveRoom}
            style={{ width: 56, height: 56, borderRadius: 28, border: 'none', background: 'var(--danger)', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I name="close" size={24} />
          </button>
        </div>
      </div>
    );
  }

  // 房间列表
  if (loading) return <div className="discover-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="loading-spinner" /></div></div>;

  return (
    <div className="discover-page">
      <div className="discover-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" onClick={onBack} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
        <h2>语音房</h2>
      </div>
      <div className="discover-list" style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 4, color: 'var(--primary)' }}><I name="mic" size={40} /></div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>实时语音聊天，和朋友面对面交流</p>
          </div>

          <button onClick={createRoom}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--primary-gradient, var(--primary))', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>
            + 创建语音房
          </button>

          {rooms.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
              暂无语音房，点击上方按钮创建
            </div>
          )}

          {rooms.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-light)', marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <I name="mic" size={18} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>语音房</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>房主：{r.host} · {r.participantCount} 人</div>
              </div>
              <button onClick={() => joinRoom(r)}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                加入
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
