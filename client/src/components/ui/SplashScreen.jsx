import React from 'react';

export default function SplashScreen({ showSplash, appVersion }) {
  if (!showSplash) return null;
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-logo">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="64" height="64" rx="18" fill="url(#splash-grad)" />
            <path d="M20 28c0-5.523 4.477-10 10-10h4c5.523 0 10 4.477 10 10v4c0 5.523-4.477 10-10 10h-1.5L30 48l-2.5-6H30c-5.523 0-10-4.477-10-10v-4z" fill="white" fillOpacity="0.95" />
            <circle cx="27" cy="32" r="2.5" fill="url(#splash-grad)" />
            <circle cx="34" cy="32" r="2.5" fill="url(#splash-grad)" />
            <defs>
              <linearGradient id="splash-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ffffff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="splash-title">聊天室</h1>
        <p className="splash-subtitle">v{appVersion}</p>
        <div className="splash-loader">
          <div className="splash-loader-bar"></div>
        </div>
      </div>
    </div>
  );
}
