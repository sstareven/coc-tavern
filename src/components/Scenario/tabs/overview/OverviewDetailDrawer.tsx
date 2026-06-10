// 总览 tab — 右侧详情抽屉容器
// 根据 selection.kind 切换渲染 RescueCard / EndingCard / PhaseCard
// 桌面侧滑(absolute right), 移动底部 sheet(fixed bottom 60dvh)
// 关闭前先 blur 焦点元素(让 RescueCard/EndingCard/PhaseCard 内 onBlur draft 提交);
// 关闭走 250ms 退场后才 unmount,焦点还原到打开前来源元素;
// 头部含返回 + 标题 + 删除(取代 Card 内嵌右上角删除)
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ScenarioDoc, RescueEnding, BadEnding, DarkPhase, RescueMilestone } from '../../../../types/scenario';
import type { OverviewSelection } from './OverviewTab';
import { RescueCard } from '../RescueEndingsTab';
import { EndingCard } from '../BadEndingsTab';
import { PhaseCard } from '../DarkTimelineTab';
import { IconClose } from '../../../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const TRANSITION_MS = 250;

interface Props {
  selection: OverviewSelection;
  scn: ScenarioDoc;
  compact: boolean;
  onPatchRescue: (id: string, patch: Partial<RescueEnding>) => void;
  onRemoveRescue: (id: string) => void;
  onAddMilestone: (rescueId: string) => void;
  onPatchMilestone: (rescueId: string, msId: string, patch: Partial<RescueMilestone>) => void;
  onRemoveMilestone: (rescueId: string, msId: string) => void;
  onPatchBad: (id: string, patch: Partial<BadEnding>) => void;
  onRemoveBad: (id: string) => void;
  onPatchPhase: (id: string, patch: Partial<DarkPhase>) => void;
  onRemovePhase: (id: string) => void;
  onClose: () => void;
}

