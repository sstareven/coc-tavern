// 剧本编辑器 — 见 docs/specs/2026-06-06-scenario-system-design.md §5.1 / §E1
// 全屏 overlay: 顶部工具栏 + 左竖向 9 tab + 右主区 + 最右侧驻留 CompanionChat(<800px 折叠抽屉)。
// 状态来源:useScenarioStore.getById → 局部 working copy → upsert(working) 落库。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { ScenarioDoc } from '../../types/scenario';
import { downloadScenario } from '../../scenario/scenario-io';
import { applyScenarioPatch } from '../../scenario/scenario-patch';
import { CompanionChat } from './CompanionChat';
import { MetaTab } from './tabs/MetaTab';
import { LocationsTab } from './tabs/LocationsTab';
import { PeopleTab } from './tabs/PeopleTab';
import { FactionsTab } from './tabs/FactionsTab';
import { ItemsTab } from './tabs/ItemsTab';
import { DarkThreadsTab } from './tabs/DarkThreadsTab';
import { SecretsTab } from './tabs/SecretsTab';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const COMPACT_BREAKPOINT = 800;

interface Props {
  scenarioId: string;
  onClose: () => void;
}

type TabKey =
  | 'meta' | 'locations' | 'people' | 'factions'
  | 'items' | 'dark' | 'secrets' | 'darkTimeline' | 'badEndings';

interface TabDef { key: TabKey; label: string; star?: boolean }

const TABS: TabDef[] = [
  { key: 'meta', label: '元信息' },
  { key: 'locations', label: '地点' },
  { key: 'people', label: '人物' },
  { key: 'factions', label: '势力' },
  { key: 'items', label: '物品线索' },
  { key: 'dark', label: '暗线' },
  { key: 'secrets', label: '秘密与解锁' },
  { key: 'darkTimeline', label: '暗线时间线', star: true },
  { key: 'badEndings', label: '坏结局矩阵', star: true },
];

