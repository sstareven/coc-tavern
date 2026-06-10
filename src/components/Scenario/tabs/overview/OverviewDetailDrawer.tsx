// 总览 tab — 右侧详情抽屉容器
// 根据 selection.kind 切换渲染 RescueCard / EndingCard / PhaseCard
// 桌面侧滑(absolute right), 移动底部 sheet(fixed bottom 60dvh)
import { useEffect, useState } from 'react';
import type { ScenarioDoc, RescueEnding, BadEnding, DarkPhase, RescueMilestone } from '../../../../types/scenario';
import type { OverviewSelection } from './OverviewTab';
import { RescueCard } from '../RescueEndingsTab';
import { EndingCard } from '../BadEndingsTab';
import { PhaseCard } from '../DarkTimelineTab';
import { IconClose } from '../../../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

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

  const [open, setOpen] = useState(false);
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : '';

  useEffect(() => {
    if (!selection) return;
    setOpen(false);
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [selection, selectionKey]);

  // 选中目标失效时(被删/找不到)自动关闭 — hook 必须在 return null 之前声明
  const missing = (() => {
    if (!selection) return false;
    if (selection.kind === 'rescue') return !(scn.rescueEndings ?? []).some((r) => r.id === selection.id);
    if (selection.kind === 'bad') return !scn.badEndings.some((b) => b.id === selection.id);
    if (selection.kind === 'phase') return !scn.darkTimeline.some((p) => p.id === selection.id);
    return false;
  })();

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  if (!selection) return null;
  if (missing) return null;

  let title = '';
  let body: React.ReactElement | null = null;

  if (selection.kind === 'rescue') {
    const rescue = (scn.rescueEndings ?? []).find((r) => r.id === selection.id);
    if (!rescue) return null;
    title = rescue.name || rescue.id;
    body = (
      <RescueCard
        rescue={rescue}
        badEndings={scn.badEndings}
        onChange={(patch) => onPatchRescue(rescue.id, patch)}
        onRemove={() => onRemoveRescue(rescue.id)}
        onAddMilestone={() => onAddMilestone(rescue.id)}
        onPatchMilestone={(msId, patch) => onPatchMilestone(rescue.id, msId, patch)}
        onRemoveMilestone={(msId) => onRemoveMilestone(rescue.id, msId)}
      />
    );
  } else if (selection.kind === 'bad') {
    const ending = scn.badEndings.find((b) => b.id === selection.id);
    if (!ending) return null;
    const boundBy = (scn.rescueEndings ?? [])
      .filter((r) => r.failureVariantId === ending.id)
      .map((r) => r.name || r.id);
    title = ending.id;
    body = (
      <EndingCard
        ending={ending}
        boundBy={boundBy}
        onChange={(patch) => onPatchBad(ending.id, patch)}
        onRemove={() => onRemoveBad(ending.id)}
      />
    );
  } else if (selection.kind === 'phase') {
    const phase = scn.darkTimeline.find((p) => p.id === selection.id);
    if (!phase) return null;
    title = phase.title || phase.id;
    body = (
      <PhaseCard
        phase={phase}
        onChange={(patch) => onPatchPhase(phase.id, patch)}
        onRemove={() => onRemovePhase(phase.id)}
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
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-light, #d0c2a0)',
          transition: `transform 160ms ${EASE}, background 200ms ${EASE}`,
          borderRadius: 2,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.background = 'rgba(40,28,16,0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.background = 'transparent';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.97)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px) scale(1)';
        }}
      >
        <IconClose size={14} />
      </button>
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
          transition: `transform 250ms ${EASE}`,
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(8,5,2,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
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
          transition: `transform 250ms ${EASE}`,
        }}
      >
        {header}
        {main}
      </div>
    </div>
  );
}
