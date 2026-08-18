import React from 'react';
import { getAvatarUrl } from '../utils/avatar';
import { isCapacitor, API_URL, WEB_BUILD } from '../utils/constants';
import AvatarImg from './ui/AvatarImg';
import MeMenuItem from './ui/MeMenuItem';

export default function MeView({
  user,
  setShowProfileModal,
  balance,
  setShowMoments,
  setShowRechargeModal,
  fetchRechargeHistory,
  setShowBackupModal,
  phoneInfo,
  fetchPhoneInfo,
  setShowPhoneModal,
  setShowChangelogModal,
  otaInfo,
  appVersion,
}) {
  return (
    <div className="me-page">
      <div className="me-header" onClick={() => setShowProfileModal(true)}>
        <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" className="me-avatar" />
        <div className="me-info">
          <div className="me-name">{user?.username}</div>
          <div className="me-id">ID: {user?.sixDigitId || '000000'}</div>
          <div className="me-bio">{user?.bio || '这个人很懒，什么都没写'}</div>
        </div>
        <span className="me-arrow">›</span>
      </div>
      <div className="me-menu">
        <MeMenuItem icon="camera" tone="moments" label="朋友圈" onClick={() => { setShowMoments(true); }} />
        <MeMenuItem icon="wallet" tone="wallet" label="钱包" meta={`¥${(balance || 0).toFixed(2)}`} onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }} />
        <MeMenuItem icon="backup" tone="backup" label="聊天记录管理" onClick={() => setShowBackupModal(true)} />
        <MeMenuItem icon="phone" tone="phone" label={phoneInfo.phoneBound ? phoneInfo.phone : '绑定手机号'} onClick={() => { fetchPhoneInfo(); setShowPhoneModal(true); }} />
        <MeMenuItem icon="sparkles" tone="primary" label="历史版本公告" onClick={() => setShowChangelogModal(true)} />
        <MeMenuItem icon="settings" tone="primary" label="设置" onClick={() => { setShowProfileModal(true); }} />
      </div>
      <div className="me-footer">
        <MeMenuItem icon="security" tone="security" label="聊天记录备份与恢复" onClick={() => setShowBackupModal(true)} />
      </div>
      <MeMenuItem icon="download" tone="download" label={`下载最新安装包 (v${otaInfo?.appVersion || appVersion})`} onClick={() => {
        const apkPath = otaInfo?.apkUrl || `/releases/ChatRoom-v${appVersion}.apk`;
        const u = apkPath.startsWith('http') ? apkPath : `${API_URL}${apkPath}`;
        isCapacitor ? window.location.href = u : window.open(u, '_blank');
      }} />
      <div className="me-version">
        <span>聊天室 v{otaInfo?.appVersion || appVersion} · Web {otaInfo?.webBuild || WEB_BUILD}</span>
      </div>
    </div>
  );
}
