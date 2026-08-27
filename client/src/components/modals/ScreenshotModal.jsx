import React, { useRef } from 'react';
import { I } from '../Icon';
import AvatarImg from '../ui/AvatarImg';
import { getAvatarUrl } from '../../utils/avatar';
import { formatTime } from '../../utils/format';

export default function ScreenshotModal({ show, onClose, messages = [], roomName = '聊天记录', showToast }) {
  const cardRef = useRef(null);

  if (!show || messages.length === 0) return null;

  const handleCopyCardText = () => {
    const text = messages.map(m => `[${m.sender?.username || '用户'}] (${formatTime(m.timestamp)}):\n${m.content || '[多媒体]'}`).join('\n\n');
    navigator.clipboard.writeText(text);
    showToast?.('已复制长文本内容', 'success');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal screenshot-modal" onClick={(e) => e.stopPropagation()}>
        <div className="screenshot-modal-header">
          <h3><I name="camera" size={18} /> 生成分享长图</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            <I name="close" size={18} />
          </button>
        </div>

        {/* 预览长图卡片 */}
        <div className="screenshot-scroll-wrap">
          <div className="screenshot-card" ref={cardRef}>
            <div className="screenshot-card-header">
              <div className="screenshot-card-title">{roomName}</div>
              <div className="screenshot-card-subtitle">精选 {messages.length} 条对话 · 画书体验</div>
            </div>

            <div className="screenshot-card-messages">
              {messages.map((m, idx) => (
                <div key={m.id || idx} className="screenshot-msg-row">
                  <AvatarImg src={getAvatarUrl(m.sender?.avatar)} alt="" className="screenshot-msg-avatar" />
                  <div className="screenshot-msg-content-wrap">
                    <div className="screenshot-msg-user-row">
                      <span className="screenshot-msg-user">{m.sender?.username || '用户'}</span>
                      <span className="screenshot-msg-time">{formatTime(m.timestamp)}</span>
                    </div>
                    <div className="screenshot-msg-bubble">
                      {m.content || '[多媒体内容]'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="screenshot-card-footer">
              <span className="screenshot-watermark">画书 · 极简光感即时通讯</span>
              <span className="screenshot-date">{new Date().toLocaleDateString('zh-CN')}</span>
            </div>
          </div>
        </div>

        <div className="modal-buttons">
          <button type="button" className="cancel" onClick={handleCopyCardText}>
            <I name="copy" size={14} /> 复制文本
          </button>
          <button type="button" className="confirm" onClick={() => {
            window.print();
          }}>
            <I name="download" size={14} /> 打印 / 保存 PDF 长图
          </button>
        </div>
      </div>
    </div>
  );
}
