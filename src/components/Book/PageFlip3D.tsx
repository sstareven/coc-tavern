// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1080,
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

// ── CSS-only page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Wraps a page in a 3D flip container with:
 * - Solid paper background filling the ENTIRE area (no transparent gaps)
 * - Content that fades out as the page rotates away
 * - Preserve-3d disabled to keep the background flat
 */
export function CSSFlipPage({ progress, direction, children, style }: CSSFlipProps) {
  const p = stagedProgress(progress);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';

  // Content fades out in first half of the flip
  const contentOpacity = Math.max(0.05, 1 - p * 2.5);

  return (
    <div
      style={{
        ...style,
        flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        backfaceVisibility: 'hidden' as const,
        transition: 'none',
        zIndex: p > 0.01 && p < 0.99 ? 5 : 1,
        // Solid paper fill
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
        overflow: 'hidden',
      }}
    >
      {/* Solid paper fill layer — always opaque, fills bottom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-deep) 50%, #e0cda0 100%)',
      }} />

      {/* Content layer — fades out during flip */}
      <div style={{
        position: 'relative', flex: 1, display: 'flex', flexDirection: 'column',
        opacity: contentOpacity,
        transition: 'none',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Fade-in wrapper for revealed adjacent page ──

interface FadeInProps {
  progress: number;
  children: React.ReactNode;
}

/**
 * Fades in the adjacent page content as the flip reveals it.
 * Content starts hidden (0) and appears (1) as flip progresses past halfway.
 */
export function FadeInPage({ progress, children }: FadeInProps) {
  const p = stagedProgress(progress);
  // Fade in during second half of the flip
  const opacity = p < 0.45 ? 0 : Math.min(1, (p - 0.45) / 0.45);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      opacity,
      transition: 'none',
      // Solid paper background so revealed area isn't transparent
      background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* Paper fill */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-deep) 50%, #e0cda0 100%)',
      }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
