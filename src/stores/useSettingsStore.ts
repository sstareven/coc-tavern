import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
import { type DsCacheConfig, DEFAULT_DS_CACHE_CONFIG } from '../sillytavern/deepseek-cache';

/** 界面缩放合法档位：标准/大/特大/超大。控件与 clamp 共用。 */
export const UI_SCALE_LEVELS = [1, 1.15, 1.3, 1.5] as const;

/** 把任意输入吸附到最近的合法缩放档位；非法/非有限值回落 1。 */
export function clampUiScale(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return UI_SCALE_LEVELS.reduce(
    (best, lvl) => (Math.abs(lvl - v) < Math.abs(best - v) ? lvl : best),
    UI_SCALE_LEVELS[0] as number,
  );
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
  // MVU 失败回灌自纠：默认关闭；开启后最多额外 N 次 mvu 桶往返让 AI 修正非法变量更新。
  mvuSelfCorrectEnabled: boolean;
  mvuSelfCorrectRetries: number;
  /** 界面整体缩放倍率（桌面端，合法档位见 UI_SCALE_LEVELS）。默认 1=100%。 */
  uiScale: number;
  /** DeepSeek V4 缓存优化器：思维模式指令注入（附着到末条用户消息，保前缀缓存）。 */
  dsCache: DsCacheConfig;
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
  setMvuSelfCorrectEnabled: (v: boolean) => void;
  setMvuSelfCorrectRetries: (n: number) => void;
  setUiScale: (v: number) => void;
  setDsCache: (c: Partial<DsCacheConfig>) => void;
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
  mvuSelfCorrectEnabled: false,
  mvuSelfCorrectRetries: 1,
  uiScale: 1,
  dsCache: DEFAULT_DS_CACHE_CONFIG,
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
      setMvuSelfCorrectEnabled: (v) => set({ mvuSelfCorrectEnabled: v }),
      setMvuSelfCorrectRetries: (n) => set({ mvuSelfCorrectRetries: Math.max(0, Math.min(3, Math.floor(n))) }),
      setUiScale: (v) => set({ uiScale: clampUiScale(v) }),
      setDsCache: (c) => set((s) => ({ dsCache: { ...s.dsCache, ...c } })),
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
