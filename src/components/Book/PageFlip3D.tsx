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

// ── Three-phase easing ──

function easeInQuad(t: number) { return t * t; }
function easeOutQuad(t: number) { return 1 - (1 - t) * (1 - t); }
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Maps raw 0→1 time to staged progress */
export function stagedProgress(rawT: number): number {
  if (rawT <= 0.26) return easeInQuad(rawT / 0.26) * 0.3;
  if (rawT <= 0.74) return 0.3 + easeInOutCubic((rawT - 0.26) / 0.48) * 0.45;
  return 0.75 + easeOutQuad((rawT - 0.74) / 0.26) * 0.25;
}

// ── Paper texture CSS ──

const PAPER_BG = `
  linear-gradient(135deg, #f4e4c1 0%, #ead5a8 40%, #e8d0a0 60%, #f2e0c0 100%)
`;

const PAPER_EDGE = `
  repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,100,60,0.03) 3px, rgba(139,100,60,0.03) 4px)
`;

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

// ── CSS-only fallback: full page flip without WebGL ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function CSSFlipPage({ progress, direction, children, style }: CSSFlipProps) {
  const isForward = direction === 'forward';
  const p = stagedProgress(progress);
  const rotateY = isForward ? -p * 170 : p * 170;
  const originX = isForward ? '0%' : '100%';
  const curl = Math.sin(p * Math.PI);
  const shadowX = (isForward ? 1 : -1) * curl * 24;
  const shadowAlpha = 0.1 + curl * 0.18;

  return (
    <div
      style={{
        ...style,
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        boxShadow: `${shadowX}px 2px ${curl * 16}px rgba(0,0,0,${shadowAlpha})`,
        backfaceVisibility: 'hidden' as const,
        transition: 'none',
        background: `${PAPER_BG}, ${PAPER_EDGE}`,
        borderRadius: '0 2px 2px 0',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}
