import { useState } from 'react';

/**
 * useRooms — 聊天室列表管理
 *
 * @param {object}   params
 * @param {object}   params.socketRef          — Socket.io 连接 ref
 * @param {object}   params.user               — 当前登录用户
 * @param {object}   params.friendsRef         — 好友列表 ref（来自 useFriends，用 ref 打破循环依赖）
 * @param {function} params.setMessages         — setMessages setter
 * @param {function} params.setMessagesLoading  — setMessagesLoading setter
 * @param {function} params.showToast           — Toast 提示函数
 *
 * 返回房间列表、当前房间、未读计数等状态及其 setters，以及房间操作函数。
 */
export function useRooms({ socketRef, user, friendsRef, setMessages, setMessagesLoading, showToast, setView }) {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [fileTransferRoom, setFileTransferRoom] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  const handleRoomClick = (room) => {
    if (setView) setView(null);
    setCurrentRoom(room);
    setCurrentRoomId(room.id);
    setMessages([]);
    // 确保 joinRoom 一定发出
    const emitJoin = () => socketRef.current?.emit('joinRoom', room.id);
    if (socketRef.current?.connected) {
      emitJoin();
    } else {
      // socket 未连接时，等重连后自动 join
      socketRef.current?.once('connect', emitJoin);
    }
  };

  const createGroup = () => {
    const groupName = prompt('请输入群聊名称：');
    if (!groupName || !groupName.trim()) return;
    const friends = friendsRef.current || [];
    const selectedFriends = friends.filter(f => window.confirm(`是否添加 ${f.username} 到群聊？`));
    socketRef.current.emit('createGroup', {
      name: groupName.trim(),
      members: selectedFriends.map(f => f.username)
    });
  };

  const deleteChat = (roomId, e) => {
    e?.stopPropagation();
    if (!window.confirm('确定要删除该聊天吗？\n\n删除后你将不再看到此聊天记录。')) return;
    socketRef.current.emit('deleteChat', { roomId });
  };

  const openFileTransfer = () => {
    // 创建一个特殊的"文件传输助手"房间
    const fileTransferRoom = {
      id: 'file_transfer',
      name: '文件传输助手',
      type: 'direct',
      isFileTransfer: true
    };
    setCurrentRoom(fileTransferRoom);
    setCurrentRoomId('file_transfer');
    setMessages([]);
    showToast('已打开文件传输助手', 'info');
  };

  return {
    rooms, setRooms,
    currentRoom, setCurrentRoom,
    currentRoomId, setCurrentRoomId,
    fileTransferRoom, setFileTransferRoom,
    typingUser, setTypingUser,
    unreadCounts, setUnreadCounts,
    handleRoomClick,
    createGroup,
    deleteChat,
    openFileTransfer,
  };
}
