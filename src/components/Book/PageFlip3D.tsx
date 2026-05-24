// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 600,
  PERSPECTIVE: 1400,
};

// ── Smooth easing (compact for short duration) ──
export function stagedProgress(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  // Cubic ease-in-out — smooth acceleration then deceleration
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── Paper background ──
const paperBg = 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-deep) 50%, #e0cda0 100%)';

// ── Flipping page ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Rotating page with SOLID paper backing behind it.
 * When the page rotates past 90°, the paper backing fills the gap.
 */
export function CSSFlipPage({ progress, direction, children, style }: CSSFlipProps) {
  const p = stagedProgress(progress);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';
  const textOpacity = Math.max(0, 1 - p * 3);

  return (
    <div style={{ ...style, flex: 1, position: 'relative', overflow: 'hidden' }}>
      {/* ── Static paper backing — always visible, fills the void when flipping page rotates away ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: paperBg,
        borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
      }} />

      {/* ── Rotating page ── */}
      <div style={{
        position: 'absolute', inset: 0,
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        backfaceVisibility: 'hidden' as const,
        transition: 'none',
        zIndex: 2,
        background: paperBg,
        borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
        display: 'flex',
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, opacity: textOpacity, transition: 'none' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Revealed page (fade in on opposite side) ──

interface FadeInProps {
  progress: number;
  children: React.ReactNode;
}

export function FadeInPage({ progress, children }: FadeInProps) {
  const p = stagedProgress(progress);
  const textOpacity = p < 0.4 ? 0 : Math.min(1, (p - 0.4) / 0.35);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
      background: paperBg,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: textOpacity, transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}
