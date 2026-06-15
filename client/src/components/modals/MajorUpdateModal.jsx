import React from 'react';
import { I } from '../Icon';
import { MAJOR_VERSION } from '../../utils/constants';

export default function MajorUpdateModal({ showMajorUpdateModal, otaInfo, setShowMajorUpdateModal, appVersion }) {
  if (!showMajorUpdateModal || !otaInfo) return null;
  return (
    <div className="modal-overlay" onClick={() => {
      const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
      localStorage.setItem(`seenMajorUpdate:${major}`, major);
      setShowMajorUpdateModal(false);
    }}>
      <div className="modal major-update-modal" onClick={e => e.stopPropagation()}>
        <div className="major-update-icon"><I name="sparkles" size={34} /></div>
        <h3>{otaInfo.updateTitle || '聊天室更新啦'}</h3>
        <p className="major-update-version">v{otaInfo.appVersion || appVersion}</p>
        <div className="major-update-list">
          {(Array.isArray(otaInfo.updateNotes) ? otaInfo.updateNotes : [otaInfo.notes || '体验细节已更新。']).map((note, i) => (
            <div key={i} className="major-update-item">
              <I name="checkin" size={15} />
              <span>{note}</span>
            </div>
          ))}
        </div>
        <button className="confirm" onClick={() => {
          const major = String(otaInfo.majorVersion || (otaInfo.appVersion || '').split('.')[0] || MAJOR_VERSION);
          localStorage.setItem(`seenMajorUpdate:${major}`, major);
          setShowMajorUpdateModal(false);
        }}>
          知道了
        </button>
      </div>
    </div>
  );
}
