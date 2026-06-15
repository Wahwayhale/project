import React from 'react';
import { I } from './Icon';
import AvatarImg from './ui/AvatarImg';
import EmptyState from './ui/EmptyState';
import { getAvatarUrl } from '../utils/avatar';

export default function AiView({
  user,
  balance,
  setView,
  setBottomTab,
  fetchDailyDigest,
  showToast,
  aiModel,
  setAiModel,
  aiModels,
  aiMessages,
  aiInput,
  setAiInput,
  aiLoading,
  handleAiKeyPress,
  sendAiMessage,
  renderMarkdown,
  aiMessagesEndRef,
  setShowRechargeModal,
  fetchRechargeHistory,
  resetAiChat,
  openAdminCenter,
}) {
  return (
    /* ===== AI助手全屏视图 ===== */
    <div className="ai-fullview">
      <div className="ai-fullview-header">
        <button className="back-btn" onClick={() => { setView('chats'); setBottomTab('discover'); }}>← 返回</button>
        <h3><I name="ai" size={20} /> AI 助手</h3>
        <div className="ai-header-actions">
          <span className="ai-balance">余额: ¥{(balance || 0).toFixed(2)}</span>
          <button onClick={() => { setShowRechargeModal(true); fetchRechargeHistory(); }} className="header-btn" title="充值"><I name="wallet" size={15} /></button>
          {user?.username === 'admin' && (
            <button onClick={openAdminCenter} className="header-btn" title="管理"><I name="crown" size={15} /></button>
          )}
          <button onClick={resetAiChat} className="header-btn" title="新对话"><I name="reset" size={15} /></button>
        </div>
      </div>
      <div className="ai-model-selector">
        <label>模型</label>
        <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
          {aiModels.map(m => (
            <option key={m.id} value={m.id}>{m.name} {m.free ? '免费' : '付费'}</option>
          ))}
        </select>
      </div>
      <div className="ai-messages">
        {aiMessages.length === 0 && (
          <EmptyState icon="ai" title="向 AI 助手提问吧" desc="支持多轮对话，连续上下文" />
        )}
        {aiMessages.map((msg, idx) => (
          <div key={idx} className={`ai-message ${msg.role}`}>
            <div className="ai-avatar">{msg.role === 'user' ? <AvatarImg src={getAvatarUrl(user.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} /> : <I name="ai" size={18} />}</div>
            <div className="ai-bubble">
              {msg.role === 'user' ? msg.content : (
                <>
                  <div className="ai-content">{renderMarkdown(msg.content)}</div>
                  {(msg.provider || msg.hint) && (
                    <div className="ai-meta-line">
                      {msg.provider && <span>{msg.provider} · {msg.model}</span>}
                      {msg.hint && <span>{msg.hint}</span>}
                    </div>
                  )}
                  {msg.rechargeUrl && (
                    <a href={msg.rechargeUrl} target="_blank" rel="noopener noreferrer" className="recharge-link">前往充值</a>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {aiLoading && (
          <div className="ai-message assistant">
            <div className="ai-avatar"><I name="ai" size={18} /></div>
            <div className="ai-bubble"><div className="ai-typing"><span></span><span></span><span></span></div></div>
          </div>
        )}
        <div ref={aiMessagesEndRef} />
      </div>
      <div className="ai-input-area">
        <textarea className="ai-input" placeholder="输入问题，Enter发送，Shift+Enter换行" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={handleAiKeyPress} disabled={aiLoading} rows={2} />
        <button className="ai-send-button" onClick={sendAiMessage} disabled={!aiInput.trim() || aiLoading}>{aiLoading ? '思考中...' : '发送'}</button>
      </div>
    </div>
  );
}
