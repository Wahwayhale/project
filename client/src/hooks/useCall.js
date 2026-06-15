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

  // ===== 位置共享 =====
  const [sharedLocations, setSharedLocations] = useState({});
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const locationWatchId = useRef(null);

  // ===== WebRTC 通话函数 =====
  const startCall = async (targetUserId, callType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
      setCallState({ type: callType, status: 'calling', localStream: stream, remoteStream: null, peerId: targetUserId, roomId: currentRoomId });
      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => { if (e.candidate) socketRef.current.emit('iceCandidate', { toUserId: targetUserId, candidate: e.candidate }); };
      pc.ontrack = (e) => { setCallState(prev => prev ? { ...prev, remoteStream: e.streams[0] } : null); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') hangUp(); };
      peerRef.current = pc;
      socketRef.current.emit('callUser', { toUserId: targetUserId, roomId: currentRoomId, signal: offer, callType });
    } catch (err) { showToast('无法访问摄像头/麦克风', 'error'); }
  };

  const acceptCall = async () => {
    if (!callState) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: callState.type === 'video', audio: true });
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => { if (e.candidate) socketRef.current.emit('iceCandidate', { toUserId: callState.peerId, candidate: e.candidate }); };
      pc.ontrack = (e) => { setCallState(prev => prev ? { ...prev, remoteStream: e.streams[0], status: 'connected' } : null); };
      await pc.setRemoteDescription(new RTCSessionDescription(callState.signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answerCall', { toUserId: callState.peerId, signal: answer });
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') hangUp(); };
      peerRef.current = pc;
      setCallState(prev => prev ? { ...prev, localStream: stream, remoteStream: null, status: 'connecting' } : null);
    } catch (err) { showToast('无法访问摄像头/麦克风', 'error'); }
  };

  const hangUp = () => {
    try {
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    } catch(e) {}
    if (callState?.localStream) {
      try { callState.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    if (callState?.peerId && socketRef.current) {
      socketRef.current.emit('hangUp', { toUserId: callState.peerId });
    }
    setCallState(null);
  };

  const toggleMute = () => {
    if (!callState?.localStream) return;
    try {
      callState.localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setCallState(prev => prev ? { ...prev, muted: !prev.muted } : null);
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
