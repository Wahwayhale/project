import React from 'react';
import { I } from '../Icon';

export default function MeMenuItem({ icon, tone, label, meta, onClick }) {
  return (
    <button className="me-menu-item" onClick={onClick}>
      <span className={`menu-icon menu-${tone}`}><I name={icon} size={18} /></span>
      <span>{label}</span>
      {meta ? <span className="menu-badge">{meta}</span> : <I name="arrowRight" size={17} className="menu-arrow" />}
    </button>
  );
}
