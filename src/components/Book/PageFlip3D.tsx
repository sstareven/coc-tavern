// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1800,
  PERSPECTIVE: 1400,
};

// ── Smooth easing ──
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function stagedProgress(rawT: number): number {
  const s1 = rawT * rawT * (3 - 2 * rawT);
  const s2 = easeOutExpo(rawT);
  return s1 * 0.3 + s2 * 0.7;
}

// ── Paper background (always solid, never fades) ──

const paperBg = 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-deep) 50%, #e0cda0 100%)';

// ── Page containers ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Rotating page: paper stays solid, text fades out.
 */
export function CSSFlipPage({ progress, direction, children, style }: CSSFlipProps) {
  const p = stagedProgress(progress);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';

  // Only text fades — paper stays opaque
  const textOpacity = Math.max(0, 1 - p * 2.8);

  return (
    <div
      style={{
        ...style,
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        backfaceVisibility: 'hidden' as const,
        transition: 'none',
        zIndex: p > 0.01 && p < 0.99 ? 5 : 1,
        background: paperBg,
        borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
        overflow: 'hidden',
      }}
    >
      {/* Text layer — only this fades, paper underneath stays solid */}
      <div style={{ flex: 1, opacity: textOpacity, transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}

interface FadeInProps {
  progress: number;
  children: React.ReactNode;
}

/**
 * Revealed page: paper always visible, text fades in.
 */
export function FadeInPage({ progress, children }: FadeInProps) {
  const p = stagedProgress(progress);
  // Text fades in during second half, paper always solid
  const textOpacity = p < 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.45);

  return (
    <div style={{
      flex: 1, display: 'flex', position: 'relative',
      background: paperBg,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* Text layer — only this fades, paper stays solid */}
      <div style={{ flex: 1, opacity: textOpacity, transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}
