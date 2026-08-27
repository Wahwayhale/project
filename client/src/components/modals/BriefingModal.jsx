import React from 'react';
import { I } from '../Icon';
import { formatTime } from '../../utils/format';

export default function BriefingModal({ show, onClose, briefings = [], onClearBriefings, onOpenChat }) {
  if (!show || briefings.length === 0) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal briefing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="briefing-header">
          <div className="briefing-title-wrap">
            <div className="briefing-icon-badge">
              <I name="sparkles" size={18} color="white" />
            </div>
            <div>
              <h3>AI 离线代答与未读简报</h3>
              <p className="briefing-subtitle">在你离开期间，AI 助手已自动接待并记录了 {briefings.length} 位好友的消息</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            <I name="close" size={18} />
          </button>
        </div>

        <div className="briefing-list">
          {briefings.map((b, idx) => (
            <div key={b.id || idx} className="briefing-card">
              <div className="briefing-card-top">
                <div className="briefing-user">
                  <span className="briefing-user-name">{b.fromUser}</span>
                  <span className="briefing-time">{formatTime(b.timestamp)}</span>
                </div>
                <button
                  type="button"
                  className="briefing-chat-btn"
                  onClick={() => {
                    onClose();
                    onOpenChat?.(b.roomId, { username: b.fromUser });
                  }}
                >
                  <I name="chat" size={12} /> 进入会话
                </button>
              </div>
              <div className="briefing-row incoming">
                <span className="briefing-tag">好友原话</span>
                <span className="briefing-text">{b.incomingText}</span>
              </div>
              <div className="briefing-row replied">
                <span className="briefing-tag ai">AI 代答</span>
                <span className="briefing-text">{b.aiReplyText}</span>
              </div>
              {b.summary && (
                <div className="briefing-summary-box">
                  <I name="todo" size={12} /> 待办建议：{b.summary}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-buttons">
          <button
            type="button"
            className="cancel"
            onClick={() => {
              onClearBriefings?.();
              onClose();
            }}
          >
            全部标为已读
          </button>
          <button type="button" className="confirm" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
