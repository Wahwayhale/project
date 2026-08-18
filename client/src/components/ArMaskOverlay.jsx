import React, { useRef, useEffect, useState, useCallback } from 'react';

/* ── 霓虹颜色 ── */
const NEON_GREEN = '#42d6a4';
const NEON_BLUE = '#00d4ff';
const NEON_PINK = '#ff6ec7';
const GLOW_GREEN = 'rgba(66, 214, 164, 0.6)';
const GLOW_BLUE = 'rgba(0, 212, 255, 0.5)';

/* ── Face Landmarker 关键点连接定义 ── */
// 脸部轮廓 (oval)
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
// 左眼
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
// 右眼
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
// 左眉毛
const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 70];
// 右眉毛
const RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276, 300];
// 嘴唇外轮廓
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];

/* ── 绘制连接线 ── */
function drawConnections(ctx, landmarks, indices, color, lineWidth = 1.5, glow = true) {
  if (!landmarks || landmarks.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  for (let i = 0; i < indices.length; i++) {
    const pt = landmarks[indices[i]];
    if (!pt) continue;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();
}

/* ── 绘制赛博墨镜 ── */
function drawCyberGlasses(ctx, landmarks, w, h) {
  if (!landmarks || landmarks.length === 0) return;

  const leftEyeCenter = landmarks[159];  // 左眼中心附近
  const rightEyeCenter = landmarks[386]; // 右眼中心附近
  const noseBridge = landmarks[6];       // 鼻梁
  if (!leftEyeCenter || !rightEyeCenter || !noseBridge) return;

  const eyeDist = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y);
  const lensW = eyeDist * 0.55;
  const lensH = eyeDist * 0.35;
  const bridgeY = noseBridge.y * h;

  ctx.save();

  // 镜片发光背景
  const drawLens = (cx, cy) => {
    const x = cx * w - lensW * w / 2;
    const y = cy * h - lensH * h / 2;
    const lw = lensW * w;
    const lh = lensH * h;

    // 外发光
    ctx.shadowColor = NEON_BLUE;
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(x, y, lw, lh, lh * 0.3);
    ctx.fill();

    // 镜片边框
    ctx.shadowBlur = 12;
    ctx.strokeStyle = NEON_BLUE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内部渐变
    ctx.shadowBlur = 0;
    const grad = ctx.createLinearGradient(x, y, x, y + lh);
    grad.addColorStop(0, 'rgba(0, 212, 255, 0.25)');
    grad.addColorStop(1, 'rgba(66, 214, 164, 0.1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, lw - 4, lh - 4, lh * 0.25);
    ctx.fill();
  };

  drawLens(leftEyeCenter.x, leftEyeCenter.y);
  drawLens(rightEyeCenter.x, rightEyeCenter.y);

  // 鼻梁连接线
  ctx.shadowColor = NEON_GREEN;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = NEON_GREEN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftEyeCenter.x * w + lensW * w * 0.4, bridgeY);
  ctx.lineTo(rightEyeCenter.x * w - lensW * w * 0.4, bridgeY);
  ctx.stroke();

  // 两侧延伸线（镜腿）
  const drawTemple = (cx, cy, dir) => {
    const startX = dir === -1 ? cx * w - lensW * w / 2 : cx * w + lensW * w / 2;
    const startY = cy * h;
    ctx.shadowColor = NEON_PINK;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = NEON_PINK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + dir * lensW * w * 0.4, startY - lensH * h * 0.1);
    ctx.stroke();
  };
  drawTemple(leftEyeCenter.x, leftEyeCenter.y, -1);
  drawTemple(rightEyeCenter.x, rightEyeCenter.y, 1);

  ctx.restore();
}

/* ── 绘制关键点（调试用，可选） ── */
function drawLandmarkDots(ctx, landmarks, w, h, color = NEON_GREEN) {
  if (!landmarks) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;
  for (const pt of landmarks) {
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ── 加载 MediaPipe ── */
let faceLandmarker = null;
let loadingPromise = null;

async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const { FaceLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    return faceLandmarker;
  })();

  return loadingPromise;
}

/* ── AR 面具组件 ── */
export default function ArMaskOverlay({ videoStream, enabled }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !videoStream) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 创建隐藏 video 元素接收流
    const video = document.createElement('video');
    video.srcObject = videoStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    videoRef.current = video;

    let landmarker = null;
    let stopped = false;

    const startDetection = async () => {
      try {
        landmarker = await loadFaceLandmarker();
        if (stopped) return;
        setLoading(false);

        // 等 video 有尺寸
        await new Promise((resolve) => {
          if (video.videoWidth > 0) return resolve();
          video.onloadeddata = resolve;
        });

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const draw = () => {
          if (stopped) return;
          rafRef.current = requestAnimationFrame(draw);

          if (video.readyState < 2) return;
          if (video.currentTime === lastTimeRef.current) return;
          lastTimeRef.current = video.currentTime;

          const w = canvas.width;
          const h = canvas.height;

          // 绘制视频帧
          ctx.drawImage(video, 0, 0, w, h);

          // 检测人脸
          let results;
          try {
            results = landmarker.detectForVideo(video, performance.now());
          } catch {
            return;
          }

          if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) return;

          const landmarks = results.faceLandmarks[0]; // 取第一个人脸

          // 绘制霓虹轮廓线
          drawConnections(ctx, landmarks, FACE_OVAL, NEON_GREEN, 1.5);
          drawConnections(ctx, landmarks, LEFT_BROW, NEON_PINK, 1.2);
          drawConnections(ctx, landmarks, RIGHT_BROW, NEON_PINK, 1.2);
          drawConnections(ctx, landmarks, LIPS_OUTER, NEON_BLUE, 1, false);

          // 绘制赛博墨镜
          drawCyberGlasses(ctx, landmarks, w, h);
        };

        draw();
      } catch (err) {
        console.error('[AR Mask] 加载失败:', err);
        setError(err.message || '模型加载失败');
        setLoading(false);
      }
    };

    startDetection();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
    };
  }, [enabled, videoStream]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="ar-mask-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        pointerEvents: 'none',
        borderRadius: 'inherit',
        background: 'transparent',
      }}
    />
  );
}
