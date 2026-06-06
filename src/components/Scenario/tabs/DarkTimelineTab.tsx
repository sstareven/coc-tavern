// 编辑器 — 暗线时间线 tab(scn.darkTimeline 编辑 + LLM 生成)
import { memo, useEffect, useMemo, useState } from 'react';
import type { ScenarioDoc, DarkPhase } from '../../../types/scenario';
import { generateDarkTimeline } from '../../../scenario/scenario-llm';
import { applyScenarioPatch } from '../../../scenario/scenario-patch';
import { IconClose, IconRefresh, IconSparkle } from '../../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
}

// 简易 UID:phase_ + 时间戳尾 + 随机后缀(避免同毫秒新增碰撞)
function newPhaseId(): string {
  return `phase_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

function blankPhase(threshold: number): DarkPhase {
  return {
    id: newPhaseId(),
    threshold,
    title: '',
    triggers: [],
    directorNote: '',
    autoUnlockKeys: [],
  };
}

export function DarkTimelineTab({ scn, onChange }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 按 threshold 升序展示;不可变排序
  const sorted = useMemo(
    () => [...scn.darkTimeline].sort((a, b) => a.threshold - b.threshold),
    [scn.darkTimeline],
  );

  // 改一条 phase
  const patchPhase = (id: string, patch: Partial<DarkPhase>): void => {
    const next = scn.darkTimeline.map((p) => (p.id === id ? { ...p, ...patch } : p));
    onChange({ ...scn, darkTimeline: next, updatedAt: Date.now() });
  };

  const removePhase = (id: string): void => {
    onChange({
      ...scn,
      darkTimeline: scn.darkTimeline.filter((p) => p.id !== id),
      updatedAt: Date.now(),
    });
  };

  const addPhase = (): void => {
    // 新阶段默认 threshold=已有最大值+10(夹到 0~100),空列表则 20
    const maxT = scn.darkTimeline.reduce((m, p) => Math.max(m, p.threshold), 0);
    const t = Math.min(100, scn.darkTimeline.length === 0 ? 20 : maxT + 10);
    onChange({
      ...scn,
      darkTimeline: [...scn.darkTimeline, blankPhase(t)],
      updatedAt: Date.now(),
    });
  };

  const clearAll = (): void => {
    if (scn.darkTimeline.length === 0) return;
    if (!window.confirm('清空所有暗线阶段?此操作不可撤销')) return;
    onChange({ ...scn, darkTimeline: [], updatedAt: Date.now() });
  };

  const onGenerate = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const patch = await generateDarkTimeline(scn.meta, scn.entries);
      onChange(applyScenarioPatch(scn, patch));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 4px' }}>
      <Toolbar busy={busy} onAdd={addPhase} onGenerate={onGenerate} onClear={clearAll} />
      {err && <ErrBox text={err} onClose={() => setErr(null)} />}

      {sorted.length === 0 ? (
        <Empty />
      ) : (
        sorted.map((p) => (
          <PhaseCard
            key={p.id}
            phase={p}
            onChange={(patch) => patchPhase(p.id, patch)}
            onRemove={() => removePhase(p.id)}
          />
        ))
      )}
    </div>
  );
}

// ── 顶部工具栏 ──
function Toolbar({
  busy,
  onAdd,
  onGenerate,
  onClear,
}: {
  busy: boolean;
  onAdd: () => void;
  onGenerate: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <BarButton onClick={onAdd}>+ 新阶段</BarButton>
      <BarButton onClick={onGenerate} primary disabled={busy}>
        {busy ? (
          '生成中…'
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconSparkle size={12} />
            LLM 生成
          </span>
        )}
      </BarButton>
      <BarButton onClick={onClear} danger>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconRefresh size={12} />
          清空
        </span>
      </BarButton>
    </div>
  );
}

function BarButton({
  onClick,
  children,
  primary,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const border = primary ? 'var(--gold)' : danger ? '#a05050' : 'rgba(196,168,85,0.4)';
  const color = primary ? 'var(--gold)' : danger ? '#d08585' : 'var(--text-light, #d0c2a0)';
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

// ── 单个 phase 卡片 ──
// 用 React.memo + 按 phase.id/字段浅比对避免父级 onChange identity 变化触发整树 re-render
const PhaseCard = memo(
  function PhaseCard({
    phase,
    onChange,
    onRemove,
  }: {
    phase: DarkPhase;
    onChange: (patch: Partial<DarkPhase>) => void;
    onRemove: () => void;
  }): React.ReactElement {
    return (
      <article
        style={{
          padding: 14,
          background: 'linear-gradient(180deg, rgba(40,28,16,0.85), rgba(20,14,8,0.92))',
          border: '1px solid rgba(196,168,85,0.35)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--ink, #8a7a52)', letterSpacing: 1.5, fontFamily: 'var(--font-mono)' }}>
            {phase.id}
          </span>
          <button
            type="button"
            onClick={onRemove}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              color: '#d08585',
              background: 'transparent',
              border: '1px solid rgba(160,80,80,0.5)',
              borderRadius: 2,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 1,
              transition: `background 180ms ${EASE}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(160,80,80,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            删除
          </button>
        </header>

        {/* threshold 滑块 — 拖动量大,不走 draft */}
        <Field label={`门槛 — ${phase.threshold}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={phase.threshold}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--gold, #c4a855)' }}
          />
        </Field>

        <Field label="标题">
          <TextInput value={phase.title} onCommit={(v) => onChange({ title: v })} placeholder="如:暮色降临" />
        </Field>

        <Field label="触发事件(每行一条)">
          <TextArea
            rows={3}
            value={phase.triggers.join('\n')}
            onCommit={(v) => onChange({ triggers: linesToArr(v) })}
          />
        </Field>

        <Field label="守秘人导演词">
          <TextArea rows={4} value={phase.directorNote} onCommit={(v) => onChange({ directorNote: v })} />
        </Field>

        <Field label="自动解锁 key(进入此阶段时写入 /剧情/已解锁/<key>)">
          <ChipEditor values={phase.autoUnlockKeys} onChange={(arr) => onChange({ autoUnlockKeys: arr })} />
        </Field>
      </article>
    );
  },
  (prev, next) =>
    prev.phase.id === next.phase.id &&
    prev.phase.threshold === next.phase.threshold &&
    prev.phase.title === next.phase.title &&
    prev.phase.directorNote === next.phase.directorNote &&
    prev.phase.triggers === next.phase.triggers &&
    prev.phase.autoUnlockKeys === next.phase.autoUnlockKeys,
);

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, color: 'var(--ink, #8a7a52)', letterSpacing: 1.2, fontFamily: 'var(--font-ui)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// 受控输入但用 local draft + onBlur 才上抛,避免每次按键触发父级 re-render(尤其中文输入法)
function TextInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  // 外部 value 变化(如 LLM 生成/撤销)时同步本地 draft
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{
        padding: '6px 8px',
        fontSize: 13,
        color: 'var(--text-light, #d0c2a0)',
        background: 'rgba(8,5,2,0.55)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 2,
        outline: 'none',
        fontFamily: 'var(--font-ui)',
      }}
    />
  );
}

function TextArea({
  value,
  onCommit,
  rows,
}: {
  value: string;
  onCommit: (v: string) => void;
  rows: number;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <textarea
      rows={rows}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{
        padding: '6px 8px',
        fontSize: 12.5,
        lineHeight: 1.55,
        color: 'var(--text-light, #d0c2a0)',
        background: 'rgba(8,5,2,0.55)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 2,
        outline: 'none',
        resize: 'vertical',
        fontFamily: 'var(--font-ui)',
      }}
    />
  );
}

// chip 编辑器:全角/半角逗号 + 回车确认;Backspace 删尾
function ChipEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (arr: string[]) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    const t = draft.trim();
    if (!t) return;
    if (values.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...values, t]);
    setDraft('');
  };
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '4px 6px',
        background: 'rgba(8,5,2,0.55)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 2,
        minHeight: 30,
        alignItems: 'center',
      }}
    >
      {values.map((v, i) => (
        <Chip key={`${v}_${i}`} value={v} onRemove={() => onChange(values.filter((_, j) => j !== i))} />
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? '回车/逗号 确认' : ''}
        style={{
          flex: 1,
          minWidth: 80,
          padding: '2px 4px',
          fontSize: 12,
          color: 'var(--text-light, #d0c2a0)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-ui)',
        }}
      />
    </div>
  );
}

// chip 单元:独立 memo 子组件,避免同列其他 chip onChange identity 变化触发整行重渲
const Chip = memo(
  function Chip({ value, onRemove }: { value: string; onRemove: () => void }): React.ReactElement {
    return (
      <span
        style={{
          padding: '2px 8px',
          fontSize: 11,
          background: 'rgba(196,168,85,0.12)',
          border: '1px solid rgba(196,168,85,0.4)',
          color: 'var(--gold)',
          borderRadius: 2,
          fontFamily: 'var(--font-ui)',
          letterSpacing: 1,
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {value}
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--gold)',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
          aria-label="移除"
        >
          <IconClose size={12} />
        </button>
      </span>
    );
  },
  (prev, next) => prev.value === next.value,
);

function ErrBox({ text, onClose }: { text: string; onClose: () => void }): React.ReactElement {
  return (
    <div
      style={{
        padding: '8px 12px',
        fontSize: 12,
        color: '#e0a0a0',
        background: 'rgba(60,20,20,0.4)',
        border: '1px solid #a05050',
        borderRadius: 3,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#e0a0a0',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          padding: 0,
        }}
        aria-label="关闭"
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}

function Empty(): React.ReactElement {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--ink, #8a7a52)',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ marginBottom: 6 }}>暂无暗线阶段</div>
      <div style={{ opacity: 0.7, display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        点击「+ 新阶段」手动添加，或「
        <IconSparkle size={12} />
        LLM 生成」据元信息自动产出
      </div>
    </div>
  );
}

function linesToArr(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
