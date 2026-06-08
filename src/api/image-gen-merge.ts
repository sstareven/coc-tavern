// 三层 merge 引擎(纯函数,可单测):
//   settings.imageDefaults 基线 → scenario.imageGen 覆盖 → 运行时 ImageRenderContext
//   → ResolvedImageGenSpec(给 image-gen-engine 拿去 fetch 的入参)。
//
// 设计原则:
// - 标量字段(width/height/steps/cfgScale/sampler/modelOverride/style):scn 非 undefined 优先,否则 settings;
// - negative:逗号合并 + 字面去重(settings.negativePrompt + scnOverride.negativePromptAppend);
// - prompt 模板:scn.promptTemplate ?? settings.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
// - 风格段:resolveStyleTokens(style, stylePromptOverride) 前置到 prompt;
// - 占位符填充:{{location}}/{{time}}/{{weather}}/{{characters}}/{{san}}/{{style}}/{{style_anchors}};
// - styleAnchors 末尾追加(scn 整块替换 settings 的 anchors)。
// - enabled 三态:scn.enabled===false 强关;scn.enabled===true 强开;undefined 沿用 settings.enabled。

import type { ScenarioImageGen, ScenarioImageStyle } from '../types/scenario';
import {
  IMAGE_STYLE_PROMPTS,
  IMAGE_STYLE_PROMPTS_NOVELAI,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_NEGATIVE_PROMPT_NOVELAI,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_PROMPT_TEMPLATE_NOVELAI,
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_STEPS,
  DEFAULT_IMAGE_CFG_SCALE,
  DEFAULT_IMAGE_SAMPLER,
} from './image-style-data';

/** Settings 侧基线配置(useSettingsStore.imageDefaults 字段对应)。 */
export interface SettingsImageDefaults {
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  negativePrompt: string;
  promptTemplate: string;
  styleAnchors: string[];
  style: ScenarioImageStyle;
}

/** 运行时上下文,由 image-prompt-builder 从 BookPage + store snapshots 拼出。 */
export interface ImageRenderContext {
  location?: string;
  time?: string;
  weather?: string;
  characters?: string[]; // 在场重要角色名(中文)
  san?: number;
  /** 场景简述,从 leftContent 截前 120 字。可空。 */
  sceneBrief?: string;
}

/** 三层合并后的最终入参,直接喂给 image-gen-engine.callImageApi。 */
export interface ResolvedImageGenSpec {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  modelOverride: string | undefined;
  enabled: boolean;
}

/** 字面去重(逗号分隔),保留先后顺序,空白/空段过滤。 */
function dedupeCsv(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    for (const seg of p.split(',')) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out.join(', ');
}

/** 解析 style + 用户自填 override → prompt 风格片段。
 *  isNovelAi=true 时用 NovelAI 专属 Danbooru tag 风格映射,避免 SD 通用纹理词被当主体。 */
function resolveStyleTokens(style: ScenarioImageStyle, override: string | undefined, isNovelAi: boolean): string {
  if (style === 'custom') return (override ?? '').trim();
  const table = isNovelAi ? IMAGE_STYLE_PROMPTS_NOVELAI : IMAGE_STYLE_PROMPTS;
  return table[style] ?? '';
}

/** 占位符填充:{{key}} → value(缺失替空字符串,避免 prompt 里出现孤立 {{xxx}})。 */
function fillPlaceholders(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '');
}

/** Prompt 模板渲染上下文 — 含占位符变量 + 条件变量。
 *  字段名同时是 {{key}} 占位符的 key 与 EJS 块里的标识符,玩家可两种语法混用:
 *    <%= isNovelAi ? "anime style" : "realistic" %>, {{location}}, {{time}}
 *    <% if (isV4) { %> very aesthetic, absurdres <% } %> */
export interface PromptTemplateContext {
  // ── 占位符变量(向后兼容 {{key}} 与新 <%= key %> 双语法) ─────────────
  style: string;
  style_anchors: string;
  location: string;
  time: string;
  weather: string;
  characters: string;
  san: string;
  scene: string;
  scene_brief: string;
  /** LLM 子调用(image-prompt-extractor)产出的英文 image prompt;空串表示未启用/失败。
   *  默认模板优先用 image_hint 主导主体描述,空时回退到 characters/location/... 中文 ctx。 */
  image_hint: string;
  // ── 条件变量(新 EJS <% if (xxx) %> 用) ──────────────────────────────
  /** 图像协议(payloadMode 实际命中值,auto 模式下是 detect 后的结果)。 */
  protocol: string;
  /** 图像模型 ID(如 'nai-diffusion-4-5-full' / 'dall-e-3' / 自建 SD checkpoint 名)。 */
  model: string;
  /** protocol === 'novelai'。 */
  isNovelAi: boolean;
  /** isNovelAi 且 model 以 'nai-diffusion-4' 开头(V4 / V4.5 系列)。 */
  isV4: boolean;
  /** protocol === 'sd-compat'。 */
  isSd: boolean;
  /** protocol === 'openai-strict' / 'gpt-image-1'。 */
  isOpenAi: boolean;
  /** protocol === 'chat-completions'(假流式中转,如 nano-banana / gemini-pro-image)。 */
  isChatCompletions: boolean;
}

