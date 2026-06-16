import React, { useState, useEffect, useRef, useCallback } from 'react';
import { I } from './Icon';
import { API_URL, SERVER_URL } from '../utils/constants';
import { generateKeyPair, importPublicKey, importPrivateKey, encryptMessage, decryptMessage } from '../utils/e2e';
import { formatTime } from '../utils/format';
import io from 'socket.io-client';

export default function EncryptedChat({ showToast, onBack, user }) {
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [keyReady, setKeyReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const socketRef = useRef(null);
  const keysRef = useRef({ myPublic: null, myPrivate: null, friendPublic: null });
  const msgEndRef = useRef(null);
  const chatIdRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/api/friends`, {
      headers: { Authorization: localStorage.getItem('token') }
    }).then(r => r.json()).then(d => {
      setFriends(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socketRef.current) {
      const wsUrl = SERVER_URL || window.location.origin;
      socketRef.current = io(wsUrl, { transports: ['websocket'], reconnection: true });
      socketRef.current.on('connect', () => {
        socketRef.current.emit('authenticate', localStorage.getItem('token'));
      });
    }
    return () => { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } };
  }, []);

  const initKeys = useCallback(async (friendName) => {
    setGenerating(true);
    try {
      const stored = localStorage.getItem(`e2e_keypair_${user.username}`);
      let myKeys;
      if (stored) {
        const parsed = JSON.parse(stored);
        myKeys = {
          publicKey: parsed.publicKey,
          rawPublic: await importPublicKey(parsed.publicKey),
          rawPrivate: await importPrivateKey(parsed.privateKeyBase64)
        };
      } else {
        const kp = await generateKeyPair();
        myKeys = { publicKey: kp.publicKey, rawPublic: kp.rawPublic, rawPrivate: kp.rawPrivate };
        localStorage.setItem(`e2e_keypair_${user.username}`, JSON.stringify({ publicKey: kp.publicKey, privateKeyBase64: kp.privateKeyBase64 }));
        await fetch(`${API_URL}/api/e2e/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
          body: JSON.stringify({ publicKey: kp.publicKey })
        });
      }
      keysRef.current.myPublic = myKeys.rawPublic;
      keysRef.current.myPrivate = myKeys.rawPrivate;

      const keyRes = await fetch(`${API_URL}/api/e2e/keys/${friendName}`, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        keysRef.current.friendPublic = await importPublicKey(keyData.publicKey);
        setKeyReady(true);
      } else {
        keysRef.current.friendPublic = null;
        setKeyReady(false);
        showToast(`${friendName} 尚未注册加密密钥`, 'info');
      }
    } catch (err) {
      showToast('密钥初始化失败', 'error');
    }
    setGenerating(false);
  }, [user, showToast]);

  const selectFriend = useCallback(async (friend) => {
    setSelectedFriend(friend);
    setMessages([]);
    setInput('');
    const cid = [user.username, friend.username].sort().join('_');
    chatIdRef.current = cid;

    await initKeys(friend.username);

    const res = await fetch(`${API_URL}/api/e2e/messages/${cid}`, {
      headers: { Authorization: localStorage.getItem('token') }
    }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data.messages && keysRef.current.myPrivate) {
        const decrypted = [];
        for (const msg of data.messages) {
          try {
            const text = await decryptMessage(msg.content, keysRef.current.myPrivate);
            decrypted.push({ ...msg, content: text, decrypted: true });
          } catch { decrypted.push({ ...msg, decrypted: false }); }
        }
        setMessages(decrypted);
      }
    }

    if (socketRef.current) {
      socketRef.current.off('e2eMessage');
      socketRef.current.on('e2eMessage', async (msg) => {
        if (msg.chatId === chatIdRef.current && keysRef.current.myPrivate) {
          try {
            const text = await decryptMessage(msg.content, keysRef.current.myPrivate);
            setMessages(prev => [...prev, { ...msg, content: text, decrypted: true }]);
          } catch { setMessages(prev => [...prev, { ...msg, decrypted: false }]); }
        }
      });
    }
  }, [user, initKeys]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedFriend || !keyReady) return;
    const text = input.trim();
    setInput('');

    try {
      const encrypted = await encryptMessage(text, keysRef.current.friendPublic);
      const cid = chatIdRef.current;
      await fetch(`${API_URL}/api/e2e/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ chatId: cid, content: encrypted, recipient: selectedFriend.username })
      });
      setMessages(prev => [...prev, { sender: user.username, content: text, timestamp: new Date(), decrypted: true }]);
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      showToast('发送失败: ' + err.message, 'error');
      setInput(text);
    }
  };

  if (loading) return <div className="discover-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="loading-spinner" /></div></div>;

  if (!selectedFriend) {
    return (
      <div className="discover-page">
        <div className="discover-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={onBack} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
          <h2>加密聊天</h2>
        </div>
        <div className="discover-list" style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: 16 }}>
            <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
              <div style={{ fontSize: 40, marginBottom: 4, color: 'var(--primary)' }}><I name="security" size={40} /></div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>端到端加密，只有你和对方能看到消息</p>
            </div>
            {friends.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>暂无好友</div>}
            {friends.map(f => (
              <div key={f.username} onClick={() => selectFriend(f)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', marginBottom: 4, transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 16 }}>
                  {f.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{f.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>点击发起加密对话</div>
                </div>
                <I name="arrowRight" size={16} color="var(--text-tertiary)" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div className="chat-header" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <button className="icon-btn" onClick={() => { setSelectedFriend(null); setMessages([]); }} style={{ padding: 8 }}>
          <I name="arrowLeft" size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{selectedFriend.username}</div>
          <div style={{ fontSize: 11, color: keyReady ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: keyReady ? 'var(--primary)' : 'var(--text-tertiary)' }} />
            {generating ? '正在初始化密钥...' : keyReady ? '端到端加密已就绪' : '等待对方注册密钥'}
          </div>
        </div>
        <I name="security" size={18} color="var(--primary)" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8, color: 'var(--primary)' }}><I name="security" size={32} /></div>
            发送加密消息，只有你和 {selectedFriend.username} 能看到内容
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.sender === user.username ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{ maxWidth: '75%', padding: '8px 14px', borderRadius: msg.sender === user.username ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.sender === user.username ? 'var(--primary)' : 'var(--bg-card)', color: msg.sender === user.username ? '#fff' : 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>
              {!msg.decrypted && <div style={{ fontSize: 10, color: 'var(--danger)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><I name="close" size={10} /> 无法解密</div>}
              {msg.content}
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}
        <div ref={msgEndRef} />
      </div>

      <div style={{ padding: '8px 16px 12px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={keyReady ? '输入加密消息...' : '等待密钥就绪...'}
          disabled={!keyReady}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
        <button onClick={sendMessage} disabled={!keyReady || !input.trim()}
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: keyReady && input.trim() ? 'var(--primary)' : 'var(--border)', color: '#fff', cursor: keyReady && input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I name="send" size={18} />
        </button>
      </div>
    </div>
  );
}
