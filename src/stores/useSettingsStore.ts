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
  mvuApiBaseUrl: string;
  mvuApiModel: string;
  mvuApiKey: string;
  mvuTemperature: number;
  mvuRetryCount: number;
  mvuAvailableModels: string[];
  maxSummaryEntries: number;
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
  setMvuApiBaseUrl: (url: string) => void;
  setMvuApiModel: (model: string) => void;
  setMvuApiKey: (key: string) => void;
  setMvuTemperature: (t: number) => void;
  setMvuRetryCount: (n: number) => void;
  setMvuAvailableModels: (models: string[]) => void;
  setMaxSummaryEntries: (n: number) => void;
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
  mvuApiBaseUrl: 'https://api.deepseek.com',
  mvuApiModel: 'deepseek-chat',
  mvuApiKey: '',
  mvuTemperature: 1,
  mvuRetryCount: 1,
  mvuAvailableModels: [],
  maxSummaryEntries: 20,
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
      setMvuApiBaseUrl: (url) => set({ mvuApiBaseUrl: url }),
      setMvuApiModel: (model) => set({ mvuApiModel: model }),
      setMvuApiKey: (key) => set({ mvuApiKey: key }),
      setMvuTemperature: (t) => set({ mvuTemperature: t }),
      setMvuRetryCount: (n) => set({ mvuRetryCount: n }),
      setMvuAvailableModels: (models) => set({ mvuAvailableModels: models }),
      setMaxSummaryEntries: (n) => set({ maxSummaryEntries: n }),
    }),
    {
      name: 'coc_settings_v2',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
    },
  ),
);
