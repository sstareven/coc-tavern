import { create } from 'zustand';

interface SettingsStore {
  // Global API
  soundEnabled: boolean;
  tooltipDelay: number;
  musicVolume: number;
  apiBaseUrl: string;
  apiModel: string;
  apiKey: string;
  availableModels: string[];

  // MVU independent API
  mvuUseIndependentApi: boolean;
  mvuApiBaseUrl: string;
  mvuApiModel: string;
  mvuApiKey: string;
  mvuTemperature: number;
  mvuRetryCount: number;

  // Actions
  toggleSound: () => void;
  setTooltipDelay: (d: number) => void;
  setMusicVolume: (v: number) => void;
  setApiKey: (k: string) => void;
  setAvailableModels: (models: string[]) => void;
  setMvuUseIndependentApi: (v: boolean) => void;
  setMvuApiBaseUrl: (url: string) => void;
  setMvuApiModel: (model: string) => void;
  setMvuApiKey: (key: string) => void;
  setMvuTemperature: (t: number) => void;
  setMvuRetryCount: (n: number) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  soundEnabled: true,
  tooltipDelay: 600,
  musicVolume: 40,
  apiBaseUrl: 'https://api.deepseek.com',
  apiModel: 'deepseek-v4-pro',
  apiKey: '',
  availableModels: [],

  mvuUseIndependentApi: false,
  mvuApiBaseUrl: 'https://api.deepseek.com',
  mvuApiModel: 'deepseek-chat',
  mvuApiKey: '',
  mvuTemperature: 1,
  mvuRetryCount: 1,

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setTooltipDelay: (d) => set({ tooltipDelay: d }),
  setMusicVolume: (v) => set({ musicVolume: v }),
  setApiKey: (k) => set({ apiKey: k }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setMvuUseIndependentApi: (v) => set({ mvuUseIndependentApi: v }),
  setMvuApiBaseUrl: (url) => set({ mvuApiBaseUrl: url }),
  setMvuApiModel: (model) => set({ mvuApiModel: model }),
  setMvuApiKey: (key) => set({ mvuApiKey: key }),
  setMvuTemperature: (t) => set({ mvuTemperature: t }),
  setMvuRetryCount: (n) => set({ mvuRetryCount: n }),
}));
