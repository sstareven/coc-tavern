// ── Tunable parameters ──
export const FLIP_CONFIG = {
  TOTAL: 1500,
};

const STRIP_COUNT = 6;
const MAX_BEND = 18;

// ── Smooth easing ──
export function stagedProgress(rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ── Bezier curve helpers ──

function cubicBezier(t: number, p1: number, p2: number): number {
  return 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
}

function solveBezier(x: number, x1: number, x2: number, y1: number, y2: number): number {
  let t = x;
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

function easeOutFade(raw: number): number {
  if (raw <= 0) return 1;
  if (raw >= 0.5) return 0;
  return 1 - solveBezier(raw / 0.5, 0.5, 0.8, 0, 0.2);
}

// ── Paper backgrounds ──
const FRONT_BG = 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)';
const BACK_BG = 'linear-gradient(135deg, #d8c89a 0%, #c4b080 100%)';

// ── 3D multi-strip page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
}

export function CSSFlipPage({ progress, direction, children }: CSSFlipProps) {
  const raw = Math.max(0, Math.min(1, progress));
  const p = stagedProgress(raw);
  const isForward = direction === 'forward';
  const originX = isForward ? '0%' : '100%';
  const radius = isForward ? '0 3px 3px 0' : '3px 0 0 3px';
  const shiftX = isForward ? -p * 100 : p * 100;
  const textOpacity = easeOutFade(raw);

  const baseAngle = isForward ? -p * 180 : p * 180;
  const bendAmount = Math.sin(raw * Math.PI) * MAX_BEND;

  const shadowIntensity = Math.sin(raw * Math.PI) * 0.12;

  return (
    <div
      data-flip="card"
      style={{
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `translateX(${shiftX}%)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
      }}
    >
      {Array.from({ length: STRIP_COUNT }, (_, i) => {
        const t = STRIP_COUNT > 1 ? i / (STRIP_COUNT - 1) : 0;
        const stripFactor = Math.pow(t, 1.4);
        const stripBend = stripFactor * bendAmount;
        const stripAngle = baseAngle + (isForward ? -stripBend : stripBend);

        const leftPct = (i / STRIP_COUNT) * 100;
        const rightPct = ((STRIP_COUNT - i - 1) / STRIP_COUNT) * 100;

        const stripShadow = stripFactor * shadowIntensity;

        return (
          <div
            key={i}
            style={{
              position: 'absolute', inset: 0,
              clipPath: `inset(0 ${rightPct}% 0 ${leftPct}%)`,
              transformOrigin: `${originX} 50%`,
              transform: `rotateY(${stripAngle}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'none',
            }}
          >
            {/* Front face */}
            <div
              data-flip="front"
              style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden',
                background: FRONT_BG, borderRadius: radius,
              }}
            >
              <div style={{ flex: 1, display: 'flex', opacity: textOpacity, transition: 'none', height: '100%' }}>
                {children}
              </div>
              {/* Lighting/shadow overlay on front face */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `linear-gradient(${isForward ? 'to right' : 'to left'}, rgba(0,0,0,${stripShadow}) 0%, transparent 80%)`,
                borderRadius: radius,
                transition: 'none',
              }} />
            </div>

            {/* Back face */}
            <div
              data-flip="back"
              style={{
                position: 'absolute', inset: 0,
                transform: 'rotateY(180deg)',
                backfaceVisibility: 'hidden',
                background: BACK_BG,
                borderRadius: radius,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Shadow cast on the opposite page during flip ──

interface FlipShadowProps {
  progress: number;
  side: 'left' | 'right';
}

export function FlipShadow({ progress, side }: FlipShadowProps) {
  const intensity = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * 0.15;
  const gradientDir = side === 'left' ? 'to left' : 'to right';
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
      background: `linear-gradient(${gradientDir}, rgba(0,0,0,${intensity}) 0%, transparent 50%)`,
      transition: 'none',
    }} />
  );
}

// ── Static fading page (opposite side, fades out) ──

interface FadingPageProps {
  progress: number;
  children: React.ReactNode;
}

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
