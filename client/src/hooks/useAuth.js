import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { isCapacitor, API_URL } from '../utils/constants';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState(localStorage.getItem('savedUsername') || '');
  const [password, setPassword] = useState(localStorage.getItem('savedPassword') || '');
  const [error, setError] = useState('');

  // 诊断信息
  const [diag, setDiag] = useState('');

  // validateToken / handleAuth 需要设置余额和个人资料
  const [balance, setBalance] = useState(0);
  const [profileEdit, setProfileEdit] = useState({ bio: '', payCode: '' });

  const validateToken = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/profile`, {
        headers: { Authorization: token }
      });
      setUser(response.data);
      setProfileEdit({ bio: response.data.bio || '', payCode: response.data.payCode || '' });
      setIsAuthenticated(true);
      // 获取余额
      axios.get(`${API_URL}/api/user/balance`, { headers: { Authorization: token } })
        .then(res => setBalance(res.data.balance))
        .catch(() => {});
    } catch (err) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
    }
  }, [token]);

  // Token 变化时验证
  useEffect(() => {
    if (token) {
      validateToken();
    }
  }, [token]); // eslint-disable-line

  useEffect(() => {
    // APK 启动流程：1.重新登录 2.检测连接 3.加载数据
    const startup = async () => {
      if (isCapacitor) {
        const u = localStorage.getItem('savedUsername');
        const p = localStorage.getItem('savedPassword');
        if (u && p) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: u, password: p }, { timeout: 10000 });
            localStorage.setItem('token', res.data.token);
            setToken(res.data.token);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + '🔐 OK | ');
          } catch {
            localStorage.removeItem('token'); localStorage.removeItem('user');
            setToken(null); setUser(null);
            setDiag(d => d + '🔐 FAIL | ');
          }
        }
      }
      // 连接检测（不弹 toast，静默）
      if (isCapacitor) {
        try {
          await axios.get(`${API_URL}/api/ai/models`, { timeout: 5000 });
          setDiag(d => d + '✅ | ');
        } catch {
          setDiag(d => d + '❌ | ');
        }
      }
    };
    startup();

    // Token 验证 + 自动重新登录（Web 端）
    const checkAuth = async () => {
      if (!token) return;
      try {
        await axios.get(`${API_URL}/api/profile`, { headers: { Authorization: token } });
      } catch (err) {
        // Token 无效，尝试用保存的密码重新登录
        const savedUser = localStorage.getItem('savedUsername');
        const savedPass = localStorage.getItem('savedPassword');
        if (savedUser && savedPass) {
          try {
            const res = await axios.post(`${API_URL}/api/login`, { username: savedUser, password: savedPass });
            const newToken = res.data.token;
            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(res.data.user);
            setIsAuthenticated(true);
            setDiag(d => d + 'Auto-relogin OK | ');
            return; // 登录成功，不需要清除
          } catch (e2) {
            setDiag(d => d + 'Auto-relogin FAILED | ');
          }
        }
        // 无法恢复，清除
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
      }
    };
    checkAuth();
    // eslint-disable-next-line
  }, []);

  const handleAuth = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const response = await axios.post(`${API_URL}${endpoint}`, { username, password });
      const { token: newToken, user: userData } = response.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('savedUsername', username);
      localStorage.setItem('savedPassword', password);
      setToken(newToken);
      setUser(userData);
      setProfileEdit({ bio: userData.bio || '', payCode: userData.payCode || '' });
      setIsAuthenticated(true);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    }
  }, [authMode, username, password]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated, user, token, setUser, setToken,
    authMode, setAuthMode, username, setUsername,
    password, setPassword, error, setError,
    handleAuth, handleLogout, diag, setDiag,
    balance, setBalance,
    profileEdit, setProfileEdit,
  };
}
