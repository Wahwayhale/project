import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { API_URL } from '../utils/constants';

/**
 * useSocket — 管理与服务端的 Socket.io 连接、在线用户、全部消息事件处理
 *
 * @param {object}   params
 * @param {string}   params.token          — JWT
 * @param {object}   params.user           — 当前登录用户
 * @param {boolean}  params.isAuthenticated
 * @param {object}   params.handlers       — 所有 setState / callback 键值对
 *
 * 仅当 isAuthenticated 且 user 存在时建立连接。
 * 返回 { socketRef, onlineUsers }。
 */
export function useSocket({ token, user, isAuthenticated, handlers, socketRef: externalSocketRef }) {
  const internalRef = useRef(null);
  const socketRef = externalSocketRef || internalRef;
  const [onlineUsers, setOnlineUsers] = useState([]);

  // 用 ref 存储最新的 handlers / user，避免 socket 事件回调闭包过时
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const userRef = useRef(user);
  userRef.current = user;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const h = handlersRef.current;
    const connectSocket = () => {
      if (socketRef.current?.connected) {
        socketRef.current.disconnect();
      }
      const wsUrl = API_URL || window.location.origin;
      console.log('Socket connecting to:', wsUrl);
      socketRef.current = io(wsUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 50,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
        upgrade: false,
        perMessageDeflate: true
      });

      socketRef.current.on('connect', () => {
        console.log('Socket connected');
        socketRef.current.emit('authenticate', tokenRef.current);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        h.showToast('连接已断开，正在重连...', 'info');
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        h.showToast('网络连接异常，请检查服务器是否运行', 'error');
      });

      socketRef.current.on('authenticated', (data) => {
        console.log('Socket authenticated', data);
      });

      // 接收完整在线用户列表（首次连接时）
      socketRef.current.on('onlineUsersList', (list) => {
        const ids = new Set(list.map(u => u.id));
        setOnlineUsers(list);
        h.setFriends(prev => prev.map(f => ({ ...f, online: ids.has(f.id) })));
        h.setAllUsers(prev => prev.map(u => ({ ...u, online: ids.has(u.id) })));
      });

      socketRef.current.on('userOnline', (data) => {
        setOnlineUsers(prev => [...prev.filter(u => u.id !== data.id), data]);
        h.setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: true } : f));
        h.setAllUsers(prev => prev.map(u => u.id === data.id ? { ...u, online: true } : u));
      });

      socketRef.current.on('userOffline', (data) => {
        setOnlineUsers(prev => prev.filter(u => u.id !== data.id));
        h.setFriends(prev => prev.map(f => f.id === data.id ? { ...f, online: false } : f));
        h.setAllUsers(prev => prev.map(u => u.id === data.id ? { ...u, online: false } : u));
      });

      socketRef.current.on('newMessage', (message) => {
        h.setMessages(prev => {
          // 替换乐观更新的临时消息，避免重复
          const currentUser = userRef.current;
          const isSelf = message.sender?.id === currentUser?.id || message.sender?.username === currentUser?.username;
          let next;
          if (isSelf) {
            const tempIdx = prev.findIndex(m =>
              m.id?.startsWith('temp-') &&
              m.roomId === message.roomId &&
              m.sender?.username === currentUser?.username &&
              m.content === message.content
            );
            if (tempIdx !== -1) {
              next = [...prev];
              next[tempIdx] = message;
            } else {
              next = [...prev, message];
            }
          } else {
            next = [...prev, message];
          }
          try { localStorage.setItem('msgCache_' + message.roomId, JSON.stringify(next.slice(-100))); } catch {}
          return next;
        });
        h.setRooms(prev => prev.map(room => {
          if (room.id === message.roomId) {
            return { ...room, lastMessage: message };
          }
          return room;
        }));
        const currentUser = userRef.current;
        // 桌面通知 - 仅在页面隐藏、消息发送者不是自己、且启用通知时弹出
        if (typeof Notification !== 'undefined' && h.notifyEnabled && !h.notifyMuted && message.sender?.id !== currentUser?.id && document.hidden) {
          try {
            new Notification(message.sender?.username || '新消息', {
              body: (message.content || `[${message.type}]`).substring(0, 100),
              icon: message.sender?.avatar || undefined,
              tag: message.roomId
            });
          } catch {}
        }
      });

      socketRef.current.on('joinedRoom', (data) => {
        h.setMessages(data.messages || []);
        h.setMessagesLoading(false);
      });

      socketRef.current.on('userTyping', ({ username }) => {
        h.setTypingUser(username);
      });

      socketRef.current.on('userStopTyping', () => {
        h.setTypingUser(null);
      });

      socketRef.current.on('roomCreated', (room) => {
        h.setRooms(prev => {
          if (prev.find(r => r.id === room.id)) return prev;
          return [...prev, room];
        });
      });

      socketRef.current.on('groupCreated', (room) => {
        h.setCurrentRoom(room);
        h.setCurrentRoomId(room.id);
        h.setShowCreateModal(false);
      });

      socketRef.current.on('friendRequest', (data) => {
        h.setFriendRequests(prev => {
          if (prev.find(r => r.id === data.id)) return prev;
          return [...prev, data];
        });
      });

      socketRef.current.on('friendAccepted', (data) => {
        h.setFriends(prev => {
          if (prev.find(f => f.id === data.id)) return prev;
          return [...prev, { ...data, online: true }];
        });
      });

      socketRef.current.on('messageRecalled', ({ messageId, roomId }) => {
        h.setRecalledMessages(prev => new Set([...prev, messageId]));
        h.setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, recalled: true } : msg
        ));
        h.showToast('一条消息已被撤回', 'info');
      });

      // 消息被删除
      socketRef.current.on('messageDeleted', ({ messageId, roomId }) => {
        h.setMessages(prev => prev.filter(msg => msg.id !== messageId));
        h.showToast('一条消息已被删除', 'info');
      });

      // 删除错误
      socketRef.current.on('deleteError', ({ error }) => {
        h.showToast(error, 'error');
      });

      // 聊天被删除（自己退出或被移出房间）
      socketRef.current.on('chatDeleted', ({ roomId }) => {
        h.setRooms(prev => prev.filter(r => r.id !== roomId));
        if (h.currentRoomId === roomId) {
          h.setCurrentRoom(null);
          h.setCurrentRoomId(null);
          h.setMessages([]);
        }
        h.showToast('已删除聊天', 'info');
      });

      // 已读回执更新
      socketRef.current.on('messageReadUpdate', ({ messageId, userId, readBy }) => {
        h.setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, readBy } : msg
        ));
      });

      // @提及通知
      socketRef.current.on('mentionNotification', ({ messageId, roomId, roomName, sender }) => {
        h.showToast(`${sender} 在 ${roomName} 中提到了你`, 'info');
      });

      // 所有消息已读
      socketRef.current.on('allMessagesRead', ({ roomId, userId }) => {
        if (userId === socketRef.current.userId) return;
        h.setMessages(prev => prev.map(msg => ({
          ...msg,
          readBy: (msg.readBy || []).includes(userId) ? msg.readBy : [...(msg.readBy || []), userId]
        })));
      });

      // 消息编辑
      socketRef.current.on('messageEdited', ({ messageId, content, editedAt }) => {
        h.setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, content, edited: true, editedAt } : msg
        ));
      });

      // 消息转发
      socketRef.current.on('messageForwarded', (message) => {
        h.setMessages(prev => [...prev, message]);
        h.setRooms(prev => prev.map(room => {
          if (room.id === message.roomId) {
            return { ...room, lastMessage: message };
          }
          return room;
        }));
      });

      // 红包相关
      socketRef.current.on('redPacketClaimed', ({ packetId, userId, share }) => {
        h.setMessages(prev => prev.map(msg => {
          if (msg.id === packetId) {
            const newClaimed = [...(msg.claimed || []), userId];
            return { ...msg, claimed: newClaimed, remaining: msg.remaining - 1 };
          }
          return msg;
        }));
        if (userId === userRef.current?.id) {
          h.showToast(`抢到红包 ¥${share.toFixed(2)}！`, 'success');
        }
      });

      // 红包错误
      socketRef.current.on('redPacketError', ({ error }) => {
        h.showToast(error, 'error');
      });

      // 余额更新
      socketRef.current.on('balanceUpdated', ({ balance }) => {
        h.setBalance(balance);
      });

      // 投票更新
      socketRef.current.on('pollUpdated', ({ pollId, optionIndex, userId }) => {
        h.setMessages(prev => prev.map(msg => {
          if (msg.id === pollId) {
            const newOptions = [...msg.options];
            newOptions[optionIndex] = {
              ...newOptions[optionIndex],
              votes: [...(newOptions[optionIndex].votes || []), userId]
            };
            return { ...msg, options: newOptions };
          }
          return msg;
        }));
      });

      // 群公告
      socketRef.current.on('announcementUpdated', ({ roomId, announcement }) => {
        h.setRoomAnnouncements(prev => ({ ...prev, [roomId]: announcement }));
        h.setCurrentRoom(prev => prev?.id === roomId ? { ...prev, announcement } : prev);
        h.setRooms(prev => prev.map(r => r.id === roomId ? { ...r, announcement } : r));
        h.showToast('群公告已更新', 'info');
      });

      // 被踢出群
      socketRef.current.on('youWereKicked', ({ roomId, roomName }) => {
        h.showToast(`你已被移出群聊「${roomName}」`, 'error');
        if (h.currentRoomId === roomId) {
          h.setCurrentRoomId(null);
          h.setCurrentRoom(null);
          h.setMessages([]);
        }
      });

      socketRef.current.on('memberKicked', ({ roomId, username }) => {
        h.setCurrentRoom(prev => prev?.id === roomId ? { ...prev, members: (prev.members || []).filter(m => m !== username) } : prev);
        h.setRooms(prev => prev.map(r => r.id === roomId ? { ...r, members: (r.members || []).filter(m => m !== username) } : r));
        h.showToast(`${username} 已被移出群聊`, 'info');
      });

      socketRef.current.on('memberMuted', ({ roomId, username }) => {
        h.setCurrentRoom(prev => prev?.id === roomId ? { ...prev, mutedMembers: [...new Set([...(prev.mutedMembers || []), username])] } : prev);
        h.setRooms(prev => prev.map(r => r.id === roomId ? { ...r, mutedMembers: [...new Set([...(r.mutedMembers || []), username])] } : r));
      });

      socketRef.current.on('memberUnmuted', ({ roomId, username }) => {
        h.setCurrentRoom(prev => prev?.id === roomId ? { ...prev, mutedMembers: (prev.mutedMembers || []).filter(m => m !== username) } : prev);
        h.setRooms(prev => prev.map(r => r.id === roomId ? { ...r, mutedMembers: (r.mutedMembers || []).filter(m => m !== username) } : r));
      });

      // 朋友圈
      socketRef.current.on('newMoment', (moment) => {
        h.setMoments(prev => [moment, ...prev]);
      });

      socketRef.current.on('momentLiked', ({ momentId, userId }) => {
        h.setMoments(prev => prev.map(m => {
          if (m.id === momentId) {
            const likes = [...(m.likes || [])];
            if (!likes.includes(userId)) likes.push(userId);
            return { ...m, likes };
          }
          return m;
        }));
      });

      socketRef.current.on('momentComment', ({ momentId, comment }) => {
        h.setMoments(prev => prev.map(m => {
          if (m.id === momentId) {
            return { ...m, comments: [...(m.comments || []), comment] };
          }
          return m;
        }));
      });

      // 聊天导出
      socketRef.current.on('chatExport', ({ roomId, roomName, messages }) => {
        const data = JSON.stringify(messages, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${roomName}_chat_export.json`;
        a.click();
        URL.revokeObjectURL(url);
        h.showToast('聊天记录已导出', 'success');
        h.setExportingChat(false);
      });

      // 统计
      socketRef.current.on('statsResult', (stats) => {
        h.setMessageStats(stats);
      });

      // ===== 新功能 Socket 监听 =====
      // 消息反应更新
      socketRef.current.on('reactionUpdated', ({ messageId, reactions }) => {
        h.setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, reactions } : msg
        ));
      });

      // 群接龙更新
      socketRef.current.on('solitaireUpdated', ({ solitaireId, participants }) => {
        h.setMessages(prev => prev.map(msg =>
          msg.id === solitaireId ? { ...msg, participants } : msg
        ));
      });

      // 未读消息计数
      socketRef.current.on('unreadCounts', (counts) => {
        h.setUnreadCounts(counts);
      });

      // 接龙错误
      socketRef.current.on('solitaireError', ({ error }) => {
        h.showToast(error, 'error');
      });

      // ===== WebRTC 信令监听 =====
      socketRef.current.on('incomingCall', ({ from, roomId, signal, callType }) => {
        h.setCallState({ type: callType || 'video', status: 'incoming', signal, peerId: from.id, localStream: null, remoteStream: null, roomId, caller: from });
        h.showToast(`${from.username} 正在呼叫你...`, 'info');
      });
      socketRef.current.on('callAccepted', ({ from, signal }) => {
        console.log('[WebRTC:caller] 收到 callAccepted, from:', from, 'signal?', !!signal);
        try {
          if (h.peerRef?.current && h.peerRef.current.signalingState !== 'closed') {
            h.peerRef.current.setRemoteDescription(new RTCSessionDescription(signal))
              .then(() => {
                console.log('[WebRTC:caller] setRemoteDescription 成功, signalingState:', h.peerRef.current?.signalingState, 'remoteDescription?', !!h.peerRef.current?.remoteDescription);
                h.flushPendingCandidates?.();
              })
              .catch((err) => {
                console.error('[WebRTC:caller] setRemoteDescription 失败:', err);
              });
            h.setCallState(prev => prev ? { ...prev, status: 'connecting' } : null);
          } else {
            console.warn('[WebRTC:caller] 收到 callAccepted 但 peerRef 不可用, signalingState:', h.peerRef?.current?.signalingState);
          }
        } catch(e) {
          console.error('[WebRTC:caller] callAccepted 处理异常:', e);
        }
      });
      socketRef.current.on('iceCandidate', ({ from, candidate }) => {
        try {
          if (!candidate) return;
          if (h.peerRef?.current && h.peerRef.current.signalingState !== 'closed' && h.peerRef.current.remoteDescription) {
            h.peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else if (h.pendingCandidatesRef?.current) {
            // peerRef 未建好或 remoteDescription 未设置，缓存起来等 flush
            h.pendingCandidatesRef.current.push(candidate);
          }
        } catch(e) {}
      });
      socketRef.current.on('callEnded', () => {
        h.setCallState(prev => {
          if (!prev) return null;
          if (prev.localStream) {
            try { prev.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
          }
          return null;
        });
        try { if (h.peerRef?.current) { h.peerRef.current.close(); h.peerRef.current = null; } } catch(e) {}
        h.showToast('通话已结束', 'info');
      });

      // ===== 位置 + 打卡监听 =====
      socketRef.current.on('locationUpdate', ({ userId, username, lat, lng }) => {
        h.setSharedLocations(prev => ({ ...prev, [userId]: { lat, lng, username } }));
      });
      socketRef.current.on('locationStopped', ({ userId }) => {
        h.setSharedLocations(prev => { const n = { ...prev }; delete n[userId]; return n; });
      });
      socketRef.current.on('locationsList', (locations) => {
        const map = {}; locations.forEach(l => { map[l.userId] = l; });
        h.setSharedLocations(map);
      });
      socketRef.current.on('checkInUpdate', ({ entry, total }) => {
        h.showToast(`${entry.username} 打卡成功！今日 ${total} 人已打卡`, 'success');
      });
      socketRef.current.on('checkInList', (data) => {
        h.setCheckInData(data);
      });
      socketRef.current.on('checkInError', ({ error }) => { h.showToast(error, 'error'); });

      // 实时翻译消息
      socketRef.current.on('translatedMessage', ({ messageId, translated, targetLang, sender }) => {
        h.setTranslatedMessages(prev => ({ ...prev, [messageId]: { translated, targetLang, sender } }));
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('reactionUpdated');
        socketRef.current.off('solitaireUpdated');
        socketRef.current.off('unreadCounts');
        socketRef.current.off('solitaireError');
        socketRef.current.off('incomingCall');
        socketRef.current.off('callAccepted');
        socketRef.current.off('iceCandidate');
        socketRef.current.off('callEnded');
        socketRef.current.off('locationUpdate');
        socketRef.current.off('locationStopped');
        socketRef.current.off('locationsList');
        socketRef.current.off('checkInUpdate');
        socketRef.current.off('checkInList');
        socketRef.current.off('checkInError');
        socketRef.current.off('translatedMessage');
        socketRef.current.disconnect();
      }
    };
    // eslint-disable-next-line
  }, [isAuthenticated, user, token]);

  return { socketRef, onlineUsers };
}
