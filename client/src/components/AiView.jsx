import React, { useState } from 'react';
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

  documentStatus,
  documentName,
  documentMeta,
  documentInputRef,
  uploadDocument,
  clearDocumentContext,
  setShowRechargeModal,
  fetchRechargeHistory,
  resetAiChat,
  openAdminCenter,
}) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadDocument(files[0]);
    }
  };

  return (
    /* ===== AI助手全屏视图 ===== */
    <div
      className={`ai-fullview ${isDraggingFile ? 'dragging-file' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
          <EmptyState icon="ai" title="向 AI 助手提问吧" desc="支持多轮对话，支持上传 PDF/Word/Markdown/代码 等文档智能解析" />
        )}
        {aiMessages.map((msg, idx) => (
          <div key={idx} className={`ai-message ${msg.role}`}>
            <div className="ai-avatar">
              {msg.role === 'user' ? (
                <AvatarImg src={getAvatarUrl(user?.avatar)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
              ) : (
                <I name="ai" size={18} />
              )}
            </div>
            <div className="ai-bubble">
              {msg.role === 'user' ? (
                <div>
                  {msg.documentRef && (
                    <div className="ai-msg-doc-badge">
                      <I name="file-text" size={12} />
                      <span>已参考文档: {msg.documentRef.name}</span>
                    </div>
                  )}
                  <div>{msg.content}</div>
                </div>
              ) : (
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

      {/* 文档解析就绪卡片与快捷操作栏 */}
      {documentStatus === 'done' && (
        <div className="ai-doc-ready-card">
          <div className="ai-doc-ready-header">
            <div className="ai-doc-ready-left">
              <span className="ai-doc-ready-icon"><I name="file-text" size={16} /></span>
              <div className="ai-doc-ready-info">
                <span className="ai-doc-ready-name">{documentName}</span>
                <span className="ai-doc-ready-meta">
                  已解析 {documentMeta?.charCount ? `${(documentMeta.charCount / 1000).toFixed(1)}k 字符` : '就绪'} · 一次性作为上下文提供给 AI
                </span>
              </div>
            </div>
            <button className="ai-doc-ready-close" onClick={clearDocumentContext} title="移除文档">
              <I name="close" size={14} />
            </button>
          </div>
          <div className="ai-doc-quick-prompts">
            <button
              type="button"
              className="ai-doc-prompt-btn"
              disabled={aiLoading}
              onClick={() => sendAiMessage('请全面总结这份文档的核心内容，提炼出主要论点、结论与结构。')}
            >
              📑 核心摘要总结
            </button>
            <button
              type="button"
              className="ai-doc-prompt-btn"
              disabled={aiLoading}
              onClick={() => sendAiMessage('请从这份文档中提炼出关键要点、重要数据与核心观点。')}
            >
              🔍 提炼关键要点
            </button>
            <button
              type="button"
              className="ai-doc-prompt-btn"
              disabled={aiLoading}
              onClick={() => sendAiMessage('请梳理这份文档中涉及的全部行动项、任务待办以及责任分工。')}
            >
              💡 提取待办行动项
            </button>
          </div>
        </div>
      )}

      <div className="ai-input-area">
        <div className="ai-doc-upload-bar">
          <input
            ref={documentInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.markdown,.json,.csv,.log,.rtf,.yaml,.yml,.xml,.html,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.sql,.sh"
            className="ai-doc-file-input"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) uploadDocument(f);
              e.target.value = '';
            }}
          />
          <button
            className="ai-doc-btn"
            onClick={() => documentInputRef && documentInputRef.current && documentInputRef.current.click()}
            disabled={aiLoading || documentStatus === 'uploading' || documentStatus === 'parsing'}
            title="上传 PDF/Word/Markdown/代码/文本 文件作为 AI 分析上下文"
          >
            <I name="file-text" size={18} />
          </button>
          {documentStatus !== 'idle' && (
            <div className={`ai-doc-status ai-doc-status--${documentStatus}`}>
              {documentStatus === 'uploading' && (<><I name="file-text" size={13} /> 上传中…</>)}
              {documentStatus === 'parsing' && (<><I name="file-text" size={13} /> 正在智能解析文本…</>)}
              {documentStatus === 'done' && (<><I name="check" size={13} /> {documentName}</>)}
              {documentStatus === 'error' && (<><I name="delete" size={13} /> 解析失败</>)}
            </div>
          )}
          {documentStatus === 'done' && (
            <button className="ai-doc-clear" onClick={clearDocumentContext} title="清除文档上下文">
              <I name="close" size={13} />
            </button>
          )}
        </div>
        <textarea
          className="ai-input"
          placeholder={documentStatus === 'done' ? `已加载《${documentName}》，输入关于此文档的问题，Enter 发送...` : '输入问题，Enter发送，Shift+Enter换行（支持拖拽/点击上传文档）'}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={handleAiKeyPress}
          disabled={aiLoading}
          rows={2}
        />
        <button className="ai-send-button" onClick={() => sendAiMessage()} disabled={!aiInput.trim() || aiLoading}>
          {aiLoading ? '思考中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
