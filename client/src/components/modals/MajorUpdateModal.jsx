import React from 'react';
import { I } from '../Icon';
import { MAJOR_VERSION } from '../../utils/constants';

export default function MajorUpdateModal({ showMajorUpdateModal, otaInfo, setShowMajorUpdateModal, appVersion }) {
  if (!showMajorUpdateModal || !otaInfo) return null;

  const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
  const updateId = String(otaInfo.updateId || otaInfo.updateKey || major);
  const markSeen = () => {
    localStorage.setItem(`seenMajorUpdate:${updateId}`, updateId);
    setShowMajorUpdateModal(false);
  };
  const versionText = `v${otaInfo.appVersion || appVersion}${otaInfo.webBuild ? ` · Web ${otaInfo.webBuild}` : ''}`;

  return (
    <div className="modal-overlay" onClick={markSeen}>
      <div className="modal major-update-modal" onClick={e => e.stopPropagation()}>
        <div className="major-update-icon"><I name="sparkles" size={34} /></div>
        <h3>{otaInfo.updateTitle || '聊天室更新啦'}</h3>
        <p className="major-update-version">{versionText}</p>
        <div className="major-update-list">
          {(Array.isArray(otaInfo.updateNotes) ? otaInfo.updateNotes : [otaInfo.notes || '体验细节已更新。']).map((note, i) => (
            <div key={i} className="major-update-item">
              <I name="checkin" size={15} />
              <span>{note}</span>
            </div>
          ))}
        </div>
        <button className="confirm" onClick={markSeen}>
          知道了
        </button>
      </div>
    </div>
  );
}
