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
 * @param isNovelAi 是否走 NovelAI 协议(影响风格 tokens / 默认负面 / 默认模板的选择)
 */
export function resolveImageGen(
  settingsBase: SettingsImageDefaults,
  scnOverride: ScenarioImageGen | undefined,
  ctx: ImageRenderContext,
  settingsEnabled: boolean,
  isNovelAi = false,
): ResolvedImageGenSpec {
  const scn = scnOverride ?? {};

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

  // 占位符填充
  const placeholders: Record<string, string> = {
    style: styleTokens,
    style_anchors: styleAnchors.join(', '),
    location: ctx.location ?? '',
    time: ctx.time ?? '',
    weather: ctx.weather ?? '',
    characters: (ctx.characters ?? []).join(', '),
    san: ctx.san !== undefined ? String(ctx.san) : '',
    scene: ctx.sceneBrief ?? '',
    scene_brief: ctx.sceneBrief ?? '',
  };
  const filled = fillPlaceholders(template, placeholders);

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
