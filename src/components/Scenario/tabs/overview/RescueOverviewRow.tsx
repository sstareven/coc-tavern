// 总览左栏 — 拯救路径缩略行(~64px)
// 进度甜甜圈 + 路径名 + 里程碑数 + 失败变体绑定状态 + 解锁提示
// 自定义 memo 比较:rescue 同字段(浅比较 + milestones 引用) + selected + related + failBad?.id
import { memo, useCallback, useMemo, useState } from 'react';
import type { BadEnding, RescueEnding } from '../../../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  rescue: RescueEnding;
  failBad: BadEnding | null;
  selected: boolean;
  related: boolean;
  onSelect: (id: string) => void;
}

interface DonutProps {
  progress: number;
}

const DONUT_RADIUS = 16;
const DONUT_CIRCUMFERENCE = Math.PI * 32;

function ProgressDonut({ progress }: DonutProps): React.ReactElement {
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = (1 - clamped) * DONUT_CIRCUMFERENCE;
  const pct = Math.round(clamped * 100);
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden>
        <g transform="rotate(-90 20 20)">
          <circle cx={20} cy={20} r={DONUT_RADIUS} fill="none" stroke="rgba(196,168,85,0.2)" strokeWidth={3} />
          <circle
            cx={20}
            cy={20}
            r={DONUT_RADIUS}
            fill="none"
            stroke="var(--gold, #c4a855)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={DONUT_CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: `stroke-dashoffset 220ms ${EASE}` }}
          />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: 'var(--gold, #c4a855)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: 0.5,
          pointerEvents: 'none',
        }}
      >
        {pct}
      </div>
    </div>
  );
}

function RescueOverviewRowImpl({ rescue, failBad, selected, related, onSelect }: Props): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  const progress = useMemo(() => {
    const sum = (rescue.milestones ?? []).reduce((acc, m) => acc + (Number.isFinite(m.delta) ? m.delta : 0), 0);
    return Math.min(1, sum / 100);
  }, [rescue.milestones]);

  const handleClick = useCallback(() => onSelect(rescue.id), [onSelect, rescue.id]);

  // 容器底色/边框 — selected 优先于 related,related 优先于 hover,hover 优先于 default
  const background = selected
    ? 'rgba(196,168,85,0.18)'
    : related
      ? 'rgba(196,168,85,0.12)'
      : hover
        ? 'rgba(40,28,16,0.7)'
        : 'rgba(20,14,8,0.4)';

  const border = selected
    ? '1px solid transparent'
    : related
      ? '1px solid rgba(196,168,85,0.55)'
      : '1px solid transparent';

  const borderLeft = selected ? '3px solid var(--gold, #c4a855)' : undefined;
  const boxShadow = selected
    ? 'inset 0 0 0 1px rgba(196,168,85,0.5)'
    : hover && !pressed
      ? '0 4px 12px rgba(0,0,0,0.4)'
      : 'none';
  const transform = pressed
    ? 'translateY(0) scale(0.97)'
    : hover && !selected ? 'translateY(-1px)' : 'translateY(0)';

  const milestoneCount = rescue.milestones?.length ?? 0;
  const displayName = (rescue.name && rescue.name.trim()) || rescue.id;

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
        width: '100%',
        padding: '10px 12px',
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 2,
        margin: '0 0 6px 0',
        border,
        borderLeft,
        background,
        boxShadow,
        transform,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        color: 'inherit',
        transition: `background 180ms ${EASE}, transform 180ms ${EASE}, box-shadow 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
    >
      <ProgressDonut progress={progress} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
          <span
            style={{
              fontSize: 13,
              color: 'var(--gold, #c4a855)',
              letterSpacing: 1,
              fontWeight: 500,
              fontFamily: 'var(--font-ui)',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-light, #d0c2a0)',
              opacity: 0.7,
              padding: '1px 6px',
              border: '1px solid rgba(196,168,85,0.3)',
              borderRadius: 2,
              flexShrink: 0,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 0.5,
            }}
          >
            {milestoneCount}·里程碑
          </span>
          {failBad ? (
            <span
              style={{
                fontSize: 11,
                color: '#d08585',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                letterSpacing: 0.3,
              }}
            >
              {`→ ${failBad.id}`}
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: '#d08585',
                opacity: 0.85,
                flexShrink: 0,
                fontFamily: 'var(--font-ui)',
                letterSpacing: 0.5,
              }}
            >
              未绑
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-light, #d0c2a0)',
            opacity: 0.7,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--font-ui)',
            letterSpacing: 0.3,
          }}
        >
          {rescue.unlockHint || ' '}
        </div>
      </div>
    </button>
  );
}

function areEqual(prev: Props, next: Props): boolean {
  if (prev.selected !== next.selected) return false;
  if (prev.related !== next.related) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if ((prev.failBad?.id ?? null) !== (next.failBad?.id ?? null)) return false;
  const a = prev.rescue;
  const b = next.rescue;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if (a.name !== b.name) return false;
  if (a.description !== b.description) return false;
  if (a.unlockHint !== b.unlockHint) return false;
  if (a.failureVariantId !== b.failureVariantId) return false;
  if (a.milestones !== b.milestones) return false;
  return true;
}

export const RescueOverviewRow = memo(RescueOverviewRowImpl, areEqual);
