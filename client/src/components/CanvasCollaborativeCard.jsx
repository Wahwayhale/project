import React, { useEffect, useRef, useState } from 'react';
import { I } from './Icon';

const BOARD_SIZE = 300;
const COLORS = [
  { key: 'mint', value: '#42d6a4' },
  { key: 'sky', value: '#55c7f7' },
  { key: 'peach', value: '#ffb38a' },
  { key: 'berry', value: '#ff8fb3' },
  { key: 'ink', value: '#334155' },
];

export default function CanvasCollaborativeCard({ roomId, cardId, socketRef, user }) {
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const lastPointByUserRef = useRef({});
  const drawingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const [color, setColor] = useState(COLORS[0]);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_SIZE * dpr;
    canvas.height = BOARD_SIZE * dpr;
    canvas.style.width = `${BOARD_SIZE}px`;
    canvas.style.height = `${BOARD_SIZE}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const drawPaper = (ctx) => {
    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.fillStyle = 'rgba(66, 214, 164, 0.12)';
    for (let x = 14; x < BOARD_SIZE; x += 18) {
      for (let y = 14; y < BOARD_SIZE; y += 18) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const drawPoint = (point) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !point) return;
    const uid = point.userId || 'guest';
    if (point.type === 'move') {
      lastPointByUserRef.current[uid] = point;
      return;
    }
    const prev = lastPointByUserRef.current[uid];
    if (!prev) {
      lastPointByUserRef.current[uid] = point;
      return;
    }
    ctx.beginPath();
    ctx.strokeStyle = point.color || '#334155';
    ctx.lineWidth = point.size || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointByUserRef.current[uid] = point;
  };

  const redraw = (points) => {
    const ctx = setupCanvas();
    if (!ctx) return;
    drawPaper(ctx);
    lastPointByUserRef.current = {};
    points.forEach(drawPoint);
  };

  useEffect(() => {
    redraw(pointsRef.current);
    const handleResize = () => redraw(pointsRef.current);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!roomId || !cardId || !socketRef?.current) return;
    const socket = socketRef.current;
    const onSync = (payload) => {
      if (payload.cardId !== cardId) return;
      pointsRef.current = payload.points || [];
      setOnlineUsers(payload.users || []);
      redraw(pointsRef.current);
    };
    const onPoint = (payload) => {
      if (payload.cardId !== cardId || !payload.point) return;
      pointsRef.current = [...pointsRef.current, payload.point].slice(-4000);
      drawPoint(payload.point);
    };
    const onClear = (payload) => {
      if (payload.cardId !== cardId) return;
      pointsRef.current = [];
      redraw([]);
    };
    socket.on('canvasCardSync', onSync);
    socket.on('canvasCardPoint', onPoint);
    socket.on('canvasCardClear', onClear);
    socket.emit('canvasCardJoin', { roomId, cardId });
    return () => {
      socket.emit('canvasCardLeave', { cardId });
      socket.off('canvasCardSync', onSync);
      socket.off('canvasCardPoint', onPoint);
      socket.off('canvasCardClear', onClear);
    };
  }, [roomId, cardId, socketRef]);

  const getPoint = (event, type) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * BOARD_SIZE;
    return {
      x: Math.max(0, Math.min(BOARD_SIZE, x)),
      y: Math.max(0, Math.min(BOARD_SIZE, y)),
      type,
      color: color.value,
      size: 3,
      userId: user?.id || user?.username || 'guest',
    };
  };

  const emitPoint = (point) => {
    pointsRef.current = [...pointsRef.current, point].slice(-4000);
    drawPoint(point);
    socketRef.current?.emit('canvasCardDraw', { roomId, cardId, point });
  };

  const startDraw = (event) => {
    event.preventDefault();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    emitPoint(getPoint(event, 'move'));
  };

  const moveDraw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastSentAtRef.current < 16) return;
    lastSentAtRef.current = now;
    emitPoint(getPoint(event, 'draw'));
  };

  const endDraw = (event) => {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const clearCard = () => {
    socketRef.current?.emit('canvasCardClear', { roomId, cardId });
  };

  return (
    <div className="canvas-card-shell">
      <div className="canvas-card-top">
        <div>
          <div className="canvas-card-title"><I name="brush" size={15} /> 实时涂鸦卡片</div>
          <div className="canvas-card-meta">{onlineUsers.length || 1} 人正在看</div>
        </div>
        <button type="button" className="canvas-card-clear" onClick={clearCard} title="清空画板">
          <I name="reset" size={14} />
        </button>
      </div>
      <div className="canvas-card-paper">
        <canvas
          ref={canvasRef}
          className="canvas-card-canvas"
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      </div>
      <div className="canvas-card-tools" aria-label="画笔颜色">
        {COLORS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`canvas-color-dot ${item.key} ${color.key === item.key ? 'is-active' : ''}`}
            onClick={() => setColor(item)}
            title="切换画笔颜色"
          />
        ))}
      </div>
    </div>
  );
}
