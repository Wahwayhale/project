import React, { useState, useEffect, useRef, useCallback } from 'react';
import { I } from './Icon';
import { API_URL } from '../utils/constants';

export default function SocialGraphView({ showToast, onBack }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const animRef = useRef(null);
  const nodesRef = useRef([]);

  useEffect(() => {
    fetch(`${API_URL}/api/ai/social-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }
    }).then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
      if (d.nodes) initPositions(d.nodes, d.edges);
    }).catch(() => { setLoading(false); showToast('加载失败', 'error'); });
  }, [showToast]);

  const initPositions = useCallback((nodes, edges) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    const cx = W / 2, cy = H / 2;
    const positioned = nodes.map((n, i) => {
      if (n.self) return { ...n, x: cx, y: cy, vx: 0, vy: 0 };
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 120 + Math.random() * 80;
      return { ...n, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0 };
    });
    nodesRef.current = positioned;
    runSimulation(positioned, edges, W, H);
  }, []);

  const runSimulation = (nodes, edges, W, H) => {
    let iterations = 0;
    const maxIter = 120;
    const cx = W / 2, cy = H / 2;

    const step = () => {
      if (iterations >= maxIter) { drawGraph(nodes, edges, W, H); return; }
      nodes.forEach(n => {
        if (n.self) return;
        const dx = n.x - cx, dy = n.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        n.vx -= (dx / dist) * 0.3;
        n.vy -= (dy / dist) * 0.3;
      });
      edges.forEach(e => {
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        if (!src || !tgt) return;
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 160) * 0.003;
        if (!src.self) { src.vx += (dx / dist) * force; src.vy += (dy / dist) * force; }
        if (!tgt.self) { tgt.vx -= (dx / dist) * force; tgt.vy -= (dy / dist) * force; }
      });
      nodes.forEach(n => {
        if (n.self) return;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(n.size + 20, Math.min(W - n.size - 20, n.x));
        n.y = Math.max(n.size + 20, Math.min(H - n.size - 20, n.y));
      });
      iterations++;
      if (iterations % 3 === 0) drawGraph(nodes, edges, W, H);
      requestAnimationFrame(step);
    };
    step();
  };

  const drawGraph = (nodes, edges, W, H) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W;
    canvas.height = H;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W / dpr, H / dpr);

    const sx = 1 / dpr, sy = 1 / dpr;
    ctx.save();
    ctx.scale(sx, sy);

    // 绘制连线
    edges.forEach(e => {
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      if (!src || !tgt) return;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = `rgba(66, 214, 164, ${0.15 + e.weight * 0.4})`;
      ctx.lineWidth = 1 + e.weight * 3;
      ctx.stroke();
    });

    // 绘制节点
    nodes.forEach(n => {
      const isHovered = hoveredNode === n.id;
      const isSelected = selectedNode === n.id;
      const r = n.size + (isHovered || isSelected ? 4 : 0);

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.self) {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
        grad.addColorStop(0, '#42d6a4');
        grad.addColorStop(1, '#2bc48a');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = isHovered || isSelected ? '#42d6a4' : `rgba(66, 214, 164, ${0.3 + (n.size - 12) / 30})`;
      }
      ctx.fill();

      if (n.self || isHovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = n.self ? '#fff' : 'var(--text)';
      ctx.font = `${n.self ? 'bold ' : ''}${n.self ? 14 : 11}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x, n.y + r + 14);
    });

    ctx.restore();
  };

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const clicked = nodesRef.current.find(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.size + 10;
    });
    setSelectedNode(clicked ? clicked.id === selectedNode ? null : clicked.id : null);
  };

  const handleCanvasMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const hovered = nodesRef.current.find(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.size + 10;
    });
    setHoveredNode(hovered ? hovered.id : null);
  };

  const selectedData = data?.nodes?.find(n => n.id === selectedNode);

  if (loading) return <div className="discover-page"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><div className="loading-spinner" /></div></div>;

  return (
    <div className="discover-page">
      <div className="discover-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" onClick={onBack} style={{ padding: 8 }}><I name="arrowLeft" size={20} /></button>
        <div>
          <h2 style={{ margin: 0 }}>社交关系图谱</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>共 {data?.totalUsers || 0} 位互动好友</div>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor: 'pointer' }}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMove}
          onMouseLeave={() => setHoveredNode(null)}
        />
        {data?.insight && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, padding: 12, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <I name="sparkles" size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {data.insight}
          </div>
        )}
        {selectedData && !selectedData.self && (
          <div style={{ position: 'absolute', top: 12, right: 12, padding: 12, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', minWidth: 140, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{selectedData.label}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{selectedData.messageCount} 条互动</div>
            {selectedData.rooms?.length > 0 && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>共同群组：{selectedData.rooms.join('、')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
