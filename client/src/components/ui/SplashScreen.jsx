import React from 'react';
import { I } from '../Icon';

export default function SplashScreen({ showSplash, appVersion }) {
  if (!showSplash) return null;
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-icon"><I name="chat" size={48} color="#fff" /></div>
        <h1 className="splash-title">聊天室</h1>
        <p className="splash-subtitle">v{appVersion}</p>
        <div className="splash-loader">
          <div className="splash-loader-bar"></div>
        </div>
      </div>
    </div>
  );
}
