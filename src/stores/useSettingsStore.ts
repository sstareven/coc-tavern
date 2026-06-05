import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
import { type DsCacheConfig, DEFAULT_DS_CACHE_CONFIG } from '../sillytavern/deepseek-cache';

/**
 * 文字倍率上下界（80% ~ 150%）—— 超出会让 UI 错乱(过小看不清 / 过大溢出)。
 * v1.11.7 起：完全废弃 uiScale 整页 zoom 方案,改用纯响应式 + 文字倍率(正文/系统两类)。
 */
export const TEXT_RATIO_MIN = 0.8;
export const TEXT_RATIO_MAX = 1.5;

/** 把任意输入钳到 [TEXT_RATIO_MIN, TEXT_RATIO_MAX]；非法/非有限值回落 1。 */
export function clampTextRatio(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  if (v < TEXT_RATIO_MIN) return TEXT_RATIO_MIN;
  if (v > TEXT_RATIO_MAX) return TEXT_RATIO_MAX;
  return v;
}

interface SettingsState {
  soundEnabled: boolean;
  darkMode: boolean;
  tooltipDelay: number;
  musicVolume: number;
  /** 音效音量 0-100（按钮点击/骰子/翻页等所有合成音的主增益）。 */
  sfxVolume: number;
  autoSubmitChoice: boolean;
  apiBaseUrl: string;
  apiModel: string;
  apiKey: string;
  availableModels: string[];
  promptPostProcessing: string;

  mvuUseIndependentApi: boolean;
  mvuForceAlways: boolean;
  mvuApiBaseUrl: string;
  mvuApiModel: string;
  mvuApiKey: string;
  rewriteUseIndependentApi: boolean;
  rewriteLite: boolean;
  rewriteLiteIncludeMatchedLore: boolean;
  rewriteApiBaseUrl: string;
  rewriteApiModel: string;
  rewriteApiKey: string;
  rewriteAvailableModels: string[];
  mvuTemperature: number;
  mvuRetryCount: number;
  mvuMaxTokens: number;
  mvuAvailableModels: string[];
  maxSummaryEntries: number;
  npcMemoryKeep: number;
  contextPageDepth: number;
  globalCaseSensitive: boolean;
  globalMatchWholeWord: boolean;
  maxRecursionSteps: number;
  includeNames: boolean;
  wiBudget: number;
  alertOnOverflow: boolean;
  worldInfoStrategy: 'evenly' | 'global-first' | 'chat-first';
  jsonRetryCount: number;
  rpmLimit: number;
  perApiRpmEnabled: boolean;
  mvuRpmLimit: number;
  rewriteRpmLimit: number;
  /**
   * 单次 rpmAcquire 调用允许的最大「排队等待轮次」：达到即抛 RpmQueueExhaustedError，
   * 由调用方 fail-open（静默降级丢这次请求），防 setTimeout 死循环卡住整条管线。
   * 硬上限 10，超 10 一律截到 10。默认 10。
   */
  rpmMaxQueueAttempts: number;
  // MVU 失败回灌自纠：默认关闭；开启后最多额外 N 次 mvu 桶往返让 AI 修正非法变量更新。
  mvuSelfCorrectEnabled: boolean;
  mvuSelfCorrectRetries: number;
  /** 正文文字倍率(0.8-1.5)。作用于叙事/对话/keywords/clues 等"剧情可读性"相关文字。默认 1=100%。 */
  textRatio: number;
  /** 系统文字倍率(0.8-1.5)。作用于按钮/菜单/设置面板/header/tab 等"系统 UI"文字。默认 1=100%。 */
  systemRatio: number;
  /** DeepSeek V4 缓存优化器：思维模式指令注入（附着到末条用户消息，保前缀缓存）。 */
  dsCache: DsCacheConfig;
  /**
   * 子调用 LLM 请求附加 response_format: { type: 'json_object' } —— 强制模型返回
   * 单一合法 JSON 对象，配合 strictJsonParse 降低子调用 JSON 解析失败率。
   * 仅作用于 callDsSubagent 通路（generateStartingItems / extractLocationElements /
   * integrateClues / generateBadEnding / rectifyMissingNpcs / time-jump-generator
   * / combat-detector 等子调用），不动主回合（主回合输出含 <UpdateVariable> 补丁
   * 块，与 json_object 模式互斥）。默认开。
   */
  forceJsonObject: boolean;
  /**
   * v1.11.8 重构：一键 DeepSeek 终极适配现在是【runtime override】而非字段覆盖。
   * true 时所有读取处通过 getEffective*() 返回 ULTRA_PRESET 值；用户底下 dsCache /
   * mvuSelfCorrectEnabled 等 Toggle 的视觉/存储状态完全不被动,撤销时 Toggle 还是
   * 原来那样。
   */
  dsUltraActive: boolean;
}

