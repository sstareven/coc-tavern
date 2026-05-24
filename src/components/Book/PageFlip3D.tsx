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
const paperBgBack = 'linear-gradient(180deg, #e8d8b8 0%, #dfceaa 50%, #d8c098 100%)';

// ── Shared fade curve: symmetric in/out ──

/** Text on flipping page fades OUT: 1 at p=0 → 0 at p=0.5 */
function fadeOut(p: number): number {
  return Math.max(0, 1 - p * 2);
}

/** Text on revealed page fades IN: 0 at p=0.5 → 1 at p=1 */
function fadeIn(p: number): number {
  return Math.max(0, Math.min(1, (p - 0.5) * 2));
}

// ── 3D double-sided page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
}

/**
 * Pure 3D card rotating around spine. No static backing — everything rotates.
 * Front face + back face both have paper backgrounds and move together.
 */
export function CSSFlipPage({ progress, direction, children }: CSSFlipProps) {
  const p = stagedProgress(progress);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';
  const radius = isForward ? '0 4px 4px 0' : '4px 0 0 4px';

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {/* 3D card — everything inside rotates together */}
      <div style={{
        position: 'absolute', inset: 0,
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
      }}>
        {/* ── Front face ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          background: paperBg,
          borderRadius: radius,
          overflow: 'hidden',
          display: 'flex',
        }}>
          <div style={{ flex: 1, opacity: fadeOut(p), transition: 'none' }}>
            {children}
          </div>
        </div>

        {/* ── Back face (pre-rotated 180°) ── */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          background: paperBgBack,
          borderRadius: radius,
        }} />
      </div>
    </div>
  );
}

// ── Revealed page (fades in on opposite side, matches flip rate) ──

interface FadeInProps {
  progress: number;
  children: React.ReactNode;
}

/**
 * Adjacent page on opposite side. Paper is always solid, only text fades in.
 * Uses the same symmetric fade rate as the flipping page.
 */
export function FadeInPage({ progress, children }: FadeInProps) {
  const p = stagedProgress(progress);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
      background: paperBg, borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: fadeIn(p), transition: 'none' }}>
        {children}
      </div>
    </div>
  );
}
