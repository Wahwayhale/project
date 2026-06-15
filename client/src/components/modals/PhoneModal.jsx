import React from 'react';
import { I } from '../Icon';

export default function PhoneModal({ showPhoneModal, closePhoneModal, phoneInfo, phoneStep, phoneInput, setPhoneInput, codeInput, setCodeInput, codeCountdown, phoneSendingCode, phoneBinding, handleSendCode, handleVerifyAndBind, handleUnbindPhone }) {
  if (!showPhoneModal) return null;
  return (
    <div className="modal-overlay" onClick={closePhoneModal}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        {phoneInfo.phoneBound ? (
          /* 已绑定 → 显示信息 + 解绑 */
          <>
            <h3><I name="phone" size={20} /> 手机号</h3>
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>{phoneInfo.phone}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                绑定时间：{phoneInfo.phoneBoundAt ? new Date(phoneInfo.phoneBoundAt).toLocaleString() : ''}
              </div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={closePhoneModal}>关闭</button>
              <button className="danger" onClick={handleUnbindPhone}>解绑</button>
            </div>
          </>
        ) : phoneStep === 'done' ? (
          /* 绑定成功 */
          <>
            <h3><I name="checkin" size={20} /> 绑定成功</h3>
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: 'var(--primary)' }}>{phoneInfo.phone}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>手机号绑定成功</div>
            </div>
            <div className="modal-buttons">
              <button className="confirm" onClick={closePhoneModal}>完成</button>
            </div>
          </>
        ) : phoneStep === 'code' ? (
          /* 第二步：输入验证码 */
          <>
            <h3><I name="phone" size={20} /> 输入验证码</h3>
            <div style={{ padding: '10px 0 5px' }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                验证码已发送至 <strong>{phoneInput.slice(0,3) + '****' + phoneInput.slice(7)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} style={{
                    width: 44, height: 54, borderRadius: 8, border: '2px solid ' + (codeInput.length > i ? 'var(--primary)' : 'var(--border)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 'bold', background: '#f5f5f5', transition: 'border 0.2s'
                  }}>
                    {codeInput[i] || ''}
                  </div>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength="6"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                style={{ width: '100%', padding: '12px 16px', fontSize: 20, letterSpacing: 8, textAlign: 'center',
                  border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
                placeholder="请输入验证码"
              />
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                {codeCountdown > 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{codeCountdown}s 后重新获取</span>
                ) : (
                  <button onClick={handleSendCode} disabled={phoneSendingCode} style={{
                    background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13
                  }}>重新获取验证码</button>
                )}
              </div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={closePhoneModal}>取消</button>
              <button className="confirm" onClick={handleVerifyAndBind} disabled={phoneBinding || codeInput.length !== 6}>
                {phoneBinding ? '验证中...' : '确认绑定'}
              </button>
            </div>
          </>
        ) : (
          /* 第一步：输入手机号 */
          <>
            <h3><I name="phone" size={20} /> 绑定手机号</h3>
            <div style={{ padding: '20px 0' }}>
              <input
                type="tel"
                placeholder="请输入手机号"
                maxLength="11"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                style={{ width: '100%', padding: '12px 16px', fontSize: 16, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>绑定后可用于账号找回和安全验证</div>
            </div>
            <div className="modal-buttons">
              <button className="cancel" onClick={closePhoneModal}>取消</button>
              <button className="confirm" onClick={handleSendCode} disabled={phoneSendingCode || !/^1[3-9]\d{9}$/.test(phoneInput)}>
                {phoneSendingCode ? '发送中...' : '获取验证码'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
