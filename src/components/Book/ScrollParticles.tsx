import { useState, useRef, useCallback, useEffect } from 'react';

export function useScrollGlow() {
  const [edge, setEdge] = useState<'none' | 'top' | 'bottom'>('none');
  const [intensity, setIntensity] = useState(0);
  const [fading, setFading] = useState(false);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const now = performance.now();
    const dt = now - lastTime.current || 16;
    const dy = Math.abs(el.scrollTop - lastY.current);
    const speed = dy / dt;
    const dir = el.scrollTop > lastY.current ? 'bottom' : 'top';
    lastY.current = el.scrollTop;
    lastTime.current = now;

    const norm = Math.min(1, speed / 3);
    setEdge(dir);
    setIntensity(norm);
    setFading(false);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    stopTimer.current = setTimeout(() => {
      setFading(true);
      fadeTimer.current = setTimeout(() => { setEdge('none'); setFading(false); setIntensity(0); }, 600);
    }, 600);
  }, []);

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);
  return { edge, intensity, fading, onScroll };
}

const PARTICLE_COUNT = 14;

export function ScrollParticles({ edge, fading, intensity }: { edge: 'top' | 'bottom'; fading: boolean; intensity: number }) {
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      size: 3 + Math.random() * 4,
      duration: 1.0 + Math.random() * 0.8,
      delay: Math.random() * 0.4,
    }))
  );

  const isBottom = edge === 'bottom';
  const I = Math.max(0.15, intensity);
  const darkAlpha = (0.5 * I).toFixed(2);
  const darkAlpha2 = (0.2 * I).toFixed(2);
  const glowAlpha = (0.8 * I).toFixed(2);
  const glowShadowA = (0.5 * I).toFixed(2);
  const glowShadowB = (0.25 * I).toFixed(2);
  const lineH = Math.round(1 + 2 * I);

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 60, pointerEvents: 'none', zIndex: 2, overflow: 'hidden',
      opacity: fading ? 0 : 1, transition: 'opacity 0.6s ease-out',
      ...(isBottom ? { bottom: 0 } : { top: 0 }),
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, height: '100%',
        ...(isBottom ? { bottom: 0 } : { top: 0 }),
        background: isBottom
          ? `linear-gradient(to top, rgba(20,16,10,${darkAlpha}) 0%, rgba(20,16,10,${darkAlpha2}) 40%, transparent 100%)`
          : `linear-gradient(to bottom, rgba(20,16,10,${darkAlpha}) 0%, rgba(20,16,10,${darkAlpha2}) 40%, transparent 100%)`,
        transition: 'background 0.15s ease',
      }} />
      <div style={{
        position: 'absolute', left: '3%', right: '3%', height: lineH,
        ...(isBottom ? { bottom: 0 } : { top: 0 }),
        background: `linear-gradient(90deg, transparent 0%, rgba(196,168,85,${glowAlpha}) 30%, rgba(196,168,85,${glowAlpha}) 70%, transparent 100%)`,
        boxShadow: `0 0 ${Math.round(12 * I)}px rgba(196,168,85,${glowShadowA}), 0 0 ${Math.round(30 * I)}px rgba(196,168,85,${glowShadowB})`,
        animation: 'glowPulse 1.5s ease-in-out infinite alternate',
        transition: 'height 0.15s ease, box-shadow 0.15s ease',
      }} />
      {particles.map((p, idx) => {
        const show = idx < Math.ceil(PARTICLE_COUNT * I);
        if (!show) return null;
        const s = p.size * (0.6 + 0.4 * I);
        return (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.left}%`,
          ...(isBottom ? { bottom: 0 } : { top: 0 }),
          width: s, height: s, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(196,168,85,${I.toFixed(2)}) 0%, rgba(196,168,85,0) 60%)`,
          boxShadow: `0 0 ${Math.round(s * 3)}px rgba(196,168,85,${(0.6 * I).toFixed(2)}), 0 0 ${Math.round(s)}px rgba(255,220,120,${(0.4 * I).toFixed(2)})`,
          animation: `particleFloat${isBottom ? 'Up' : 'Down'} ${p.duration}s ease-out ${p.delay}s infinite`,
          opacity: 0,
        }} />
        );
      })}
      <style>{`
        @keyframes particleFloatUp {
          0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
          10% { opacity: 1; transform: translateY(-5px) scale(1); }
          60% { opacity: 0.7; }
          100% { transform: translateY(-55px) translateX(${Math.random() > 0.5 ? '' : '-'}${5 + Math.random() * 10}px) scale(0.3); opacity: 0; }
        }
        @keyframes particleFloatDown {
          0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
          10% { opacity: 1; transform: translateY(5px) scale(1); }
          60% { opacity: 0.7; }
          100% { transform: translateY(55px) translateX(${Math.random() > 0.5 ? '' : '-'}${5 + Math.random() * 10}px) scale(0.3); opacity: 0; }
        }
        @keyframes glowPulse {
          0% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}