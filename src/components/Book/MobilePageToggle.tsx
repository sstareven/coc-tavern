// src/components/Book/MobilePageToggle.tsx
// 手机端浮层（库存/角色卡）顶部的左右页分段切换条——单列显示一页，点另一段切换，无需关闭重开。

export type Side = 'left' | 'right';

export function MobilePageToggle({ left, right, side, onSide }: {
  left: string;
  right: string;
  side: Side;
  onSide: (s: Side) => void;
}) {
  return (
    <div style={{
      flexShrink: 0, display: 'flex', gap: 6, padding: 8,
      background: 'rgba(13,10,7,0.55)', borderBottom: '1px solid rgba(196,168,85,0.15)',
    }}>
      {(['left', 'right'] as const).map((s) => {
        const active = side === s;
        return (
          <button
            key={s}
            onClick={() => onSide(s)}
            aria-pressed={active}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 6,
              border: `1px solid ${active ? 'var(--gold)' : 'rgba(196,168,85,0.25)'}`,
              background: active ? 'rgba(196,168,85,0.15)' : 'transparent',
              color: active ? 'var(--gold)' : 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2,
              cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
            onTouchStart={(e) => { if (!active) e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
            onTouchEnd={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            {s === 'left' ? left : right}
          </button>
        );
      })}
    </div>
  );
}
