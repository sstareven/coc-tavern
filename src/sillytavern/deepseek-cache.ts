/**
 * DeepSeek V4 缓存优化器 —— 配置 + 思维模式 marker（纯函数层）。
 *
 * 历史：早期仅做"思维模式 marker 附着到末条用户消息"。该策略本身正确（不进一步破坏前缀），
 * 但发现现项目的 system 段(worldInfoBefore/format/worldInfoAfter)每回合都含动态内容(statSnapshot/
 * anchor/keyword/inventory/NPC/locationElem/pillar 等)，前缀根本不稳定 → marker 尾置救不了。
 *
 * 现状：DsCacheConfig 已扩展为 *统一缓存优化器* 配置；真正承担"前缀稳定"工作的是
 * src/sillytavern/deepseek-cache-restructure.ts 的 restructureMessages —— 把 [system×N, user×1]
 * 重组为 ONE role:'user'（顶部稳定前缀），让 DeepSeek 前缀缓存按消息边界字节比对真正命中。
 *
 * 本文件保留 buildThinkingMarker（沉浸/分析/格式加强/自定义 4 种 marker 文案），由 useChatPipeline
 * 在重组前附到末条 user 消息末尾——重组时 marker 已是 user 消息内容的一部分。
 */

export type DsThinkingMode = 'default' | 'immersive' | 'analysis' | 'format_enforce' | 'custom';

