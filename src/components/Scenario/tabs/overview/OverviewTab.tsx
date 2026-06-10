// 编辑器 — 总览 tab(横向三栏拯救/坏结局/暗线 + 联动高亮 + 详情抽屉)
// 桌面三栏并列(4:3:3),移动单栏切换;Esc/点空白关闭选中;搜索过滤+联动高亮
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScenarioDoc, RescueEnding, BadEnding, DarkPhase, RescueMilestone } from '../../../../types/scenario';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { RescueOverviewRow } from './RescueOverviewRow';
import { BadEndingOverviewRow } from './BadEndingOverviewRow';
import { DarkPhaseOverviewRow } from './DarkPhaseOverviewRow';
import { OverviewDetailDrawer } from './OverviewDetailDrawer';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export type OverviewSelection =
  | { kind: 'rescue'; id: string }
  | { kind: 'bad'; id: string }
  | { kind: 'phase'; id: string }
  | null;

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const tail = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 12) : Math.floor(Math.random() * 36 ** 8).toString(36);
  return `${prefix}_${tail}`;
}

function blankRescue(): RescueEnding {
  return { id: newId('res'), name: '', description: '', unlockHint: '', milestones: [] };
}
function blankBad(): BadEnding {
  return { id: newId('bad'), condition: '', narrative: '', accelerators: [] };
}
function blankPhase(threshold: number): DarkPhase {
  return { id: newId('phase'), threshold, title: '', triggers: [], directorNote: '', autoUnlockKeys: [] };
}
function blankMilestone(): RescueMilestone {
  return { id: newId('ms'), name: '', delta: 25 };
}

function stamp(): number {
  return Date.now();
}

