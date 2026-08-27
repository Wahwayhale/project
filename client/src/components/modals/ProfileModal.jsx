import React from 'react';
import { I } from '../Icon';
import { getAvatarUrl } from '../../utils/avatar';
import AvatarImg from '../ui/AvatarImg';

export default function ProfileModal({ showProfileModal, setShowProfileModal, user, profileEdit, setProfileEdit, avatarInputRef, uploadAvatar, updateProfile }) {
  if (!showProfileModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
        <h3>个人资料</h3>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" style={{ width: 80, height: 80, borderRadius: '50%' }} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--primary-color)', color: 'white', cursor: 'pointer', fontSize: 16 }}
            >
              <I name="image" size={24} />
            </button>
            <input
              type="file"
              ref={avatarInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={(e) => {
                if (e.target.files[0]) {
                  uploadAvatar(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>我的ID</label>
          <div style={{ padding: '10px 12px', background: 'var(--bg-color)', borderRadius: 8, fontSize: 18, fontWeight: 'bold', textAlign: 'center', letterSpacing: 2 }}>
            {user?.sixDigitId}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>分享ID给好友，让他们搜索添加你</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>用户名</label>
          <div style={{ padding: '10px 12px', background: 'var(--bg-color)', borderRadius: 8 }}>{user?.username}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>个人签名</label>
          <textarea
            value={profileEdit.bio}
            onChange={(e) => setProfileEdit({ ...profileEdit, bio: e.target.value })}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit' }}
            rows={3}
            placeholder="编辑个人签名..."
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>微信收款码</label>
          <textarea
            value={profileEdit.payCode}
            onChange={(e) => setProfileEdit({ ...profileEdit, payCode: e.target.value })}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit' }}
            rows={2}
            placeholder="填写微信收款链接或收款码内容..."
          />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            在微信中生成收款码，复制链接或截图内容填入此处
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>朋友拍了拍我 +</label>
          <input
            type="text"
            value={profileEdit.patSuffix || ''}
            onChange={(e) => setProfileEdit({ ...profileEdit, patSuffix: e.target.value })}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-color)', fontFamily: 'inherit', marginTop: 4 }}
            placeholder="例如：的西瓜、并递过来一杯奶茶（默认：的肩膀）"
            maxLength={30}
          />
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowProfileModal(false)}>关闭</button>
          <button className="confirm" onClick={updateProfile}>保存</button>
        </div>
      </div>
    </div>
  );
}
