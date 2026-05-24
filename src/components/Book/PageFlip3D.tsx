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
 * [FlipCard] A physical paper page that rotates around the spine.
 *
 * Structure:
 *   FlipCard (outer, rotates)         ← 3D旋转容器
 *   ├─ FlipFront (front face)         ← 正面：当前内容+纸底
 *   └─ FlipBack (back face, 180°)     ← 背面：空白纸色
 */
export function CSSFlipPage({ progress, direction, children }: CSSFlipProps) {
  const p = stagedProgress(Math.max(0, Math.min(1, progress)));
  const isForward = direction === 'forward';
  const rotateY = isForward ? -p * 180 : p * 180;
  const originX = isForward ? '0%' : '100%';
  const radius = isForward ? '0 3px 3px 0' : '3px 0 0 3px';
  const textOpacity = Math.max(0.08, 1 - p * 1.8);

  return (
    <div
      data-flip="card"
      style={{
        flex: 1, display: 'flex', position: 'relative',
        transformOrigin: `${originX} 50%`,
        transform: `perspective(${FLIP_CONFIG.PERSPECTIVE}px) rotateY(${rotateY}deg)`,
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
          overflow: 'hidden', display: 'flex',
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

// ── Blank paper placeholder (no text, just solid paper) ──

/**
 * [Placeholder] Static blank paper shown on the opposite side during a flip.
 * No text, just solid paper color.
 */
export function BlankPaper({ side }: { side: 'left' | 'right' }) {
  const radius = side === 'left' ? '3px 0 0 3px' : '0 3px 3px 0';
  return (
    <div
      data-flip="placeholder"
      data-side={side}
      style={{
        flex: 1, background: PLACEHOLDER_BG, borderRadius: radius,
      }}
    />
  );
}
