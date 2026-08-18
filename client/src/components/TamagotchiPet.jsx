import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ── 果冻宠物 CSS ── */
const STYLES = `
@keyframes jelly-breathe {
  0%, 100% { border-radius: 42% 58% 62% 38% / 44% 52% 48% 56%; transform: scale(1); }
  25%      { border-radius: 55% 45% 48% 52% / 58% 42% 56% 44%; transform: scale(1.04); }
  50%      { border-radius: 48% 52% 56% 44% / 42% 58% 44% 56%; transform: scale(0.97); }
  75%      { border-radius: 60% 40% 44% 56% / 50% 50% 52% 48%; transform: scale(1.03); }
}
@keyframes jelly-hop {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-8px) scale(1.06); }
}
@keyframes jelly-sleep {
  0%, 100% { opacity: 0.5; transform: scale(0.92); }
  50%      { opacity: 0.35; transform: scale(0.88); }
}
@keyframes jelly-drag {
  0%, 100% { border-radius: 48% 52% 54% 46% / 50% 50% 52% 48%; transform: scale(1.12); }
  50%      { border-radius: 54% 46% 48% 52% / 46% 54% 50% 50%; transform: scale(1.15); }
}
@keyframes zzz-float {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.6); }
  50%  { opacity: 1; }
  100% { opacity: 0; transform: translate(12px, -28px) scale(1.2); }
}
@keyframes feed-burst {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
@keyframes stat-pop {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-24px); opacity: 0; }
}
.tamagotchi-wrap {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.tamagotchi-body {
  width: 52px;
  height: 52px;
  position: relative;
  cursor: grab;
  transition: background 0.6s ease, box-shadow 0.6s ease;
}
.tamagotchi-body.dragging { cursor: grabbing; }
.tamagotchi-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  z-index: 1;
  pointer-events: none;
}
.tamagotchi-eyes {
  display: flex;
  gap: 10px;
}
.tamagotchi-eye {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  transition: height 0.3s;
}
.tamagotchi-eye.sleepy { height: 2px; border-radius: 2px; }
.tamagotchi-mouth {
  width: 8px;
  height: 4px;
  border-radius: 0 0 8px 8px;
  border: 1.5px solid #fff;
  border-top: none;
  transition: all 0.3s;
}
.tamagotchi-mouth.sad {
  border-radius: 8px 8px 0 0;
  border: 1.5px solid #fff;
  border-bottom: none;
}
.tamagotchi-mouth.sleep {
  width: 6px;
  height: 0;
  border: none;
  background: rgba(255,255,255,0.5);
  border-radius: 1px;
}
.tamagotchi-stats {
  display: flex;
  gap: 6px;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  pointer-events: auto;
  backdrop-filter: blur(8px);
}
.tamagotchi-stat { display: flex; align-items: center; gap: 2px; }
.tamagotchi-feed-btn {
  font-size: 10px;
  padding: 2px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text);
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(8px);
  transition: all 0.2s;
}
.tamagotchi-feed-btn:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
.tamagotchi-feed-btn:active { transform: scale(0.92); }
.tamagotchi-zzz {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 12px;
  animation: zzz-float 2s ease-in-out infinite;
  pointer-events: none;
}
.tamagotchi-pop {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--primary);
  animation: stat-pop 1s ease forwards;
  pointer-events: none;
}
`;

function injectStyles() {
  if (document.getElementById('tamagotchi-styles')) return;
  const el = document.createElement('style');
  el.id = 'tamagotchi-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
}

const LEVEL_NAMES = ['', '幼崽', '少年', '青年', '成年', '精英', '传说', '神话', '超越', '永恒', '创世'];

function getMoodColor(mood, hunger) {
  if (hunger < 15 || mood < 15) return { bg: 'rgba(160,160,170,0.45)', shadow: '0 2px 12px rgba(0,0,0,0.08)' };
  if (mood > 70) return { bg: 'rgba(66,214,164,0.55)', shadow: '0 4px 20px rgba(66,214,164,0.35)' };
  if (mood > 40) return { bg: 'rgba(120,200,240,0.50)', shadow: '0 4px 16px rgba(120,200,240,0.30)' };
  return { bg: 'rgba(180,190,210,0.40)', shadow: '0 2px 10px rgba(0,0,0,0.06)' };
}

