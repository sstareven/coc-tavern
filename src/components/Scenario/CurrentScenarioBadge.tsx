// 剧本系统 - 当前剧本胶囊(GameView 右上角)
// 折叠态:[图标] 剧本名 · 暗线 N/100
// 点击展开右滑入抽屉:名/类型/暗线进度条/darkPhase title/已解锁 keys/可能结局
// 无剧本 / __free → 灰色「自由探索」胶囊(不可展开)
import { useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useChatStore } from '../../stores/useChatStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { IconToc, IconClose } from '../Layout/TabIcons';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { DarkPhase } from '../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

// 从 statData 嵌套树按点号路径取值;缺失/非标量返回默认。
function readNum(tree: Record<string, unknown>, path: string, fallback = 0): number {
  let cur: unknown = tree;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return fallback;
    cur = (cur as Record<string, unknown>)[seg];
  }
  const n = typeof cur === 'string' ? Number(cur) : cur;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

// 读 /剧情/已解锁/* 下值为 truthy 的 key 列表。
function readUnlockedKeys(tree: Record<string, unknown>): string[] {
  const plot = tree['剧情'];
  if (plot === null || typeof plot !== 'object' || Array.isArray(plot)) return [];
  const unlocked = (plot as Record<string, unknown>)['已解锁'];
  if (unlocked === null || typeof unlocked !== 'object' || Array.isArray(unlocked)) return [];
  return Object.entries(unlocked as Record<string, unknown>)
    .filter(([, v]) => v === true || v === 'true' || (typeof v === 'number' && v > 0))
    .map(([k]) => k);
}

// 命中的暗线 phase = threshold ≤ progress 中 threshold 最大的那个
function currentDarkPhase(timeline: DarkPhase[], progress: number): DarkPhase | null {
  if (!timeline.length) return null;
  const sorted = [...timeline].sort((a, b) => a.threshold - b.threshold);
  let hit: DarkPhase | null = null;
  for (const p of sorted) {
    if (p.threshold <= progress) hit = p;
    else break;
  }
  return hit;
}

export function CurrentScenarioBadge() {
  const [open, setOpen] = useState(false);
  const activeSessionId = useChatStore((s) => s.activeId);
  const sessions = useChatStore((s) => s.sessions);
  const getById = useScenarioStore((s) => s.getById);
  const statData = useVariableStore((s) => s.statData);
  const isMobile = useIsMobile();

  const session = sessions.find((c) => c.id === activeSessionId);
  const scenarioId = session?.scenarioId;
  const doc = scenarioId && scenarioId !== '__free' ? getById(scenarioId) : undefined;

  // 自由探索 / 未选剧本 → 灰胶囊,不可展开
  if (!doc) {
    return (
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 12,
          border: '1px solid rgba(120,120,120,0.45)',
          background: 'rgba(0,0,0,0.12)',
          color: 'var(--ink, #2a2415)',
          fontFamily: 'var(--font-ui)',
          fontSize: 'calc(11px * var(--system-ratio, 1))',
          letterSpacing: 1, userSelect: 'none',
          flexShrink: 0,
        }}
        title="未选择剧本(自由探索模式)"
      >
        <IconToc size={13} />
        <span>自由探索</span>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, readNum(statData, '剧情.暗线.进度', 0)));
  const phase = currentDarkPhase(doc.darkTimeline, progress);
  const unlocked = readUnlockedKeys(statData);

  return (
    <>
      <BadgeButton
        name={doc.meta.name}
        progress={progress}
        isMobile={isMobile}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <Drawer
          doc={doc}
          progress={progress}
          phase={phase}
          unlocked={unlocked}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function BadgeButton({ name, progress, isMobile, onClick }: { name: string; progress: number; isMobile: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`查看剧本「${name}」详情(暗线 ${progress}/100)`}
      style={{
        // 桌面端:左上角 fixed 胶囊;手机端:relative 由 GameView 包到 TopBar 下方一行,避免遮挡 StatusBar
        ...(isMobile
          ? { position: 'relative', flexShrink: 0 }
          : { position: 'fixed', top: 92, left: 14, zIndex: 49 }),
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 18,
        background: 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))',
        border: '1px solid var(--brass)',
        color: 'var(--gold)',
        fontFamily: 'var(--font-ui)',
        fontSize: 11, letterSpacing: 2,
        cursor: 'pointer', userSelect: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1), background 200ms cubic-bezier(0.4,0,0.2,1)',
      }}
      title="点击查看剧本详情"
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(60,40,20,0.95), rgba(30,20,12,0.98))';
        e.currentTarget.style.borderColor = 'var(--gold)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(40,28,16,0.92), rgba(20,14,8,0.96))';
        e.currentTarget.style.borderColor = 'var(--brass)';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-1px) scale(1)'; }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        background: 'rgba(196,168,85,0.18)',
        border: '1px solid var(--gold)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--gold)',
      }}>
        <IconToc size={10} />
      </span>
      <span style={{ color: 'var(--parchment, #d8c79a)', fontWeight: 500 }}>{name}</span>
      <span style={{ opacity: 0.45 }}>·</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>暗线 {progress}/100</span>
    </button>
  );
}

