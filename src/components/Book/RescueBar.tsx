// 顶部拯救路径横条 — spec §4
// 潜伏:整体不渲染;对峙:每条 unlocked path 一行(灰行=未解锁不显)+右上角暗线 progress 红字;
// 锁定:整条变金 + 胜出路径铭牌(其他路径变灰显示已冻结)。
// 嵌在 StatusBar 内,不浮层不绝对定位。
import { useRescueStore } from '../../stores/useRescueStore';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useDarkThreadStore } from '../../stores/useDarkThreadStore';
import { useChatStore } from '../../stores/useChatStore';
import { IconLuck, IconStar } from '../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  compact?: boolean;
}

export function RescueBar({ compact = false }: Props): React.ReactElement | null {
  const globalStatus = useRescueStore((s) => s.globalStatus);
  const paths = useRescueStore((s) => s.paths);
  const winningEndingId = useRescueStore((s) => s.winningEndingId);
  const activeId = useChatStore((s) => s.activeId);
  const activeScenarioId = useChatStore((s) => activeId ? s.sessions.find(x => x.id === activeId)?.scenarioId : null);
  const scenario = useScenarioStore((s) => activeScenarioId ? s.getById(activeScenarioId) : null);
  const endings = scenario?.rescueEndings ?? [];
  const darkProgress = useDarkThreadStore((s) => s.entries.length > 0 ? s.entries[s.entries.length - 1].progress : null);

  // 潜伏态(剧本未启用拯救路径或玩家尚未触达任何路径)整体不渲染
  if (globalStatus === '潜伏') return null;
  if (paths.length === 0) return null;

  const endingById = new Map(endings.map((e) => [e.id, e]));

  // 锁定态:整条金 + 铭牌
  if (globalStatus === '锁定' && winningEndingId) {
    const winEnding = endingById.get(winningEndingId);
    return (
      <div data-testid="rescue-bar" data-status="locked" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: compact ? '4px 10px' : '6px 14px',
        margin: '2px 0',
        background: 'linear-gradient(90deg, rgba(196,168,85,0.18), rgba(196,168,85,0.35), rgba(196,168,85,0.18))',
        border: '1px solid var(--gold, #c4a855)',
        borderRadius: 4,
        fontFamily: 'var(--font-display)',
        color: 'var(--gold, #c4a855)',
        letterSpacing: 4,
        fontSize: compact ? 11 : 13,
        transition: `all 360ms ${EASE}`,
        userSelect: 'none',
      }}>
        <IconStar size={compact ? 12 : 14} filled />
        <span>最终结局 · {winEnding?.name ?? '胜出路径'}</span>
        <IconStar size={compact ? 12 : 14} filled />
      </div>
    );
  }

  // 对峙态:渲染所有路径行(unlocked=金点动条,locked-out=灰色冻结提示;unrevealed 不渲染)
  const visiblePaths = paths.filter((p) => p.unlocked);
  if (visiblePaths.length === 0) return null;

  // 拯救聚合 = 所有已解锁路径的最大值(代表"最有希望的那条")— 用于与暗线赛跑对比
  const rescueAggregate = visiblePaths.reduce((m, p) => Math.max(m, p.progress), 0);

  return (
    <div data-testid="rescue-bar" data-status="contested" style={{
      display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4,
      padding: compact ? '4px 8px' : '6px 12px',
      margin: '2px 0',
      background: 'rgba(20,14,8,0.45)',
      border: '1px solid rgba(196,168,85,0.22)',
      borderRadius: 3,
      userSelect: 'none',
    }}>
      {/* 顶部模式标识 — 明确告知玩家「现在处于拯救模式」 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--font-display)',
        fontSize: compact ? 10 : 12,
        color: 'var(--gold, #c4a855)',
        letterSpacing: 3,
        borderBottom: '1px solid rgba(196,168,85,0.15)',
        paddingBottom: compact ? 2 : 3,
      }}>
        <IconLuck size={compact ? 11 : 13} />
        <span>拯救模式 · 对峙</span>
      </div>

      {/* 赛跑对比 — 拯救最高 vs 暗线 progress 上下两条窄条 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3 }}>
        <RaceRow
          label="拯救"
          value={rescueAggregate}
          color="var(--gold, #c4a855)"
          gradient="linear-gradient(90deg, rgba(196,168,85,0.4), var(--gold, #c4a855))"
          compact={compact}
        />
        {darkProgress !== null && (
          <RaceRow
            label="暗线"
            value={darkProgress}
            color="var(--blood, #8b1e1e)"
            gradient="linear-gradient(90deg, rgba(139,30,30,0.4), var(--blood, #8b1e1e))"
            compact={compact}
          />
        )}
      </div>

      {/* 路径明细分隔标识 */}
      {visiblePaths.length > 1 && (
        <div style={{
          fontFamily: 'var(--font-ui)',
          fontSize: compact ? 8 : 9,
          color: 'var(--brass, #a89970)',
          opacity: 0.6,
          letterSpacing: 1.5,
          paddingTop: compact ? 1 : 2,
        }}>
          路径明细
        </div>
      )}
      {visiblePaths.map((p) => {
        const ending = endingById.get(p.endingId);
        const total = ending?.milestones.length ?? 0;
        const achieved = p.achievedMilestoneIds.length;
        return (
          <div
            key={p.endingId}
            data-testid="rescue-row"
            data-ending-id={p.endingId}
            title={ending?.description ?? ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-display)',
              fontSize: compact ? 10 : 11,
              color: 'var(--parchment, #d8c79a)',
              letterSpacing: 1,
            }}
          >
            <span style={{
              minWidth: compact ? 56 : 72,
              color: 'var(--gold, #c4a855)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>{ending?.name ?? p.endingId}</span>
            <div style={{
              flex: 1, minWidth: 40, height: compact ? 5 : 7, borderRadius: 3,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(196,168,85,0.25)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <div style={{
                width: `${Math.max(0, Math.min(100, p.progress))}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--blood, #8b1e1e), var(--gold, #c4a855))',
                transition: `width 360ms ${EASE}`,
              }} />
            </div>
            <span data-testid="milestone-count" style={{
              minWidth: 28, textAlign: 'right',
              color: 'var(--brass, #a89970)',
              fontFamily: 'var(--font-mono)',
            }}>{achieved}/{total}</span>
            <span data-testid="progress-pct" style={{
              minWidth: 28, textAlign: 'right',
              color: 'var(--gold, #c4a855)',
              fontFamily: 'var(--font-mono)',
              fontSize: compact ? 9 : 10,
              opacity: 0.85,
            }}>{Math.round(p.progress)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 顶部赛跑对比单条:[label] [窄进度条] [数字]。拯救/暗线共用同一组件,只差颜色。 */
function RaceRow({
  label,
  value,
  color,
  gradient,
  compact,
}: {
  label: string;
  value: number;
  color: string;
  gradient: string;
  compact: boolean;
}): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-display)',
      fontSize: compact ? 10 : 11,
      letterSpacing: 1,
    }}>
      <span style={{
        minWidth: compact ? 28 : 32,
        color,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 2,
        fontSize: compact ? 9 : 10,
      }}>{label}</span>
      <div style={{
        flex: 1, minWidth: 40, height: compact ? 6 : 8, borderRadius: 3,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(196,168,85,0.2)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: gradient,
          transition: `width 360ms ${EASE}`,
        }} />
      </div>
      <span style={{
        minWidth: 28, textAlign: 'right',
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: compact ? 10 : 11,
      }}>{Math.round(pct)}</span>
    </div>
  );
}
