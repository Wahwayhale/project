import React, { useState } from 'react';
import { I } from './Icon';
import AvatarImg from './ui/AvatarImg';
import { getAvatarUrl } from '../utils/avatar';
import { formatTime } from '../utils/format';

/**
 * ThreadsPanel — 群话题（Threads）面板
 *
 * 左侧话题列表（含新建），右侧当前话题的讨论流与回复输入框。
 */
export default function ThreadsPanel({
  show,
  setShow,
  user,
  threads,
  createThread,
  sendThreadMessage,
  showToast,
}) {
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [title, setTitle] = useState('');
  const [firstContent, setFirstContent] = useState('');
  const [replyText, setReplyText] = useState('');

  if (!show) return null;

  const currentThread = threads.find((t) => t.id === currentThreadId) || null;

  const handleCreate = () => {
    if (!title.trim()) {
      showToast('请输入话题标题', 'error');
      return;
    }
    createThread(title.trim(), firstContent.trim());
    setTitle('');
    setFirstContent('');
  };

  const handleSendReply = () => {
    if (!currentThread || !replyText.trim()) return;
    sendThreadMessage(currentThread.id, replyText.trim());
    setReplyText('');
  };

  const sortedThreads = [...threads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="modal-overlay" onClick={() => setShow(false)}>
      <div className="modal threads-panel" onClick={(e) => e.stopPropagation()}>
        <div className="threads-header">
          <h3><I name="chat" size={18} /> 群话题</h3>
          <button className="cancel" onClick={() => setShow(false)}>关闭</button>
        </div>
        <div className="threads-body">
          <div className="threads-list">
            <div className="threads-new">
              <input
                type="text"
                placeholder="新话题标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                placeholder="首条内容（可选）"
                value={firstContent}
                onChange={(e) => setFirstContent(e.target.value)}
                rows={2}
              />
              <button className="confirm" onClick={handleCreate}>创建话题</button>
            </div>
            {sortedThreads.length === 0 && (
              <div className="threads-empty">暂无话题，创建一个开始讨论吧</div>
            )}
            {sortedThreads.map((t) => (
              <div
                key={t.id}
                className={`thread-item ${currentThreadId === t.id ? 'active' : ''}`}
                onClick={() => setCurrentThreadId(t.id)}
              >
                <div className="thread-title">{t.title}</div>
                <div className="thread-meta">
                  {t.creator} · {t.messageCount ?? (t.messages || []).length} 条
                </div>
              </div>
            ))}
          </div>
          <div className="threads-detail">
            {currentThread ? (
              <>
                <div className="thread-detail-header">
                  <strong>{currentThread.title}</strong>
                  <span>{currentThread.creator} 创建于 {formatTime(currentThread.createdAt)}</span>
                </div>
                <div className="thread-messages">
                  {(currentThread.messages || []).map((m) => (
                    <div
                      key={m.id}
                      className={`message ${m.sender?.username === user?.username ? 'sent' : 'received'}`}
                    >
                      <AvatarImg className="avatar" src={getAvatarUrl(m.sender?.avatar)} alt="" />
                      <div className="message-content">
                        {m.sender?.username !== user?.username && (
                          <div className="sender-name">{m.sender?.username}</div>
                        )}
                        <div className="bubble">{m.content}</div>
                        <div className="message-footer">
                          <div className="time">{formatTime(m.timestamp)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="thread-reply">
                  <input
                    type="text"
                    placeholder="回复话题..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <button className="confirm" onClick={handleSendReply} disabled={!replyText.trim()}>
                    发送
                  </button>
                </div>
              </>
            ) : (
              <div className="threads-empty">选择一个话题查看讨论</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
