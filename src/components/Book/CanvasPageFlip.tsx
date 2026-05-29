import { useRef, useLayoutEffect } from 'react';

const THEMES = {
  dark: {
    front: [10, 8, 8] as const,
    mid: [18, 16, 12] as const,
    back: [14, 12, 10] as const,
  },
  parchment: {
    front: [244, 228, 193] as const,
    mid: [232, 213, 163] as const,
    back: [212, 196, 160] as const,
  },
};

type Theme = keyof typeof THEMES;

interface Props {
  theme: Theme;
  duration?: number;
  onComplete: () => void;
}

const STRIPS = 30;
const SPINE_W = 2;

function rgb(c: readonly [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function CanvasPageFlip({ theme, duration = 800, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: w, height: h } = parent.getBoundingClientRect();
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const c = THEMES[theme];
    const pageW = (w - SPINE_W) / 2;
    const rightX = pageW + SPINE_W;
    const stripW = pageW / STRIPS;

    function render(t: number) {
      ctx.clearRect(0, 0, w, h);

      // ── Left page: fade out ──
      const la = Math.max(0, 1 - t * 1.4);
      if (la > 0.002) {
        ctx.globalAlpha = la;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(c.front));
        g.addColorStop(0.5, rgb(c.mid));
        g.addColorStop(1, rgb(c.front));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, pageW, h);
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(pageW, 0, SPINE_W, h);
        ctx.globalAlpha = 1;
      }

      // ── Right page: cylindrical curl ──
      const fold = pageW * (1 - t);
      const R = pageW * Math.max(0.06, 0.28 - 0.18 * t);

      // Flat portion (not yet curled)
      if (fold > 0.5) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgb(c.front));
        g.addColorStop(0.5, rgb(c.mid));
        g.addColorStop(1, rgb(c.front));
        ctx.fillStyle = g;
        ctx.fillRect(rightX, 0, fold, h);
      }

      // Shadow cast on revealed page (right of fold)
      if (t > 0.02) {
        const fx = rightX + fold;
        const sw = Math.min(35, pageW * 0.12);
        const sg = ctx.createLinearGradient(fx, 0, fx + sw, 0);
        sg.addColorStop(0, `rgba(0,0,0,${(0.18 * (1 - t * 0.5)).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(fx, 0, sw, h);
      }

      // Fold-line shadow on flat portion
      if (fold > 2 && t > 0.02 && t < 0.95) {
        const fx = rightX + fold;
        const sw = Math.min(20, pageW * 0.06);
        const sg = ctx.createLinearGradient(fx - sw, 0, fx, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0)');
        sg.addColorStop(1, `rgba(0,0,0,${(0.12 * (1 - t * 0.3)).toFixed(3)})`);
        ctx.fillStyle = sg;
        ctx.fillRect(fx - sw, 0, sw, h);
      }

      // Build curl strips
      const buf: { x: number; w: number; r: number; g: number; b: number }[] = [];
      for (let i = 0; i < STRIPS; i++) {
        const ox = (i + 0.5) * stripW;
        if (ox <= fold) continue;
        const angle = (ox - fold) / R;
        if (angle > Math.PI) continue;
        const sw = stripW * Math.abs(Math.cos(angle));
        if (sw < 0.3) continue;

        const front = angle < Math.PI / 2;
        const lit = front
          ? 0.7 + 0.3 * Math.cos(angle)
          : 0.25 + 0.15 * Math.abs(Math.cos(angle));
        const base = front ? c.front : c.back;

        buf.push({
          x: rightX + fold - R * Math.sin(angle) - sw / 2,
          w: sw,
          r: Math.round(base[0] * lit),
          g: Math.round(base[1] * lit),
          b: Math.round(base[2] * lit),
        });
      }

      // Paint far-to-near (painter's algorithm)
      for (let i = buf.length - 1; i >= 0; i--) {
        const s = buf[i];
        ctx.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
        ctx.fillRect(s.x, 0, s.w, h);
      }

      // Curl-tip shadow on revealed page
      if (t > 0.05 && t < 0.95) {
        const tipX = rightX + fold - R;
        if (tipX > rightX) {
          const sw = R * 0.3;
          const sg = ctx.createLinearGradient(tipX, 0, tipX + sw, 0);
          sg.addColorStop(0, `rgba(0,0,0,${(0.07 * (1 - t * 0.3)).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(tipX, 0, sw, h);
        }
      }
    }

    // First frame synchronously (before browser paint — no flash)
    render(0);

    let start: number | null = null;
    let id = 0;
    function loop(ts: number) {
      if (!start) start = ts;
      const raw = Math.min(1, (ts - start) / duration);
      render(ease(raw));
      if (raw < 1) id = requestAnimationFrame(loop);
      else cbRef.current();
    }
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [theme, duration]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
    />
  );
}
