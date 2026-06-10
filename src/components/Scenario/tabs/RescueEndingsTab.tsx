// 编辑器 — 拯救路径 tab(scn.rescueEndings 编辑 + 失败变体下拉 + 里程碑子列表)
// 参考 BadEndingsTab/DarkTimelineTab:卡片列表 + 工具栏 + 顶部统计 + memo 子组件 + onBlur draft
import { memo, useEffect, useState } from 'react';
import type { ScenarioDoc, RescueEnding, RescueMilestone } from '../../../types/scenario';
import { IconClose } from '../../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
}

function newRescueId(): string {
  return `res_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

function newMilestoneId(): string {
  return `ms_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

function blankRescue(): RescueEnding {
  return { id: newRescueId(), name: '', description: '', unlockHint: '', milestones: [] };
}

function blankMilestone(): RescueMilestone {
  return { id: newMilestoneId(), name: '', delta: 25 };
}

export function RescueEndingsTab({ scn, onChange }: Props): React.ReactElement {
  const rescueEndings = scn.rescueEndings ?? [];

  const patchOne = (id: string, patch: Partial<RescueEnding>): void => {
    onChange({
      ...scn,
      rescueEndings: rescueEndings.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      updatedAt: Date.now(),
    });
  };

  const removeOne = (id: string): void => {
    onChange({ ...scn, rescueEndings: rescueEndings.filter((r) => r.id !== id), updatedAt: Date.now() });
  };

  const addOne = (): void => {
    onChange({ ...scn, rescueEndings: [...rescueEndings, blankRescue()], updatedAt: Date.now() });
  };

  const clearAll = (): void => {
    if (rescueEndings.length === 0) return;
    if (!window.confirm('清空所有拯救路径?此操作不可撤销')) return;
    onChange({ ...scn, rescueEndings: [], updatedAt: Date.now() });
  };

  const addMilestone = (rescueId: string): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchOne(rescueId, { milestones: [...target.milestones, blankMilestone()] });
  };

  const patchMilestone = (rescueId: string, msId: string, patch: Partial<RescueMilestone>): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchOne(rescueId, {
      milestones: target.milestones.map((m) => (m.id === msId ? { ...m, ...patch } : m)),
    });
  };

  const removeMilestone = (rescueId: string, msId: string): void => {
    const target = rescueEndings.find((r) => r.id === rescueId);
    if (!target) return;
    patchOne(rescueId, { milestones: target.milestones.filter((m) => m.id !== msId) });
  };

  const totalMilestones = rescueEndings.reduce((sum, r) => sum + r.milestones.length, 0);
  const unboundCount = rescueEndings.filter((r) => !r.failureVariantId).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14,
      padding: '10px 14px 16px',
      height: '100%', minHeight: 0,
      overflowY: 'auto',
    }}>
      <Toolbar onAdd={addOne} onClear={clearAll} />
      <StatBar paths={rescueEndings.length} milestones={totalMilestones} unbound={unboundCount} />

      {rescueEndings.length === 0 ? (
        <Empty />
      ) : (
        rescueEndings.map((r) => (
          <RescueCard
            key={r.id}
            rescue={r}
            badEndings={scn.badEndings}
            onChange={(patch) => patchOne(r.id, patch)}
            onRemove={() => removeOne(r.id)}
            onAddMilestone={() => addMilestone(r.id)}
            onPatchMilestone={(msId, patch) => patchMilestone(r.id, msId, patch)}
            onRemoveMilestone={(msId) => removeMilestone(r.id, msId)}
          />
        ))
      )}
    </div>
  );
}

function Toolbar({ onAdd, onClear }: { onAdd: () => void; onClear: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <BarButton onClick={onAdd}>+ 新拯救路径</BarButton>
      <BarButton onClick={onClear} danger>清空</BarButton>
    </div>
  );
}