/** EJS 模板解析的中间表示。 */
type EjsPart =
  | { type: 'text'; content: string }
  | { type: 'output'; content: string }   // <%= expr %>
  | { type: 'code'; content: string };    // <% code %>

/** 切分 EJS 模板:<% %> / <%= %> 与文本段。<%- %> 这种"unescaped 输出"在 image prompt
 *  里没意义(都是纯文本拼接),按 <%= %> 同等处理。 */
function parseEjsTemplate(text: string): EjsPart[] {
  const parts: EjsPart[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<%', i);
    if (open < 0) {
      parts.push({ type: 'text', content: text.slice(i) });
      break;
    }
    if (open > i) parts.push({ type: 'text', content: text.slice(i, open) });
    const close = text.indexOf('%>', open + 2);
    if (close < 0) {
      // 未闭合 — 当文本兜底
      parts.push({ type: 'text', content: text.slice(open) });
      break;
    }
    const tag = text.slice(open + 2, close);
    if (tag.startsWith('=') || tag.startsWith('-')) {
      parts.push({ type: 'output', content: tag.slice(1).trim() });
    } else {
      parts.push({ type: 'code', content: tag });
    }
    i = close + 2;
  }
  return parts;
}

/** 渲染 image prompt 模板。先做 {{key}} 占位符替换(向后兼容),再做 EJS 块渲染。
 *  EJS 块通过 new Function(...keys, body) 注入 ctx 全字段为形参,
 *  模板里可直接用 `isNovelAi` / `model` 等标识符(无 with,strict-safe)。
 *  解析或执行失败 → 退回到只做 {{key}} 替换的结果,fail-open。 */
export function renderPromptTemplate(template: string, ctx: PromptTemplateContext): string {
  // 1. 旧 {{key}} 占位符(向后兼容玩家既有模板)
  const placeholdersOnly: Record<string, string> = {
    style: ctx.style,
    style_anchors: ctx.style_anchors,
    location: ctx.location,
    time: ctx.time,
    weather: ctx.weather,
    characters: ctx.characters,
    san: ctx.san,
    scene: ctx.scene,
    scene_brief: ctx.scene_brief,
    image_hint: ctx.image_hint,
  };
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_, k) => placeholdersOnly[k] ?? '');

  // 2. 若模板不含 EJS 标签,直接返回
  if (!/<%/.test(filled)) return filled;

  // 3. EJS 块渲染 — 编译 + 执行
  const parts = parseEjsTemplate(filled);
  let body = 'let __o = "";\n';
  for (const part of parts) {
    if (part.type === 'text') {
      body += `__o += ${JSON.stringify(part.content)};\n`;
    } else if (part.type === 'output') {
      body += `try { __o += String((${part.content}) ?? ""); } catch (e) {}\n`;
    } else {
      body += `${part.content}\n`;
    }
  }
  body += 'return __o;';

  const keys = Object.keys(ctx);
  const values = keys.map((k) => (ctx as unknown as Record<string, unknown>)[k]);
  try {
    const fn = new Function(...keys, body);
    const out = fn(...values);
    return typeof out === 'string' ? out : String(out ?? '');
  } catch {
    return filled; // 编译/执行失败 — 退回到只做占位符替换的结果
  }
}

/** 默认基线(settings 字段未初始化时的 fallback,主要给单测/老存档兜底)。 */
export const DEFAULT_SETTINGS_IMAGE_DEFAULTS: SettingsImageDefaults = {
  width: DEFAULT_IMAGE_WIDTH,
  height: DEFAULT_IMAGE_HEIGHT,
  steps: DEFAULT_IMAGE_STEPS,
  cfgScale: DEFAULT_IMAGE_CFG_SCALE,
  sampler: DEFAULT_IMAGE_SAMPLER,
  negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  styleAnchors: [],
  style: 'vintage_photo',
};

