import React, { useState, useEffect, useCallback } from 'react';
import { I } from './Icon';
import AvatarImg from './ui/AvatarImg';
import { getAvatarUrl } from '../utils/avatar';

/**
 * UndercoverGame — 谁是卧底游戏面板
 *
 * 挂载在聊天视图左上角的浮动入口，展开后显示游戏面板：
 * 报名 → 发词（仅自己可见）→ 聊天区发言描述 → 面板投票 → 结算。
 * 状态由服务端下发（undercover:state），每人只看到自己的词。
 */
export default function UndercoverGame({ socketRef, roomId, user, showToast }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ phase: 'none' });
  const [wordRevealed, setWordRevealed] = useState(false);

  useEffect(() => {
    const sock = socketRef?.current;
    if (!sock || !roomId) return;
    const stateHandler = (data) => {
      if (data.roomId === roomId) setState(data);
    };
    const errHandler = ({ error }) => showToast(error, 'error');
    sock.on('undercover:state', stateHandler);
    sock.on('undercover:error', errHandler);
    sock.emit('undercover:state', { roomId });
    return () => {
      sock.off('undercover:state', stateHandler);
      sock.off('undercover:error', errHandler);
    };
  }, [socketRef, roomId, showToast]);

  // 局数变化时重置词卡
  useEffect(() => { setWordRevealed(false); }, [state.round, state.phase]);

  const emit = useCallback((event, data = {}) => {
    socketRef?.current?.emit(event, { roomId, ...data });
  }, [socketRef, roomId]);

  const vote = (target) => {
    if (target === user?.username) { showToast('不能投自己', 'error'); return; }
    emit('undercover:vote', { target });
  };

  if (!roomId) return null;

  const { phase, players = [], host, myWord, amIInGame, amIAlive, winner, wordPair } = state;
  const aliveCount = players.filter(p => p.alive).length;
  const hasGame = phase !== 'none';

  const phaseLabel = {
    lobby: '报名中',
    speaking: `第 ${state.round || 1} 轮 · 描述中`,
    voting: `第 ${state.round || 1} 轮 · 投票中`,
    ended: '已结束'
  }[phase] || '谁是卧底';

  return (
    <div className="ucg-wrap">
      {/* 浮动入口按钮 */}
      <button
        className={`ucg-fab ${hasGame ? 'ucg-fab-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="谁是卧底"
      >
        <I name="crown" size={20} />
        {hasGame && phase !== 'ended' && <span className="ucg-fab-dot">{aliveCount}</span>}
      </button>

      {open && (
        <div className="ucg-panel">
          <div className="ucg-panel-head">
            <span className="ucg-panel-title"><I name="crown" size={15} /> 谁是卧底 · {hasGame ? phaseLabel : '未开始'}</span>
            <button className="ucg-close" onClick={() => setOpen(false)}><I name="close" size={15} /></button>
          </div>

          {/* 未开局 */}
          {!hasGame && (
            <div className="ucg-body">
              <div className="ucg-hint">经典派对游戏：平民拿到同一个词，卧底拿到相近的词。每人一句话描述，投票揪出卧底！</div>
              <button className="ucg-btn ucg-btn-primary" onClick={() => emit('undercover:create')}>
                <I name="crown" size={15} /> 发起一局（发起后自动报名）
              </button>
            </div>
          )}

          {/* 报名中 */}
          {phase === 'lobby' && (
            <div className="ucg-body">
              <div className="ucg-player-grid">
                {players.map(p => (
                  <div key={p.username} className="ucg-player">
                    <AvatarImg src={getAvatarUrl(p.avatar)} alt="" />
                    <span className="ucg-player-name">{p.username}{p.username === host ? '（房主）' : ''}</span>
                  </div>
                ))}
              </div>
              <div className="ucg-hint">{players.length} 人已报名，至少 3 人开局{players.length >= 5 ? '，5 人以上有 2 名卧底' : ''}</div>
              <div className="ucg-btn-row">
                {!amIInGame ? (
                  <button className="ucg-btn ucg-btn-primary" onClick={() => emit('undercover:join')}>加入游戏</button>
                ) : (
                  <>
                    <button className="ucg-btn ucg-btn-ghost" onClick={() => emit('undercover:leave')}>退出报名</button>
                    {user?.username === host && (
                      <button className="ucg-btn ucg-btn-primary" disabled={players.length < 3} onClick={() => emit('undercover:start')}>
                        {players.length < 3 ? `还差 ${3 - players.length} 人` : '开始游戏'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 描述阶段：亮词卡 */}
          {phase === 'speaking' && (
            <div className="ucg-body">
              {amIInGame ? (
                <div className={`ucg-word-card ${wordRevealed ? 'revealed' : ''}`} onClick={() => setWordRevealed(v => !v)}>
                  {!wordRevealed ? (
                    <><I name="info" size={16} /> <span>点击查看你的词（小心别人偷看）</span></>
                  ) : (
                    <div className="ucg-word-text">
                      <span className="ucg-word">{myWord}</span>
                      <span className="ucg-word-tip">再点一下隐藏</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ucg-hint">你在观战，等待本局结束</div>
              )}
              <div className="ucg-player-list">
                {players.map(p => (
                  <div key={p.username} className={`ucg-player-row ${p.alive ? '' : 'dead'}`}>
                    <AvatarImg src={getAvatarUrl(p.avatar)} alt="" />
                    <span className="ucg-player-name">{p.username}</span>
                    {!p.alive && <span className="ucg-tag out">出局</span>}
                  </div>
                ))}
              </div>
              {amIAlive && (
                <div className="ucg-hint">在聊天框发言描述你的词（不要直接说出来），描述完点击下方按钮开始投票</div>
              )}
              {amIAlive && (
                <button className="ucg-btn ucg-btn-primary" onClick={() => emit('undercover:beginVote')}>
                  <I name="vote" size={15} /> 描述完毕，进入投票
                </button>
              )}
            </div>
          )}

          {/* 投票阶段 */}
          {phase === 'voting' && (
            <div className="ucg-body">
              <div className="ucg-hint">{amIAlive ? '点击你想投出的玩家（不能投自己）' : '你已出局，观战投票'}</div>
              <div className="ucg-player-list">
                {players.map(p => (
                  <div
                    key={p.username}
                    className={`ucg-player-row ucg-votable ${p.alive ? '' : 'dead'} ${p.voted ? 'voted' : ''}`}
                    onClick={() => amIAlive && p.alive && vote(p.username)}
                  >
                    <AvatarImg src={getAvatarUrl(p.avatar)} alt="" />
                    <span className="ucg-player-name">{p.username}{p.username === user?.username ? '（我）' : ''}</span>
                    {p.voted && <span className="ucg-tag voted-tag">已投</span>}
                    {!p.alive && <span className="ucg-tag out">出局</span>}
                  </div>
                ))}
              </div>
              {amIAlive && <div className="ucg-hint">全员投完自动开票</div>}
            </div>
          )}

          {/* 结束 */}
          {phase === 'ended' && (
            <div className="ucg-body">
              <div className={`ucg-result ${winner === 'civilian' ? 'civilian' : 'spy'}`}>
                <div className="ucg-result-title">
                  {winner === 'civilian' ? '平民获胜！卧底全部出局' : '卧底获胜！潜伏成功'}
                </div>
                {wordPair && (
                  <div className="ucg-result-words">
                    平民词「{wordPair[0]}」 · 卧底词「{wordPair[1]}」
                  </div>
                )}
              </div>
              <div className="ucg-player-list">
                {players.map(p => (
                  <div key={p.username} className={`ucg-player-row ${p.alive ? '' : 'dead'}`}>
                    <AvatarImg src={getAvatarUrl(p.avatar)} alt="" />
                    <span className="ucg-player-name">{p.username}</span>
                    {p.isSpy && <span className="ucg-tag spy">卧底</span>}
                    {!p.alive && <span className="ucg-tag out">出局</span>}
                  </div>
                ))}
              </div>
              {user?.username === host && (
                <button className="ucg-btn ucg-btn-primary" onClick={() => emit('undercover:restart')}>
                  <I name="reset" size={15} /> 再来一局
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