export function OverviewTab({ scn, onChange, onToast }: Props): React.ReactElement {
  const [selection, setSelection] = useState<OverviewSelection>(null);
  const [search, setSearch] = useState('');
  const [mobileCol, setMobileCol] = useState<'rescue' | 'bad' | 'phase'>('rescue');
  const compact = useIsMobile('(max-width: 800px)');

  const rescueEndings = scn.rescueEndings ?? [];
  const badEndings = scn.badEndings;
  const darkTimeline = scn.darkTimeline;

  // ── 稳定回调 ──────────────────────────────────────────────────
  const closeDrawer = useCallback(() => setSelection(null), []);
  const selectRescue = useCallback((id: string) => setSelection({ kind: 'rescue', id }), []);
  const selectBad = useCallback((id: string) => setSelection({ kind: 'bad', id }), []);
  const selectPhase = useCallback((id: string) => setSelection({ kind: 'phase', id }), []);

  // ── 数据 helpers ───────────────────────────────────────────────
  const addRescue = (): void => {
    const item = blankRescue();
    onChange({ ...scn, rescueEndings: [...rescueEndings, item], updatedAt: stamp() });
    setSelection({ kind: 'rescue', id: item.id });
    onToast?.('已新增拯救路径');
  };

  const addBad = (): void => {
    const item = blankBad();
    onChange({ ...scn, badEndings: [...badEndings, item], updatedAt: stamp() });
    setSelection({ kind: 'bad', id: item.id });
    onToast?.('已新增坏结局');
  };

  const addPhase = (): void => {
    const maxT = darkTimeline.reduce((m, p) => Math.max(m, p.threshold), 0);
    const threshold = Math.min(100, darkTimeline.length === 0 ? 20 : maxT + 10);
    const item = blankPhase(threshold);
    onChange({ ...scn, darkTimeline: [...darkTimeline, item], updatedAt: stamp() });
    setSelection({ kind: 'phase', id: item.id });
    onToast?.('已新增暗线阶段');
  };

  const patchRescue = (id: string, patch: Partial<RescueEnding>): void => {
    onChange({
      ...scn,
      rescueEndings: rescueEndings.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      updatedAt: stamp(),
    });
  };

  const removeRescue = (id: string): void => {
    onChange({ ...scn, rescueEndings: rescueEndings.filter((r) => r.id !== id), updatedAt: stamp() });
    if (selection?.kind === 'rescue' && selection.id === id) setSelection(null);
  };

  const addMilestone = (rescueId: string): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchRescue(rescueId, { milestones: [...target.milestones, blankMilestone()] });
  };

  const patchMilestone = (rescueId: string, msId: string, patch: Partial<RescueMilestone>): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchRescue(rescueId, {
      milestones: target.milestones.map((m) => (m.id === msId ? { ...m, ...patch } : m)),
    });
  };

  const removeMilestone = (rescueId: string, msId: string): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchRescue(rescueId, { milestones: target.milestones.filter((m) => m.id !== msId) });
  };

  const patchBad = (id: string, patch: Partial<BadEnding>): void => {
    onChange({
      ...scn,
      badEndings: badEndings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      updatedAt: stamp(),
    });
  };

  const removeBad = (id: string): void => {
    onChange({
      ...scn,
      badEndings: badEndings.filter((b) => b.id !== id),
      rescueEndings: rescueEndings.map((r) =>
        r.failureVariantId === id ? { ...r, failureVariantId: undefined } : r,
      ),
      updatedAt: stamp(),
    });
    if (selection?.kind === 'bad' && selection.id === id) setSelection(null);
  };

  const patchPhase = (id: string, patch: Partial<DarkPhase>): void => {
    onChange({
      ...scn,
      darkTimeline: darkTimeline.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      updatedAt: stamp(),
    });
  };

  const removePhase = (id: string): void => {
    onChange({ ...scn, darkTimeline: darkTimeline.filter((p) => p.id !== id), updatedAt: stamp() });
    if (selection?.kind === 'phase' && selection.id === id) setSelection(null);
  };

  // ── 联动 + 预计算 Map ──────────────────────────────────────────
  // failBadById: 单条 rescue 的 failureVariant 指向的 BadEnding;传给 Row 让它只看自己绑定的 bad
  // boundCountByBad: 每条 BadEnding 被多少条 rescue 引用;O(N) 取代每行 O(rescue) filter
  const { failBadById, boundCountByBad } = useMemo(() => {
    const failMap = new Map<string, BadEnding | null>();
    const boundMap = new Map<string, number>();
    const badIndex = new Map(badEndings.map((b) => [b.id, b] as const));
    for (const r of rescueEndings) {
      failMap.set(r.id, r.failureVariantId ? badIndex.get(r.failureVariantId) ?? null : null);
      if (r.failureVariantId) boundMap.set(r.failureVariantId, (boundMap.get(r.failureVariantId) ?? 0) + 1);
    }
    return { failBadById: failMap, boundCountByBad: boundMap };
  }, [rescueEndings, badEndings]);

  const related = useMemo<{ rescueIds: Set<string>; badIds: Set<string> }>(() => {
    const rescueIds = new Set<string>();
    const badIds = new Set<string>();
    if (!selection) return { rescueIds, badIds };
    if (selection.kind === 'rescue') {
      const r = rescueEndings.find((x) => x.id === selection.id);
      if (r?.failureVariantId) badIds.add(r.failureVariantId);
    } else if (selection.kind === 'bad') {
      for (const r of rescueEndings) {
        if (r.failureVariantId === selection.id) rescueIds.add(r.id);
      }
    }
    return { rescueIds, badIds };
  }, [selection, rescueEndings]);

  // ── 过滤 ───────────────────────────────────────────────────────
  const { filteredRescues, filteredBads, sortedPhases } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchRescue = (r: RescueEnding): boolean => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.unlockHint.toLowerCase().includes(q)
      );
    };
    const matchBad = (b: BadEnding): boolean => {
      if (!q) return true;
      return b.condition.toLowerCase().includes(q) || b.narrative.toLowerCase().includes(q);
    };
    const matchPhase = (p: DarkPhase): boolean => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.triggers.join(' ').toLowerCase().includes(q) ||
        p.directorNote.toLowerCase().includes(q)
      );
    };
    const fr = rescueEndings.filter(matchRescue);
    const fb = badEndings.filter(matchBad);
    const fp = [...darkTimeline.filter(matchPhase)].sort((a, b) => a.threshold - b.threshold);
    return { filteredRescues: fr, filteredBads: fb, sortedPhases: fp };
  }, [search, rescueEndings, badEndings, darkTimeline]);

  // ── Esc 关闭 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  // ── 移动栏切换关 drawer:避免浮层遮挡新栏 ───────────────────────
  const switchMobileCol = useCallback((col: 'rescue' | 'bad' | 'phase') => {
    setMobileCol(col);
    setSelection(null);
  }, []);

  // ── main 容器空白点击关 drawer ─────────────────────────────────
  const handleMainBackdrop = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) setSelection(null);
  }, []);

  // ── 渲染 ───────────────────────────────────────────────────────
  const rescueColumn = (
    <Column title="拯救路径" count={filteredRescues.length}>
      {filteredRescues.length === 0 ? (
        <EmptyHint>暂无拯救路径</EmptyHint>
      ) : (
        filteredRescues.map((r) => (
          <RescueOverviewRow
            key={r.id}
            rescue={r}
            failBad={failBadById.get(r.id) ?? null}
            selected={selection?.kind === 'rescue' && selection.id === r.id}
            related={related.rescueIds.has(r.id)}
            onSelect={selectRescue}
          />
        ))
      )}
    </Column>
  );

  const badColumn = (
    <Column title="坏结局" count={filteredBads.length}>
      {filteredBads.length === 0 ? (
        <EmptyHint>暂无坏结局</EmptyHint>
      ) : (
        filteredBads.map((b) => (
          <BadEndingOverviewRow
            key={b.id}
            ending={b}
            boundCount={boundCountByBad.get(b.id) ?? 0}
            selected={selection?.kind === 'bad' && selection.id === b.id}
            related={related.badIds.has(b.id)}
            onSelect={selectBad}
          />
        ))
      )}
    </Column>
  );

  const phaseColumn = (
    <Column title="暗线阶段" count={sortedPhases.length}>
      {sortedPhases.length === 0 ? (
        <EmptyHint>暂无暗线阶段</EmptyHint>
      ) : (
        sortedPhases.map((p) => (
          <DarkPhaseOverviewRow
            key={p.id}
            phase={p}
            selected={selection?.kind === 'phase' && selection.id === p.id}
            onSelect={selectPhase}
          />
        ))
      )}
    </Column>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'rgba(10,7,4,0.45)',
      }}
    >
      <Toolbar
        search={search}
        onSearch={setSearch}
        onAddRescue={addRescue}
        onAddBad={addBad}
        onAddPhase={addPhase}
      />

      {compact && <MobileColTabs current={mobileCol} onSwitch={switchMobileCol} />}

      <main
        onClick={handleMainBackdrop}
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          position: 'relative',
        }}
      >
        {compact ? (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {mobileCol === 'rescue' && rescueColumn}
            {mobileCol === 'bad' && badColumn}
            {mobileCol === 'phase' && phaseColumn}
          </div>
        ) : (
          <>
            <div
              style={{
                flex: 4,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid rgba(196,168,85,0.18)',
              }}
            >
              {rescueColumn}
            </div>
            <div
              style={{
                flex: 3,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid rgba(196,168,85,0.18)',
              }}
            >
              {badColumn}
            </div>
            <div
              style={{
                flex: 3,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {phaseColumn}
            </div>
          </>
        )}

        <OverviewDetailDrawer
          selection={selection}
          scn={scn}
          compact={compact}
          onClose={closeDrawer}
          onPatchRescue={patchRescue}
          onRemoveRescue={removeRescue}
          onAddMilestone={addMilestone}
          onPatchMilestone={patchMilestone}
          onRemoveMilestone={removeMilestone}
          onPatchBad={patchBad}
          onRemoveBad={removeBad}
          onPatchPhase={patchPhase}
          onRemovePhase={removePhase}
        />
      </main>
    </div>
  );
}

