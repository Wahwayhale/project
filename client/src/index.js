import React from 'react';
import ReactDOM from 'react-dom/client';
import { AlertTriangle } from 'lucide-react';
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
        <div className="error-boundary">
          <div className="error-boundary-icon">
            <AlertTriangle size={48} strokeWidth={1.5} />
          </div>
          <h2>页面渲染错误</h2>
          <div className="error-boundary-message">
            {this.state.error?.toString()}
          </div>
          {this.state.error?.stack && (
            <details className="error-boundary-stack">
              <summary>调用栈</summary>
              <pre>
                {this.state.error.stack.slice(0, 1000)}
              </pre>
            </details>
          )}
          <button className="error-boundary-reload" onClick={() => window.location.reload()}>
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
