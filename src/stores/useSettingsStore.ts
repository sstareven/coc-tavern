import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

interface SettingsState {
  soundEnabled: boolean;
  tooltipDelay: number;
  musicVolume: number;
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
}

interface SettingsStore extends SettingsState {
  toggleSound: () => void;
  setTooltipDelay: (d: number) => void;
  setMusicVolume: (v: number) => void;
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
}

const defaults: SettingsState = {
  soundEnabled: true,
  tooltipDelay: 600,
  musicVolume: 40,
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
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaults,

      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      setTooltipDelay: (d) => set({ tooltipDelay: d }),
      setMusicVolume: (v) => set({ musicVolume: v }),
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
    }),
    {
      name: 'coc_settings_v2',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
    },
  ),
);
