// 总览右栏 — 暗线 phase 缩略卡(~52px)。memo;无 related。
import { memo } from 'react';
import type { DarkPhase } from '../../../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  phase: DarkPhase;
  selected: boolean;
  onClick: () => void;
}

export const DarkPhaseOverviewRow = memo(function DarkPhaseOverviewRow({
  phase,
  selected,
  onClick,
}: Props): React.ReactElement {
  const triggersText = phase.triggers.join('  ·  ');
  const title = phase.title || phase.id;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => {
        if (selected) return;
        e.currentTarget.style.background = 'rgba(196,168,85,0.08)';
        e.currentTarget.style.borderColor = 'rgba(196,168,85,0.35)';
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
      style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 2,
        margin: '0 0 6px 0',
        border: selected ? '1px solid rgba(196,168,85,0.55)' : '1px solid transparent',
        background: selected ? 'rgba(196,168,85,0.14)' : 'transparent',
        color: 'inherit',
        transition: `background 200ms ${EASE}, border-color 200ms ${EASE}`,
        font: 'inherit',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: 'var(--gold)',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {phase.threshold}
        </div>
        <div
          style={{
            width: 24,
            height: 4,
            background: 'rgba(196,168,85,0.4)',
            borderRadius: 1,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 13,
            color: 'var(--gold)',
            letterSpacing: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-light)',
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {triggersText}
        </div>
      </div>
    </button>
  );
});
