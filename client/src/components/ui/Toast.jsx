import React from 'react';
import { I } from '../Icon';

export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      {toast.type === 'success' && <I name="checkin" size={14} />}
      {toast.type === 'error' && <I name="close" size={14} />}
      {toast.type === 'info' && <I name="info" size={14} />}
      <span>{toast.message}</span>
    </div>
  );
}
