import { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/constants';

export function useWallet({
  token,
  user,
  showToast,
  balance,
  setBalance,
  currentRoomId,
  socketRef,
  fetchAiStatus,
}) {
  // ===== 充值 =====
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargePayCode, setRechargePayCode] = useState(null);
  const [rechargeHistory, setRechargeHistory] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pendingRecharges, setPendingRecharges] = useState([]);
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [adminDashboardLoading, setAdminDashboardLoading] = useState(false);

  // ===== 红包 =====
  const [redPackets, setRedPackets] = useState({});
  const [showRedPacketModal, setShowRedPacketModal] = useState(false);
  const [redPacketAmount, setRedPacketAmount] = useState('');
  const [redPacketCount, setRedPacketCount] = useState('');
  const [redPacketMessage, setRedPacketMessage] = useState('恭喜发财，大吉大利');

  // ===== 用户间转账 =====
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferToUsername, setTransferToUsername] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferHistory, setTransferHistory] = useState([]);

  // 获取余额
  const fetchBalance = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/user/balance`, {
        headers: { Authorization: token }
      });
      setBalance(response.data.balance);
    } catch (err) {
      console.error('获取余额失败:', err);
    }
  };

  // 充值请求
  const requestRecharge = async () => {
    if (!rechargeAmount || parseFloat(rechargeAmount) < 1) {
      showToast('充值金额至少1元', 'error');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/recharge/request`,
        { amount: parseFloat(rechargeAmount) },
        { headers: { Authorization: token } }
      );
      setRechargePayCode(response.data);
      fetchRechargeHistory();
    } catch (err) {
      alert(err.response?.data?.error || '充值请求失败');
    }
  };

  // 获取充值记录
  const fetchRechargeHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/recharge/history`, {
        headers: { Authorization: token }
      });
      setRechargeHistory(response.data);
    } catch (err) {
      console.error('获取充值记录失败:', err);
    }
  };

  // 管理员：获取待确认充值
  const fetchPendingRecharges = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/recharges/pending`, {
        headers: { Authorization: token }
      });
      setPendingRecharges(response.data);
    } catch (err) {
      if (err.response?.status === 403) {
        showToast('需要管理员权限', 'error');
      } else {
        alert(err.response?.data?.error || '获取待确认充值失败');
      }
    }
  };

  // 管理员：确认充值
  const confirmRecharge = async (rechargeId) => {
    try {
      await axios.post(`${API_URL}/api/admin/recharge/confirm`,
        { rechargeId },
        { headers: { Authorization: token } }
      );
      fetchPendingRecharges();
      showToast('充值已确认', 'success');
    } catch (err) {
      alert(err.response?.data?.error || '确认失败');
    }
  };

  // 管理员：拒绝充值
  const rejectRecharge = async (rechargeId) => {
    try {
      await axios.post(`${API_URL}/api/admin/recharge/reject`,
        { rechargeId },
        { headers: { Authorization: token } }
      );
      fetchPendingRecharges();
      showToast('已拒绝', 'info');
    } catch (err) {
      alert(err.response?.data?.error || '拒绝失败');
    }
  };

  // 管理员概览
  const fetchAdminDashboard = async () => {
    if (user?.username !== 'admin') return;
    setAdminDashboardLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/dashboard`, {
        headers: { Authorization: token }
      });
      setAdminDashboard(response.data);
    } catch (err) {
      showToast(err.response?.data?.error || '管理概览获取失败', 'error');
    } finally {
      setAdminDashboardLoading(false);
    }
  };

  const openAdminCenter = () => {
    setShowAdminModal(true);
    fetchPendingRecharges();
    fetchAiStatus();
    fetchAdminDashboard();
  };

  // 生成红包随机分配
  const generateRedPacketDistribution = (totalAmount, totalCount) => {
    const distribution = [];
    let remaining = totalAmount;

    for (let i = 0; i < totalCount - 1; i++) {
      // 确保剩余每人至少0.01元
      const maxPossible = remaining - (totalCount - i - 1) * 0.01;
      const minPossible = 0.01;
      const amount = minPossible + Math.random() * (maxPossible - minPossible);
      distribution.push(parseFloat(amount.toFixed(2)));
      remaining -= amount;
    }

    // 最后一个红包拿剩余金额
    distribution.push(parseFloat(remaining.toFixed(2)));

    // 打乱顺序
    for (let i = distribution.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
    }

    return distribution;
  };

  // 发送红包
  const sendRedPacket = () => {
    if (!redPacketAmount || !redPacketCount || !currentRoomId) return;
    const amount = parseFloat(redPacketAmount);
    const count = parseInt(redPacketCount);

    // 检查余额
    if (balance < amount) {
      showToast(`余额不足，当前余额：¥${(balance || 0).toFixed(2)}，需要：¥${amount.toFixed(2)}`, 'error');
      return;
    }

    // 验证红包规则
    if (amount < 1) {
      showToast('红包金额最少为1元', 'error');
      return;
    }
    if (count < 1 || count > 100) {
      showToast('红包个数必须在1-100之间', 'error');
      return;
    }
    if (amount / count < 0.01) {
      showToast('每个红包金额不能低于0.01元', 'error');
      return;
    }

    // 生成随机分配
    const distribution = generateRedPacketDistribution(amount, count);

    socketRef.current.emit('sendRedPacket', {
      roomId: currentRoomId,
      amount,
      count,
      message: redPacketMessage,
      distribution
    });
    setShowRedPacketModal(false);
    setRedPacketAmount('');
    setRedPacketCount('');
    setRedPacketMessage('恭喜发财，大吉大利');
    showToast('红包已发送', 'success');
  };

  // 抢红包
  const claimRedPacket = (packetId) => {
    socketRef.current.emit('claimRedPacket', { roomId: currentRoomId, packetId });
  };

  // ===== 转账 =====
  const fetchTransferHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/transfer/history`, {
        headers: { Authorization: token }
      });
      setTransferHistory(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('获取转账记录失败:', err);
    }
  };

  const sendTransfer = async () => {
    if (!transferToUsername || !transferToUsername.trim()) {
      showToast('请输入收款人用户名', 'error');
      return;
    }
    const amountNum = parseFloat(transferAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast('请输入有效的转账金额', 'error');
      return;
    }
    if (Math.round(amountNum * 100) !== amountNum * 100) {
      showToast('转账金额最多两位小数', 'error');
      return;
    }
    try {
      const response = await axios.post(`${API_URL}/api/transfer`,
        { toUsername: transferToUsername.trim(), amount: amountNum, note: transferNote },
        { headers: { Authorization: token } }
      );
      setBalance(response.data.newBalance);
      showToast(`已转账 ¥${amountNum.toFixed(2)} 给 ${transferToUsername.trim()}`, 'success');
      setShowTransferModal(false);
      setTransferToUsername('');
      setTransferAmount('');
      setTransferNote('');
      fetchTransferHistory();
    } catch (err) {
      showToast(err.response?.data?.error || '转账失败', 'error');
    }
  };

  return {
    // Recharge
    showRechargeModal, setShowRechargeModal,
    rechargeAmount, setRechargeAmount,
    rechargePayCode, setRechargePayCode,
    rechargeHistory, setRechargeHistory,
    showAdminModal, setShowAdminModal,
    pendingRecharges, setPendingRecharges,
    adminDashboard, setAdminDashboard,
    adminDashboardLoading, setAdminDashboardLoading,
    // Red packets
    redPackets, setRedPackets,
    showRedPacketModal, setShowRedPacketModal,
    redPacketAmount, setRedPacketAmount,
    redPacketCount, setRedPacketCount,
    redPacketMessage, setRedPacketMessage,
    // Functions
    fetchBalance,
    requestRecharge,
    fetchRechargeHistory,
    fetchPendingRecharges,
    confirmRecharge,
    rejectRecharge,
    fetchAdminDashboard,
    openAdminCenter,
    sendRedPacket,
    generateRedPacketDistribution,
    claimRedPacket,
    // Transfer
    showTransferModal, setShowTransferModal,
    transferToUsername, setTransferToUsername,
    transferAmount, setTransferAmount,
    transferNote, setTransferNote,
    transferHistory, setTransferHistory,
    sendTransfer, fetchTransferHistory,
  };
}
