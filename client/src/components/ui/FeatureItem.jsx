import React from 'react';
import { I } from '../Icon';

export default function FeatureItem({ icon, tone, title, desc, onClick, loading }) {
  return (
    <button className="feature-item" onClick={onClick}>
      <span className={`feature-icon feature-${tone}`}><I name={icon} size={20} /></span>
      <span className="feature-copy">
        <span className="feature-title">{title}</span>
        <span className="feature-desc">{loading || desc}</span>
      </span>
      <I name="arrowRight" size={17} className="feature-arrow" />
    </button>
  );
}
