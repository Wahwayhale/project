import React, { useState } from 'react';
import { I } from '../Icon';
import AvatarImg from '../ui/AvatarImg';
import { getAvatarUrl } from '../../utils/avatar';
import { formatTime } from '../../utils/format';
import { API_URL } from '../../utils/constants';

export default function MergedForwardModal({ show, onClose, forwardData, showToast }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  if (!show || !forwardData) return null;

  const { title, messages = [] } = forwardData;

  const handleAiSummary = async () => {
    if (aiLoading) return;
    setAiLoading(true);

    const chatContext = messages
      .map((m) => `[${m.sender?.username || '用户'}]: ${m.content || '[多媒体消息]'}`)
      .join('\n');

    const prompt = [
      {
        role: 'system',
        content: '你是专业的会话速读助理。请根据提供的合并转发聊天记录，提炼出【核心讨论议题】、【关键结论/共识】和【行动项/待办事项】，保持简明扼要，使用清晰的 Markdown 列表呈现。'
      },
      {
        role: 'user',
        content: `以下是聊天记录：\n${chatContext}`
      }
    ];

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token || ''
        },
        body: JSON.stringify({
          messages: prompt,
          model: 'glm-4-flash'
        })
      });
      const data = await res.json();
      setAiLoading(false);
      if (data && data.reply) {
        setAiSummary(data.reply);
      } else {
        showToast?.(data?.error || 'AI 总结生成失败，请重试', 'error');
      }
    } catch {
      setAiLoading(false);
      showToast?.('AI 总结服务异常', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal merged-forward-modal" onClick={(e) => e.stopPropagation()}>
        <div className="merged-forward-header">
          <div className="merged-forward-title-wrap">
            <h3><I name="chat" size={18} /> {title || '聊天记录'}</h3>
            <span className="merged-forward-count">共 {messages.length} 条记录</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            <I name="close" size={18} />
          </button>
        </div>

        {/* AI 速读悬浮栏 */}
        <div className="merged-ai-bar">
          <button
            type="button"
            className="merged-ai-btn"
            onClick={handleAiSummary}
            disabled={aiLoading}
          >
            <I name="ai" size={15} />
            <span>{aiLoading ? 'AI 正在提炼核心摘要...' : '✨ AI 一键提取重点与待办'}</span>
          </button>
        </div>

        {/* AI 提炼结果卡片 */}
        {aiSummary && (
          <div className="merged-ai-summary-card">
            <div className="merged-ai-summary-header">
              <span className="merged-ai-badge">AI 智能速读纪要</span>
              <button type="button" className="merged-ai-copy-btn" onClick={() => {
                navigator.clipboard.writeText(aiSummary);
                showToast?.('已复制 AI 纪要', 'success');
              }}>
                <I name="copy" size={13} />
                <span>复制</span>
              </button>
            </div>
            <div className="merged-ai-summary-content">
              {aiSummary}
            </div>
          </div>
        )}

        {/* 聊天记录列表 */}
        <div className="merged-forward-list">
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className="merged-msg-item">
              <AvatarImg src={getAvatarUrl(msg.sender?.avatar)} alt="" className="merged-msg-avatar" />
              <div className="merged-msg-body">
                <div className="merged-msg-info">
                  <span className="merged-msg-sender">{msg.sender?.username || '用户'}</span>
                  <span className="merged-msg-time">{msg.timestamp ? formatTime(msg.timestamp) : ''}</span>
                </div>
                <div className="merged-msg-content">
                  {msg.type === 'image' || msg.fileUrl && msg.mimeType?.startsWith('image/') ? (
                    <img src={msg.fileUrl} alt="图片" className="merged-msg-img" />
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-buttons">
          <button type="button" className="confirm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
