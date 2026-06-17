import React, { useEffect, useRef } from 'react';

function makeDrop(width, height) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    len: 12 + Math.random() * 18,
    speed: 140 + Math.random() * 120,
    drift: 22 + Math.random() * 26,
    alpha: 0.16 + Math.random() * 0.18,
  };
}

export default function ContextThemeLayer({ rain }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!rain) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let drops = [];
    let splashes = [];
    let targets = [];
    let last = performance.now();
    let lastTargetRefresh = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.max(34, Math.floor((rect.width * rect.height) / 16000)));
      drops = Array.from({ length: count }, () => makeDrop(rect.width, rect.height));
    };

    const refreshTargets = () => {
      const rootRect = canvas.getBoundingClientRect();
      targets = Array.from(document.querySelectorAll('.messages-container .bubble')).slice(-80).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left - rootRect.left,
          right: rect.right - rootRect.left,
          top: rect.top - rootRect.top,
        };
      });
    };

    const splashAt = (x, y) => {
      for (let i = 0; i < 3; i += 1) {
        splashes.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 42,
          vy: -18 - Math.random() * 18,
          life: 0.36,
          maxLife: 0.36,
        });
      }
      if (splashes.length > 80) splashes = splashes.slice(-80);
    };

    const draw = (now) => {
      const rect = canvas.getBoundingClientRect();
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      if (now - lastTargetRefresh > 700) {
        refreshTargets();
        lastTargetRefresh = now;
      }

      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.lineCap = 'round';
      drops.forEach((drop) => {
        const prevY = drop.y;
        drop.x += drop.drift * dt;
        drop.y += drop.speed * dt;

        const hit = targets.find((target) => (
          drop.x >= target.left &&
          drop.x <= target.right &&
          prevY < target.top &&
          drop.y >= target.top
        ));
        if (hit) {
          splashAt(drop.x, hit.top);
          Object.assign(drop, makeDrop(rect.width, rect.height), { y: -20 });
        }

        if (drop.y > rect.height + 40 || drop.x > rect.width + 40) {
          Object.assign(drop, makeDrop(rect.width, rect.height), { y: -20 });
        }

        ctx.strokeStyle = `rgba(116, 185, 213, ${drop.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.drift * 0.08, drop.y + drop.len);
        ctx.stroke();
      });

      splashes = splashes.filter((splash) => splash.life > 0);
      splashes.forEach((splash) => {
        splash.life -= dt;
        splash.x += splash.vx * dt;
        splash.y += splash.vy * dt;
        splash.vy += 90 * dt;
        const alpha = Math.max(0, splash.life / splash.maxLife) * 0.22;
        ctx.strokeStyle = `rgba(116, 185, 213, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(splash.x - 3, splash.y);
        ctx.lineTo(splash.x + 3, splash.y + 1);
        ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    };

    resize();
    refreshTargets();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [rain]);

  if (!rain) return null;
  return <canvas ref={canvasRef} className="context-rain-canvas" aria-hidden="true" />;
}