// ── 工具栏 ─────────────────────────────────────────────────────
function Toolbar({
  search,
  onSearch,
  onAddRescue,
  onAddBad,
  onAddPhase,
}: {
  search: string;
  onSearch: (v: string) => void;
  onAddRescue: () => void;
  onAddBad: () => void;
  onAddPhase: () => void;
}): React.ReactElement {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        background: 'rgba(20,14,8,0.4)',
      }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="搜索全栏(名称/描述/触发)"
        aria-label="搜索全栏"
        style={{
          flex: 1,
          minWidth: 180,
          padding: '6px 10px',
          fontSize: 12.5,
          color: 'var(--text-light, #d0c2a0)',
          background: 'rgba(8,5,2,0.55)',
          border: '1px solid rgba(196,168,85,0.25)',
          borderRadius: 2,
          outline: 'none',
          fontFamily: 'var(--font-ui)',
        }}
      />
      <BarButton onClick={onAddRescue}>+ 拯救路径</BarButton>
      <BarButton onClick={onAddBad}>+ 坏结局</BarButton>
      <BarButton onClick={onAddPhase}>+ 暗线阶段</BarButton>
    </div>
  );
}

function BarButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const transform = pressed
    ? 'translateY(0) scale(0.97)'
    : hover ? 'translateY(-1px)' : 'translateY(0)';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '6px 12px',
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        letterSpacing: 1.2,
        color: 'var(--text-light, #d0c2a0)',
        background: hover ? 'rgba(40,28,16,0.85)' : 'rgba(20,14,8,0.6)',
        border: '1px solid rgba(196,168,85,0.4)',
        borderRadius: 3,
        cursor: 'pointer',
        boxShadow: hover && !pressed ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
        transform,
        transition: `transform 160ms ${EASE}, background 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
    >
      {children}
    </button>
  );
}

// ── 列 ────────────────────────────────────────────────────────
function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: 'linear-gradient(180deg, rgba(40,28,16,0.95), rgba(20,14,8,0.92))',
          borderBottom: '1px solid rgba(196,168,85,0.25)',
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--gold)',
            letterSpacing: 1.5,
            fontFamily: 'var(--font-ui)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-light, #d0c2a0)',
            opacity: 0.7,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {count}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 10px 16px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        padding: '24px 12px',
        textAlign: 'center',
        color: 'var(--text-light, #d0c2a0)',
        opacity: 0.5,
        fontSize: 11.5,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 1,
      }}
    >
      {children}
    </div>
  );
}

// ── 移动列切换 ─────────────────────────────────────────────────
function MobileColTabs({
  current,
  onSwitch,
}: {
  current: 'rescue' | 'bad' | 'phase';
  onSwitch: (v: 'rescue' | 'bad' | 'phase') => void;
}): React.ReactElement {
  const items: Array<{ key: 'rescue' | 'bad' | 'phase'; label: string }> = [
    { key: 'rescue', label: '拯救路径' },
    { key: 'bad', label: '坏结局' },
    { key: 'phase', label: '暗线阶段' },
  ];
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        background: 'rgba(20,14,8,0.35)',
      }}
    >
      {items.map((it) => {
        const active = current === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSwitch(it.key)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              letterSpacing: 1.2,
              color: active ? 'var(--gold)' : 'var(--text-light, #d0c2a0)',
              background: active ? 'rgba(40,28,16,0.9)' : 'rgba(20,14,8,0.5)',
              border: `1px solid ${active ? 'var(--gold)' : 'rgba(196,168,85,0.25)'}`,
              borderRadius: 3,
              cursor: 'pointer',
              transition: `background 200ms ${EASE}, color 200ms ${EASE}, border-color 200ms ${EASE}`,
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
