// 拯救路径气泡 — 两种渲染模式:
//   - mode='inline' (默认, 兼容旧调用): 嵌在状态栏行内的金色圆形按钮; 浮层在气泡下方居中展开
//   - mode='tab': 正文页左上角侧边抽屉柄, 默认 translateX(-75%) 只露 25%, hover 拉出, 点击右侧展开浮层
// 潜伏态:整体不渲染(globalStatus='潜伏' 或无 unlocked path);
// 对峙态:金色脉冲气泡 + IconLuck;
// 锁定态:金色实心气泡 + IconStar filled。
// 浮层用 absolute positioning,需父容器 position:relative。
import { useState, useRef, useEffect } from 'react';
import { useRescueStore } from '../../stores/useRescueStore';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useDarkThreadStore } from '../../stores/useDarkThreadStore';
import { useChatStore } from '../../stores/useChatStore';
import { IconLuck, IconStar } from '../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  compact?: boolean;
  /** 'inline' (默认) = 状态栏行内圆形气泡; 'tab' = 正文页左上角侧边抽屉柄 */
  mode?: 'inline' | 'tab';
}

export function RescueBar({ compact = false, mode = 'inline' }: Props): React.ReactElement | null {
  const globalStatus = useRescueStore((s) => s.globalStatus);
  const paths = useRescueStore((s) => s.paths);
  const winningEndingId = useRescueStore((s) => s.winningEndingId);
  const activeId = useChatStore((s) => s.activeId);
  const activeScenarioId = useChatStore((s) => activeId ? s.sessions.find(x => x.id === activeId)?.scenarioId : null);
  const scenario = useScenarioStore((s) => activeScenarioId ? s.getById(activeScenarioId) : null);
  const endings = scenario?.rescueEndings ?? [];
  const darkProgress = useDarkThreadStore((s) => s.entries.length > 0 ? s.entries[s.entries.length - 1].progress : null);

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (globalStatus === '潜伏') return null;
  if (paths.length === 0) return null;

  const endingById = new Map(endings.map((e) => [e.id, e]));
  const visiblePaths = paths.filter((p) => p.unlocked);
  const isLocked = globalStatus === '锁定';
  if (!isLocked && visiblePaths.length === 0) return null;

  const rescueAggregate = visiblePaths.reduce((m, p) => Math.max(m, p.progress), 0);
  const winEnding = isLocked && winningEndingId ? endingById.get(winningEndingId) : null;
  const isTab = mode === 'tab';

  // inline 模式: 圆形;  tab 模式: 竖向药丸 (左侧贴书脊, 右侧圆角作把手)
  const bubbleSize = compact ? 22 : 26;
  const iconSize = compact ? 11 : 13;
  // tab 模式: 容器自身 hover/open 都会向右滑出 75%; 不再用 scale
  const inlineScale = isTab ? 1 : (hover ? 1.06 : 1);

  // tab 模式: 容器 absolute, 默认 translateX(-75%) 只露 25% 当作把手, hover/open 时归位
  const tabRevealed = hover || open;
  const containerStyle: React.CSSProperties = isTab
    ? {
      position: 'absolute',
      top: 40,
      left: 0,
      zIndex: 5,
      display: 'inline-block',
      transform: tabRevealed ? 'translateX(0)' : 'translateX(-75%)',
      transition: `transform 280ms ${EASE}`,
      // 让 hover 区域比可见部分大一点(留 8px 边沿响应), 避免玩家鼠标贴书脊时拉不出
      paddingRight: 8,
    }
    : { display: 'inline-block', position: 'relative', verticalAlign: 'middle' };

  const tabBubbleStyle: React.CSSProperties = isTab
    ? {
      // tab 模式: 高 32 宽 36 的竖向把手 (右半圆), 玩家默认看到 9px 宽月牙
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      width: 36,
      height: 32,
      paddingRight: 8,
      border: '1px solid var(--gold, #c4a855)',
      borderLeft: 'none',
      borderRadius: '0 16px 16px 0',
      background: isLocked
        ? 'radial-gradient(circle at 80% 50%, #e0c074 0%, #8a7235 70%, #4a3a18 100%)'
        : 'radial-gradient(circle at 80% 50%, rgba(196,168,85,0.85) 0%, rgba(120,95,40,0.9) 70%, rgba(50,38,15,0.95) 100%)',
      color: '#fff4d4',
      cursor: 'pointer',
      animation: isLocked ? 'none' : `rescue-bubble-pulse 1.8s ${EASE} infinite`,
      boxShadow: tabRevealed ? '2px 2px 12px rgba(0,0,0,0.35)' : '1px 1px 4px rgba(0,0,0,0.25)',
      flexShrink: 0,
    }
    : {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: bubbleSize,
      height: bubbleSize,
      padding: 0,
      margin: 0,
      border: '1px solid var(--gold, #c4a855)',
      borderRadius: '50%',
      background: isLocked
        ? 'radial-gradient(circle at 35% 30%, #e0c074 0%, #8a7235 70%, #4a3a18 100%)'
        : 'radial-gradient(circle at 35% 30%, rgba(196,168,85,0.85) 0%, rgba(120,95,40,0.9) 70%, rgba(50,38,15,0.95) 100%)',
      color: '#fff4d4',
      cursor: 'pointer',
      animation: isLocked ? 'none' : `rescue-bubble-pulse 1.8s ${EASE} infinite`,
      transform: `scale(${inlineScale})`,
      transition: `transform 220ms ${EASE}`,
      flexShrink: 0,
    };

  // 浮层位置: inline = 气泡下方居中; tab = 气泡右侧(把手露出后向右弹)
  const overlayStyle: React.CSSProperties = isTab
    ? {
      position: 'absolute',
      top: 0,
      left: 'calc(100% + 6px)',
      minWidth: 280,
      maxWidth: 360,
      padding: '10px 12px',
      background: 'linear-gradient(135deg, rgba(30,22,12,0.97) 0%, rgba(20,14,8,0.97) 100%)',
      border: '1px solid var(--gold, #c4a855)',
      borderRadius: 4,
      boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
      zIndex: 100,
      userSelect: 'none',
      color: 'var(--parchment, #d8c79a)',
      fontFamily: 'var(--font-display)',
    }
    : {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: '50%',
      transform: 'translateX(-50%)',
      minWidth: 280,
      maxWidth: 360,
      padding: '10px 12px',
      background: 'linear-gradient(135deg, rgba(30,22,12,0.97) 0%, rgba(20,14,8,0.97) 100%)',
      border: '1px solid var(--gold, #c4a855)',
      borderRadius: 4,
      boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
      zIndex: 100,
      userSelect: 'none',
      color: 'var(--parchment, #d8c79a)',
      fontFamily: 'var(--font-display)',
    };

  return (
    <span
      ref={wrapRef}
      style={containerStyle}
      onMouseEnter={isTab ? () => setHover(true) : undefined}
      onMouseLeave={isTab ? () => setHover(false) : undefined}
    >
      <style>{`
        @keyframes rescue-bubble-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 0 rgba(196, 168, 85, 0.55),
              inset 0 0 4px rgba(255, 220, 130, 0.5);
          }
          50% {
            box-shadow:
              0 0 0 5px rgba(196, 168, 85, 0),
              inset 0 0 7px rgba(255, 230, 150, 0.8);
          }
        }
      `}</style>
      <button
        type="button"
        data-testid="rescue-bar"
        data-status={isLocked ? 'locked' : 'contested'}
        data-mode={mode}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={isTab ? undefined : () => setHover(true)}
        onMouseLeave={isTab ? undefined : () => setHover(false)}
        title={isLocked ? `最终结局 · ${winEnding?.name ?? '胜出路径'}` : `拯救模式 · 对峙 (最高 ${Math.round(rescueAggregate)})`}
        aria-label="拯救路径"
        style={tabBubbleStyle}
      >
        {isLocked
          ? <IconStar size={iconSize} filled />
          : <IconLuck size={iconSize} />
        }
      </button>

      {open && (
        <div style={overlayStyle}>
          {/* 标题:对峙=「拯救模式·对峙」,锁定=「最终结局·名」 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--gold, #c4a855)',
            letterSpacing: 3,
            borderBottom: '1px solid rgba(196,168,85,0.18)',
            paddingBottom: 5, marginBottom: 6,
          }}>
            {isLocked
              ? <><IconStar size={13} filled /><span>最终结局 · {winEnding?.name ?? '胜出路径'}</span></>
              : <><IconLuck size={13} /><span>拯救模式 · 对峙</span></>
            }
          </div>

          {/* 锁定态:直接显示结局描述,不再赛跑 */}
          {isLocked ? (
            <div style={{
              fontSize: 11,
              lineHeight: 1.65,
              color: 'var(--parchment, #d8c79a)',
              fontFamily: 'var(--font-body)',
              padding: '2px 0',
            }}>
              {winEnding?.description ?? '其他路径已冻结,叙事围绕这一结局展开。'}
            </div>
          ) : (
            <>
              {/* 赛跑对比 — 拯救/暗线两条窄条 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                <RaceRow
                  label="拯救"
                  value={rescueAggregate}
                  color="var(--gold, #c4a855)"
                  gradient="linear-gradient(90deg, rgba(196,168,85,0.4), var(--gold, #c4a855))"
                />
                {darkProgress !== null && (
                  <RaceRow
                    label="暗线"
                    value={darkProgress}
                    color="var(--blood, #8b1e1e)"
                    gradient="linear-gradient(90deg, rgba(139,30,30,0.4), var(--blood, #8b1e1e))"
                  />
                )}
              </div>

              {/* 路径明细 */}
              {visiblePaths.length > 0 && (
                <div style={{
                  fontSize: 8, color: 'var(--brass, #a89970)',
                  opacity: 0.7, letterSpacing: 1.5, marginBottom: 4,
                  fontFamily: 'var(--font-ui)',
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
                      fontSize: 10, letterSpacing: 1,
                      padding: '2px 0',
                    }}
                  >
                    <span style={{
                      minWidth: 64,
                      color: 'var(--gold, #c4a855)',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>{ending?.name ?? p.endingId}</span>
                    <div style={{
                      flex: 1, minWidth: 40, height: 5, borderRadius: 3,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(196,168,85,0.22)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.max(0, Math.min(100, p.progress))}%`, height: '100%',
                        background: 'linear-gradient(90deg, var(--blood, #8b1e1e), var(--gold, #c4a855))',
                        transition: `width 360ms ${EASE}`,
                      }} />
                    </div>
                    <span data-testid="milestone-count" style={{
                      minWidth: 26, textAlign: 'right',
                      color: 'var(--brass, #a89970)',
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                    }}>{achieved}/{total}</span>
                    <span data-testid="progress-pct" style={{
                      minWidth: 22, textAlign: 'right',
                      color: 'var(--gold, #c4a855)',
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                    }}>{Math.round(p.progress)}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </span>
  );
}

/** 浮层内的赛跑对比单条 */
function RaceRow({
  label,
  value,
  color,
  gradient,
}: {
  label: string;
  value: number;
  color: string;
  gradient: string;
}): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 10, letterSpacing: 1,
    }}>
      <span style={{
        minWidth: 28,
        color,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 2,
        fontSize: 9,
      }}>{label}</span>
      <div style={{
        flex: 1, minWidth: 40, height: 7, borderRadius: 3,
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(196,168,85,0.22)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: gradient,
          transition: `width 360ms ${EASE}`,
        }} />
      </div>
      <span style={{
        minWidth: 24, textAlign: 'right',
        color,
        fontFamily: 'var(--font-mono)', fontSize: 10,
      }}>{Math.round(pct)}</span>
    </div>
  );
}
