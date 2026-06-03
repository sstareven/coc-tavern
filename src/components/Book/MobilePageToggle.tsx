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
      background: '#14100b', borderBottom: '1px solid rgba(196,168,85,0.2)',
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
              border: `1px solid ${active ? 'var(--gold)' : 'rgba(196,168,85,0.3)'}`,
              background: active ? '#3a2f18' : '#1f1810',
              color: active ? 'var(--gold)' : 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 2,
              cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
            onTouchStart={(e) => { if (!active) e.currentTarget.style.background = '#2a2113'; }}
            onTouchEnd={(e) => { if (!active) e.currentTarget.style.background = '#1f1810'; }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#2a2113'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#1f1810'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {s === 'left' ? left : right}
          </button>
        );
      })}
    </div>
  );
}
