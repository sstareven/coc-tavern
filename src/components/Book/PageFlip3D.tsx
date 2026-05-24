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

// ── Shared paper backgrounds ──
const FRONT_BG = 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)';
const BACK_BG = 'linear-gradient(180deg, #e8d8b8 0%, #dfceaa 50%, #d8c098 100%)';

// ── Synchronized fade (same p value, same curve, just mirrored) ──
function textFadeOut(p: number): number {
  // 1 → 0 over p=0→0.5
  return Math.max(0, 1 - p * 2);
}
function textFadeIn(p: number): number {
  // 0 → 1 over p=0.5→1
  return Math.max(0, Math.min(1, (p - 0.5) * 2));
}

// ── CSS page flip ──

interface CSSFlipProps {
  progress: number;
  direction: 'forward' | 'backward';
  children: React.ReactNode;
}

/**
 * Page that flips around the spine:
 * - Outer div fills full flex area with paper color
 * - Static paper backing layer stays flat (always visible)
 * - 3D rotating card on top: front face + back face
 * - When front face passes 90°, backing + back face provide seamless paper fill
 */
export function CSSFlipPage({ progress, direction, children }: CSSFlipProps) {
  const p = stagedProgress(Math.max(0, Math.min(1, progress)));
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';
  const radius = isForward ? '0 3px 3px 0' : '3px 0 0 3px';
  const opacity = textFadeOut(p);

  return (
    <div style={{ flex: 1, display: 'flex', position: 'relative', background: FRONT_BG, borderRadius: radius, overflow: 'hidden' }}>
      {/* Layer 0: static paper backing — always flat, always fills full area */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: FRONT_BG, borderRadius: radius,
      }} />

      {/* Layer 1: rotating 3D card */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'none',
      }}>
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          background: FRONT_BG, borderRadius: radius,
          overflow: 'hidden', display: 'flex',
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity, transition: 'none' }}>
            {children}
          </div>
        </div>

        {/* Back face — pre-rotated, appears as card flips past 90° */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          background: BACK_BG, borderRadius: radius,
        }} />
      </div>
    </div>
  );
}

// ── Revealed adjacent page ──

interface FadeInProps {
  progress: number;
  children: React.ReactNode;
}

/**
 * Opposite-side page that's revealed as the flipping page moves away.
 * Paper always solid, text fades in at the same rate the flip page fades out.
 */
export function FadeInPage({ progress, children }: FadeInProps) {
  const p = stagedProgress(Math.max(0, Math.min(1, progress)));
  const opacity = textFadeIn(p);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', position: 'relative',
      background: FRONT_BG, borderRadius: 3, overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: FRONT_BG, borderRadius: 3,
      }} />
      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1, display: 'flex', flexDirection: 'column',
        opacity, transition: 'none',
      }}>
        {children}
      </div>
    </div>
  );
}
