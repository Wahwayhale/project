import React from 'react';
import { I } from '../Icon';
import { MAJOR_VERSION } from '../../utils/constants';

const TYPE_META = {
  new: { label: '新功能', color: '#07c160' },
  fix: { label: '修复', color: '#fa9d3b' },
  improve: { label: '优化', color: '#576b95' }
};

// 兼容：字符串 notes → improve 分组；对象 notes → 按 type 分组
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

export default function MajorUpdateModal({ showMajorUpdateModal, otaInfo, setShowMajorUpdateModal, appVersion, onMarkSeen }) {
  if (!showMajorUpdateModal || !otaInfo) return null;

  const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
  const updateId = String(otaInfo.updateId || otaInfo.updateKey || major);
  const groups = groupNotes(otaInfo.updateNotes || otaInfo.notes);
  const hasGrouped = ['new', 'fix', 'improve'].some(k => groups[k].length > 0);
  const markSeen = () => {
    localStorage.setItem(`seenMajorUpdate:${updateId}`, updateId);
    if (typeof onMarkSeen === 'function') onMarkSeen(otaInfo);
    setShowMajorUpdateModal(false);
  };
  const versionText = `v${otaInfo.appVersion || appVersion}${otaInfo.webBuild ? ` · Web ${otaInfo.webBuild}` : ''}`;
  // 版本对比：Web prev → cur
  const prevText = otaInfo.prevWebBuild != null ? `Web ${otaInfo.prevWebBuild} → ${otaInfo.webBuild}` : '';

  return (
    <div className="modal-overlay" onClick={markSeen}>
      <div className="modal major-update-modal" onClick={e => e.stopPropagation()}>
        <div className="major-update-icon"><I name="sparkles" size={34} /></div>
        <h3>{otaInfo.updateTitle || '聊天室更新啦'}</h3>
        <p className="major-update-version">
          {versionText}
          {prevText && <span className="major-update-range">（{prevText}）</span>}
        </p>
        <div className="major-update-list">
          {hasGrouped ? (
            <>
              {['new', 'fix', 'improve'].filter(k => groups[k].length > 0).map(k => (
                <div key={k} className="major-update-group">
                  <div className="major-update-group-title" style={{ color: TYPE_META[k].color }}>
                    <span className="major-update-group-dot" style={{ background: TYPE_META[k].color }} />
                    {TYPE_META[k].label}
                  </div>
                  {groups[k].map((text, i) => (
                    <div key={i} className="major-update-item">
                      <I name="checkin" size={15} />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : (
            [otaInfo.notes || '体验细节已更新。'].map((note, i) => (
              <div key={i} className="major-update-item">
                <I name="checkin" size={15} />
                <span>{note}</span>
              </div>
            ))
          )}
        </div>
        <button className="confirm" onClick={markSeen}>
          知道了
        </button>
      </div>
    </div>
  );
}
