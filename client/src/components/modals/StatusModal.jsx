import React, { useState } from 'react';
import { I } from '../Icon';

const PRESET_STATUSES = [
  { icon: '☕', text: '摸鱼中' },
  { icon: '💻', text: '沉迷代码' },
  { icon: '🎵', text: '听歌放空中' },
  { icon: '✈️', text: '旅行出游' },
  { icon: '🌙', text: '睡觉勿扰' },
  { icon: '🎮', text: '游戏开黑' },
  { icon: '🍱', text: '干饭中' },
  { icon: '🔥', text: '暴躁勿惹' },
  { icon: '✨', text: '元气满满' },
  { icon: '📖', text: '专注学习' },
];

export default function StatusModal({ show, onClose, currentStatus, onSaveStatus }) {
  const [selectedIcon, setSelectedIcon] = useState(currentStatus?.icon || '☕');
  const [customText, setCustomText] = useState(currentStatus?.text || '摸鱼中');

  if (!show) return null;

  const handleSelectPreset = (preset) => {
    setSelectedIcon(preset.icon);
    setCustomText(preset.text);
  };

  const handleSave = () => {
    if (!customText.trim()) return;
    onSaveStatus({
      icon: selectedIcon,
      text: customText.trim().slice(0, 20),
      updatedAt: Date.now()
    });
    onClose();
  };

  const handleClear = () => {
    onSaveStatus(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal status-modal" onClick={(e) => e.stopPropagation()}>
        <div className="status-modal-header">
          <h3><span className="status-modal-icon">✨</span> 设置今日状态</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="关闭">
            <I name="close" size={18} />
          </button>
        </div>

        {/* 状态预览大胶囊 */}
        <div className="status-preview-box">
          <div className="status-preview-capsule">
            <span className="status-emoji">{selectedIcon}</span>
            <input
              type="text"
              className="status-preview-input"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="写点什么状态..."
              maxLength={20}
            />
          </div>
          <span className="status-char-count">{customText.length}/20</span>
        </div>

        {/* 预设状态网格 */}
        <div className="status-presets-label">选择预设状态</div>
        <div className="status-presets-grid">
          {PRESET_STATUSES.map((item) => (
            <button
              key={item.text}
              type="button"
              className={`status-preset-item ${selectedIcon === item.icon && customText === item.text ? 'active' : ''}`}
              onClick={() => handleSelectPreset(item)}
            >
              <span className="status-preset-emoji">{item.icon}</span>
              <span className="status-preset-text">{item.text}</span>
            </button>
          ))}
        </div>

        <div className="modal-buttons">
          {currentStatus && (
            <button type="button" className="cancel danger-text" onClick={handleClear}>
              清除状态
            </button>
          )}
          <button type="button" className="cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" className="confirm" onClick={handleSave} disabled={!customText.trim()}>
            保存状态
          </button>
        </div>
      </div>
    </div>
  );
}
