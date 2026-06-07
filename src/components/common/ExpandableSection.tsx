// 折叠展开容器 — 标题平铺，点击切换显示 children。默认行为由 caller 控制 expanded。
// 项目铜版风格：金边 + 三角箭头旋转 + cubic-bezier 过渡。
import type { ReactNode } from 'react';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface ExpandableSectionProps {
  title: string;
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function ExpandableSection({ title, hint, expanded, onToggle, children }: ExpandableSectionProps) {
  return (
    <div style={{
      border: '1px solid rgba(196,168,85,0.22)',
      borderRadius: 3,
      background: 'rgba(0,0,0,0.18)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        type="button"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 12px',
          background: expanded ? 'rgba(196,168,85,0.12)' : 'transparent',
          border: 'none',
          color: 'var(--gold)',
          fontFamily: 'var(--font-ui)', fontSize: 11.5, letterSpacing: 1.5,
          cursor: 'pointer',
          textAlign: 'left',
          transition: `background 200ms ${EASE}`,
        }}
        onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
        onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{
          display: 'inline-block', width: 10, textAlign: 'center',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: `transform 200ms ${EASE}`,
          color: 'rgba(196,168,85,0.7)',
        }}>▶</span>
        <span style={{ fontWeight: 500 }}>{title}</span>
        {hint && (
          <span style={{
            marginLeft: 8, fontSize: 10, color: 'rgba(196,168,85,0.55)',
            letterSpacing: 0.8, fontFamily: 'var(--font-ui)',
          }}>{hint}</span>
        )}
      </button>
      {expanded && (
        <div style={{
          padding: '10px 12px 12px',
          display: 'flex', flexDirection: 'column', gap: 10,
          borderTop: '1px solid rgba(196,168,85,0.18)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