export function OverviewDetailDrawer(props: Props): React.ReactElement | null {
  const {
    selection,
    scn,
    compact,
    onPatchRescue,
    onRemoveRescue,
    onAddMilestone,
    onPatchMilestone,
    onRemoveMilestone,
    onPatchBad,
    onRemoveBad,
    onPatchPhase,
    onRemovePhase,
    onClose,
  } = props;

  // 缓存最近一次非空 selection,让 selection→null 时仍能渲染内容做退场动画
  const [mountedSel, setMountedSel] = useState<OverviewSelection>(selection);
  const [open, setOpen] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // selection 变化:进场/切换内容/退场
  useEffect(() => {
    if (selection) {
      // 记录打开前的焦点(仅从 null→有值这一刻);切换内容时 lastFocusRef 已锁
      if (!mountedSel) lastFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
      setMountedSel(selection);
      setOpen(true);
      return;
    }
    // selection 变 null:走退场。先 blur 当前焦点元素以触发 Card 内 onBlur draft 提交,
    // 再 setOpen(false) 让 transform 跑回 100%;TRANSITION_MS 后才把 mountedSel 清掉真正 unmount
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
    setOpen(false);
    const t = window.setTimeout(() => {
      setMountedSel(null);
      // 退场结束:把焦点还原到来源元素(若仍可聚焦)
      const origin = lastFocusRef.current;
      lastFocusRef.current = null;
      if (origin && typeof origin.focus === 'function' && document.contains(origin)) origin.focus();
    }, TRANSITION_MS);
    return () => window.clearTimeout(t);
  // mountedSel 是派生 state,只用 selection 触发
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // 进场后把焦点送入抽屉(close 按钮)避免键盘用户落在已隐藏的来源
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 16);
    return () => window.clearTimeout(t);
  }, [open, mountedSel?.kind, mountedSel?.id]);

  // 选中目标失效(被删/找不到)自动关闭
  const missing = (() => {
    if (!mountedSel) return false;
    if (mountedSel.kind === 'rescue') return !(scn.rescueEndings ?? []).some((r) => r.id === mountedSel.id);
    if (mountedSel.kind === 'bad') return !scn.badEndings.some((b) => b.id === mountedSel.id);
    if (mountedSel.kind === 'phase') return !scn.darkTimeline.some((p) => p.id === mountedSel.id);
    return false;
  })();

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  if (!mountedSel) return null;
  if (missing) return null;

  let title = '';
  let body: React.ReactElement | null = null;
  let onDelete: (() => void) | null = null;

  if (mountedSel.kind === 'rescue') {
    const rescue = (scn.rescueEndings ?? []).find((r) => r.id === mountedSel.id);
    if (!rescue) return null;
    title = rescue.name || rescue.id;
    onDelete = () => { onRemoveRescue(rescue.id); onClose(); };
    body = (
      <RescueCard
        rescue={rescue}
        badEndings={scn.badEndings}
        onChange={(patch) => onPatchRescue(rescue.id, patch)}
        onRemove={onDelete}
        onAddMilestone={() => onAddMilestone(rescue.id)}
        onPatchMilestone={(msId, patch) => onPatchMilestone(rescue.id, msId, patch)}
        onRemoveMilestone={(msId) => onRemoveMilestone(rescue.id, msId)}
        hideRemove
      />
    );
  } else if (mountedSel.kind === 'bad') {
    const ending = scn.badEndings.find((b) => b.id === mountedSel.id);
    if (!ending) return null;
    const boundBy = (scn.rescueEndings ?? [])
      .filter((r) => r.failureVariantId === ending.id)
      .map((r) => r.name || r.id);
    title = ending.id;
    onDelete = () => { onRemoveBad(ending.id); onClose(); };
    body = (
      <EndingCard
        ending={ending}
        boundBy={boundBy}
        onChange={(patch) => onPatchBad(ending.id, patch)}
        onRemove={onDelete}
        hideRemove
      />
    );
  } else if (mountedSel.kind === 'phase') {
    const phase = scn.darkTimeline.find((p) => p.id === mountedSel.id);
    if (!phase) return null;
    title = phase.title || phase.id;
    onDelete = () => { onRemovePhase(phase.id); onClose(); };
    body = (
      <PhaseCard
        phase={phase}
        onChange={(patch) => onPatchPhase(phase.id, patch)}
        onRemove={onDelete}
        hideRemove
      />
    );
  }

  const header = (
    <div
      style={{
        position: 'sticky',
        top: 0,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(8,5,2,0.95)',
        zIndex: 1,
      }}
    >
      <DrawerIconButton ref={closeBtnRef} ariaLabel="关闭" onClick={onClose}>
        <IconClose size={14} />
      </DrawerIconButton>
      <div
        title={title}
        style={{
          fontSize: 13,
          color: 'var(--gold)',
          letterSpacing: 1.5,
          fontFamily: 'var(--font-ui)',
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      {onDelete && (
        <DrawerDangerButton onClick={onDelete}>删除</DrawerDangerButton>
      )}
    </div>
  );

  const main = (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 14,
        minHeight: 0,
      }}
    >
      {body}
    </div>
  );

  if (!compact) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`详情 — ${title}`}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          background: 'rgba(8,5,2,0.96)',
          borderLeft: '1px solid rgba(196,168,85,0.35)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateX(${open ? '0' : '100%'})`,
          transition: `transform ${TRANSITION_MS}ms ${EASE}`,
          boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
        }}
      >
        {header}
        {main}
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(8,5,2,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        opacity: open ? 1 : 0,
        transition: `opacity ${TRANSITION_MS}ms ${EASE}`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`详情 — ${title}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '60dvh',
          maxHeight: '80dvh',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(8,5,2,0.96)',
          borderTop: '1px solid rgba(196,168,85,0.35)',
          boxShadow: '0 -16px 40px rgba(0,0,0,0.7)',
          transform: `translateY(${open ? '0' : '100%'})`,
          transition: `transform ${TRANSITION_MS}ms ${EASE}`,
        }}
      >
        {header}
        {main}
      </div>
    </div>
  );
}

// ── 小组件 ──

const DrawerIconButton = forwardRef<HTMLButtonElement, { ariaLabel: string; onClick: () => void; children: React.ReactNode }>(
  function DrawerIconButton({ ariaLabel, onClick, children }, ref): React.ReactElement {
    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);
    const transform = pressed ? 'scale(0.97)' : hover ? 'translateY(-1px)' : 'translateY(0)';
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          background: hover ? 'rgba(40,28,16,0.6)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-light, #d0c2a0)',
          transition: `transform 160ms ${EASE}, background 200ms ${EASE}`,
          borderRadius: 2,
          transform,
        }}
      >
        {children}
      </button>
    );
  },
);

function DrawerDangerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const transform = pressed ? 'scale(0.97)' : hover ? 'translateY(-1px)' : 'translateY(0)';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        letterSpacing: 1.2,
        color: '#d08585',
        background: hover ? 'rgba(160,80,80,0.22)' : 'transparent',
        border: '1px solid rgba(160,80,80,0.5)',
        borderRadius: 2,
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
        boxShadow: hover && !pressed ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
        transform,
        transition: `transform 160ms ${EASE}, background 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
    >
      {children}
    </button>
  );
}
