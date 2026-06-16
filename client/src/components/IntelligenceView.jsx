import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icon';
import { API_URL } from '../utils/constants';

const CATEGORIES = [
  { key: 'hot', label: '热搜', icon: 'fire' },
  { key: 'tech', label: '科技', icon: 'smart' },
  { key: 'finance', label: '财经', icon: 'wallet' },
  { key: 'world', label: '国际', icon: 'globe' },
  { key: 'science', label: '科学', icon: 'sparkles' },
  { key: 'sports', label: '体育', icon: 'game' },
  { key: 'entertainment', label: '娱乐', icon: 'music' },
];

export default function IntelligenceView({ showToast, onBack }) {
  const [interests, setInterests] = useState(['hot']);
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [digest, setDigest] = useState('');
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/ai/intelligence/interests`, {
      headers: { Authorization: localStorage.getItem('token') }
    }).then(r => r.json()).then(d => {
      if (d.interests) setInterests(d.interests);
      if (d.keywords) setKeywords(d.keywords);
      setConfigLoading(false);
    }).catch(() => setConfigLoading(false));
  }, []);

  const saveInterests = async (newInterests, newKeywords) => {
    try {
      await fetch(`${API_URL}/api/ai/intelligence/interests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ interests: newInterests, keywords: newKeywords || keywords })
      });
    } catch { showToast('保存失败', 'error'); }
  };

  const toggleInterest = (key) => {
    const next = interests.includes(key) ? interests.filter(i => i !== key) : [...interests, key];
    setInterests(next);
    saveInterests(next);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw || keywords.includes(kw)) return;
    const next = [...keywords, kw];
    setKeywords(next);
    setKeywordInput('');
    saveInterests(interests, next);
  };

  const removeKeyword = (kw) => {
    const next = keywords.filter(k => k !== kw);
    setKeywords(next);
    saveInterests(interests, next);
  };

  const fetchDigest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/intelligence/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }
      });
      const data = await res.json();
      if (data.digest) {
        setDigest(data.digest);
        setStories(data.stories || []);
        setFetchedAt(data.fetchedAt);
        showToast('情报已更新', 'success');
      } else {
        showToast(data.error || '获取失败', 'error');
      }
    } catch { showToast('获取失败', 'error'); }
    setLoading(false);
  }, [showToast]);

  if (configLoading) return <div className="discover-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="loading-spinner" /></div></div>;

  return (
    <div className="discover-page">
      <div className="discover-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" onClick={onBack} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
        <h2>AI 情报站</h2>
      </div>
      <div className="discover-list" style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 4, color: 'var(--primary)' }}><I name="news" size={40} /></div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>AI 筛选最值得关注的信息</p>
          </div>

          <button onClick={() => setShowConfig(!showConfig)} style={{ width: '100%', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>兴趣配置 ({interests.length} 个领域)</span>
            <I name={showConfig ? 'arrowLeft' : 'arrowRight'} size={16} />
          </button>

          {showConfig && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>关注领域</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {CATEGORIES.map(c => (
                  <button key={c.key} onClick={() => toggleInterest(c.key)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${interests.includes(c.key) ? 'var(--primary)' : 'var(--border)'}`, background: interests.includes(c.key) ? 'var(--primary-bg, rgba(66,214,164,0.1))' : 'transparent', color: interests.includes(c.key) ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                    <I name={c.icon} size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {c.label}
                  </button>
                ))}
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>自定义关键词</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input type="text" value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKeyword()}
                  placeholder="添加关键词..."
                  style={{ flex: 1, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
                <button onClick={addKeyword} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>添加</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {keywords.map(kw => (
                  <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 12, background: 'var(--bg-hover)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {kw}
                    <span onClick={() => removeKeyword(kw)} style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={fetchDigest} disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--primary-gradient, var(--primary))', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginBottom: 16 }}>
            {loading ? 'AI 正在分析...' : '生成今日情报'}
          </button>

          {digest && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <I name="ai" size={16} /> AI 情报简报
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{digest}</div>
              {fetchedAt && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>更新于 {new Date(fetchedAt).toLocaleTimeString('zh-CN')}</div>}
            </div>
          )}

          {stories.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border-light)' }}>相关新闻</div>
              {stories.map((story, i) => (
                <a key={story.id || i} href={story.url ? `https://news.zhihu.com/p/${story.id}` : '#'} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-light)', textDecoration: 'none', color: 'var(--text)', fontSize: 13, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)', fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{story.source || story.category}</span>
                  <span style={{ flex: 1 }}>{story.title}</span>
                  {story.heat && <span style={{ fontSize: 10, color: 'var(--danger)', whiteSpace: 'nowrap' }}>{story.heat}</span>}
                  {story.image && <img src={story.image} alt="" style={{ width: 48, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
