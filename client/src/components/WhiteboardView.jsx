import React, { useState, useEffect, useRef, useCallback } from 'react';
import { I } from './Icon';
import { API_URL, SERVER_URL } from '../utils/constants';
import io from 'socket.io-client';

const COLORS = ['#000000', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
const SIZES = [2, 4, 8, 16];

export default function WhiteboardView({ showToast, onBack, roomId = 'whiteboard_global' }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen');
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [users, setUsers] = useState([]);
  const [showPalette, setShowPalette] = useState(false);
  const [aiDesc, setAiDesc] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSvg, setAiSvg] = useState('');
  const currentStroke = useRef([]);

  useEffect(() => {
    const wsUrl = SERVER_URL || window.location.origin;
    socketRef.current = io(wsUrl, { transports: ['websocket'] });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('authenticate', localStorage.getItem('token'));
      socketRef.current.emit('whiteboardJoin', { roomId });
    });
    socketRef.current.on('whiteboardSync', (data) => {
      setStrokes(data.strokes || []);
      setUsers(data.users || []);
    });
    socketRef.current.on('whiteboardStroke', ({ stroke }) => {
      setStrokes(prev => [...prev, stroke]);
    });
    socketRef.current.on('whiteboardClear', () => { setStrokes([]); });
    return () => { if (socketRef.current) { socketRef.current.emit('whiteboardLeave', { roomId }); socketRef.current.disconnect(); } };
  }, [roomId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    strokes.forEach(s => drawStroke(ctx, s));
  }, [strokes]);

  const drawStroke = (ctx, s) => {
    if (!s.points || s.points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startDraw = (e) => {
    if (tool === 'eraser') {
      setStrokes(prev => prev.slice(0, -5));
      return;
    }
    setDrawing(true);
    currentStroke.current = [getPos(e)];
  };

  const moveDraw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStroke.current.push(pos);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pts = currentStroke.current;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.current.length > 1) {
      const stroke = { points: currentStroke.current, color, size, tool };
      setStrokes(prev => [...prev, stroke]);
      socketRef.current?.emit('whiteboardStroke', { roomId, stroke });
    }
    currentStroke.current = [];
  };

  const clearCanvas = () => {
    setStrokes([]);
    socketRef.current?.emit('whiteboardClear', { roomId });
  };

  const aiBeautify = async () => {
    if (!aiDesc.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/whiteboard/ai-beautify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ description: aiDesc })
      });
      const data = await res.json();
      if (data.svg) { setAiSvg(data.svg); showToast('AI 生成完成', 'success'); }
      else showToast(data.error || '生成失败', 'error');
    } catch { showToast('生成失败', 'error'); }
    setAiLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div className="chat-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <button className="icon-btn" onClick={onBack} style={{ padding: 6 }}><I name="arrowLeft" size={18} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>协作画板</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{users.length} 人在线</div>
        </div>
        <button onClick={clearCanvas} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, cursor: 'pointer' }}>清空</button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor: tool === 'eraser' ? 'crosshair' : 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
        />
        {aiSvg && (
          <div style={{ position: 'absolute', top: 8, right: 8, width: 160, background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: aiSvg.replace(/<svg/, '<svg style="width:100%;height:auto"') }} />
        )}
      </div>

      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button onClick={() => setTool(tool === 'pen' ? 'eraser' : 'pen')}
            style={{ width: 32, height: 32, borderRadius: 6, border: `1.5px solid ${tool === 'eraser' ? 'var(--primary)' : 'var(--border)'}`, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I name={tool === 'pen' ? 'edit' : 'close'} size={14} />
          </button>
          {SIZES.map(s => (
            <button key={s} onClick={() => setSize(s)}
              style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${size === s ? 'var(--primary)' : 'var(--border)'}`, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: s + 2, height: s + 2, borderRadius: '50%', background: color }} />
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <div onClick={() => setShowPalette(!showPalette)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', cursor: 'pointer' }} />
            {showPalette && (
              <div style={{ position: 'absolute', bottom: 36, left: -4, display: 'flex', gap: 4, padding: 6, borderRadius: 8, background: 'var(--bg-card)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => { setColor(c); setShowPalette(false); }}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #333' : '2px solid transparent' }} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="text" value={aiDesc} onChange={e => setAiDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && aiBeautify()}
            placeholder="描述你想要的图案，AI 帮你画..."
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
          <button onClick={aiBeautify} disabled={aiLoading}
            style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 500, cursor: aiLoading ? 'not-allowed' : 'pointer', opacity: aiLoading ? 0.6 : 1 }}>
            {aiLoading ? '...' : 'AI 画'}
          </button>
        </div>
      </div>
    </div>
  );
}
