// 中栏坏结局缩略卡 — 顶视图左/中栏选中态行
// 与 RescueOverviewRow 同款样式规则:default/hover/related/selected 四态
import { memo, useState } from 'react';
import type { BadEnding } from '../../../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  ending: BadEnding;
  boundCount: number;
  selected: boolean;
  related: boolean;
  onClick: () => void;
}

function DiamondIcon(): React.ReactElement {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden style={{ flexShrink: 0 }}>
      <polygon points="5,0 10,5 5,10 0,5" fill="var(--gold)" />
    </svg>
  );
}

export const BadEndingOverviewRow = memo(function BadEndingOverviewRow({
  ending,
  boundCount,
  selected,
  related,
  onClick,
}: Props): React.ReactElement {
  const [hover, setHover] = useState(false);

  const borderColor = selected
    ? 'var(--gold)'
    : hover
      ? 'rgba(196,168,85,0.55)'
      : related
        ? 'rgba(196,168,85,0.35)'
        : 'transparent';

  const background = selected
    ? 'rgba(196,168,85,0.15)'
    : hover
      ? 'rgba(196,168,85,0.08)'
      : related
        ? 'rgba(196,168,85,0.04)'
        : 'transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 2,
        margin: '0 0 6px 0',
        border: `1px solid ${borderColor}`,
        background,
        transition: `background 200ms ${EASE}, border-color 200ms ${EASE}, transform 200ms ${EASE}`,
        transform: hover && !selected ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'baseline', width: '100%' }}>
        <DiamondIcon />
        <span
          style={{
            fontSize: 13,
            color: 'var(--gold)',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ending.id}
        </span>
        {boundCount > 0 && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--gold)',
              padding: '1px 6px',
              background: 'rgba(196,168,85,0.1)',
              border: '1px solid rgba(196,168,85,0.35)',
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            {`${boundCount}·路径`}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-light, #d0c2a0)',
          opacity: 0.7,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {ending.condition}
      </div>
    </button>
  );
});
