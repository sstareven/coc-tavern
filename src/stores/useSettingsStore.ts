import { create } from 'zustand';

const STORAGE_KEY = 'coc_settings_v2';

function load(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(state: SettingsState) {
  try {
    const { toggleSound, setTooltipDelay, setMusicVolume, setApiKey, setAvailableModels, setMvuUseIndependentApi, setMvuApiBaseUrl, setMvuApiModel, setMvuApiKey, setMvuTemperature, setMvuRetryCount, setPromptPostProcessing, setApiBaseUrl, setApiModel, ...data } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded, ignore */ }
}

interface SettingsState {
  soundEnabled: boolean;
  tooltipDelay: number;
  musicVolume: number;
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
}

interface SettingsStore extends SettingsState {
  toggleSound: () => void;
  setTooltipDelay: (d: number) => void;
  setMusicVolume: (v: number) => void;
  setApiBaseUrl: (url: string) => void;
  setApiModel: (model: string) => void;
  setApiKey: (k: string) => void;
  setPromptPostProcessing: (v: string) => void;
  setMvuUseIndependentApi: (v: boolean) => void;
  setMvuApiBaseUrl: (url: string) => void;
  setMvuApiModel: (model: string) => void;
  setMvuApiKey: (key: string) => void;
  setMvuTemperature: (t: number) => void;
  setMvuRetryCount: (n: number) => void;
  setMvuAvailableModels: (models: string[]) => void;
}

const defaults: SettingsState = {
  soundEnabled: true,
  tooltipDelay: 600,
  musicVolume: 40,
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
};

const persisted = load();

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaults,
  ...persisted,

  toggleSound: () => set((s) => {
    const next = { ...s, soundEnabled: !s.soundEnabled };
    save(next);
    return { soundEnabled: next.soundEnabled };
  }),
  setTooltipDelay: (d) => set((s) => {
    save({ ...s, tooltipDelay: d });
    return { tooltipDelay: d };
  }),
  setMusicVolume: (v) => set((s) => {
    save({ ...s, musicVolume: v });
    return { musicVolume: v };
  }),
  setApiBaseUrl: (url) => set((s) => {
    save({ ...s, apiBaseUrl: url });
    return { apiBaseUrl: url };
  }),
  setApiModel: (model) => set((s) => {
    save({ ...s, apiModel: model });
    return { apiModel: model };
  }),
  setApiKey: (k) => set((s) => {
    save({ ...s, apiKey: k });
    return { apiKey: k };
  }),
  setAvailableModels: (models) => set((s) => {
    save({ ...s, availableModels: models });
    return { availableModels: models };
  }),
  setMvuUseIndependentApi: (v) => set((s) => {
    save({ ...s, mvuUseIndependentApi: v });
    return { mvuUseIndependentApi: v };
  }),
  setMvuApiBaseUrl: (url) => set((s) => {
    save({ ...s, mvuApiBaseUrl: url });
    return { mvuApiBaseUrl: url };
  }),
  setMvuApiModel: (model) => set((s) => {
    save({ ...s, mvuApiModel: model });
    return { mvuApiModel: model };
  }),
  setMvuApiKey: (key) => set((s) => {
    save({ ...s, mvuApiKey: key });
    return { mvuApiKey: key };
  }),
  setMvuTemperature: (t) => set((s) => {
    save({ ...s, mvuTemperature: t });
    return { mvuTemperature: t };
  }),
  setMvuRetryCount: (n) => set((s) => {
    save({ ...s, mvuRetryCount: n });
    return { mvuRetryCount: n };
  }),
  setMvuAvailableModels: (models) => set((s) => {
    save({ ...s, mvuAvailableModels: models });
    return { mvuAvailableModels: models };
  }),
  setPromptPostProcessing: (v) => set((s) => {
    save({ ...s, promptPostProcessing: v });
    return { promptPostProcessing: v };
  }),
}));
