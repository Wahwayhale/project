import React, { useState } from 'react';
import { getAvatarUrl } from '../utils/avatar';
import { isCapacitor, API_URL, WEB_BUILD } from '../utils/constants';
import AvatarImg from './ui/AvatarImg';
import MeMenuItem from './ui/MeMenuItem';
import StatusModal from './modals/StatusModal';
import FavoritesModal from './modals/FavoritesModal';
import { I } from './Icon';

export default function MeView({
  user,
  setShowProfileModal,
  balance,
  setShowMoments,
  setShowRechargeModal,
  fetchRechargeHistory,
  setShowTransferModal,
  fetchTransferHistory,
  setShowBackupModal,
  phoneInfo,
  fetchPhoneInfo,
  setShowPhoneModal,
  setShowChangelogModal,
  otaInfo,
  appVersion,
  socketRef,
  setUser,
  showToast,
}) {
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);

  const handleSaveStatus = (statusData) => {
    if (socketRef?.current) {
      socketRef.current.emit('setUserStatus', statusData);
    }
    if (setUser) {
      setUser((prev) => (prev ? { ...prev, status: statusData } : prev));
    }
  };

  return (
    <div className="me-page">
      {/* 顶部沉浸式个人数字名片 */}
      <div className="me-hero-card">
        <div className="me-hero-bg" />
        <div className="me-hero-content" onClick={() => setShowProfileModal(true)}>
          <div className="me-avatar-wrap">
            <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" className="me-avatar" />
            <span className="me-online-dot" />
          </div>
          <div className="me-info">
            <div className="me-name-row">
              <h2 className="me-name">{user?.username || '用户'}</h2>
              <span className="me-id-badge">ID: {user?.sixDigitId || '000000'}</span>
              <span
                className="user-status-capsule"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusModal(true);
                }}
                title="设置我的今日状态"
              >
                <span>{user?.status?.icon || '✨'}</span>
                <span>{user?.status?.text || '+ 状态'}</span>
              </span>
            </div>
            <p className="me-bio">{user?.bio || '这个人很低调，暂未填写个性签名'}</p>
          </div>
          <button type="button" className="me-edit-btn" title="编辑个人资料" onClick={(e) => { e.stopPropagation(); setShowProfileModal(true); }}>
            <I name="settings" size={14} />
            <span>编辑</span>
          </button>
        </div>

        {/* 核心资产与权益看板行 */}
        <div className="me-asset-bar">
          <div className="me-asset-item" onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }}>
            <div className="me-asset-label"><I name="wallet" size={13} /> <span>余额</span></div>
            <div className="me-asset-val">¥{(balance || 0).toFixed(2)}</div>
            <div className="me-asset-action">充值 ›</div>
          </div>
          <div className="me-asset-divider" />
          <div className="me-asset-item" onClick={() => { setShowTransferModal(true); fetchTransferHistory(); }}>
            <div className="me-asset-label"><I name="transfer" size={13} /> <span>转账</span></div>
            <div className="me-asset-val">安全即时</div>
            <div className="me-asset-action">转账 ›</div>
          </div>
          <div className="me-asset-divider" />
          <div className="me-asset-item" onClick={() => { fetchPhoneInfo(); setShowPhoneModal(true); }}>
            <div className="me-asset-label"><I name="phone" size={13} /> <span>密保手机</span></div>
            <div className="me-asset-val">{phoneInfo?.phoneBound ? (phoneInfo.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')) : '未绑定'}</div>
            <div className="me-asset-action">{phoneInfo?.phoneBound ? '管理 ›' : '去绑定 ›'}</div>
          </div>
        </div>
      </div>

      {/* 分组设置与功能卡片 */}
      <div className="me-sections">
        <div className="me-group-title">社交与数据</div>
        <div className="me-menu me-group-card">
          <MeMenuItem icon="star" tone="primary" label="我的收藏与随手笔记" onClick={() => setShowFavoritesModal(true)} />
          <MeMenuItem icon="camera" tone="moments" label="朋友圈空间" onClick={() => { setShowMoments(true); }} />
          <MeMenuItem icon="backup" tone="backup" label="聊天记录云端备份与恢复" onClick={() => setShowBackupModal(true)} />
        </div>

        <div className="me-group-title">系统与关于</div>
        <div className="me-menu me-group-card">
          <MeMenuItem icon="sparkles" tone="primary" label="历史版本公告与更新动态" onClick={() => setShowChangelogModal(true)} />
          <MeMenuItem icon="download" tone="download" label={`下载最新客户端 (v${otaInfo?.appVersion || appVersion})`} onClick={() => {
            const apkPath = otaInfo?.apkUrl || `/releases/ChatRoom-v${appVersion}.apk`;
            const u = apkPath.startsWith('http') ? apkPath : `${API_URL}${apkPath}`;
            isCapacitor ? window.location.href = u : window.open(u, '_blank');
          }} />
          <MeMenuItem icon="settings" tone="primary" label="偏好设置与安全管理" onClick={() => { setShowProfileModal(true); }} />
        </div>
      </div>

      <div className="me-version">
        <span className="me-version-tag">画书 · 极简光感体验</span>
        <span className="me-version-text">v{otaInfo?.appVersion || appVersion} (Web Build {otaInfo?.webBuild || WEB_BUILD})</span>
      </div>

      <StatusModal
        show={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        currentStatus={user?.status}
        onSaveStatus={handleSaveStatus}
      />

      <FavoritesModal
        show={showFavoritesModal}
        onClose={() => setShowFavoritesModal(false)}
        showToast={showToast}
      />
    </div>
  );
}

