import React, { useState, useEffect, useRef, useCallback } from 'react';
import { I } from './Icon';
import { API_URL, SERVER_URL } from '../utils/constants';
import io from 'socket.io-client';

export default function VoiceRoomView({ showToast, onBack, user }) {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [participants, setParticipants] = useState({});
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // userId -> RTCPeerConnection
  const audioRefs = useRef({}); // userId -> audio element

  useEffect(() => {
    const wsUrl = SERVER_URL || window.location.origin;
    socketRef.current = io(wsUrl, { transports: ['websocket'] });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('authenticate', localStorage.getItem('token'));
    });
    socketRef.current.on('voiceParticipantUpdate', ({ participants: p, host }) => {
      setParticipants(p);
    });
    socketRef.current.on('voiceOffer', async ({ from, fromUsername, offer }) => {
      if (!localStreamRef.current) return;
      const pc = createPeerConnection(from, fromUsername);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('voiceAnswer', { roomId: currentRoom?.id, to: from, answer });
    });
    socketRef.current.on('voiceAnswer', async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socketRef.current.on('voiceIce', async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
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

  const createPeerConnection = (peerId, peerUsername) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peersRef.current[peerId] = pc;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('voiceIce', { roomId: currentRoom?.id, to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (!audioRefs.current[peerId]) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.id = `voice_audio_${peerId}`;
        document.body.appendChild(audio);
        audioRefs.current[peerId] = audio;
      }
      audioRefs.current[peerId].srcObject = e.streams[0];
    };
    return pc;
  };

  const joinRoom = async (room) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, echoCancellation: true, noiseSuppression: true });
      localStreamRef.current = stream;
      await fetch(`${API_URL}/api/voice/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ roomId: room.id })
      });
      setCurrentRoom(room);
      socketRef.current?.emit('voiceJoin', { roomId: room.id });

      const res = await fetch(`${API_URL}/api/voice/list`, { headers: { Authorization: localStorage.getItem('token') } });
      const data = await res.json();
      const updatedRoom = data.find(r => r.id === room.id);
      if (updatedRoom) setParticipants(updatedRoom.participants || {});
    } catch (err) {
      showToast('无法访问麦克风', 'error');
    }
  };

  const leaveRoom = async () => {
    if (currentRoom) {
      await fetch(`${API_URL}/api/voice/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ roomId: currentRoom.id })
      }).catch(() => {});
      socketRef.current?.emit('voiceLeave', { roomId: currentRoom.id });
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    Object.values(audioRefs.current).forEach(a => a.remove());
    audioRefs.current = {};
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
      body: JSON.stringify({ roomId: currentRoom?.id, muted: newMuted })
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