/**
 * 三层 merge 主入口。纯函数,可单测。
 *
 * @param settingsBase 全局基线(useSettingsStore.imageDefaults)
 * @param scnOverride 剧本覆盖层(scenarioDoc.imageGen),undefined 等价无覆盖
 * @param ctx 运行时上下文(sceneInfo + leftContent 摘要 + 在场 NPC)
 * @param settingsEnabled 全局总开关(useSettingsStore.imageGenerationEnabled)
 * @param renderHints 模板渲染额外上下文(protocol/model/imageHint),决定 EJS 条件分支与默认风格选择
 */
export function resolveImageGen(
  settingsBase: SettingsImageDefaults,
  scnOverride: ScenarioImageGen | undefined,
  ctx: ImageRenderContext,
  settingsEnabled: boolean,
  renderHints?: { protocol?: string; model?: string; imageHint?: string },
): ResolvedImageGenSpec {
  const scn = scnOverride ?? {};
  const protocol = renderHints?.protocol ?? '';
  const model = renderHints?.model ?? '';
  const isNovelAi = protocol === 'novelai';
  const isV4 = isNovelAi && /^nai-diffusion-4/i.test(model);
  const isSd = protocol === 'sd-compat';
  const isOpenAi = protocol === 'openai-strict' || protocol === 'gpt-image-1';
  const isChatCompletions = protocol === 'chat-completions';

  // 标量字段 — scn 非 undefined 优先
  const width = scn.width ?? settingsBase.width;
  const height = scn.height ?? settingsBase.height;
  const steps = scn.steps ?? settingsBase.steps;
  const cfgScale = scn.cfgScale ?? settingsBase.cfgScale;
  const sampler = scn.sampler ?? settingsBase.sampler;
  const style = scn.style ?? settingsBase.style;
  const modelOverride = scn.modelOverride;

  // enabled 三态
  const enabled = scn.enabled !== undefined ? scn.enabled : settingsEnabled;

  // negative:逗号合并去重。settings.negativePrompt 若是默认值(SD 通用),NovelAI 走专属负面;
  // 玩家显式改过的 settings.negativePrompt 不动(玩家意图优先)
  const baseNegative = (isNovelAi && settingsBase.negativePrompt === DEFAULT_NEGATIVE_PROMPT)
    ? DEFAULT_NEGATIVE_PROMPT_NOVELAI
    : settingsBase.negativePrompt;
  const negativePrompt = dedupeCsv([baseNegative, scn.negativePromptAppend ?? '']);

  // styleAnchors:scn 非 undefined 整块替换,否则用 settings(scn 给空数组 = 显式清空)
  const styleAnchors = scn.styleAnchors !== undefined ? scn.styleAnchors : settingsBase.styleAnchors;

  // prompt 模板:scn 优先,否则 settings(若是默认 SD 模板且 NovelAI,换 NovelAI 默认),否则默认
  const settingsTemplate = (isNovelAi && settingsBase.promptTemplate === DEFAULT_PROMPT_TEMPLATE)
    ? DEFAULT_PROMPT_TEMPLATE_NOVELAI
    : settingsBase.promptTemplate;
  const fallback = isNovelAi ? DEFAULT_PROMPT_TEMPLATE_NOVELAI : DEFAULT_PROMPT_TEMPLATE;
  const template = scn.promptTemplate ?? settingsTemplate ?? fallback;

  // 风格片段(按 NovelAI 走两套不同 tokens)
  const styleTokens = resolveStyleTokens(style, scn.stylePromptOverride, isNovelAi);

  // 模板渲染上下文 — 占位符变量 + EJS 条件变量
  const tplCtx: PromptTemplateContext = {
    style: styleTokens,
    style_anchors: styleAnchors.join(', '),
    location: ctx.location ?? '',
    time: ctx.time ?? '',
    weather: ctx.weather ?? '',
    characters: (ctx.characters ?? []).join(', '),
    san: ctx.san !== undefined ? String(ctx.san) : '',
    scene: ctx.sceneBrief ?? '',
    scene_brief: ctx.sceneBrief ?? '',
    image_hint: renderHints?.imageHint ?? '',
    protocol, model,
    isNovelAi, isV4, isSd, isOpenAi, isChatCompletions,
  };
  const filled = renderPromptTemplate(template, tplCtx);

  // 清理:连续 ", , " → ", ";首尾标点
  const prompt = filled
    .replace(/\s*,\s*(?=,)/g, '') // ", ,, " → ", "
    .replace(/(^[,\s]+)|([,\s]+$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    modelOverride,
    enabled,
  };
}
