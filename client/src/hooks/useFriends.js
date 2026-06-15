import { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/constants';

/**
 * useFriends — 管理好友、好友请求、用户搜索等社交功能
 *
 * @param {object}   params
 * @param {object}   params.socketRef          — Socket.io ref
 * @param {object}   params.user               — 当前登录用户
 * @param {string}   params.token              — JWT
 * @param {function} params.showToast          — Toast 回调
 * @param {array}    params.rooms              — 聊天室列表
 * @param {function} params.setCurrentRoom     — 设置当前房间
 * @param {function} params.setCurrentRoomId   — 设置当前房间 ID
 * @param {function} params.setView            — 设置视图
 */
export function useFriends({ socketRef, user, token, showToast, rooms, setCurrentRoom, setCurrentRoomId, setView }) {
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const fetchFriends = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friends`, { headers: { Authorization: token } });
      const data = Array.isArray(response.data) ? response.data : [];
      setFriends(data);
    } catch (err) { console.error('Failed to fetch friends', err); setFriends([]); }
  };

  const fetchFriendRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/friend-requests`, {
        headers: { Authorization: token }
      });
      setFriendRequests(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch friend requests', err);
      setFriendRequests([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { Authorization: token }
      });
      setAllUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch users', err);
      setAllUsers([]);
    }
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try {
      // 支持 6位数字ID 或 用户名搜索
      const isNumericId = /^\d{6}$/.test(searchId.trim());
      let response;
      if (isNumericId) {
        response = await axios.get(`${API_URL}/api/users/search/${searchId.trim()}`, { headers: { Authorization: token } });
      } else {
        response = await axios.get(`${API_URL}/api/users/searchByName/${encodeURIComponent(searchId.trim())}`, { headers: { Authorization: token } });
      }
      setSearchResult(response.data);
    } catch (err) {
      setSearchResult(null);
      showToast('未找到该用户', 'error');
    }
  };

  const sendFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/request`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      showToast('好友请求已发送', 'success');
      setSearchResult(prev => prev ? { ...prev, requestSent: true } : null);
    } catch (err) {
      alert(err.response?.data?.error || '发送失败');
    }
  };

  const acceptFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/accept`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      setFriendRequests(prev => prev.filter(r => r.username !== targetUsername));
      fetchFriends();
    } catch (err) {
      alert(err.response?.data?.error || '操作失败');
    }
  };

  const rejectFriendRequest = async (targetUsername) => {
    try {
      await axios.post(`${API_URL}/api/friends/reject`, { username: targetUsername }, {
        headers: { Authorization: token }
      });
      setFriendRequests(prev => prev.filter(r => r.username !== targetUsername));
    } catch (err) {
      alert(err.response?.data?.error || '操作失败');
    }
  };

  const startChatWithFriend = (friend) => {
    const roomName = `chat_${[user.username, friend.username].sort().join('_')}`;
    const existingRoom = (rooms || []).find(r => r.name === roomName || (r.members && r.members.includes(user.username) && r.members.includes(friend.username)));
    if (existingRoom) {
      setCurrentRoom(existingRoom);
      setCurrentRoomId(existingRoom.id);
    } else {
      socketRef.current.emit('createGroup', {
        name: `${friend.username} & ${user.username}`,
        members: [friend.username]
      });
      setTimeout(() => {
        setCurrentRoomId(`chat_${[user.username, friend.username].sort().join('_')}`);
      }, 500);
    }
    setView('chats');
  };

  return {
    friends, setFriends,
    friendRequests, setFriendRequests,
    allUsers, setAllUsers,
    searchId, setSearchId,
    searchResult, setSearchResult,
    showSearchModal, setShowSearchModal,
    fetchFriends, fetchFriendRequests, fetchUsers,
    searchUser, sendFriendRequest,
    acceptFriendRequest, rejectFriendRequest,
    startChatWithFriend,
  };
}
