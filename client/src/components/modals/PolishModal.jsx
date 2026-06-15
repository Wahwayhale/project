import React from 'react';
import { I } from '../Icon';

export default function PolishModal({ showPolishModal, setShowPolishModal, setPolishResult, polishText, setPolishText, polishTone, setPolishTone, polishResult, polishLoading, polishMessage, applyPolish }) {
  if (!showPolishModal) return null;
  return (
    <div className="modal-overlay" onClick={() => { setShowPolishModal(false); setPolishResult(''); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3><I name="polish" size={20} /> AI 文字润色</h3>
        <div className="form-group">
          <label>原始文字</label>
          <textarea value={polishText} onChange={e => setPolishText(e.target.value)} rows={3} placeholder="输入要润色的文字..." />
        </div>
        <div className="form-group">
          <label>风格</label>
          <select value={polishTone} onChange={e => setPolishTone(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
            <option value="casual">口语化</option>
            <option value="formal">正式</option>
            <option value="funny">幽默</option>
            <option value="concise">简洁</option>
          </select>
        </div>
        {polishResult && (
          <div className="form-group">
            <label>润色结果</label>
            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.6 }}>{polishResult}</div>
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowPolishModal(false); setPolishResult(''); }}>取消</button>
          {!polishResult ? (
            <button className="confirm" onClick={polishMessage} disabled={!polishText.trim() || polishLoading}>
              {polishLoading ? '润色中...' : '开始润色'}
            </button>
          ) : (
            <button className="confirm" onClick={applyPolish}>应用到输入框</button>
          )}
        </div>
      </div>
    </div>
  );
}
