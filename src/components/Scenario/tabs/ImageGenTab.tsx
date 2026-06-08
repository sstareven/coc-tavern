// 生图配置 tab — 剧本作者覆盖默认生图风格/prompt 模板/采样参数。
// 三层 merge:settings.imageDefaults 基线 → scn.imageGen 覆盖 → 运行时 ImageRenderContext。
// 全部字段 optional;留空=继承基线。

import { useState } from 'react';
import type { ScenarioDoc, ScenarioImageGen, ScenarioImageStyle } from '../../../types/scenario';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { IconClose } from '../../Layout/TabIcons';
import { IMAGE_STYLE_LABELS, SAMPLER_OPTIONS } from '../../../api/image-style-data';
import { resolveImageGen } from '../../../api/image-gen-merge';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
}

const STYLE_KEYS: ScenarioImageStyle[] = [
  'vintage_photo', 'oil_painting', 'ink_wash', 'watercolor', 'engraving',
  'cinematic', 'sepia_film', 'photoreal', 'anime', 'custom',
];

export function ImageGenTab({ scn, onChange }: Props) {
  const settings = useSettingsStore();
  const imgGen: ScenarioImageGen = scn.imageGen ?? {};

  const patch = (m: Partial<ScenarioImageGen>): void => {
    // 关键:空字符串/0/undefined 显式 set null 让稀疏化;
    // 这里直接覆盖,UI 层在 onChange 前已处理 trim → 空 = 删 key
    const next: ScenarioImageGen = { ...imgGen, ...m };
    // 清掉显式为 undefined 的字段,保持稀疏
    (Object.keys(m) as (keyof ScenarioImageGen)[]).forEach((k) => {
      if (m[k] === undefined) delete next[k];
    });
    // 若结果为空对象,删 scn.imageGen
    const cleaned = Object.keys(next).length === 0 ? undefined : next;
    onChange({ ...scn, imageGen: cleaned, updatedAt: Date.now() });
  };

  // 三态开关:继承(undefined) / 强开(true) / 强关(false)
  const enabledState: '继承' | '强开' | '强关' = imgGen.enabled === undefined
    ? '继承'
    : imgGen.enabled ? '强开' : '强关';

  // 风格选择:undefined=继承基线;否则用 scn 值
  const currentStyle = imgGen.style;
  const isCustom = currentStyle === 'custom';

  // 实时 prompt 预览(空运行时 ctx)
  const previewSpec = resolveImageGen(
    settings.imageDefaults,
    cleanForResolve(imgGen),
    { location: '示例地点', time: '黄昏', weather: '雾', characters: ['示例NPC'] },
    true,
  );

  return (
    <div className="scenario-editor" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto', minHeight: 0, flex: 1 }}>
      <Section title="启用">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['继承', '强开', '强关'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => patch({ enabled: opt === '继承' ? undefined : opt === '强开' })}
              style={{
                padding: '6px 16px',
                background: enabledState === opt ? 'rgba(196,168,85,0.3)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${enabledState === opt ? 'var(--brass)' : 'rgba(196,168,85,0.3)'}`,
                color: enabledState === opt ? 'var(--gold)' : 'var(--ink-faded)',
                borderRadius: 2, fontFamily: 'var(--font-ui)', fontSize: 11,
                letterSpacing: 1, cursor: 'pointer',
                transition: `all 160ms ${EASE}`,
              }}
            >{opt}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
          继承=跟随全局总开关;强开=本剧本始终生图;强关=本剧本不生图(玩家也无法手动重生成)。
        </div>
      </Section>

      <Section title="风格">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            onClick={() => patch({ style: undefined, stylePromptOverride: undefined })}
            style={pillStyle(currentStyle === undefined)}
          >继承基线</button>
          {STYLE_KEYS.map((k) => (
            <button key={k} onClick={() => patch({ style: k })} style={pillStyle(currentStyle === k)}>
              {IMAGE_STYLE_LABELS[k]}
            </button>
          ))}
        </div>
        {isCustom && (
          <Row label="自定义风格描述(custom 模式)">
            <textarea
              value={imgGen.stylePromptOverride ?? ''}
              onChange={(e) => patch({ stylePromptOverride: e.target.value || undefined })}
              placeholder="把你想要的风格描述写在这里(英文更友好),例如 'art nouveau, ornate borders, faded ink'"
              rows={3}
              style={textareaStyle}
            />
          </Row>
        )}
      </Section>

      <Section title="正向 prompt 模板">
        <Row label="模板(可用占位 {{location}} {{time}} {{weather}} {{characters}} {{san}} {{style}} {{style_anchors}})">
          <textarea
            value={imgGen.promptTemplate ?? ''}
            onChange={(e) => patch({ promptTemplate: e.target.value || undefined })}
            placeholder={`留空 = 继承基线:\n${settings.imageDefaults.promptTemplate}`}
            rows={4}
            style={textareaStyle}
          />
          <CharCounter value={imgGen.promptTemplate ?? ''} max={1000} />
        </Row>
      </Section>

      <Section title="负面 prompt 追加">
        <Row label="本剧本额外追加的负面项(与全局基线逗号合并,自动去重)">
          <textarea
            value={imgGen.negativePromptAppend ?? ''}
            onChange={(e) => patch({ negativePromptAppend: e.target.value || undefined })}
            placeholder="例如 'modern, anachronistic, neon sign'"
            rows={2}
            style={textareaStyle}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>
            全局基线已含:{settings.imageDefaults.negativePrompt.slice(0, 80)}{settings.imageDefaults.negativePrompt.length > 80 ? '…' : ''}
          </div>
        </Row>
      </Section>

      <Section title="风格锚定">
        <Row label="风格锚定标签(末尾追加到 prompt,逐项加 chip)">
          <ChipEditor
            values={imgGen.styleAnchors ?? []}
            onChange={(v) => patch({ styleAnchors: v.length === 0 ? undefined : v })}
            placeholder="例如:1920s Boston / gas-lit fog / period costume"
          />
        </Row>
      </Section>

      <Section title="尺寸与采样(留空继承全局基线)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Row label={`宽 (基线:${settings.imageDefaults.width})`} compact>
            <input
              type="number" min={256} max={2048} step={32}
              value={imgGen.width ?? ''}
              onChange={(e) => patch({ width: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="继承"
              style={inputStyle}
            />
          </Row>
          <Row label={`高 (基线:${settings.imageDefaults.height})`} compact>
            <input
              type="number" min={128} max={1024} step={32}
              value={imgGen.height ?? ''}
              onChange={(e) => patch({ height: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="继承"
              style={inputStyle}
            />
          </Row>
          <Row label={`步数 (基线:${settings.imageDefaults.steps})`} compact>
            <input
              type="number" min={4} max={80} step={1}
              value={imgGen.steps ?? ''}
              onChange={(e) => patch({ steps: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="继承"
              style={inputStyle}
            />
          </Row>
          <Row label={`CFG (基线:${settings.imageDefaults.cfgScale})`} compact>
            <input
              type="number" min={1} max={20} step={1}
              value={imgGen.cfgScale ?? ''}
              onChange={(e) => patch({ cfgScale: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="继承"
              style={inputStyle}
            />
          </Row>
          <Row label={`采样器 (基线:${settings.imageDefaults.sampler})`}>
            <select
              value={imgGen.sampler ?? ''}
              onChange={(e) => patch({ sampler: e.target.value || undefined })}
              style={inputStyle}
            >
              <option value="">继承基线</option>
              {SAMPLER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>
          <Row label="模型覆盖(留空走全局选择)">
            <input
              type="text"
              value={imgGen.modelOverride ?? ''}
              onChange={(e) => patch({ modelOverride: e.target.value.trim() || undefined })}
              placeholder="如 dall-e-3 或 flux-dev"
              style={inputStyle}
            />
          </Row>
        </div>
      </Section>

      <Section title="预览(示例上下文)">
        <pre style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(196,168,85,0.25)',
          padding: 10,
          fontSize: 11,
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-light, #d0c2a0)',
          whiteSpace: 'pre-wrap',
          maxHeight: 200,
          overflowY: 'auto',
          margin: 0,
          borderRadius: 2,
        }}>
{`正向: ${previewSpec.prompt}

负面: ${previewSpec.negativePrompt}

尺寸: ${previewSpec.width}×${previewSpec.height}  步数: ${previewSpec.steps}  CFG: ${previewSpec.cfgScale}  采样: ${previewSpec.sampler}`}
        </pre>
      </Section>
    </div>
  );
}

/** 把空对象 imgGen 转 undefined,避免 resolveImageGen 内 ?? 误判。 */
function cleanForResolve(g: ScenarioImageGen): ScenarioImageGen | undefined {
  return Object.keys(g).length === 0 ? undefined : g;
}

// ── 小组件(独立于 MetaTab,稍后可抽公共 _form.tsx)──

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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 50,
  lineHeight: 1.5,
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    background: active ? 'rgba(196,168,85,0.3)' : 'rgba(0,0,0,0.2)',
    border: `1px solid ${active ? 'var(--brass)' : 'rgba(196,168,85,0.25)'}`,
    color: active ? 'var(--gold)' : 'var(--ink-faded)',
    borderRadius: 12, fontFamily: 'var(--font-ui)', fontSize: 11,
    letterSpacing: 1, cursor: 'pointer',
    transition: `all 160ms ${EASE}`,
  };
}

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
          }}
        >添加</button>
      </div>
    </div>
  );
}
