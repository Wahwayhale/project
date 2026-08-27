import React, { useState, useEffect } from 'react';
import { I } from '../Icon';
import { API_URL } from '../../utils/constants';
import { formatTime } from '../../utils/format';

export default function FavoritesModal({ show, onClose, showToast }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // all, note, message, media
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTag, setNoteTag] = useState('');

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/favorites`, {
        headers: { Authorization: token || '' }
      });
      const data = await res.json();
      if (data && data.favorites) {
        setFavorites(data.favorites);
      }
    } catch {
      showToast?.('获取收藏失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      fetchFavorites();
    }
  }, [show]);

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) {
      showToast?.('笔记内容不能为空', 'warning');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token || ''
        },
        body: JSON.stringify({
          type: 'note',
          title: noteTitle.trim() || '随手记',
          content: noteContent.trim(),
          tags: noteTag.trim() ? [noteTag.trim()] : ['笔记']
        })
      });
      const data = await res.json();
      if (data && data.success) {
        showToast?.('笔记已保存', 'success');
        setNoteTitle('');
        setNoteContent('');
        setNoteTag('');
        setShowCreateNote(false);
        fetchFavorites();
      } else {
        showToast?.(data?.error || '保存失败', 'error');
      }
    } catch {
      showToast?.('网络错误，保存失败', 'error');
    }
  };

  const handleDeleteFav = async (id, e) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/favorites/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token || '' }
      });
      const data = await res.json();
      if (data && data.success) {
        setFavorites((prev) => prev.filter((f) => f.id !== id));
        showToast?.('已删除收藏', 'info');
      }
    } catch {
      showToast?.('删除失败', 'error');
    }
  };

  if (!show) return null;

  const filteredList = favorites.filter((f) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'note') return f.type === 'note';
    if (activeTab === 'message') return f.type === 'message';
    if (activeTab === 'media') return f.type === 'image' || f.type === 'file';
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal favorites-modal" onClick={(e) => e.stopPropagation()}>
        <div className="favorites-header">
          <div className="favorites-title-wrap">
            <h3><I name="star" size={18} color="var(--warning)" /> 我的收藏与笔记</h3>
            <span className="favorites-count">{favorites.length} 个项目</span>
          </div>
          <div className="favorites-header-actions">
            <button
              type="button"
              className="fav-new-note-btn"
              onClick={() => setShowCreateNote((s) => !s)}
            >
              <I name="edit" size={14} />
              <span>{showCreateNote ? '收起' : '+ 新建笔记'}</span>
            </button>
            <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
              <I name="close" size={18} />
            </button>
          </div>
        </div>

        {/* 新建笔记卡片 */}
        {showCreateNote && (
          <form className="fav-create-card" onSubmit={handleCreateNote}>
            <input
              type="text"
              className="fav-input"
              placeholder="笔记标题（可选）"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              maxLength={40}
            />
            <textarea
              className="fav-textarea"
              placeholder="写下灵感、代办或备忘内容..."
              rows={3}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              autoFocus
            />
            <div className="fav-create-footer">
              <input
                type="text"
                className="fav-tag-input"
                placeholder="标签 (如: 工作、灵感)"
                value={noteTag}
                onChange={(e) => setNoteTag(e.target.value)}
                maxLength={10}
              />
              <div className="fav-create-btns">
                <button type="button" className="fav-btn cancel" onClick={() => setShowCreateNote(false)}>
                  取消
                </button>
                <button type="submit" className="fav-btn submit">
                  保存笔记
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 标签筛选栏 */}
        <div className="favorites-tabs">
          <button
            type="button"
            className={`fav-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            全部
          </button>
          <button
            type="button"
            className={`fav-tab ${activeTab === 'note' ? 'active' : ''}`}
            onClick={() => setActiveTab('note')}
          >
            📝 笔记
          </button>
          <button
            type="button"
            className={`fav-tab ${activeTab === 'message' ? 'active' : ''}`}
            onClick={() => setActiveTab('message')}
          >
            💬 聊天摘录
          </button>
          <button
            type="button"
            className={`fav-tab ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            🖼️ 图片文件
          </button>
        </div>

        {/* 收藏列表 */}
        <div className="favorites-list">
          {loading ? (
            <div className="fav-empty">加载中...</div>
          ) : filteredList.length === 0 ? (
            <div className="fav-empty">
              <I name="star" size={32} color="var(--text-tertiary)" />
              <p>暂无收藏内容，点击右上角新建笔记，或在聊天中长按/点击收藏</p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div key={item.id} className="fav-item-card">
                <div className="fav-item-top">
                  <span className="fav-item-type">
                    {item.type === 'note' ? '📝 笔记' : item.type === 'message' ? '💬 聊天' : '📁 媒体'}
                  </span>
                  <span className="fav-item-title">{item.title}</span>
                  <span className="fav-item-time">{formatTime(item.createdAt)}</span>
                  <button
                    type="button"
                    className="fav-item-delete"
                    onClick={(e) => handleDeleteFav(item.id, e)}
                    title="删除此条收藏"
                  >
                    <I name="delete" size={13} />
                  </button>
                </div>
                <div className="fav-item-body">
                  {item.content}
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="fav-tags-row">
                    {item.tags.map((t, idx) => (
                      <span key={idx} className="fav-tag-badge">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