export function ScenarioEditor({ scenarioId, onClose }: Props) {
  const getById = useScenarioStore((s) => s.getById);
  const upsert = useScenarioStore((s) => s.upsert);

  const initial = useMemo<ScenarioDoc | undefined>(() => getById(scenarioId), [getById, scenarioId]);
  const [working, setWorking] = useState<ScenarioDoc | undefined>(initial);
  const [activeTab, setActiveTab] = useState<TabKey>('meta');
  const [toast, setToast] = useState<string | null>(null);
  const [companionOpen, setCompanionOpen] = useState(false); // 移动端抽屉显隐
  const toastTimerRef = useRef<number | null>(null);

  // 视口宽度自适应
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < COMPACT_BREAKPOINT;
  });
  useEffect(() => {
    const onResize = (): void => setCompact(window.innerWidth < COMPACT_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, []);

  // 剧本 id 变更时重新初始化 working
  useEffect(() => {
    setWorking(initial);
  }, [initial]);

  const showToast = (msg: string): void => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  };

  // 剧本未找到 — 直接关闭并提示
  if (!working) {
    return (
      <div role="alert" style={{
        position: 'fixed', inset: 0, zIndex: 160,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,5,2,0.85)',
        color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 2,
      }}>
        剧本不存在 — <button onClick={onClose} style={{
          marginLeft: 10, background: 'none', border: '1px solid var(--brass)',
          padding: '6px 14px', color: 'var(--gold)', cursor: 'pointer', borderRadius: 2,
        }}>关闭</button>
      </div>
    );
  }

  const handleSave = (): void => {
    const id = upsert(working);
    if (id !== working.id) {
      // 内置 fork:把 id 切到新副本并继续编辑
      setWorking({ ...working, id, builtin: false });
      showToast('已 fork 为新剧本副本并保存');
    } else {
      showToast('已保存');
    }
  };

  const handleExport = (): void => {
    try {
      downloadScenario(working);
      showToast('已导出');
    } catch (err) {
      showToast(`导出失败: ${(err as Error).message}`);
    }
  };

  const handleSaveAs = (): void => {
    // 另存为:复制 doc 给新 id,直接 upsert
    const newId = (globalThis.crypto?.randomUUID?.() ?? ('scn_' + Math.random().toString(36).slice(2)));
    const copy: ScenarioDoc = {
      ...working,
      id: newId,
      builtin: false,
      meta: { ...working.meta, name: working.meta.name + '(副本)' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const saved = upsert(copy);
    setWorking({ ...copy, id: saved });
    showToast('已另存为新剧本');
  };

  const handleNameChange = (name: string): void => {
    setWorking((prev) => prev ? applyScenarioPatch(prev, { patchMeta: { name } }) : prev);
  };

  const renderTab = (): React.ReactNode => {
    const onChange = (next: ScenarioDoc): void => setWorking(next);
    const passToast = showToast;
    switch (activeTab) {
      case 'meta': return <MetaTab scn={working} onChange={onChange} />;
      case 'locations': return <LocationsTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'people': return <PeopleTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'factions': return <FactionsTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'items': return <ItemsTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'dark': return <DarkThreadsTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'secrets': return <SecretsTab scn={working} onChange={onChange} onToast={passToast} />;
      case 'darkTimeline':
      case 'badEndings':
        return (
          <div style={{
            padding: 24, color: 'var(--ink, #8a7a52)',
            fontSize: 12, fontFamily: 'var(--font-ui)', textAlign: 'center',
          }}>(占位) 此 tab 由 F1/F2 任务实现</div>
        );
    }
  };

  const onCompanionApply = (patch: import('../../types/scenario').ScenarioPatch): void => {
    setWorking((prev) => prev ? applyScenarioPatch(prev, patch) : prev);
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label="剧本编辑器"
      style={{
        position: 'fixed', inset: 0, zIndex: 160,
        display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse at center, var(--abyss, #18120a) 0%, var(--void, #060403) 70%)',
        overflow: 'hidden',
      }}
    >
      {/* 顶部工具栏 */}
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        minHeight: 56,
        padding: '12px 18px',
        borderBottom: '1px solid rgba(196,168,85,0.20)',
        background: 'rgba(10,7,4,0.6)',
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{
          fontSize: 11, color: 'var(--ink, #8a7a52)',
          fontFamily: 'var(--font-ui)', letterSpacing: 2,
          flexShrink: 0,
        }}>剧本</span>
        <input
          value={working.meta.name}
          onChange={(e) => handleNameChange(e.target.value)}
          aria-label="剧本名"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(196,168,85,0.3)',
            borderRadius: 2,
            color: 'var(--gold)', fontFamily: 'var(--font-ui)',
            fontSize: 14, letterSpacing: 1,
          }}
        />
        {working.builtin && (
          <span style={{
            padding: '2px 8px',
            fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-ui)',
            letterSpacing: 1.5,
            background: 'rgba(196,168,85,0.12)',
            border: '1px solid var(--brass)', borderRadius: 2,
            flexShrink: 0,
          }}>内置 · 保存将 fork</span>
        )}
        <BarBtn onClick={handleSave} label="保存" accent compact={compact} />
        <BarBtn onClick={handleExport} label="导出" compact={compact} />
        <BarBtn onClick={handleSaveAs} label="另存为" compact={compact} />
        {compact && (
          <BarBtn onClick={() => setCompanionOpen((v) => !v)} label={companionOpen ? '关闭伙伴' : '作者伙伴'} compact={compact} />
        )}
        <BarBtn onClick={onClose} label="关闭" danger compact={compact} />
      </header>

      {/* 主体: tabs(左) + 主区(中) + companion(右,桌面端) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左竖向 tabs */}
        <nav style={{
          flexShrink: 0,
          width: 160,
          padding: '12px 0',
          background: 'rgba(20,14,8,0.55)',
          borderRight: '1px solid rgba(196,168,85,0.18)',
          overflowY: 'auto',
        }}>
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                  padding: '9px 16px',
                  background: active ? 'rgba(196,168,85,0.14)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? '2px solid var(--brass)' : '2px solid transparent',
                  color: active ? 'var(--gold)' : 'var(--text-light, #d0c2a0)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 1.5,
                  cursor: 'pointer',
                  transition: `background 180ms ${EASE}, border-color 180ms ${EASE}, color 180ms ${EASE}`,
                }}
                onMouseEnter={(ev) => { if (!active) ev.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                onMouseLeave={(ev) => { if (!active) ev.currentTarget.style.background = 'transparent'; }}
              >
                {t.star && <span style={{ color: 'var(--brass)' }}>★</span>}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 主区 */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {renderTab()}
        </main>

        {/* 右侧 CompanionChat — 桌面端常驻;移动端隐藏 */}
        {!compact && (
          <CompanionChat scn={working} onApplyPatch={onCompanionApply} />
        )}
      </div>

      {/* 移动端 CompanionChat 抽屉(底部 60%) */}
      {compact && companionOpen && (
        <div
          role="dialog" aria-label="作者伙伴抽屉"
          onClick={() => setCompanionOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 220,
            background: 'rgba(8,5,2,0.5)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', height: '60%',
            boxShadow: '0 -16px 40px rgba(0,0,0,0.7)',
          }}>
            <CompanionChat scn={working} onApplyPatch={onCompanionApply} compact />
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', fontSize: 12, fontFamily: 'var(--font-ui)', letterSpacing: 1,
          color: 'var(--gold)', background: 'rgba(20,14,8,0.95)',
          border: '1px solid var(--brass)', borderRadius: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'none', zIndex: 300,
        }}>{toast}</div>
      )}
    </div>
  );
}

// ── 工具栏按钮 ──

function BarBtn({ onClick, label, accent, danger, compact }: { onClick: () => void; label: string; accent?: boolean; danger?: boolean; compact?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const color = danger ? '#b14a4a' : accent ? 'var(--gold)' : 'var(--text-light, #d0c2a0)';
  const border = danger ? '#b14a4a' : accent ? 'var(--brass)' : 'rgba(196,168,85,0.4)';
  const scale = pressed ? 0.95 : hover ? 1.05 : 1;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        flexShrink: 0,
        padding: compact ? '5px 10px' : '6px 14px',
        background: hover ? 'rgba(196,168,85,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${border}`, borderRadius: 2,
        color, fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1.5,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >{label}</button>
  );
}
