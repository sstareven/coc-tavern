// 总览右栏 — 暗线 phase 缩略卡(~52px), memo;无 related。
// hover/pressed 都走 useState, 避免 DOM mutation 与 selected 切换时样式残留。
import { memo, useCallback, useState } from 'react';
import type { DarkPhase } from '../../../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  phase: DarkPhase;
  selected: boolean;
  onSelect: (id: string) => void;
}

export const DarkPhaseOverviewRow = memo(function DarkPhaseOverviewRow({
  phase,
  selected,
  onSelect,
}: Props): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const handleClick = useCallback(() => onSelect(phase.id), [onSelect, phase.id]);
  const triggersText = phase.triggers.join('  ·  ');
  const title = phase.title || phase.id;

  const background = selected
    ? 'rgba(196,168,85,0.14)'
    : hover
      ? 'rgba(196,168,85,0.08)'
      : 'transparent';

  const borderColor = selected
    ? 'rgba(196,168,85,0.55)'
    : hover
      ? 'rgba(196,168,85,0.35)'
      : 'transparent';

  const boxShadow = selected
    ? 'inset 0 0 0 1px rgba(196,168,85,0.5)'
    : hover && !pressed
      ? '0 4px 12px rgba(0,0,0,0.4)'
      : 'none';

  const transform = pressed
    ? 'translateY(0) scale(0.97)'
    : hover && !selected ? 'translateY(-1px)' : 'translateY(0)';

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      aria-current={selected || undefined}
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
        border: `1px solid ${borderColor}`,
        background,
        boxShadow,
        transform,
        color: 'inherit',
        font: 'inherit',
        transition: `background 200ms ${EASE}, border-color 200ms ${EASE}, transform 200ms ${EASE}, box-shadow 200ms ${EASE}`,
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
