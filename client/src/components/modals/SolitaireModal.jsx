import React from 'react';
import { I } from '../Icon';

export default function SolitaireModal({ showSolitaireModal, setShowSolitaireModal, solitaireTitle, setSolitaireTitle, solitaireFormat, setSolitaireFormat, createSolitaire }) {
  if (!showSolitaireModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowSolitaireModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3><I name="solitaire" size={20} /> 发起群接龙</h3>
        <div className="form-group">
          <label>接龙主题</label>
          <input type="text" value={solitaireTitle} onChange={e => setSolitaireTitle(e.target.value)} placeholder="例如：今天吃什么？" />
        </div>
        <div className="form-group">
          <label>接龙格式（可选）</label>
          <input type="text" value={solitaireFormat} onChange={e => setSolitaireFormat(e.target.value)} placeholder="{序号}. {内容}" />
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowSolitaireModal(false)}>取消</button>
          <button className="confirm" onClick={createSolitaire}>发起接龙</button>
        </div>
      </div>
    </div>
  );
}
