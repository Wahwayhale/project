import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../Icon';
import { API_URL } from '../../utils/constants';

/**
 * ChangelogModal — 历史版本公告弹窗
 * 从 /changelog.json 拉取所有历史版本列表，按时间倒序展示。
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
        const res = await fetch(`${API_URL}/changelog.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
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
            {releases.map((rel, i) => (
              <div key={`${rel.webBuild}-${i}`} className="changelog-item">
                <div className="changelog-item-header">
                  <span className="changelog-item-title">{rel.title || '版本更新'}</span>
                  <span className="changelog-item-version">
                    v{rel.version}{rel.webBuild ? ` · Web ${rel.webBuild}` : ''}
                  </span>
                </div>
                {rel.date && <div className="changelog-item-date">{rel.date}</div>}
                <div className="changelog-item-notes">
                  {(Array.isArray(rel.notes) ? rel.notes : []).map((note, j) => (
                    <div key={j} className="changelog-note">
                      <I name="checkin" size={14} />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
