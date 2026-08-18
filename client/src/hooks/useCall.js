import { useState, useRef } from 'react';
import { isCapacitor } from '../utils/constants';

export function useCall({
  showToast,
  currentRoomId,
  socketRef,
  user,
  allUsers,
  peerRef,
}) {
  // ===== WebRTC 通话 =====
  const [callState, setCallState] = useState(null); // { type, roomId, peerId, localStream, remoteStream, status }
  const localVideoRef = useRef(null);
  // 用 ref 镜像 callState，避免 hangUp 闭包读到过时的 state（导致旧 localStream/PC 不被清理）
  const callStateRef = useRef(null);
  const setCallStateSafe = (updater) => {
    setCallState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      callStateRef.current = next;
      return next;
    });
  };
  // 缓存对端在 peerRef 建好前 / remoteDescription 设置前发来的 ICE 候选
  // 解决 trickle ICE 时序问题：主叫发 offer 后立即开始发候选，但被叫还没接听、peerRef 未创建，候选会被丢弃
  const pendingCandidatesRef = useRef([]);
  // ICE 断开后的重连等待定时器（disconnected 不立刻挂，给 WebRTC 重连机会）
  const disconnectTimeoutRef = useRef(null);
  // 连接超时定时器（connecting 超过 30 秒还没连上，提示并挂断）
  const connectTimeoutRef = useRef(null);

  // ===== 位置共享 =====
  const [sharedLocations, setSharedLocations] = useState({});
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const locationWatchId = useRef(null);

  // ===== ICE 服务器配置（多 STUN + TURN 备选）=====
  // TURN 是 WebRTC 穿透 NAT 的关键：STUN 只能穿透 Cone NAT，
  // 对称 NAT / 企业网 / 4G5G 移动网络必须靠 TURN 中继转发流量，
  // 否则会出现"对方接听后一直卡在连接中"的现象。
  const ICE_SERVERS = [
    // ----- STUN（用于收集主机/反射候选）-----
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },

    // ----- 公共免费 TURN（OpenRelay，北美节点，国内延迟较高但能通）-----
    // 用于临时验证通话链路，生产环境建议替换为自建 coturn
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },

    // ===== 自建 coturn（生产环境使用，部署后替换下面的占位符）=====
    // 部署步骤：
    //   1. 租一台带公网 IP 的服务器（阿里云轻量香港 / Vultr 等）
    //   2. Docker 部署 coturn，开放 TCP/UDP 3478 + UDP 49152-65535
    //   3. turnserver.conf 必须配置 external-ip=公网IP
    //   4. 替换下面的 IP / 域名 / 用户名 / 密码
    // 安全建议：生产环境改用 REST API 临时凭证（HMAC），不要硬编码长期凭证
    // {
    //   urls: 'turn:你的服务器IP:3478?transport=udp',
    //   username: '你的用户名',
    //   credential: '你的密码',
    // },
    // {
    //   urls: 'turn:你的服务器IP:3478?transport=tcp',
    //   username: '你的用户名',
    //   credential: '你的密码',
    // },
    // // 有 TLS 证书时再加这条（HTTPS 页面推荐）
    // {
    //   urls: 'turns:你的域名:5349',
    //   username: '你的用户名',
    //   credential: '你的密码',
    // },
  ];

  // ===== WebRTC 通话函数 =====
  // flush 缓存的 ICE 候选：在 setRemoteDescription 完成后调用
  // addIceCandidate 必须在 remoteDescription 设置好之后才能调用，否则会报错
  const flushPendingCandidates = () => {
    const pc = peerRef.current;
    if (!pc || pendingCandidatesRef.current.length === 0) return;
    if (pc.signalingState === 'closed' || !pc.remoteDescription) return;
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    pending.forEach(c => {
      try {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      } catch(e) {}
    });
  };

  // 清理所有通话相关的定时器
  const clearCallTimers = () => {
    if (disconnectTimeoutRef.current) { clearTimeout(disconnectTimeoutRef.current); disconnectTimeoutRef.current = null; }
    if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
  };

  // 统一给 RTCPeerConnection 挂诊断 + 挂断逻辑
  // role: 'caller' | 'callee'，用于日志区分
  const setupPcDiagnostics = (pc, role) => {
    // ICE 收集状态：new → gathering → complete
    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC:${role}] ICE gathering:`, pc.iceGatheringState);
    };
    // ICE 连接状态（决定是否挂断的关键）：new → checking → connected → completed / disconnected → failed
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log(`[WebRTC:${role}] ICE connection:`, s);
      if (s === 'connected' || s === 'completed') {
        // 连上了，清掉断开等待和连接超时
        if (disconnectTimeoutRef.current) { clearTimeout(disconnectTimeoutRef.current); disconnectTimeoutRef.current = null; }
        if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
      } else if (s === 'disconnected') {
        // 不立刻挂，等 10 秒看是否自动恢复（WebRTC 短暂断开会重连）
        if (!disconnectTimeoutRef.current) {
          disconnectTimeoutRef.current = setTimeout(() => {
            console.warn(`[WebRTC:${role}] ICE disconnected 超过 10s，挂断`);
            showToast('网络不稳定，通话已断开', 'info');
            hangUp();
          }, 10000);
        }
      } else if (s === 'failed') {
        console.error(`[WebRTC:${role}] ICE failed —— 候选协商失败，通常是 TURN 不可达或 NAT 穿透失败`);
        showToast('连接失败：可能 TURN 服务器不可达，或网络环境限制', 'error');
        hangUp();
      }
    };
    // 整体连接状态
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC:${role}] PC connection:`, pc.connectionState);
    };
    // 注意：onicecandidate 在 startCall/acceptCall 里单独设置，同时做日志 + 发送给对端
  };

  // 统一的 ICE 候选处理：打印候选类型日志 + 通过 socket 发给对端
  const makeIceCandidateHandler = (targetUserId, role) => (e) => {
    if (e.candidate) {
      const t = e.candidate.candidate || '';
      let type = 'unknown';
      if (t.includes('typ host')) type = 'host';
      else if (t.includes('typ srflx')) type = 'srflx (STUN)';
      else if (t.includes('typ relay')) type = 'relay (TURN)';
      else if (t.includes('typ prflx')) type = 'prflx';
      console.log(`[WebRTC:${role}] ICE candidate:`, type);
      socketRef.current.emit('iceCandidate', { toUserId: targetUserId, candidate: e.candidate });
    } else {
      console.log(`[WebRTC:${role}] ICE gathering complete`);
    }
  };

  // 启动连接超时检测：30 秒还没 connected 就提示并挂断
  const startConnectTimeout = (role) => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      if (peerRef.current && peerRef.current.iceConnectionState !== 'connected' && peerRef.current.iceConnectionState !== 'completed') {
        console.error(`[WebRTC:${role}] 连接超时 30s，当前 ICE 状态:`, peerRef.current.iceConnectionState);
        showToast('连接超时，请检查网络或 TURN 服务器配置', 'error');
        hangUp();
      }
    }, 30000);
  };

  const startCall = async (targetUserId, callType) => {
    if (!targetUserId) { showToast('未找到对方用户', 'error'); return; }
    // 已有通话时先挂断旧的
    if (callState) { hangUp(); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
      const peerUser = allUsers.find(u => u.id === targetUserId || u._id === targetUserId);
      const peerName = peerUser?.username || peerUser?.nickname || '对方';
      setCallStateSafe({ type: callType, status: 'calling', localStream: stream, remoteStream: null, peerId: targetUserId, peerName, roomId: currentRoomId });
      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = makeIceCandidateHandler(targetUserId, 'caller');
      pc.ontrack = (e) => { setCallStateSafe(prev => prev ? { ...prev, remoteStream: e.streams[0], status: 'connected' } : null); };
      setupPcDiagnostics(pc, 'caller');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      peerRef.current = pc;
      socketRef.current.emit('callUser', { toUserId: targetUserId, roomId: currentRoomId, signal: offer, callType });
      startConnectTimeout('caller');
    } catch (err) {
      console.error('[WebRTC] startCall failed:', err);
      showToast('无法访问摄像头/麦克风：' + (err.message || err.name), 'error');
      setCallStateSafe(null);
    }
  };

  const acceptCall = async () => {
    if (!callState) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callState.type === 'video', audio: true });
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = makeIceCandidateHandler(callState.peerId, 'callee');
      pc.ontrack = (e) => { setCallStateSafe(prev => prev ? { ...prev, remoteStream: e.streams[0], status: 'connected' } : null); };
      setupPcDiagnostics(pc, 'callee');
      await pc.setRemoteDescription(new RTCSessionDescription(callState.signal));
      peerRef.current = pc;
      // flush 主叫在接听前发来的 ICE 候选（之前因 peerRef 未建好被缓存）
      flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answerCall', { toUserId: callState.peerId, signal: answer });
      const peerName = callState.caller?.username || callState.peerName || '对方';
      setCallStateSafe(prev => prev ? { ...prev, localStream: stream, remoteStream: null, status: 'connecting', peerName } : null);
      startConnectTimeout('callee');
    } catch (err) {
      console.error('[WebRTC] acceptCall failed:', err);
      showToast('无法访问摄像头/麦克风：' + (err.message || err.name), 'error');
    }
  };

  const hangUp = () => {
    clearCallTimers();
    pendingCandidatesRef.current = [];
    // 从 ref 读取最新的 callState，避免闭包过时导致旧 stream/PC 不被清理
    const cur = callStateRef.current;
    try {
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    } catch(e) {}
    if (cur?.localStream) {
      try { cur.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    if (cur?.peerId && socketRef.current) {
      socketRef.current.emit('hangUp', { toUserId: cur.peerId });
    }
    callStateRef.current = null;
    setCallState(null);
  };

  const toggleMute = () => {
    if (!callState?.localStream) return;
    try {
      callState.localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setCallStateSafe(prev => prev ? { ...prev, muted: !prev.muted } : null);
    } catch(e) {}
  };

  // ===== 位置共享 =====
  const startSharingLocation = () => {
    if (!currentRoomId) return;
    if (navigator.geolocation) {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          socketRef.current.emit('shareLocation', { roomId: currentRoomId, lat: latitude, lng: longitude });
          setSharedLocations(prev => ({ ...prev, [user?.id]: { lat: latitude, lng: longitude, username: user?.username } }));
        },
        (err) => showToast('获取位置失败: ' + err.message, 'error'),
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      setIsSharingLocation(true);
      showToast('开始共享位置', 'success');
    } else { showToast('浏览器不支持定位', 'error'); }
  };

  const stopSharingLocation = () => {
    if (locationWatchId.current) { navigator.geolocation.clearWatch(locationWatchId.current); locationWatchId.current = null; }
    socketRef.current.emit('stopSharingLocation', { roomId: currentRoomId });
    setIsSharingLocation(false);
    setSharedLocations({});
    showToast('已停止位置共享', 'info');
  };

  const openLocationMap = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  return {
    // Call
    callState, setCallState,
    peerRef,
    localVideoRef,
    pendingCandidatesRef,
    flushPendingCandidates,
    // Location
    sharedLocations, setSharedLocations,
    isSharingLocation, setIsSharingLocation,
    locationWatchId,
    // Functions
    startCall,
    acceptCall,
    hangUp,
    toggleMute,
    startSharingLocation,
    stopSharingLocation,
    openLocationMap,
  };
}
