import React, { useState, useEffect } from 'react';
import { I } from './Icon';
import { API_URL } from '../utils/constants';

const PERSONALITIES = [
  { key: 'default', label: '自然随和', desc: '像日常聊天一样' },
  { key: 'formal', label: '正式得体', desc: '职场精英风格' },
  { key: 'humorous', label: '风趣幽默', desc: '喜欢开玩笑用梗' },
  { key: 'warm', label: '温暖体贴', desc: '关心他人，回复温暖' },
  { key: 'cool', label: '高冷简约', desc: '话少但精准' },
  { key: 'enthusiastic', label: '热情洋溢', desc: '充满正能量' },
];

export default function DigitalTwinView({ showToast, onBack }) {
  const [config, setConfig] = useState({ enabled: false, personality: 'default', styleAnalysis: null, sampleCount: 0 });
  const [analyzing, setAnalyzing] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [twinReply, setTwinReply] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/ai/twin/config`, {
      headers: { Authorization: localStorage.getItem('token') }
    }).then(r => r.json()).then(d => { setConfig(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggleTwin = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/twin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ enabled: !config.enabled })
      });
      const data = await res.json();
      setConfig(data);
      showToast(data.enabled ? '数字分身已启用' : '数字分身已关闭', 'success');
    } catch { showToast('操作失败', 'error'); }
  };

  const setPersonality = async (p) => {
    try {
      const res = await fetch(`${API_URL}/api/ai/twin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ personality: p })
      });
      const data = await res.json();
      setConfig(data);
      showToast('性格已切换', 'success');
    } catch { showToast('切换失败', 'error'); }
  };

  const analyzeStyle = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/twin/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }
      });
      const data = await res.json();
      if (data.analysis) {
        setConfig(prev => ({ ...prev, styleAnalysis: data.analysis, sampleCount: data.sampleCount }));
        showToast(`分析完成，基于 ${data.sampleCount} 条消息`, 'success');
      } else {
        showToast(data.message || '分析失败', 'error');
      }
    } catch { showToast('分析失败', 'error'); }
    setAnalyzing(false);
  };

  const testTwin = async () => {
    if (!testMessage.trim()) return;
    setTestLoading(true);
    setTwinReply('');
    try {
      const res = await fetch(`${API_URL}/api/ai/twin/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ triggerMessage: testMessage })
      });
      const data = await res.json();
      if (data.reply) {
        setTwinReply(data.reply);
        if (!config.enabled) {
          setConfig(prev => ({ ...prev, enabled: true }));
          showToast('分身已自动启用', 'success');
        }
      } else showToast(data.error || '测试失败', 'error');
    } catch { showToast('测试失败', 'error'); }
    setTestLoading(false);
  };

  if (loading) return <div className="discover-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="loading-spinner" /></div></div>;

  return (
    <div className="discover-page">
      <div className="discover-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" onClick={onBack} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
        <h2>AI 数字分身</h2>
      </div>
      <div className="discover-list" style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ padding: 16 }}>
          <div className="twin-hero" style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--bg-card)', borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 8, color: 'var(--primary)' }}><I name={config.enabled ? 'bot' : 'me'} size={48} /></div>
            <h3 style={{ margin: '0 0 4px', color: 'var(--text)' }}>你的数字分身</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>AI 学习你的说话风格，代替你回复消息</p>
          </div>

          <div className="twin-toggle-section" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>启用数字分身</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>开启后分身可代替你回复消息</div>
              </div>
              <div className={`toggle-switch ${config.enabled ? 'active' : ''}`} onClick={toggleTwin}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>

          <div className="twin-personality" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>选择分身性格</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PERSONALITIES.map(p => (
                <div key={p.key} onClick={() => setPersonality(p.key)}
                  style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${config.personality === p.key ? 'var(--primary)' : 'var(--border-light)'}`, background: config.personality === p.key ? 'var(--primary-bg, rgba(66,214,164,0.08))' : 'transparent', transition: 'all 0.2s' }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="twin-analyze" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>说话风格分析</div>
              <button className="twin-btn" onClick={analyzeStyle} disabled={analyzing}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: analyzing ? 'not-allowed' : 'pointer', opacity: analyzing ? 0.6 : 1 }}>
                {analyzing ? '分析中...' : '重新分析'}
              </button>
            </div>
            {config.styleAnalysis ? (
              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 8, color: 'var(--text)' }}><strong>风格：</strong>{config.styleAnalysis.style || '未知'}</div>
                <div style={{ marginBottom: 8, color: 'var(--text-secondary)' }}><strong>语气：</strong>{config.styleAnalysis.tone || '自然'}</div>
                {config.styleAnalysis.traits?.length > 0 && <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-secondary)' }}>特征：</strong>{config.styleAnalysis.traits.map((t, i) => <span key={i} className="twin-tag" style={{ display: 'inline-block', padding: '2px 8px', margin: '0 4px 4px 0', borderRadius: 4, background: 'var(--bg-hover)', fontSize: 11, color: 'var(--text-secondary)' }}>{t}</span>)}</div>}
                {config.styleAnalysis.catchphrases?.length > 0 && <div style={{ marginBottom: 4, color: 'var(--text-secondary)' }}><strong>口头禅：</strong>{config.styleAnalysis.catchphrases.join('、')}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>基于 {config.sampleCount || 0} 条消息分析</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>尚未分析。点击"重新分析"从你的聊天记录中提取说话风格。</div>
            )}
          </div>

          <div className="twin-test" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>测试分身回复</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>输入一条消息，看看分身会怎么回复</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={testMessage} onChange={e => setTestMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && testTwin()}
                placeholder="输入测试消息..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
              <button onClick={testTwin} disabled={testLoading || !config.enabled}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: config.enabled ? 'var(--primary)' : 'var(--border)', color: config.enabled ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: config.enabled && !testLoading ? 'pointer' : 'not-allowed' }}>
                {testLoading ? '...' : '测试'}
              </button>
            </div>
            {twinReply && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-hover)', fontSize: 13, color: 'var(--text)' }}>
                <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><I name="bot" size={12} /> 分身回复：</div>
                {twinReply}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