/**
 * v1.11.8 重构: DS ULTRA 不再修改 store 字段(老版用 DsUltraSnapshot snapshot+revert),
 * 改为 runtime override —— DS_ULTRA_PRESET 常量定义 ULTRA 模式下所有字段的"effective"值,
 * dsUltraActive===true 时通过 getEffective*() 返回这些值;false 时返回用户原值。
 *
 * 好处: 用户底下 Toggle 显示/存储状态完全不变,撤销时 Toggle 不会"莫名其妙变化"。
 *
 * 覆盖字段同老版 DsUltraSnapshot: dsCache 全段 + forceJsonObject + maxSummaryEntries
 * + mvuSelfCorrect* + mvuForceAlways。跨 store 的 tavernHelper.optimizeMessageLoad
 * 也在 ULTRA 下被强制 false(read 时由调用方接 effective 判断,见 useChatPipeline)。
 */
export const DS_ULTRA_PRESET = {
  forceJsonObject: true,
  maxSummaryEntries: 50,
  mvuSelfCorrectEnabled: true,
  mvuSelfCorrectRetries: 2,
  mvuForceAlways: false,
  tavernOptimizeMessageLoad: false,
  /** ULTRA 模式下 dsCache 的覆盖项(其余字段从用户当前 dsCache 透传:思维模式 enabled/mode/customText)。 */
  dsCacheOverride: {
    restructure: true,
    roleTags: true,
    keepTailAssistant: true,
    targetSources: 'deepseek,custom',
    separateWiLights: true,
    autoDetectDynamicConstant: true,
    experimentalLeanSnapshot: true,
    experimentalSkipMvuVarList: true,
    experimentalPrefixDiagnostics: true,
    experimentalSubagentSharedSystem: true,
    autoSinkDynamicPromptItem: true,
  } as Partial<DsCacheConfig>,
} as const;

/** 计算 effective dsCache: dsUltraActive===true 时合并 override,否则原样。 */
export function getEffectiveDsCache(s: SettingsState): DsCacheConfig {
  return s.dsUltraActive ? { ...s.dsCache, ...DS_ULTRA_PRESET.dsCacheOverride } : s.dsCache;
}

/** 通用 effective setting selector: 字段在 DS_ULTRA_PRESET 里有 override 且 active 时返回 preset 值。 */
export function getEffectiveSetting<K extends keyof Pick<SettingsState, 'forceJsonObject' | 'maxSummaryEntries' | 'mvuSelfCorrectEnabled' | 'mvuSelfCorrectRetries' | 'mvuForceAlways'>>(
  s: SettingsState,
  key: K,
): SettingsState[K] {
  if (s.dsUltraActive && key in DS_ULTRA_PRESET) {
    return (DS_ULTRA_PRESET as unknown as Record<K, SettingsState[K]>)[key];
  }
  return s[key];
}

