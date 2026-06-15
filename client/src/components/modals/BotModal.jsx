import React from 'react';
import { I } from '../Icon';

export default function BotModal({ showBotModal, setShowBotModal, bots, deleteBot, botForm, setBotForm, createBot }) {
  if (!showBotModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowBotModal(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3><I name="bot" size={20} /> 聊天机器人</h3>
        {bots.map(bot => (
          <div key={bot.id} className="bot-card">
            <div className="bot-info">
              <div className="bot-name">{bot.name}</div>
              <div className="bot-status">{bot.autoReply ? '自动回复中' : '已关闭回复'} {bot.schedule ? `| ⏰ ${bot.schedule.cron}` : ''}</div>
            </div>
            <button onClick={() => deleteBot(bot.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="delete" size={16} /></button>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <div className="form-group"><label>机器人名称</label><input type="text" value={botForm.name} onChange={e => setBotForm(f => ({ ...f, name: e.target.value }))} placeholder="例如：早安助手" /></div>
          <div className="form-group"><label>人设提示词</label><textarea value={botForm.prompt} onChange={e => setBotForm(f => ({ ...f, prompt: e.target.value }))} placeholder="你是一个友好的早安助手..." rows={2} /></div>
          <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={botForm.autoReply} onChange={e => setBotForm(f => ({ ...f, autoReply: e.target.checked }))} style={{ width: 'auto' }} /> 自动回复群聊消息</label></div>
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowBotModal(false)}>关闭</button>
          <button className="confirm" onClick={createBot}>创建机器人</button>
        </div>
      </div>
    </div>
  );
}
