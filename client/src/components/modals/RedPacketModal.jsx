import React from 'react';
import { I } from '../Icon';

export default function RedPacketModal({ showRedPacketModal, setShowRedPacketModal, balance, redPacketAmount, setRedPacketAmount, redPacketCount, setRedPacketCount, redPacketMessage, setRedPacketMessage, sendRedPacket }) {
  if (!showRedPacketModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowRedPacketModal(false)}>
      <div className="modal red-packet-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="gift" size={20} /> 发红包</h3>
        <div className="balance-info">
          <span>当前余额：</span>
          <span className="balance-amount">¥{(balance || 0).toFixed(2)}</span>
        </div>
        <div className="form-group">
          <label>红包金额（元）</label>
          <input type="number" value={redPacketAmount} onChange={e => setRedPacketAmount(e.target.value)} placeholder="输入金额" min="1" step="0.01" />
        </div>
        <div className="form-group">
          <label>红包个数</label>
          <input type="number" value={redPacketCount} onChange={e => setRedPacketCount(e.target.value)} placeholder="输入个数" min="1" />
        </div>
        <div className="form-group">
          <label>祝福语</label>
          <input type="text" value={redPacketMessage} onChange={e => setRedPacketMessage(e.target.value)} placeholder="恭喜发财，大吉大利" />
        </div>
        {redPacketAmount && redPacketCount && (
          <div className="red-packet-preview">
            预计每个红包约 ¥{(parseFloat(redPacketAmount) / parseInt(redPacketCount)).toFixed(2)}
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowRedPacketModal(false)}>取消</button>
          <button className="confirm" onClick={sendRedPacket}>发送</button>
        </div>
      </div>
    </div>
  );
}
