import React from 'react';
import { I } from '../Icon';

export default function PollModal({ showPollModal, setShowPollModal, pollQuestion, setPollQuestion, pollOptions, updatePollOption, removePollOption, addPollOption, pollAnonymous, setPollAnonymous, pollDeadline, setPollDeadline, createEnhancedPoll }) {
  if (!showPollModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
      <div className="modal poll-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="vote" size={20} /> 发起投票</h3>
        <div className="form-group"><label>投票主题</label><input type="text" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="输入投票主题" /></div>
        <div className="form-group">
          <label>选项</label>
          {pollOptions.map((opt, i) => (
            <div key={i} className="poll-option-row">
              <input type="text" value={opt} onChange={e => updatePollOption(i, e.target.value)} placeholder={`选项 ${i + 1}`} />
              {pollOptions.length > 2 && <button className="remove-option" onClick={() => removePollOption(i)}>✕</button>}
            </div>
          ))}
          <button className="add-option" onClick={addPollOption}>+ 添加选项</button>
        </div>
        <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={pollAnonymous} onChange={e => setPollAnonymous(e.target.checked)} style={{ width: 'auto' }} /> 匿名投票</label></div>
        <div className="form-group"><label>截止时间（可选）</label><input type="datetime-local" value={pollDeadline} onChange={e => setPollDeadline(e.target.value)} /></div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowPollModal(false)}>取消</button>
          <button className="confirm" onClick={createEnhancedPoll}>发起投票</button>
        </div>
      </div>
    </div>
  );
}
