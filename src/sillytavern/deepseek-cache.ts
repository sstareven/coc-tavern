/**
 * DeepSeek V4 缓存优化器 —— 思维模式指令注入（纯函数层）。
 *
 * 原理（依据 deepseek_v4_rolepaly_instruct + deepseek-cache-optimizer）：
 * - 在对话上下文里注入一段「思维模式指令 marker」，控制 DeepSeek V4 思考(<think>标签内)的风格（概率性增强）。
 * - 缓存优化：marker 必须【附着到发送 messages 的最后一条用户消息末尾】(尾部高注意力区)，
 *   绝不进 system / 前缀中段——这样 system+格式+世界书 这段可缓存前缀每回合不变，命中 DeepSeek 前缀缓存。
 * - 默认模式不注入（零副作用）。
 */

export type DsThinkingMode = 'default' | 'immersive' | 'analysis' | 'format_enforce' | 'custom';

/** 各模式的 marker 文案（immersive/analysis 取 repo 原文；format_enforce 为格式加强）。 */
export const DS_THINKING_MARKERS: Record<Exclude<DsThinkingMode, 'default' | 'custom'>, string> = {
  immersive: [
    '【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：',
    '1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"',
    '2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等',
    '3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复',
  ].join('\n'),
  analysis: [
    '【思维模式要求】在你的思考过程（<think>标签内）中，请遵守以下规则：',
    '1. 禁止使用圆括号包裹内心独白，例如"（心想：……）"或"(内心OS：……)"，所有分析内容直接陈述即可',
    '2. 禁止以角色第一人称描写内心活动，例如"我心想""我觉得""我暗自"等，请用分析性语言替代',
    '3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演',
  ].join('\n'),
  format_enforce: [
    '【格式加强要求】请严格【遵从】既定的输出格式规范（勿新增格式之外的字段或标签）：',
    '1. 完全按既定输出格式的结构与字段顺序输出，标签/结构正确闭合',
    '2. 思维链/创作指导部分（如格式有要求）写得完整充分，覆盖规定的思考模块',
    '3. 正文严格遵守段落格式、字数、标签等既定规范',
    '4. 既定格式里的「省略规则」同样遵守——无变化的字段（如线索/NPC/物品更新）照常省略，不要为了"完整"而无中生有地填充或新增字段',
  ].join('\n'),
};

export interface DsCacheConfig {
  enabled: boolean;
  mode: DsThinkingMode;
  customText: string;
}

export const DEFAULT_DS_CACHE_CONFIG: DsCacheConfig = { enabled: false, mode: 'default', customText: '' };

/**
 * 据配置生成要附着到【最后一条用户消息】末尾的思维模式 marker；
 * 未启用 / 默认模式 / 自定义但空文本 → 返回空串（不注入）。
 */
export function buildThinkingMarker(cfg: DsCacheConfig | undefined): string {
  if (!cfg || !cfg.enabled || cfg.mode === 'default') return '';
  if (cfg.mode === 'custom') return cfg.customText.trim();
  return DS_THINKING_MARKERS[cfg.mode] ?? '';
}
