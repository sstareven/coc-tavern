// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1500,
};

// ── Smooth easing ──
export function stagedProgress(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── Bezier curve helpers ──

/** Evaluate cubic-bezier(P1x,P1y, P2x,P2y) at input t */
function cubicBezier(t: number, p1: number, p2: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
}

/** Solve cubic-bezier x→y for a given input x using Newton-Raphson */
function solveBezier(x: number, x1: number, x2: number, y1: number, y2: number): number {
  let t = x; // initial guess
  for (let i = 0; i < 8; i++) {
    const dx = cubicBezier(t, x1, x2) - x;
    if (Math.abs(dx) < 0.001) break;
    const deriv = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(deriv) < 0.001) break;
    t -= dx / deriv;
    t = Math.max(0, Math.min(1, t));
  }
  return cubicBezier(t, y1, y2);
}

// fade-out: cubic-bezier(0.5, 0, 0.8, 0.2) — slow start, fast end, vanishes by 90°
function easeOutFade(raw: number): number {
  if (raw <= 0) return 1;
  if (raw >= 0.5) return 0;
  return 1 - solveBezier(raw / 0.5, 0.5, 0.8, 0, 0.2);
}

// fade-in: cubic-bezier(0.2, 0, 0.4, 1) — gentle ease-in
function easeInFade(raw: number): number {
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return solveBezier(raw, 0.2, 0.4, 0, 1);
}

// ── Paper backgrounds ──
const FRONT_BG = 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)';
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

  // Forward: page moves from right [B] toward left [A]; backward: opposite
  const shiftX = isForward ? -p * 100 : p * 100;

  // Text fades with bezier
  const textOpacity = easeOutFade(raw);

  return (
    <div
      data-flip="card"
      style={{
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `rotateY(${rotateY}deg) translateX(${shiftX}%)`,
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

      {/* [FlipBack] — transparent, shows container's paper color underneath */}
      <div
        data-flip="back"
        style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          borderRadius: radius,
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
  const textOpacity = easeOutFade(raw);
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
        animation: 'pageFadeIn 0.8s cubic-bezier(0.2,0,0.4,1)',
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
