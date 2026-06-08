import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 错误边界 - 捕获渲染错误
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 650, margin: '40px auto', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: '#ef4444', marginBottom: 16 }}>页面渲染错误</h2>
          <div style={{ background: '#fee2e2', padding: 16, borderRadius: 8, marginBottom: 16, fontSize: 14, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
            {this.state.error?.toString()}
          </div>
          {this.state.error?.stack && (
            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: 13 }}>调用栈</summary>
              <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 150, marginTop: 8 }}>
                {this.state.error.stack.slice(0, 1000)}
              </pre>
            </details>
          )}
          <button onClick={() => window.location.reload()}
            style={{ padding: '12px 28px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            🔄 刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));

// 全局未捕获错误处理
window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = '<div style="padding:30px;font-family:sans-serif;max-width:650px;margin:40px auto;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12)"><h2 style="color:#ef4444">⚠️ 运行时错误</h2><pre style="background:#fee2e2;padding:16px;border-radius:8px;overflow:auto;font-size:13px;white-space:pre-wrap">' + (err?.message || msg) + '</pre><pre style="background:#f3f4f6;padding:12px;border-radius:8px;margin-top:8px;font-size:11px;overflow:auto;max-height:100px">' + (err?.stack?.slice(0,600) || '') + '</pre></div>';
  return true;
};
window.onunhandledrejection = (e) => {
  document.body.innerHTML = '<div style="padding:30px;font-family:sans-serif;max-width:650px;margin:40px auto;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12)"><h2 style="color:#f59e0b">⚠️ Promise 错误</h2><pre style="background:#fef3c7;padding:16px;border-radius:8px;overflow:auto;font-size:13px;white-space:pre-wrap">' + (e.reason?.message || String(e.reason)) + '</pre></div>';
};

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);