import React from 'react';
import { I } from '../Icon';

export default function WrappedModal({ showWrapped, wrappedData, setShowWrapped }) {
  if (!showWrapped || !wrappedData) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowWrapped(false)}>
      <div className="modal wrapped-modal" onClick={e => e.stopPropagation()}>
        <div className="wrapped-hero"><I name="stats" size={48} /></div>
        <h3>你的聊天年度报告</h3>
        <div className="wrapped-stat"><div className="wstat-num">{wrappedData.total}</div><div className="wstat-label">总消息数</div></div>
        <div className="wrapped-stat"><div className="wstat-num">{wrappedData.totalSent}</div><div className="wstat-label">发送 {wrappedData.totalSent} / 接收 {wrappedData.totalReceived}</div></div>
        <div className="wrapped-stat"><div className="wstat-num">{wrappedData.activeHour}:00</div><div className="wstat-label">最活跃时间段</div></div>
        {wrappedData.topFriend && (
          <div className="wrapped-friend">
            <span>最亲密好友：</span><strong>{wrappedData.topFriend.name}</strong>
            <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 12 }}>{wrappedData.topFriend.count} 条消息</span>
          </div>
        )}
        <div className="modal-buttons">
          <button className="confirm" onClick={() => setShowWrapped(false)}>知道了</button>
        </div>
      </div>
    </div>
  );
}
