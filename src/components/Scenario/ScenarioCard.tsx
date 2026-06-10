// 剧本卡片 — 列在 ScenarioScreen grid 中；保持纯展示，逻辑全靠 props 注入
import { useState } from 'react';
import type { ScenarioDoc } from '../../types/scenario';
import { IconStar } from '../Layout/TabIcons';

interface Props {
  scn: ScenarioDoc;
  onPlay: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

// 难度星：实心 + 空心，1~5；用 SVG 五点光圈渲染
function DifficultyStars({ n }: { n: number }) {
  const filled = Math.max(0, Math.min(5, n));
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar key={i} filled={i < filled} size={12} />
      ))}
    </span>
  );
}

// 截断标签：超 8 个截断；用于职业/必要人物 chips
function chipList(items: string[], max: number): string[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `+${items.length - max}`];
}

// 通用 chip — 紧凑铜版徽章
function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: 11,
      fontFamily: 'var(--font-ui)',
      letterSpacing: 0.5,
      color: accent ? 'var(--gold)' : 'var(--text-light)',
      background: accent ? 'rgba(196,168,85,0.10)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? 'rgba(196,168,85,0.45)' : 'rgba(255,255,255,0.10)'}`,
      borderRadius: 3,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// hover/active 按钮 — 复用 beta 既定动效规范
function ActionButton({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.96 : hover ? 1.04 : 1;
  const baseBg = primary ? 'rgba(196,168,85,0.14)' : danger ? 'rgba(139,58,58,0.08)' : 'transparent';
  const hoverBg = primary ? 'rgba(196,168,85,0.24)' : danger ? 'rgba(139,58,58,0.20)' : 'rgba(255,255,255,0.06)';
  const color = primary ? 'var(--gold)' : danger ? 'var(--blood-bright, #c85050)' : 'var(--text-light)';
  const borderColor = primary ? 'var(--brass)' : danger ? 'rgba(180,60,60,0.40)' : 'rgba(196,168,85,0.30)';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        flex: 1,
        padding: '8px 14px',
        fontSize: 13,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 1.5,
        color,
        background: hover ? hoverBg : baseBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 2,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `background 200ms ${EASE}, transform 180ms ${EASE}, color 200ms ${EASE}`,
      }}
    >
      {children}
    </button>
  );
}

export function ScenarioCard({ scn, onPlay, onEdit, onDelete }: Props) {
  const [hover, setHover] = useState(false);
  const { meta, builtin } = scn;

  const occChips = chipList(scn.recommendedOccupations, 4);
  // 必要人物 chip 行 — 三档都算(包括 locked_npc),让玩家看到剧本里所有关键角色
  const necessary = scn.characters.filter(c => c.role === 'protagonist' || c.role === 'optional' || c.role === 'locked_npc');
  const npcChips = chipList(
    necessary.map(c => c.sheet?.identity?.name ?? c.npcAttrs.identityTag).filter((s): s is string => !!s),
    4,
  );

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: 380,
        padding: 16,
        background: 'linear-gradient(180deg, rgba(40,28,16,0.85), rgba(20,14,8,0.92))',
        border: `1px solid ${hover ? 'var(--brass)' : 'rgba(196,168,85,0.35)'}`,
        borderRadius: 4,
        boxShadow: hover
          ? '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,168,85,0.25) inset'
          : '0 4px 12px rgba(0,0,0,0.4)',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        transition: `transform 240ms ${EASE}, box-shadow 240ms ${EASE}, border-color 240ms ${EASE}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 内置徽章 */}
      {builtin && (
        <span style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '2px 8px',
          fontSize: 10,
          fontFamily: 'var(--font-ui)',
          letterSpacing: 1.5,
          color: 'var(--gold)',
          background: 'rgba(196,168,85,0.12)',
          border: '1px solid var(--brass)',
          borderRadius: 2,
        }}>内置</span>
      )}

      {/* 标题 */}
      <h3 style={{
        margin: '0 0 6px',
        paddingRight: builtin ? 56 : 0,
        fontSize: 18,
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        letterSpacing: 1,
        color: 'var(--gold)',
        lineHeight: 1.3,
      }}>
        {meta.name || '未命名剧本'}
      </h3>

      {/* 顶部元信息行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <Chip accent>{meta.type}</Chip>
        <Chip>{meta.durationHint}</Chip>
        <Chip>{meta.headcountHint || '?人'}</Chip>
      </div>

      {/* 难度 + SAN */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
        color: 'var(--text-light, #d4c4a0)',
        opacity: 0.78,
      }}>
        <span title={`难度 ${meta.difficulty}/5`} style={{ color: 'var(--gold)', letterSpacing: 2 }}>
          <DifficultyStars n={meta.difficulty} />
        </span>
        <span>SAN 损耗 · <span style={{ color: 'var(--text-light)' }}>{meta.sanLossHint}</span></span>
      </div>

      {/* 一句话背景 — 两行截断 */}
      <p style={{
        margin: '0 0 12px',
        fontSize: 12.5,
        lineHeight: 1.55,
        color: 'var(--text-light, #d4c4a0)',
        opacity: 0.92,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minHeight: 38,
      }}>
        {meta.blurb || '（暂无背景描述）'}
      </p>

      {/* 推荐职业 chips */}
      {occChips.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.75)', marginBottom: 4, letterSpacing: 1.2 }}>推荐职业</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {occChips.map((s, i) => <Chip key={i}>{s}</Chip>)}
          </div>
        </div>
      )}

      {/* 必要人物 chips */}
      {npcChips.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.75)', marginBottom: 4, letterSpacing: 1.2 }}>登场角色</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {npcChips.map((s, i) => <Chip key={i}>{s}</Chip>)}
          </div>
        </div>
      )}

      {/* 弹性占位 */}
      <div style={{ flex: 1 }} />

      {/* 按钮区 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <ActionButton onClick={onPlay} primary>开始</ActionButton>
        <ActionButton onClick={onEdit}>编辑</ActionButton>
        {onDelete && <ActionButton onClick={onDelete} danger>删除</ActionButton>}
      </div>
    </article>
  );
}
