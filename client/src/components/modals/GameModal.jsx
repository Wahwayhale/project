import React from 'react';
import { I } from '../Icon';

export default function GameModal({ showGameModal, setShowGameModal, sendRockPaperScissors }) {
  if (!showGameModal) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowGameModal(false)}>
      <div className="modal game-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="hand" size={20} /> 猜拳游戏</h3>
        <p>选择你的出拳：</p>
        <div className="game-choices">
          <button className="choice-btn" onClick={() => { sendRockPaperScissors('石头'); setShowGameModal(false); }}>✊ 石头</button>
          <button className="choice-btn" onClick={() => { sendRockPaperScissors('剪刀'); setShowGameModal(false); }}>✌️ 剪刀</button>
          <button className="choice-btn" onClick={() => { sendRockPaperScissors('布'); setShowGameModal(false); }}>🖐️ 布</button>
        </div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => setShowGameModal(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