/** 各模式的 marker 文案（immersive/analysis 取 repo 原文；format_enforce 为格式加强）。 */
export const DS_THINKING_MARKERS: Record<Exclude<DsThinkingMode, 'default' | 'custom'>, string> = {
  immersive: [
    '【角色沉浸要求】在你的思考过程（<think>标签内）中，请遵守以下规则：',
    '1. 请以角色第一人称进行内心独白，用括号包裹内心活动，例如"（心想：……）"或"(内心OS：……)"',
    '2. 用第一人称描写角色的内心感受，例如"我心想""我觉得""我暗自"等',
    '3. 思考内容应沉浸在角色中，通过内心独白分析剧情和规划回复',
    '4. 角色不应知道自己被数字量化——内心独白严禁出现具体技能值/属性值/HP/SAN/MP/伤害骰/检定目标值（如"医学85""HP 还剩 2"）。要用感官与定性描写："医术高明""手稳得很""头开始发昏"代替',
  ].join('\n'),
  analysis: [
    '【思维模式要求】在你的思考过程（<think>标签内）中，请遵守以下规则：',
    '1. 禁止使用圆括号包裹内心独白，例如"（心想：……）"或"(内心OS：……)"，所有分析内容直接陈述即可',
    '2. 禁止以角色第一人称描写内心活动，例如"我心想""我觉得""我暗自"等，请用分析性语言替代',
    '3. 思考内容应聚焦于剧情走向分析和回复内容规划，不要在思考中进行角色扮演式的内心戏表演',
    '4. 思考链里允许讨论数值与机制（这是分析模式的本职），但最终落进 leftContent/rightContent 的叙事正文【依然严禁】出现具体技能值/属性值/HP/SAN 等机制数字',
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
  /** "思维模式 marker"开关。默认 false（不注入）。 */
  enabled: boolean;
  /** 思维模式（控制 <think> 标签内风格的概率性增强）。 */
  mode: DsThinkingMode;
  /** mode='custom' 时使用的自定义文案。 */
  customText: string;
  /** —— 以下为消息三区重组（移植自 deepseek-cache-optimizer 插件）—— */
  /** 消息三区重组（前缀缓存最大化）总开关。默认 false（保守，用户主动开启）。 */
  restructure?: boolean;
  /** 合并时给每组加 <role==X> 标签。默认 true。 */
  roleTags?: boolean;
  /** 调试日志：把重组前后的 messages 打到 console。默认 false。 */
  debugLog?: boolean;
  /** postHistory 末尾若为 assistant（伪思维链/prefill），保留为独立 message。默认 true。 */
  keepTailAssistant?: boolean;
  /** 在末尾追加一条自定义 assistant 预填。默认 false。 */
  customPrefillEnabled?: boolean;
  /** 自定义预填内容（trim 后非空才生效）。 */
  customPrefillContent?: string;
  /** 目标 API 来源，逗号分隔，仅命中时才启用重组。默认 'deepseek,custom'。 */
  targetSources?: string;
  /** WI 蓝绿灯分离（绿灯/非常驻 lore 下沉到底部高注意力区）。默认 false。 */
  separateWiLights?: boolean;
  /** 静态/动态分桶：constant 桶也视为动态（含 EJS 引用动态变量的条目最大化下沉）。默认 false。 */
  treatConstantAsDynamic?: boolean;
  /** 自动检测：constantBucket 里含 EJS `<%`/`{{getvar`/`{{xxx.yyy}}` 等动态 marker 的条目自动下沉。默认 true（建议）。 */
  autoDetectDynamicConstant?: boolean;
  /** ── 实验性 ULTRA 缓存优化（默认全关，用户主动启用） ── */
  /** statSnapshot 减肥：只发 HP/SAN/MP/姿态/状态/战斗/时间/天气/暗线进度 等高频字段，
   *  丢弃 /剧情/已解锁/线索/关键事件 等长但不常变的字段。省 ~500-1500 tokens/回合。 */
  experimentalLeanSnapshot?: boolean;
  /** 跳过 mvu_var_list：内置 coc_lore 的 mvu_var_list 与 statSnapshot 几乎完全重复，
   *  开启后从匹配里过滤掉它，省 ~400-800 tokens/回合。 */
  experimentalSkipMvuVarList?: boolean;
  /** 前缀漂移诊断（借鉴 claude-code-best PROMPT_CACHE_BREAK_DETECTION）：
   *  跨回合对比"理论应稳定"的静态字段(systemPrompt + wbBefore + processedFormat + wbAfter)，
   *  漂移时写日志告知第一处差异位置 + 上下文 + 启发式定位（systemPrompt/wbBefore/processedFormat/wbAfter）。
   *  让用户自助排查"为何缓存命中率不达预期"。 */
  experimentalPrefixDiagnostics?: boolean;
  /** Subagent 共享前缀（借鉴 claude-code-best 的 subagent fresh+small context 设计）：
   *  所有 LLM 子调用(坏结局/起始物品/地点元素抽取/地图自检/线索整合/剧情锚点等)共用同一段
   *  SUBAGENT_SHARED_SYSTEM；原各自 system 内容下沉到 user 头部 + [子任务: xxx] 标签。
   *  同回合内多个子调用之间 messages[0] 字节完全相同 → DS 前缀缓存跨子调用复用。
   *  收益：开局/战斗后等多子调用密集回合可省 ~600-1000 tokens cache write。
   *  副作用：原 system 通用化，LLM 任务理解能力可能略下降——任务说明置于 user 头部部分抵消。 */
  experimentalSubagentSharedSystem?: boolean;
}

export const DEFAULT_DS_CACHE_CONFIG: DsCacheConfig = {
  // 思维模式默认开启但 mode='default'（不实际注入文案），让用户能在 UI 直接切换模式，
  // 无需先点"启用"开关——降低 UX 门槛。
  enabled: true,
  mode: 'default',
  customText: '',
  // 消息重组：默认开启，跨 API 通用（targetSources 兜底 'deepseek,custom' 覆盖中转站）。
  restructure: true,
  roleTags: true,
  debugLog: false,
  keepTailAssistant: true,
  customPrefillEnabled: false,
  customPrefillContent: '',
  targetSources: 'deepseek,custom',
  separateWiLights: false,
  treatConstantAsDynamic: false,
  autoDetectDynamicConstant: true,
  // 实验性区(仅 DS 有意义,默认关)：减肥/去重。
  experimentalLeanSnapshot: false,
  experimentalSkipMvuVarList: false,
  // 已升正式(默认开)：前缀漂移诊断 + 子调用共享前缀。
  // 注：store 字段名保留 experimental* 前缀以兼容老存档(zustand persist 按字段名加载)；
  // UI 文案已去掉"实验性"前缀，分组中移到正式区。
  experimentalPrefixDiagnostics: true,
  experimentalSubagentSharedSystem: true,
};

/**
 * 据配置生成要附着到【最后一条用户消息】末尾的思维模式 marker；
 * 未启用 / 默认模式 / 自定义但空文本 → 返回空串（不注入）。
 */
export function buildThinkingMarker(cfg: DsCacheConfig | undefined): string {
  if (!cfg || !cfg.enabled || cfg.mode === 'default') return '';
  if (cfg.mode === 'custom') return cfg.customText.trim();
  return DS_THINKING_MARKERS[cfg.mode] ?? '';
}

/**
 * DeepSeek 标准计价（deepseek-chat，人民币/百万 token；list 价，可按需调整）：
 * 输入(缓存命中) ¥0.5 · 输入(缓存未命中) ¥2 · 输出 ¥8。
 * 注：DeepSeek 偶有错峰/促销折扣，此处用标准价估算，仅供参考。
 */
export const DEEPSEEK_PRICE_CNY = { cacheHit: 0.5, cacheMiss: 2, output: 8 } as const;

/** 据 token 用量估算人民币费用（命中输入/未命中输入/输出）。 */
export function estimateCostCNY(cacheHitTokens: number, cacheMissTokens: number, outputTokens: number): number {
  return (
    (cacheHitTokens * DEEPSEEK_PRICE_CNY.cacheHit +
      cacheMissTokens * DEEPSEEK_PRICE_CNY.cacheMiss +
      outputTokens * DEEPSEEK_PRICE_CNY.output) / 1_000_000
  );
}
