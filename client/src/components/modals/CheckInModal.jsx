import React from 'react';
import { I } from '../Icon';

export default function CheckInModal({ showCheckIn, setShowCheckIn, checkInData, checkInNote, setCheckInNote, doCheckIn }) {
  if (!showCheckIn) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowCheckIn(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h3><I name="checkin" size={20} /> 每日打卡</h3>
        {checkInData && (
          <div style={{ marginBottom: 12 }}>
            <div className="checkin-card">
              <div className="checkin-day">{new Date().toLocaleDateString('zh-CN')}</div>
              <div className="checkin-count">今日已打卡: {checkInData.today.length} 人</div>
            </div>
            {checkInData.today.length > 0 && (
              <div className="checkin-leaderboard" style={{ marginTop: 10 }}>
                {checkInData.today.map((c, i) => (
                  <div key={i} className="lb-row">
                    <span className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`} style={i > 2 ? { background: '#e5e7eb', color: '#6b7280' } : {}}>{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{new Date(c.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="form-group"><label>打卡备注（可选）</label><input type="text" value={checkInNote} onChange={e => setCheckInNote(e.target.value)} placeholder="今天做什么了？" /></div>
        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowCheckIn(false); setCheckInNote(''); }}>关闭</button>
          <button className="confirm" onClick={() => { doCheckIn(checkInNote); setCheckInNote(''); }}>打卡</button>
        </div>
      </div>
    </div>
  );
}
