import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../Icon';
import { API_URL } from '../../utils/constants';

const TYPE_META = {
  new: { label: '新功能', color: '#07c160' },
  fix: { label: '修复', color: '#fa9d3b' },
  improve: { label: '优化', color: '#576b95' }
};
const TAG_COLORS = { '新功能': '#07c160', '修复': '#fa9d3b', '优化': '#576b95' };

function groupNotes(notes) {
  const groups = { new: [], fix: [], improve: [] };
  (Array.isArray(notes) ? notes : []).forEach(n => {
    if (typeof n === 'string') groups.improve.push(n);
    else if (n && typeof n === 'object' && n.text) {
      const t = TYPE_META[n.type] ? n.type : 'improve';
      groups[t].push(n.text);
    }
  });
  return groups;
}

/**
 * ChangelogModal — 历史版本公告弹窗
 * 数据源：后端 /api/changelog（管理员在线发布），失败时回退静态 /changelog.json。
 */
export default function ChangelogModal({ show, onClose }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const fetchChangelog = async () => {
      setLoading(true);
      try {
        let data = null;
        try {
          const apiRes = await fetch(`${API_URL}/api/changelog`, { cache: 'no-cache' });
          if (apiRes.ok) data = await apiRes.json();
        } catch (e) { /* fallback */ }
        if (!data || !Array.isArray(data.releases)) {
          const res = await fetch(`${API_URL}/changelog.json`, { cache: 'no-cache' });
          if (!res.ok) throw new Error('fetch failed');
          data = await res.json();
        }
        if (!cancelled) setReleases(Array.isArray(data.releases) ? data.releases : []);
      } catch (e) {
        if (!cancelled) setReleases([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchChangelog();
    return () => { cancelled = true; };
  }, [show]);

  if (!show) return null;

  const overlay = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal changelog-modal" onClick={e => e.stopPropagation()}>
        <div className="changelog-header">
          <div className="changelog-title-row">
            <span className="changelog-icon"><I name="sparkles" size={22} /></span>
            <h3>历史版本公告</h3>
          </div>
          <button className="changelog-close" onClick={onClose} aria-label="关闭">
            <I name="close" size={20} />
          </button>
        </div>

        {loading ? (
          <div className="changelog-loading">加载中...</div>
        ) : releases.length === 0 ? (
          <div className="changelog-empty">暂无更新记录</div>
        ) : (
          <div className="changelog-list">
            {releases.map((rel, i) => {
              const groups = groupNotes(rel.notes);
              const hasGrouped = ['new', 'fix', 'improve'].some(k => groups[k].length > 0);
              const rangeText = rel.prevWebBuild != null && rel.prevWebBuild !== rel.webBuild
                ? `${rel.prevWebBuild} → ${rel.webBuild}`
                : '';
              return (
                <div key={`${rel.webBuild}-${i}`} className="changelog-item">
                  <div className="changelog-item-header">
                    <span className="changelog-item-title">{rel.title || '版本更新'}</span>
                    <span className="changelog-item-version">
                      v{rel.version}{rel.webBuild ? ` · Web ${rel.webBuild}` : ''}
                    </span>
                  </div>
                  {rel.date && <div className="changelog-item-date">
                    {rel.date}
                    {rangeText && <span className="changelog-item-range">（{rangeText}）</span>}
                  </div>}
                  {(Array.isArray(rel.tags) && rel.tags.length > 0) && (
                    <div className="changelog-item-tags">
                      {rel.tags.map((t, ti) => (
                        <span key={ti} className="changelog-tag" style={{ color: TAG_COLORS[t] || 'var(--text-secondary)', borderColor: (TAG_COLORS[t] || 'var(--border)') }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="changelog-item-notes">
                    {hasGrouped ? (
                      ['new', 'fix', 'improve'].filter(k => groups[k].length > 0).map(k => (
                        <div key={k} className="changelog-note-group">
                          <div className="changelog-note-group-title" style={{ color: TYPE_META[k].color }}>
                            <span className="changelog-note-group-dot" style={{ background: TYPE_META[k].color }} />
                            {TYPE_META[k].label}
                          </div>
                          {groups[k].map((text, j) => (
                            <div key={j} className="changelog-note">
                              <I name="checkin" size={14} />
                              <span>{text}</span>
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      (Array.isArray(rel.notes) ? rel.notes : []).map((note, j) => (
                        <div key={j} className="changelog-note">
                          <I name="checkin" size={14} />
                          <span>{note}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
