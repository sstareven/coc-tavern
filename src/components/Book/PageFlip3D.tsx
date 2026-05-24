import { useEffect, useRef, useState } from 'react';
import { useAudio } from '../../hooks/useAudio';

// ── Tunable parameters ──
export const FLIP_CONFIG = {
  /** Duration per stage in ms */
  STAGE_1: 280,   // initial curl (ease-in)
  STAGE_2: 480,   // main flip (cubic)
  STAGE_3: 320,   // settle (ease-out)
  TOTAL: 1080,
  /** Visual */
  PERSPECTIVE: 1400,
  CURL_SHADOW_INTENSITY: 0.25,
  PAPER_THICKNESS: 3,
};

// ── Smooth cubic bezier easing ──
// Equivalent to CSS cubic-bezier(0.4, 0.0, 0.2, 1.0) with gentle start

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Single smooth curve: slow start → accelerate → gentle settle */
export function stagedProgress(rawT: number): number {
  // Smoothstep-like curve with weighted blend
  const s1 = rawT * rawT * (3 - 2 * rawT); // smoothstep
  const s2 = easeOutExpo(rawT);             // exponential ease-out
  // Blend: 30% smoothstep + 70% expo for natural page turn feel
  return s1 * 0.3 + s2 * 0.7;
}

interface Props {
  direction: 'forward' | 'backward';
  onComplete: () => void;
  /** Callback each frame for the progress-driven shadow/transform on the book container */
  onProgress?: (p: number, curl: number) => void;
}

export function PageFlip3D({ direction, onComplete, onProgress }: Props) {
  const audio = useAudio();
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<'curl' | 'flip' | 'settle' | 'done'>('curl');

  useEffect(() => {
    audio.playFlip();
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(1, elapsed / FLIP_CONFIG.TOTAL);
      const p = stagedProgress(rawT);

      // Phase tracking for sound triggers
      if (p < 0.3) setPhase('curl');
      else if (p < 0.75) setPhase('flip');
      else if (p < 1) setPhase('settle');

      // U-curl intensity: peaks at mid-flip
      const curl = Math.sin(p * Math.PI) * (1 - Math.abs(p - 0.5) * 2);

      onProgress?.(p, curl);

      if (rawT < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPhase('done');
        onComplete();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [direction, onComplete, onProgress, audio]);

  return null; // renders nothing itself — drives parent via onProgress
}

// ── CSS style builder ──

/**
 * Build CSS properties for the flipping page element.
 * The page element should have `backface-visibility: hidden`.
 */
export function buildFlipStyle(
  progress: number,
  direction: 'forward' | 'backward',
  isLeft: boolean,
): React.CSSProperties {
  const isForward = direction === 'forward';
  const p = stagedProgress(Math.max(0, Math.min(1, progress)));

  // Forward: left page flips leftwards; Backward: right page flips rightwards
  const rotateY = isForward
    ? -p * 170
    : (1 - p) * 170 * (isLeft ? -1 : 1);

  const originX = isForward ? '0%' : '100%';

  // Shadow during curl
  const curl = Math.sin(p * Math.PI);
  const shadowX = (isForward ? 1 : -1) * curl * 30;
  const shadowBlur = curl * 20;
  const shadowAlpha = 0.12 + curl * 0.18;

  return {
    transformOrigin: `${originX} 50%`,
    transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
    boxShadow: `${shadowX}px 0 ${shadowBlur}px rgba(0,0,0,${shadowAlpha})`,
    backfaceVisibility: 'hidden',
    transition: 'none',
  };
}

/**
 * Build the U-curl overlay style — a gradient that simulates
 * the paper bending by darkening the bend region.
 */
export function buildCurlOverlayStyle(p: number): React.CSSProperties {
  const intensity = Math.sin(p * Math.PI) * FLIP_CONFIG.CURL_SHADOW_INTENSITY;
  const centerDark = intensity * 0.8;
  const edgeLight = intensity * 0.2;

  return {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
    background: `
      linear-gradient(
        90deg,
        rgba(0,0,0,${edgeLight}) 0%,
        rgba(0,0,0,${centerDark}) 30%,
        rgba(0,0,0,${centerDark}) 70%,
        rgba(0,0,0,${edgeLight}) 100%
      )
    `,
    opacity: p > 0 && p < 1 ? 1 : 0,
  };
}

// ── Double-sided page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  /** Content visible on the front face (visible at start) */
  front: React.ReactNode;
  /** Content visible on the back face (visible when flipped past 90°) */
  back: React.ReactNode;
  style?: React.CSSProperties;
}

export function CSSFlipPage({ progress, direction, front, back, style }: CSSFlipProps) {
  const p = stagedProgress(progress);

  // Forward: page rotates around its LEFT edge (spine side)
  // Backward: page rotates around its RIGHT edge (spine side)
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';

  return (
    <div
      style={{
        ...style,
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
        zIndex: p > 0.01 && p < 0.99 ? 5 : 1,
      }}
    >
      {/* Front face */}
      <div style={{
        position: 'absolute', inset: 0,
        backfaceVisibility: 'hidden' as const,
      }}>
        {front}
      </div>

      {/* Back face — pre-rotated 180° so it appears when the card flips */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: 'rotateY(180deg)',
        backfaceVisibility: 'hidden' as const,
      }}>
        {back}
      </div>
    </div>
  );
}
