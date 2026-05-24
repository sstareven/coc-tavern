import { useState } from 'react';
import type { ChatPreset } from '../../types';

interface Props {
  presetId: string;
  onClose: () => void;
}

const DEFAULT_DATA: Record<string, ChatPreset> = {
  p1: {
    id: 'p1', name: '默认预设',
    temperature: 0.8, topP: 0.9, topK: 40, maxTokens: 1024, repetitionPenalty: 1.1,
    systemPrompt: '你是一个TRPG游戏主持人，负责运行克苏鲁的呼唤7版模组。',
    userPrefix: '玩家: ', assistantPrefix: '守秘人: ',
  },
  p2: {
    id: 'p2', name: '创意模式',
    temperature: 1.2, topP: 0.95, topK: 60, maxTokens: 2048, repetitionPenalty: 1.0,
    systemPrompt: '你是一个富有创造力的叙事者，擅长描绘洛夫克拉夫特式的恐怖氛围。',
    userPrefix: '调查员: ', assistantPrefix: '旁白: ',
  },
  p3: {
    id: 'p3', name: '严格规则',
    temperature: 0.5, topP: 0.8, topK: 20, maxTokens: 512, repetitionPenalty: 1.2,
    systemPrompt: '严格按照COC 7版规则书执行所有检定和判定。',
    userPrefix: '玩家: ', assistantPrefix: 'KP: ',
  },
};

type Tab = 'sampling' | 'prompts' | 'order';

const TABS: { key: Tab; label: string }[] = [
  { key: 'sampling', label: '采样参数' },
  { key: 'prompts', label: '提示模板' },
  { key: 'order', label: '提示顺序' },
];

export function PresetEditor({ presetId, onClose }: Props) {
  const base = DEFAULT_DATA[presetId];
  const [form, setForm] = useState<ChatPreset>(base ? { ...base } : DEFAULT_DATA.p1);
  const [tab, setTab] = useState<Tab>('sampling');

  if (!base) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: 'var(--ink-subtle)', textAlign: 'center', padding: 40 }}>预设未找到</p>
        </div>
      </div>
    );
  }

  type FormKey = keyof ChatPreset;

  const update = (key: FormKey, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...panelStyle, minWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 18, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', letterSpacing: 3, margin: 0 }}>
            {form.name}
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '8px 0', border: tab === t.key ? '1px solid var(--gold)' : '1px solid transparent',
                borderBottomColor: tab === t.key ? 'var(--gold)' : 'rgba(196,168,85,0.15)',
                borderRadius: 3, background: tab === t.key ? 'rgba(196,168,85,0.1)' : 'transparent',
                color: tab === t.key ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sampling params tab */}
        {tab === 'sampling' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SliderField label="Temperature" value={form.temperature} min={0} max={2} step={0.05}
              onChange={(v) => update('temperature', v)} />
            <SliderField label="Top P" value={form.topP} min={0} max={1} step={0.05}
              onChange={(v) => update('topP', v)} />
            <SliderField label="Top K" value={form.topK} min={1} max={200} step={1}
              onChange={(v) => update('topK', v)} />
            <SliderField label="Max Tokens" value={form.maxTokens} min={64} max={8192} step={64}
              onChange={(v) => update('maxTokens', v)} />
            <SliderField label="Repetition Penalty" value={form.repetitionPenalty} min={0.5} max={2} step={0.05}
              onChange={(v) => update('repetitionPenalty', v)} />
          </div>
        )}

        {/* Prompt templates tab */}
        {tab === 'prompts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>预设名称</label>
              <input value={form.name} onChange={(e) => update('name', e.target.value)}
                style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>系统提示 (System Prompt)</label>
              <textarea value={form.systemPrompt} onChange={(e) => update('systemPrompt', e.target.value)}
                style={{ ...fieldInputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label style={labelStyle}>用户前缀</label>
                <input value={form.userPrefix} onChange={(e) => update('userPrefix', e.target.value)}
                  style={fieldInputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <label style={labelStyle}>助手前缀</label>
                <input value={form.assistantPrefix} onChange={(e) => update('assistantPrefix', e.target.value)}
                  style={fieldInputStyle} />
              </div>
            </div>
          </div>
        )}

        {/* Prompt order tab */}
        {tab === 'order' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', lineHeight: 1.8, margin: 0 }}>
              当前提示词组装顺序：
            </p>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: 14, border: '1px solid rgba(196,168,85,0.12)',
              borderRadius: 4, background: 'rgba(0,0,0,0.15)',
            }}>
              {[
                { num: 1, label: '系统提示 (System Prompt)' },
                { num: 2, label: '世界书上下文 (Lorebook Context)' },
                { num: 3, label: '对话历史 (Chat History)' },
                { num: 4, label: '用户输入 (User Input)' },
              ].map((item) => (
                <div key={item.num} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                  fontSize: 12, color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '1px solid var(--gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: 'var(--gold)', flexShrink: 0,
                  }}>{item.num}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save button */}
        <button style={{
          width: '100%', marginTop: 24, padding: '10px 0',
          border: '1px solid var(--gold)', borderRadius: 4,
          background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
          fontFamily: 'var(--font-ui)', fontSize: 13, letterSpacing: 3, cursor: 'pointer',
          transition: 'var(--transition-smooth)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; }}
        >
          保存预设
        </button>
      </div>
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={labelStyle}>{label}</label>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--gold)' }} />
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 950,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
};

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
  border: '1px solid var(--gold)', borderRadius: 8,
  padding: '24px 28px', maxWidth: 520, width: '90%',
  boxShadow: '0 0 80px rgba(0,0,0,0.6)',
};

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

const fieldInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--brass)',
  borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
  fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
};
