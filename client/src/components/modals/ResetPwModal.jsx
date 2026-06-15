import React from 'react';
import { I } from '../Icon';

export default function ResetPwModal({ showResetPw, setShowResetPw, resetPwStep, setResetPwStep, resetPwPhone, setResetPwPhone, resetPwCode, setResetPwCode, resetPwNewPw, setResetPwNewPw, resetPwCountdown, handleSendResetCode, handleResetPassword }) {
  if (!showResetPw) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowResetPw(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h3><I name="security" size={20} /> 找回密码</h3>
        {resetPwStep === 0 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>输入绑定的手机号，获取验证码</p>
            <input type="tel" placeholder="请输入手机号" value={resetPwPhone} onChange={e => setResetPwPhone(e.target.value.replace(/\D/g, ''))} maxLength={11} style={{ width: '100%', marginBottom: 12 }} />
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
              <button className="confirm" onClick={handleSendResetCode}>获取验证码</button>
            </div>
          </>
        )}
        {resetPwStep === 1 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
              验证码已发送至 <strong>{resetPwPhone.slice(0,3)}****{resetPwPhone.slice(7)}</strong>
            </p>
            <div className="code-grid">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={`cdigit ${resetPwCode.length > i ? 'on' : ''}`}>{resetPwCode[i] || ''}</div>
              ))}
            </div>
            <input type="text" inputMode="numeric" maxLength={6} value={resetPwCode}
              onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setResetPwCode(v); if (v.length === 6) setResetPwStep(2); }}
              style={{ width: '100%', padding: '10px 0', fontSize: 18, letterSpacing: 10, textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', position: 'absolute', opacity: 0 }} autoFocus />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              {resetPwCountdown > 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{resetPwCountdown}s 后重新获取</span>
              ) : (
                <button onClick={handleSendResetCode} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}>重新获取</button>
              )}
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
              <button className="confirm" disabled={resetPwCode.length !== 6} onClick={() => setResetPwStep(2)}>下一步</button>
            </div>
          </>
        )}
        {resetPwStep === 2 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>设置新密码（至少3位）</p>
            <input type="password" placeholder="请输入新密码" value={resetPwNewPw}
              onChange={e => setResetPwNewPw(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }} autoFocus />
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowResetPw(false)}>取消</button>
              <button className="confirm" onClick={handleResetPassword}>重置密码</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