function StatBar({ paths, milestones, unbound }: { paths: number; milestones: number; unbound: number }): React.ReactElement {
  return (
    <div style={{
      display: 'flex', gap: 16,
      padding: '6px 10px',
      background: 'rgba(20,14,8,0.4)',
      border: '1px solid rgba(196,168,85,0.18)',
      borderRadius: 3,
      fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-light, #d0c2a0)',
      letterSpacing: 1.2,
    }}>
      <span>路径 <strong data-testid="rescue-stat-paths" style={{ color: 'var(--gold)' }}>{paths}</strong></span>
      <span>里程碑 <strong data-testid="rescue-stat-milestones" style={{ color: 'var(--gold)' }}>{milestones}</strong></span>
      <span>未绑失败变体 <strong data-testid="rescue-stat-unbound" style={{ color: unbound > 0 ? 'var(--blood, #8b1e1e)' : 'var(--gold)' }}>{unbound}</strong></span>
    </div>
  );
}

function BarButton({
  onClick, children, danger, disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const border = danger ? '#a05050' : 'rgba(196,168,85,0.4)';
  const color = danger ? '#d08585' : 'var(--text-light, #d0c2a0)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        letterSpacing: 1.2,
        color,
        background: 'rgba(20,14,8,0.6)',
        border: `1px solid ${border}`,
        borderRadius: 3,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: `transform 160ms ${EASE}, background 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        e.currentTarget.style.background = 'rgba(40,28,16,0.85)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.background = 'rgba(20,14,8,0.6)';
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
      }}
      onMouseUp={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px) scale(1)';
      }}
    >
      {children}
    </button>
  );
}

export const RescueCard = memo(
  function RescueCard({
    rescue,
    badEndings,
    onChange,
    onRemove,
    onAddMilestone,
    onPatchMilestone,
    onRemoveMilestone,
  }: {
    rescue: RescueEnding;
    badEndings: ScenarioDoc['badEndings'];
    onChange: (patch: Partial<RescueEnding>) => void;
    onRemove: () => void;
    onAddMilestone: () => void;
    onPatchMilestone: (msId: string, patch: Partial<RescueMilestone>) => void;
    onRemoveMilestone: (msId: string) => void;
  }): React.ReactElement {
    return (
      <article
        data-testid={`rescue-card-${rescue.id}`}
        style={{
          padding: 14,
          background: 'linear-gradient(180deg, rgba(40,28,16,0.85), rgba(20,14,8,0.92))',
          border: '1px solid rgba(196,168,85,0.35)',
          borderRadius: 4,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{
            fontSize: 10, color: 'var(--gold)', opacity: 0.45,
            letterSpacing: 1.5, fontFamily: 'var(--font-mono)',
          }}>{rescue.id}</span>
          <button
            type="button"
            onClick={onRemove}
            style={{
              padding: '2px 8px', fontSize: 10, color: '#d08585',
              background: 'transparent', border: '1px solid rgba(160,80,80,0.5)', borderRadius: 2,
              cursor: 'pointer', fontFamily: 'var(--font-ui)', letterSpacing: 1,
              transition: `background 180ms ${EASE}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(160,80,80,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >删除</button>
        </header>

        <Field label="路径名">
          <TextInput value={rescue.name} onCommit={(v) => onChange({ name: v })} placeholder="如:封印古神" />
        </Field>

        <Field label="路径描述">
          <TextArea rows={3} value={rescue.description} onCommit={(v) => onChange({ description: v })} />
        </Field>

        <Field label="解锁条件提示(给 LLM 判定)">
          <TextArea rows={2} value={rescue.unlockHint} onCommit={(v) => onChange({ unlockHint: v })} />
        </Field>

        <Field label="失败变体">
          <select
            aria-label="失败变体"
            value={rescue.failureVariantId ?? ''}
            onChange={(e) => onChange({ failureVariantId: e.target.value || undefined })}
            style={{
              padding: '6px 8px', fontSize: 13,
              color: 'var(--text-light, #d0c2a0)',
              background: 'rgba(8,5,2,0.55)',
              border: '1px solid rgba(196,168,85,0.25)',
              borderRadius: 2, outline: 'none',
              fontFamily: 'var(--font-ui)',
            }}
          >
            <option value="">(无 — 路径推进失败则全局判负)</option>
            {badEndings.map((b) => (
              <option key={b.id} value={b.id}>{b.id}</option>
            ))}
          </select>
        </Field>

        <Field label="里程碑">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rescue.milestones.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-light, #d0c2a0)', opacity: 0.55 }}>暂无里程碑</div>
            )}
            {rescue.milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                onChange={(patch) => onPatchMilestone(m.id, patch)}
                onRemove={() => onRemoveMilestone(m.id)}
              />
            ))}
            <div>
              <BarButton onClick={onAddMilestone}>+ 新里程碑</BarButton>
            </div>
          </div>
        </Field>
      </article>
    );
  },
  (prev, next) =>
    prev.rescue.id === next.rescue.id &&
    prev.rescue.name === next.rescue.name &&
    prev.rescue.description === next.rescue.description &&
    prev.rescue.unlockHint === next.rescue.unlockHint &&
    prev.rescue.failureVariantId === next.rescue.failureVariantId &&
    prev.rescue.milestones === next.rescue.milestones &&
    prev.badEndings === next.badEndings,
);

