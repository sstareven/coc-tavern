import { create } from 'zustand';
interface SettingsStore { soundEnabled: boolean; tooltipDelay: number; musicVolume: number; apiBaseUrl: string; apiModel: string; apiKey: string; availableModels: string[]; toggleSound: () => void; setTooltipDelay: (d:number) => void; setMusicVolume: (v:number) => void; setApiKey: (k:string) => void; setAvailableModels: (models:string[]) => void; }
export const useSettingsStore = create<SettingsStore>((set) => ({
  soundEnabled: true, tooltipDelay: 600, musicVolume: 40, apiBaseUrl: 'https://api.deepseek.com', apiModel: 'deepseek-v4-pro', apiKey: '', availableModels: [],
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
  setTooltipDelay: (d) => set({ tooltipDelay: d }),
  setMusicVolume: (v) => set({ musicVolume: v }),
  setApiKey: (k) => set({ apiKey: k }),
  setAvailableModels: (models) => set({ availableModels: models }),
}));
