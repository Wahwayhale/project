import React from 'react';
import { I } from '../Icon';

export default function EmptyState({ icon = 'chat', title, desc }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon-wrap">
        <div className="empty-state-icon"><I name={icon} size={40} /></div>
      </div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  );
}