interface SettingsStore extends SettingsState {
  toggleSound: () => void;
  toggleDarkMode: () => void;
  setDarkMode: (v: boolean) => void;
  setTooltipDelay: (d: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setAutoSubmitChoice: (v: boolean) => void;
  setApiBaseUrl: (url: string) => void;
  setApiModel: (model: string) => void;
  setApiKey: (k: string) => void;
  setAvailableModels: (models: string[]) => void;
  setPromptPostProcessing: (v: string) => void;
  setMvuUseIndependentApi: (v: boolean) => void;
  setMvuForceAlways: (v: boolean) => void;
  setMvuApiBaseUrl: (url: string) => void;
  setMvuApiModel: (model: string) => void;
  setMvuApiKey: (key: string) => void;
  setRewriteUseIndependentApi: (v: boolean) => void;
  setRewriteLite: (v: boolean) => void;
  setRewriteLiteIncludeMatchedLore: (v: boolean) => void;
  setRewriteApiBaseUrl: (url: string) => void;
  setRewriteApiModel: (model: string) => void;
  setRewriteApiKey: (key: string) => void;
  setRewriteAvailableModels: (models: string[]) => void;
  setMvuTemperature: (t: number) => void;
  setMvuRetryCount: (n: number) => void;
  setMvuMaxTokens: (n: number) => void;
  setMvuAvailableModels: (models: string[]) => void;
  setMaxSummaryEntries: (n: number) => void;
  setNpcMemoryKeep: (n: number) => void;
  setContextPageDepth: (n: number) => void;
  setGlobalCaseSensitive: (v: boolean) => void;
  setGlobalMatchWholeWord: (v: boolean) => void;
  setMaxRecursionSteps: (n: number) => void;
  setIncludeNames: (v: boolean) => void;
  setWiBudget: (n: number) => void;
  setAlertOnOverflow: (v: boolean) => void;
  setWorldInfoStrategy: (v: 'evenly' | 'global-first' | 'chat-first') => void;
  setJsonRetryCount: (n: number) => void;
  setRpmLimit: (n: number) => void;
  setPerApiRpmEnabled: (v: boolean) => void;
  setMvuRpmLimit: (n: number) => void;
  setRewriteRpmLimit: (n: number) => void;
  setRpmMaxQueueAttempts: (n: number) => void;
  setMvuSelfCorrectEnabled: (v: boolean) => void;
  setMvuSelfCorrectRetries: (n: number) => void;
  setTextRatio: (v: number) => void;
  setSystemRatio: (v: number) => void;
  setDsCache: (c: Partial<DsCacheConfig>) => void;
  setForceJsonObject: (v: boolean) => void;
  /**
   * 一键 DeepSeek 终极适配 —— 把所有【与缓存命中/上下文长度相关】的设置项一次性
   * 覆盖到「最大化前缀缓存命中」的组合。不动 API 三件套（凭证）/ 思维模式偏好 /
   * UI 偏好（uiScale/音量/颜色）。
   *
   * 覆盖项见 useSettingsStore action 实现注释。
   */
  applyDeepSeekUltraPreset: () => void;
  /**
   * 撤销一键 DeepSeek 终极适配 —— 从 dsUltraSnapshot 恢复所有被覆盖的字段，
   * 清 snapshot。snapshot 为 undefined 时是 no-op。
   */
  revertDeepSeekUltraPreset: () => void;
}

const defaults: SettingsState = {
  soundEnabled: true,
  darkMode: false,
  tooltipDelay: 600,
  musicVolume: 40,
  sfxVolume: 100,
  autoSubmitChoice: false,
  apiBaseUrl: 'https://api.deepseek.com',
  apiModel: 'deepseek-v4-pro',
  apiKey: '',
  availableModels: [],
  promptPostProcessing: '',

  mvuUseIndependentApi: false,
  mvuForceAlways: false,
  mvuApiBaseUrl: 'https://api.deepseek.com',
  mvuApiModel: 'deepseek-chat',
  mvuApiKey: '',
  rewriteUseIndependentApi: false,
  rewriteLite: false,
  rewriteLiteIncludeMatchedLore: false,
  rewriteApiBaseUrl: 'https://api.deepseek.com',
  rewriteApiModel: 'deepseek-chat',
  rewriteApiKey: '',
  rewriteAvailableModels: [],
  mvuTemperature: 1,
  mvuRetryCount: 1,
  mvuMaxTokens: 8096,
  mvuAvailableModels: [],
  maxSummaryEntries: 20,
  npcMemoryKeep: 6,
  contextPageDepth: 3,
  globalCaseSensitive: false,
  globalMatchWholeWord: false,
  maxRecursionSteps: 0,
  includeNames: true,
  wiBudget: 0,
  alertOnOverflow: false,
  worldInfoStrategy: 'evenly',
  jsonRetryCount: 1,
  rpmLimit: 10,
  perApiRpmEnabled: false,
  mvuRpmLimit: 10,
  rewriteRpmLimit: 10,
  rpmMaxQueueAttempts: 10,
  mvuSelfCorrectEnabled: false,
  mvuSelfCorrectRetries: 1,
  textRatio: 1,
  systemRatio: 1,
  dsCache: DEFAULT_DS_CACHE_CONFIG,
  forceJsonObject: true,
  dsUltraActive: false,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaults,

      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      setDarkMode: (v) => set({ darkMode: v }),
      setTooltipDelay: (d) => set({ tooltipDelay: d }),
      setMusicVolume: (v) => set({ musicVolume: v }),
      setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(100, Math.round(v))) }),
      setAutoSubmitChoice: (v) => set({ autoSubmitChoice: v }),
      setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
      setApiModel: (model) => set({ apiModel: model }),
      setApiKey: (k) => set({ apiKey: k }),
      setAvailableModels: (models) => set({ availableModels: models }),
      setPromptPostProcessing: (v) => set({ promptPostProcessing: v }),
      setMvuUseIndependentApi: (v) => set({ mvuUseIndependentApi: v }),
      setMvuForceAlways: (v) => set({ mvuForceAlways: v }),
      setMvuApiBaseUrl: (url) => set({ mvuApiBaseUrl: url }),
      setMvuApiModel: (model) => set({ mvuApiModel: model }),
      setMvuApiKey: (key) => set({ mvuApiKey: key }),
      setRewriteUseIndependentApi: (v) => set({ rewriteUseIndependentApi: v }),
      setRewriteLite: (v) => set({ rewriteLite: v }),
      setRewriteLiteIncludeMatchedLore: (v) => set({ rewriteLiteIncludeMatchedLore: v }),
      setRewriteApiBaseUrl: (url) => set({ rewriteApiBaseUrl: url }),
      setRewriteApiModel: (model) => set({ rewriteApiModel: model }),
      setRewriteApiKey: (key) => set({ rewriteApiKey: key }),
      setRewriteAvailableModels: (models) => set({ rewriteAvailableModels: models }),
      setMvuTemperature: (t) => set({ mvuTemperature: t }),
      setMvuRetryCount: (n) => set({ mvuRetryCount: n }),
      setMvuMaxTokens: (n) => set({ mvuMaxTokens: n }),
      setMvuAvailableModels: (models) => set({ mvuAvailableModels: models }),
      setMaxSummaryEntries: (n) => set({ maxSummaryEntries: n }),
      setNpcMemoryKeep: (n) => set({ npcMemoryKeep: Math.max(3, Math.min(12, Math.floor(n))) }),
      setContextPageDepth: (n) => set({ contextPageDepth: n }),
      setGlobalCaseSensitive: (v) => set({ globalCaseSensitive: v }),
      setGlobalMatchWholeWord: (v) => set({ globalMatchWholeWord: v }),
      setMaxRecursionSteps: (n) => set({ maxRecursionSteps: n }),
      setIncludeNames: (v) => set({ includeNames: v }),
      setWiBudget: (n) => set({ wiBudget: n }),
      setAlertOnOverflow: (v) => set({ alertOnOverflow: v }),
      setWorldInfoStrategy: (v) => set({ worldInfoStrategy: v }),
      setJsonRetryCount: (n) => set({ jsonRetryCount: Math.max(0, Math.min(5, Math.floor(n))) }),
      setRpmLimit: (n) => set({ rpmLimit: Math.max(0, Math.min(10, Math.floor(n))) }),
      setPerApiRpmEnabled: (v) => set({ perApiRpmEnabled: v }),
      setMvuRpmLimit: (n) => set({ mvuRpmLimit: Math.max(0, Math.min(10, Math.floor(n))) }),
      setRewriteRpmLimit: (n) => set({ rewriteRpmLimit: Math.max(0, Math.min(10, Math.floor(n))) }),
      setRpmMaxQueueAttempts: (n) => set({ rpmMaxQueueAttempts: Math.max(0, Math.min(10, Math.floor(n))) }),
      setMvuSelfCorrectEnabled: (v) => set({ mvuSelfCorrectEnabled: v }),
      setMvuSelfCorrectRetries: (n) => set({ mvuSelfCorrectRetries: Math.max(0, Math.min(3, Math.floor(n))) }),
      setTextRatio: (v) => set({ textRatio: clampTextRatio(v) }),
      setSystemRatio: (v) => set({ systemRatio: clampTextRatio(v) }),
      setDsCache: (c) => set((s) => ({ dsCache: { ...s.dsCache, ...c } })),
      setForceJsonObject: (v) => set({ forceJsonObject: v }),
      /**
       * 一键 DeepSeek 终极适配 —— 把所有【与缓存命中/上下文长度/MVU 健康相关】的
       * 设置一次性覆盖到最优组合：
       *
       * 【DS 缓存（前缀缓存最大化）】
       * - restructure: true              三区重组(顶部稳定前缀)
       * - roleTags: true                 合并时加 <role==X> 标签
       * - keepTailAssistant: true        postHistory 尾的 assistant 保独立
       * - targetSources: deepseek,custom 覆盖中转站
       * - separateWiLights: true         绿灯下沉到底部高注意力区
       * - autoDetectDynamicConstant: true 自动识别动态 constant 下沉
       * - experimentalLeanSnapshot: true statSnapshot 减肥（省 500-1500 tok）
       * - experimentalSkipMvuVarList: true 跳过与 statSnapshot 重复的内置条目
       * - experimentalPrefixDiagnostics: true 漂移诊断(已有 driftBySegment)
       * - experimentalSubagentSharedSystem: true 子调用共享前缀
       * - autoSinkDynamicPromptItem: true 自动下沉含动态宏的 system 类 promptItem
       *
       * 【上下文长度（无限长保命中）】
       * - maxSummaryEntries: 50          剧情回顾上限拉满
       * - tavernHelper.optimize.optimizeMessageLoad: false（跨 store 调用）
       *   不 trim 历史 page，让 chatHistory 永久增长——稳定前缀不被刷掉
       *
       * 【MVU 健康】
       * - mvuSelfCorrectEnabled: true    MVU 失败时调 LLM 自纠
       * - mvuSelfCorrectRetries: 2       保险，单次易漏
       * - mvuForceAlways: false          主回合带 patch 时跳过 MVU 提取省钱
       *
       * 【全局】
       * - forceJsonObject: true          严格 JSON 模式（MVU 解析更稳）
       *
       * 不动：API 三件套（凭证）/ dsCache.enabled/mode/customText（思维模式偏好）/
       * UI 偏好（uiScale/音量/颜色）/ mvuApi 三件套（用户的独立 MVU API 凭证）。
       */
      /**
       * v1.11.8 重构: 一键 DeepSeek 终极适配 = 纯 flag 切换。
       *
       * 不再 snapshot+覆盖字段(老版会让用户底下 Toggle 显示状态随之改变,撤销后
       * 也可能不一致)。改为 set dsUltraActive: true,所有读取处通过 getEffective*()
       * 在 active 时返回 DS_ULTRA_PRESET 值,否则返回用户原值。
       *
       * 用户底下 Toggle 显示的是 store.dsCache 原值(不变);实际生效的是 effective
       * dsCache (active 时用 ULTRA preset 覆盖)。
       */
      applyDeepSeekUltraPreset: () => {
        set({ dsUltraActive: true });
      },
      /**
       * v1.11.8 重构: 撤销 = 纯 flag 关。用户 Toggle 状态从来没动过,所以撤销无需恢复。
       */
      revertDeepSeekUltraPreset: () => {
        set({ dsUltraActive: false });
      },
    }),
    {
      name: 'coc_settings_v2',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
      // 反序列化时给 dsCache 做深合并:zustand 默认顶层 shallow merge,会让老存档里缺失的
      // dsCache 子字段(如 v1.8 没有的 restructure/experimentalPrefixDiagnostics 等)整块覆盖
      // 默认值——结果 UI 的 `!== false` 显 ON、管线的 `=== true` 视 OFF,功能形同未启用。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsStore>;
        return {
          ...current,
          ...p,
          dsCache: { ...DEFAULT_DS_CACHE_CONFIG, ...(p.dsCache ?? {}) },
        } as SettingsStore;
      },
    },
  ),
);