export default function TamagotchiPet({ socketRef, roomId, user, showToast }) {
  const [pet, setPet] = useState({ hunger: 50, mood: 50, level: 1 });
  const [feeding, setFeeding] = useState(false);
  const [popText, setPopText] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const popTimer = useRef(null);
  const wrapRef = useRef(null);
  // 拖拽状态
  const dragRef = useRef({
    active: false,       // 是否正在拖拽（已超过阈值）
    startX: 0, startY: 0,
    accDx: 0, accDy: 0,  // 累计位移
    lastX: 0, lastY: 0,
  });

  useEffect(() => { injectStyles(); }, []);

  // 监听宠物状态
  useEffect(() => {
    const sock = socketRef?.current;
    if (!sock || !roomId) return;
    const handler = (data) => {
      if (data.roomId === roomId) setPet(data);
    };
    sock.on('petState', handler);
    sock.emit('petGetState', { roomId });
    return () => { sock.off('petState', handler); };
  }, [socketRef, roomId]);

  // ── 拖拽：用 transform 偏移，不改 position ──
  const applyTransform = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const { accDx, accDy } = dragRef.current;
    // 边界限制
    const parent = wrap.parentElement;
    if (parent) {
      const maxDx = parent.offsetWidth - wrap.offsetWidth - 8;
      const maxDy = parent.offsetHeight - wrap.offsetHeight - 8;
      dragRef.current.accDx = Math.max(-wrap.offsetLeft + 8, Math.min(maxDx, accDx));
      dragRef.current.accDy = Math.max(-wrap.offsetTop + 8, Math.min(maxDy, accDy));
    }
    wrap.style.transform = `translate(${dragRef.current.accDx}px, ${dragRef.current.accDy}px)`;
  }, []);

  const handlePointerDown = useCallback((e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.lastX = clientX;
    dragRef.current.lastY = clientY;
    dragRef.current.active = false;
    dragRef.current.pressed = true;
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const handleMove = (e) => {
      if (!dragRef.current.pressed) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;

      // 超过 4px 阈值才开始拖拽
      if (!dragRef.current.active) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        dragRef.current.active = true;
        setIsDragging(true);
      }

      e.preventDefault();
      dragRef.current.accDx += clientX - dragRef.current.lastX;
      dragRef.current.accDy += clientY - dragRef.current.lastY;
      dragRef.current.lastX = clientX;
      dragRef.current.lastY = clientY;
      applyTransform();
    };

    const handleUp = () => {
      dragRef.current.pressed = false;
      if (dragRef.current.active) {
        setIsDragging(false);
        dragRef.current.active = false;
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [applyTransform]);

  const showPop = useCallback((text) => {
    setPopText(text);
    clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPopText(null), 1000);
  }, []);

  const feed = useCallback((e) => {
    e.stopPropagation();
    if (feeding) return;
    setFeeding(true);
    socketRef?.current?.emit('petFeed', { roomId });
    showPop('🍎 饱食+20');
    setTimeout(() => setFeeding(false), 600);
  }, [socketRef, roomId, feeding, showPop]);

  const handleBodyClick = useCallback(() => {
    // 拖拽过就不触发抚摸
    if (dragRef.current.active) return;
    socketRef?.current?.emit('petPet', { roomId });
    showPop('✨ 心情+1');
  }, [socketRef, roomId, showPop]);

  if (!roomId) return null;

  const { hunger, mood, level } = pet;
  const isSleeping = hunger < 10 && mood < 10;
  const isHappy = mood > 60 && hunger > 15;
  const colors = getMoodColor(mood, hunger);
  const levelName = LEVEL_NAMES[Math.min(level, 10)] || `Lv.${level}`;

  const bodyStyle = {
    background: colors.bg,
    boxShadow: colors.shadow,
    animation: isDragging
      ? 'jelly-drag 0.8s ease-in-out infinite'
      : isSleeping
        ? 'jelly-sleep 3s ease-in-out infinite'
        : isHappy
          ? 'jelly-hop 1.2s ease-in-out infinite, jelly-breathe 4s ease-in-out infinite'
          : 'jelly-breathe 5s ease-in-out infinite',
    backdropFilter: 'blur(6px)',
    border: '1px solid rgba(255,255,255,0.3)',
    transition: isDragging ? 'none' : 'background 0.6s, box-shadow 0.6s',
  };

  return (
    <div className="tamagotchi-wrap" ref={wrapRef}>
      <div
        className={`tamagotchi-body${isDragging ? ' dragging' : ''}`}
        style={bodyStyle}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={handleBodyClick}
        title="拖拽移动 · 点击抚摸 · 按钮投喂"
      >
        <div className="tamagotchi-face">
          <div className="tamagotchi-eyes">
            <div className={`tamagotchi-eye${isSleeping ? ' sleepy' : ''}`} />
            <div className={`tamagotchi-eye${isSleeping ? ' sleepy' : ''}`} />
          </div>
          <div className={`tamagotchi-mouth${isSleeping ? ' sleep' : isHappy ? '' : ' sad'}`} />
        </div>
        {isSleeping && <span className="tamagotchi-zzz">💤</span>}
        {popText && <span className="tamagotchi-pop">{popText}</span>}
        {feeding && <span style={{ position: 'absolute', inset: 0, animation: 'feed-burst 0.4s ease', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />}
      </div>
      <div className="tamagotchi-stats">
        <span className="tamagotchi-stat">❤️{mood}</span>
        <span className="tamagotchi-stat">🍎{hunger}</span>
        <span className="tamagotchi-stat">⭐{levelName}</span>
      </div>
      <button className="tamagotchi-feed-btn" onClick={feed}>投喂</button>
    </div>
  );
}