const MilestoneRow = memo(
  function MilestoneRow({
    milestone, onChange, onRemove,
  }: {
    milestone: RescueMilestone;
    onChange: (patch: Partial<RescueMilestone>) => void;
    onRemove: () => void;
  }): React.ReactElement {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: 8,
        background: 'rgba(8,5,2,0.4)',
        border: '1px solid rgba(196,168,85,0.18)',
        borderRadius: 3,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TextInput value={milestone.name} onCommit={(v) => onChange({ name: v })} placeholder="里程碑名" />
          <button
            type="button"
            data-testid={`milestone-del-${milestone.id}`}
            onClick={onRemove}
            aria-label="删除里程碑"
            style={{
              background: 'transparent', border: 'none',
              color: '#d08585', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', padding: 4,
            }}
          ><IconClose size={12} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--gold)', opacity: 0.55, letterSpacing: 1.2, minWidth: 64 }}>
            推进 +{milestone.delta}
          </span>
          <input
            type="range"
            data-testid={`milestone-delta-${milestone.id}`}
            min={5} max={100} step={5}
            value={milestone.delta}
            onChange={(e) => onChange({ delta: Number(e.target.value) })}
            style={{ flex: 1, accentColor: 'var(--gold, #c4a855)' }}
          />
        </div>
        <TextArea
          rows={2}
          value={milestone.hint ?? ''}
          onCommit={(v) => onChange({ hint: v || undefined })}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.milestone.id === next.milestone.id &&
    prev.milestone.name === next.milestone.name &&
    prev.milestone.delta === next.milestone.delta &&
    prev.milestone.hint === next.milestone.hint,
);

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        fontSize: 10, color: 'var(--gold)', opacity: 0.55,
        letterSpacing: 1.2, fontFamily: 'var(--font-ui)',
      }}>{label}</div>
      {children}
    </div>
  );
}

function TextInput({
  value, onCommit, placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      style={{
        padding: '6px 8px', fontSize: 13,
        color: 'var(--text-light, #d0c2a0)',
        background: 'rgba(8,5,2,0.55)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 2, outline: 'none',
        fontFamily: 'var(--font-ui)',
        flex: 1, minWidth: 0,
      }}
    />
  );
}

function TextArea({
  value, onCommit, rows,
}: {
  value: string;
  onCommit: (v: string) => void;
  rows: number;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <textarea
      rows={rows}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      style={{
        padding: '6px 8px', fontSize: 12.5, lineHeight: 1.55,
        color: 'var(--text-light, #d0c2a0)',
        background: 'rgba(8,5,2,0.55)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 2, outline: 'none', resize: 'vertical',
        fontFamily: 'var(--font-ui)',
      }}
    />
  );
}

function Empty(): React.ReactElement {
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      color: 'var(--text-light, #d4c4a0)', opacity: 0.6,
      fontSize: 12, fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ marginBottom: 6 }}>暂无拯救路径</div>
      <div style={{ opacity: 0.85 }}>点击「+ 新拯救路径」手动添加,每条路径的里程碑驱动 /剧情/救援/路径 进度</div>
    </div>
  );
}
