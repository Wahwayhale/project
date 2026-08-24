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
          <div style={{ marginBottom: 12, color: '#ef4444' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
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
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

var root = ReactDOM.createRoot(document.getElementById('root'));

// 全局未捕获错误处理（仅日志记录，不破坏 DOM）
window.onerror = (msg, src, line, col, err) => {
  console.error('Global error:', { msg, src, line, col, err });
  return true;
};
window.onunhandledrejection = (e) => {
  console.error('Unhandled rejection:', e.reason);
};

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);