// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1500,
};

// ── Smooth easing ──
export function stagedProgress(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── Paper backgrounds ──
const FRONT_BG = 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)';
const BACK_BG = 'linear-gradient(225deg, #e8d8b8 0%, #dfceaa 100%)';
const PLACEHOLDER_BG = 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)';

// ── 3D page flip component ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
}

/**
 * [FlipCard] Physical page rotating around the spine.
 * Parent book container provides perspective; this card just rotates on Y axis.
 *
 * Forward: origin at left edge (right page flips to left), rotateY 0→-180
 * Backward: origin at right edge (left page flips to right), rotateY 0→180
 */
export function CSSFlipPage({ progress, direction, children }: CSSFlipProps) {
  const raw = Math.max(0, Math.min(1, progress));
  const p = stagedProgress(raw);
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';
  const radius = isForward ? '0 3px 3px 0' : '3px 0 0 3px';

  // Text vanishes by raw=0.5 (90° vertical — page edge-on to viewer)
  const textOpacity = Math.max(0, 1 - raw / 0.5);

  return (
    <div
      data-flip="card"
      style={{
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
      }}
    >
      {/* [FlipFront] */}
      <div
        data-flip="front"
        style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          background: FRONT_BG, borderRadius: radius,
          display: 'flex',
        }}
      >
        <div style={{ flex: 1, display: 'flex', opacity: textOpacity, transition: 'none' }}>
          {children}
        </div>
      </div>

      {/* [FlipBack] */}
      <div
        data-flip="back"
        style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          background: BACK_BG, borderRadius: radius,
        }}
      />
    </div>
  );
}

// ── Static fading page (opposite side, fades out) ──

interface FadingPageProps {
  progress: number;
  children: React.ReactNode;
}

/**
 * Non-rotating page that fades out its text during the flip.
 * Paper stays solid, only text content fades.
 */
export function FadingPage({ progress, children }: FadingPageProps) {
  const raw = Math.max(0, Math.min(1, progress));
  const textOpacity = Math.max(0, 1 - raw / 0.5);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: textOpacity, transition: 'none' }}>
      {children}
    </div>
  );
}

// ── Content fade-in after flip completes ──

interface AppearProps {
  pageIndex: number;
  children: React.ReactNode;
}

/**
 * Fades in page content after a page turn completes.
 * Uses key on pageIndex to trigger re-mount animation.
 */
export function AppearPage({ pageIndex, children }: AppearProps) {
  return (
    <div
      key={pageIndex}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        animation: 'pageFadeIn 0.8s ease-out',
      }}
    >
      <style>{`
        @keyframes pageFadeIn {
          from { opacity: 0.3; }
          to   { opacity: 1; }
        }
      `}</style>
      {children}
    </div>
  );
}
