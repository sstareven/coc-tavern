// 编辑器 — 坏结局矩阵 tab(scn.badEndings 编辑 + LLM 生成)
import { useState } from 'react';
import type { ScenarioDoc, BadEnding } from '../../../types/scenario';
import { generateBadEndings } from '../../../scenario/scenario-llm';
import { applyScenarioPatch } from '../../../scenario/scenario-patch';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
}

function newEndingId(): string {
  return `bad_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

function blankEnding(): BadEnding {
  return { id: newEndingId(), condition: '', narrative: '', accelerators: [] };
}

export function BadEndingsTab({ scn, onChange }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patchOne = (id: string, patch: Partial<BadEnding>): void => {
    onChange({
      ...scn,
      badEndings: scn.badEndings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      updatedAt: Date.now(),
    });
  };

  const removeOne = (id: string): void => {
    onChange({ ...scn, badEndings: scn.badEndings.filter((b) => b.id !== id), updatedAt: Date.now() });
  };

  const addOne = (): void => {
    onChange({ ...scn, badEndings: [...scn.badEndings, blankEnding()], updatedAt: Date.now() });
  };

  const clearAll = (): void => {
    if (scn.badEndings.length === 0) return;
    if (!window.confirm('清空所有坏结局?此操作不可撤销')) return;
    onChange({ ...scn, badEndings: [], updatedAt: Date.now() });
  };

  const onGenerate = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const patch = await generateBadEndings(scn.darkTimeline, scn.entries);
      onChange(applyScenarioPatch(scn, patch));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 4px' }}>
      <Toolbar busy={busy} onAdd={addOne} onGenerate={onGenerate} onClear={clearAll} />
      {err && <ErrBox text={err} onClose={() => setErr(null)} />}

      {scn.badEndings.length === 0 ? (
        <Empty />
      ) : (
        scn.badEndings.map((b) => (
          <EndingCard
            key={b.id}
            ending={b}
            onChange={(patch) => patchOne(b.id, patch)}
            onRemove={() => removeOne(b.id)}
          />
        ))
      )}
    </div>
  );
}

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
      <BarButton onClick={onAdd}>+ 新坏结局</BarButton>
      <BarButton onClick={onGenerate} primary disabled={busy}>
        {busy ? '生成中…' : '✨ LLM 生成'}
      </BarButton>
      <BarButton onClick={onClear} danger>♻ 清空</BarButton>
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

function EndingCard({
  ending,
  onChange,
  onRemove,
}: {
  ending: BadEnding;
  onChange: (patch: Partial<BadEnding>) => void;
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
          {ending.id}
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

      <Field label="触发条件(自然语言:SAN/暗线进度/NPC 态度组合)">
        <TextArea rows={2} value={ending.condition} onChange={(v) => onChange({ condition: v })} />
      </Field>

      <Field label="结局叙述">
        <TextArea rows={4} value={ending.narrative} onChange={(v) => onChange({ narrative: v })} />
      </Field>

      <Field label="加速因子(玩家越多此类行为越快坠入)">
        <ChipEditor values={ending.accelerators} onChange={(arr) => onChange({ accelerators: arr })} />
      </Field>
    </article>
  );
}

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

function TextArea({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
}): React.ReactElement {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
        <span
          key={`${v}_${i}`}
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
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--gold)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 12,
              lineHeight: 1,
            }}
            aria-label="移除"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ',') {
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
        style={{ background: 'transparent', border: 'none', color: '#e0a0a0', cursor: 'pointer' }}
      >
        ×
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
      <div style={{ marginBottom: 6 }}>暂无坏结局</div>
      <div style={{ opacity: 0.7 }}>点击「+ 新坏结局」手动添加，或「✨ LLM 生成」据暗线/线索自动产出</div>
    </div>
  );
}
