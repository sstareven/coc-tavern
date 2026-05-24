// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1500,
  PERSPECTIVE: 1400,
};

// ── Smooth easing ──
export function stagedProgress(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── Paper background ──
const paperBg = 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-deep) 50%, #e0cda0 100%)';

// ── 3D double-sided page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * 3D page flip with front face + back face.
 * Front shows current content, back shows a blank paper face.
 * As the card rotates, front fades → back appears → creates a physical page-turn illusion.
 */
export function CSSFlipPage({ progress, direction, children, style }: CSSFlipProps) {
  const p = stagedProgress(progress);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';

  // Text on front face fades quickly as page turns
  const textOpacity = Math.max(0, 1 - p * 2.5);

  return (
    <div style={{ ...style, flex: 1, position: 'relative' }}>
      {/* Static paper backing — fills gap behind rotating page */}
      <div style={{
        position: 'absolute', inset: 0,
        background: paperBg,
        borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
      }} />

      {/* 3D card rotating around spine */}
      <div style={{
        position: 'absolute', inset: 0,
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
        zIndex: 3,
      }}>
        {/* ── Front face ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          background: paperBg,
          borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
          overflow: 'hidden',
          display: 'flex',
        }}>
          <div style={{ flex: 1, opacity: textOpacity, transition: 'none' }}>
            {children}
          </div>
        </div>

        {/* ── Back face (pre-rotated 180°) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          background: 'linear-gradient(180deg, #e8d8b8 0%, #dfceaa 50%, #d8c098 100%)',
          borderRadius: isForward ? '0 4px 4px 0' : '4px 0 0 4px',
        }} />
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
  const textOpacity = p < 0.4 ? 0 : Math.min(1, (p - 0.4) / 0.4);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
      background: paperBg, borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: textOpacity, transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}
