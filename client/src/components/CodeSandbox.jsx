import React, { useState, useRef, useCallback } from 'react';

/* ── Web Worker 执行 JS 代码 ── */
function runInWorker(code, timeout = 5000) {
  return new Promise((resolve) => {
    const wrapped = `
      const __logs = [];
      console.log = function() { __logs.push({t:'log', d: Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}); };
      console.error = function() { __logs.push({t:'error', d: Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}); };
      console.warn = function() { __logs.push({t:'warn', d: Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}); };
      try {
        var __result = (function() { ${code} })();
        if (__result !== undefined) __logs.push({t:'log', d: String(__result)});
      } catch(e) {
        __logs.push({t:'error', d: e.name + ': ' + e.message});
      }
      postMessage({ logs: __logs });
    `;
    const blob = new Blob([wrapped], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve([{ t: 'error', d: '⏱ 执行超时（' + (timeout / 1000) + 's）' }]);
    }, timeout);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(e.data.logs || []);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve([{ t: 'error', d: e.message || '未知错误' }]);
    };
  });
}

const LANG_LABELS = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JavaScript (JSX)',
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TypeScript (TSX)',
  py: 'Python', python: 'Python',
  html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL',
  sh: 'Shell', bash: 'Shell', shell: 'Shell',
  go: 'Go', rust: 'Rust', java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#',
};

const RUNNABLE = new Set(['js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx']);

export default function CodeSandbox({ code, language }) {
  const [output, setOutput] = useState(null); // null = 未运行, [] = 已运行
  const [running, setRunning] = useState(false);
  const outputRef = useRef(null);

  const lang = (language || '').toLowerCase().trim();
  const langLabel = LANG_LABELS[lang] || (lang ? lang.toUpperCase() : 'Code');
  const canRun = RUNNABLE.has(lang);
  const displayCode = code.replace(/\n$/, ''); // 去除末尾空行

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setOutput([]);
    try {
      const logs = await runInWorker(displayCode);
      setOutput(logs);
    } catch (err) {
      setOutput([{ t: 'error', d: err.message || '执行失败' }]);
    }
    setRunning(false);
  }, [displayCode, running]);

  return (
    <div className="code-sandbox">
      {/* 头部：macOS 圆点 + 语言 + 运行按钮 */}
      <div className="code-sandbox-header">
        <div className="code-sandbox-dots">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
        <span className="code-sandbox-lang">{langLabel}</span>
        {canRun && (
          <button
            className={`code-sandbox-run${running ? ' running' : ''}`}
            onClick={handleRun}
            disabled={running}
          >
            {running ? <span className="run-spinner" /> : '▶'} {running ? '运行中' : '运行'}
          </button>
        )}
      </div>

      {/* 代码展示区 */}
      <pre className="code-sandbox-code">
        <code>{displayCode}</code>
      </pre>

      {/* 输出区 */}
      {output !== null && (
        <div className="code-sandbox-output" ref={outputRef}>
          {output.length === 0 ? (
            <div className="output-line output-muted">（无输出）</div>
          ) : (
            output.map((line, i) => (
              <div key={i} className={`output-line output-${line.t}`}>
                {line.d}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