function Drawer({
  doc, progress, phase, unlocked, onClose,
}: {
  doc: import('../../types/scenario').ScenarioDoc;
  progress: number;
  phase: DarkPhase | null;
  unlocked: string[];
  onClose: () => void;
}) {
  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 998, animation: `scnFadeIn 240ms ${EASE}`,
        }}
      />
      {/* 右滑入抽屉 */}
      <aside
        role="dialog"
        aria-label="剧本详情"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(420px, 92vw)', zIndex: 999,
          background: 'linear-gradient(180deg, #15110b 0%, #1c1610 100%)',
          borderLeft: '1px solid rgba(196,168,85,0.35)',
          boxShadow: '-8px 0 28px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column',
          padding: '18px 20px', gap: 14,
          color: 'var(--parchment, #d8c79a)', fontFamily: 'var(--font-ui)',
          animation: `scnSlideIn 280ms ${EASE}`, overflowY: 'auto',
        }}
      >
        <style>{`
          @keyframes scnSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes scnFadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        {/* 标题行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <IconToc size={18} />
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'calc(18px * var(--system-ratio, 1))',
              color: 'var(--gold)', letterSpacing: 2, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{doc.meta.name}</span>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        {/* 类型 / 时长 / 难度 / SAN */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          fontSize: 'calc(11px * var(--system-ratio, 1))',
          color: 'var(--ink, #2a2415)', letterSpacing: 0.5,
        }}>
          <Tag>{doc.meta.type}</Tag>
          <Tag>{doc.meta.durationHint}</Tag>
          <Tag>难度 {doc.meta.difficulty}</Tag>
          <Tag>SAN {doc.meta.sanLossHint}</Tag>
        </div>
        {/* 暗线进度条 */}
        <Section title="暗线进度">
          <ProgressBar value={progress} />
          {phase ? (
            <div style={{ marginTop: 6, fontSize: 'calc(12px * var(--system-ratio, 1))', color: 'var(--gold)' }}>
              当前阶段:{phase.title}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 'calc(11px * var(--system-ratio, 1))', opacity: 0.65 }}>
              尚未进入任何暗线阶段
            </div>
          )}
        </Section>
        {/* 已解锁 keys */}
        <Section title={`已解锁线索 (${unlocked.length})`}>
          {unlocked.length === 0 ? (
            <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', opacity: 0.55 }}>
              尚无解锁
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {unlocked.map((k) => <Pill key={k}>{k}</Pill>)}
            </div>
          )}
        </Section>
        {/* 可能结局 */}
        <Section title={`可能结局 (${doc.badEndings.length})`}>
          {doc.badEndings.length === 0 ? (
            <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', opacity: 0.55 }}>
              本剧本未配置结局矩阵
            </div>
          ) : (
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {doc.badEndings.map((b) => (
                <li key={b.id} style={{
                  border: '1px solid rgba(196,168,85,0.18)',
                  borderRadius: 4, padding: '6px 8px',
                  background: 'rgba(0,0,0,0.18)',
                }}>
                  <div style={{
                    fontSize: 'calc(11px * var(--system-ratio, 1))',
                    color: 'var(--gold)', letterSpacing: 0.5, marginBottom: 2,
                  }}>{b.condition}</div>
                  <div style={{
                    fontSize: 'calc(11px * var(--system-ratio, 1))',
                    color: 'var(--parchment, #d8c79a)', opacity: 0.85, lineHeight: 1.5,
                  }}>{b.narrative}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>
    </>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="关闭"
      style={{
        width: 26, height: 26, flexShrink: 0,
        border: '1px solid rgba(196,168,85,0.35)',
        background: 'rgba(0,0,0,0.3)', color: 'var(--gold)',
        borderRadius: 4, cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1,
        transition: `transform 200ms ${EASE}, filter 200ms ${EASE}, background 200ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.08)';
        e.currentTarget.style.filter = 'brightness(1.2)';
        e.currentTarget.style.background = 'rgba(196,168,85,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.filter = 'brightness(1)';
        e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
    ><IconClose size={14} /></button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 'calc(10px * var(--system-ratio, 1))',
        letterSpacing: 2, color: 'var(--ink, #2a2415)',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        paddingBottom: 3,
      }}>{title}</div>
      <div>{children}</div>
    </section>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{
      width: '100%', height: 8, borderRadius: 4,
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(196,168,85,0.25)',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: 'linear-gradient(90deg, var(--gold, #c4a855), var(--blood, #8b1e1e))',
        transition: `width 360ms ${EASE}`,
      }} />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9,
      border: '1px solid rgba(196,168,85,0.3)',
      background: 'rgba(0,0,0,0.2)',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 9,
      border: '1px solid rgba(196,168,85,0.35)',
      background: 'rgba(196,168,85,0.1)',
      color: 'var(--parchment, #d8c79a)',
      fontSize: 'calc(11px * var(--system-ratio, 1))',
      letterSpacing: 0.3,
    }}>{children}</span>
  );
}
