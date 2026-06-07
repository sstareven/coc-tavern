// 元信息 tab — 见 docs/specs/2026-06-06-scenario-system-design.md §5.1 / §E4
// 编辑 ScenarioMeta + prologueSeed + recommendedSkills/Occupations(chip 行)
import { useState } from 'react';
import type { ScenarioDoc, ScenarioMeta } from '../../../types/scenario';
import { IconClose } from '../../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
}

const TYPE_OPTS: ScenarioMeta['type'][] = ['调查', '战斗', '玩职', '剧本', '混合'];
const DURATION_OPTS: ScenarioMeta['durationHint'][] = ['1-2h', '3-5h', '长期连载'];
const SAN_OPTS: ScenarioMeta['sanLossHint'][] = ['低', '中', '高', '极高'];

export function MetaTab({ scn, onChange }: Props) {
  const patchMeta = (m: Partial<ScenarioMeta>): void => {
    onChange({ ...scn, meta: { ...scn.meta, ...m }, updatedAt: Date.now() });
  };
  const setField = <K extends keyof ScenarioDoc>(k: K, v: ScenarioDoc[K]): void => {
    onChange({ ...scn, [k]: v, updatedAt: Date.now() });
  };

  return (
    <div style={{ padding: 18, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="基本信息">
        <Row label="剧本名">
          <input style={inputStyle} value={scn.meta.name} onChange={(e) => patchMeta({ name: e.target.value })} />
        </Row>
        <Row label="一句话背景">
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={2}
            maxLength={500}
            value={scn.meta.blurb}
            onChange={(e) => patchMeta({ blurb: e.target.value })}
          />
          <CharCounter value={scn.meta.blurb} max={500} />
        </Row>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Row label="类型" compact>
            <select style={inputStyle} value={scn.meta.type} onChange={(e) => patchMeta({ type: e.target.value as ScenarioMeta['type'] })}>
              {TYPE_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Row>
          <Row label="时长" compact>
            <select style={inputStyle} value={scn.meta.durationHint} onChange={(e) => patchMeta({ durationHint: e.target.value as ScenarioMeta['durationHint'] })}>
              {DURATION_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Row>
          <Row label="难度 1-5" compact>
            <input
              type="number" min={1} max={5} style={inputStyle}
              value={scn.meta.difficulty}
              onChange={(e) => patchMeta({ difficulty: Math.max(1, Math.min(5, Number(e.target.value) || 1)) as ScenarioMeta['difficulty'] })}
            />
          </Row>
          <Row label="SAN 损耗" compact>
            <select style={inputStyle} value={scn.meta.sanLossHint} onChange={(e) => patchMeta({ sanLossHint: e.target.value as ScenarioMeta['sanLossHint'] })}>
              {SAN_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Row>
          <Row label="人数提示" compact>
            <input style={inputStyle} value={scn.meta.headcountHint} onChange={(e) => patchMeta({ headcountHint: e.target.value })} />
          </Row>
        </div>
      </Section>

      <Section title="开场白种子">
        <textarea
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
          rows={6}
          maxLength={8000}
          placeholder="喂给 LLM 扩写为 page[0] 的场景种子文本"
          value={scn.prologueSeed}
          onChange={(e) => setField('prologueSeed', e.target.value)}
        />
        <CharCounter value={scn.prologueSeed} max={8000} />
      </Section>

      <Section title="推荐技能">
        <ChipEditor
          values={scn.recommendedSkills}
          onChange={(v) => setField('recommendedSkills', v)}
          placeholder="新增技能…"
        />
      </Section>

      <Section title="推荐职业">
        <ChipEditor
          values={scn.recommendedOccupations}
          onChange={(v) => setField('recommendedOccupations', v)}
          placeholder="新增职业…"
        />
      </Section>

      <Section title="作者备注">
        <textarea
          style={{ ...inputStyle, resize: 'vertical' }}
          rows={3}
          maxLength={4000}
          placeholder="仅作者可见;不进 LLM 上下文"
          value={scn.authorNotes}
          onChange={(e) => setField('authorNotes', e.target.value)}
        />
        <CharCounter value={scn.authorNotes} max={4000} />
      </Section>
    </div>
  );
}

// ── 小组件 ──

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(196,168,85,0.3)',
  borderRadius: 2,
  color: 'var(--text-light, #d0c2a0)',
  fontFamily: 'var(--font-ui)', fontSize: 12,
  boxSizing: 'border-box',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 12,
      background: 'rgba(196,168,85,0.04)',
      border: '1px solid rgba(196,168,85,0.18)',
      borderRadius: 3,
    }}>
      <h4 style={{
        margin: 0, fontSize: 12, color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 500,
      }}>{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: compact ? 110 : undefined, flex: compact ? '0 0 auto' : 1,
    }}>
      <span style={{ fontSize: 10.5, color: 'var(--ink, #8a7a52)', letterSpacing: 1.2, fontFamily: 'var(--font-ui)' }}>{label}</span>
      {children}
    </label>
  );
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const ratio = len / max;
  return (
    <div style={{
      textAlign: 'right', fontSize: 10,
      color: ratio > 0.8 ? '#c4a855' : 'var(--ink-faded, #6b5a3a)',
      fontFamily: 'var(--font-ui)',
    }}>{len}/{max}</div>
  );
}

function ChipEditor({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = (): void => {
    const t = draft.trim();
    if (!t) return;
    if (values.includes(t)) { setDraft(''); return; }
    onChange([...values, t]);
    setDraft('');
  };
  const remove = (i: number): void => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
        {values.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--ink, #8a7a52)', fontFamily: 'var(--font-ui)' }}>(空)</span>
        )}
        {values.map((v, i) => (
          <span key={v + i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px',
            background: 'rgba(196,168,85,0.12)',
            border: '1px solid rgba(196,168,85,0.4)', borderRadius: 12,
            color: 'var(--gold)', fontSize: 11, fontFamily: 'var(--font-ui)',
            transition: `background 160ms ${EASE}`,
          }}>
            {v}
            <button
              onClick={() => remove(i)}
              aria-label={`移除 ${v}`}
              style={{
                background: 'none', border: 'none', color: 'var(--gold)',
                cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
                display: 'inline-flex', alignItems: 'center',
              }}
            ><IconClose size={12} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={inputStyle}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button
          onClick={add}
          style={{
            padding: '6px 12px',
            background: 'rgba(196,168,85,0.15)',
            border: '1px solid var(--brass)',
            borderRadius: 2,
            color: 'var(--gold)', fontFamily: 'var(--font-ui)',
            fontSize: 11, letterSpacing: 1, cursor: 'pointer',
            transition: `transform 160ms ${EASE}, background 160ms ${EASE}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >添加</button>
      </div>
    </div>
  );
}
