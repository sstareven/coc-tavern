import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

export interface CharacterPresetData {
  name: string;
  player: string;
  occupation: string;
  customOccupation: string;
  age: number;
  sex: string;
  residence: string;
  birthplace: string;
  charValues: Record<string, number>;
  luckValue: number | null;
  creditRating: number;
  occSkills: string[];
  occPoints: Record<string, number>;
  interestSkills: string[];
  interestPoints: Record<string, number>;
  description: string;
  beliefs: string;
  significantPeople: string;
  meaningfulLocations: string;
  treasuredPossessions: string;
  traits: string;
  injuries: string;
  /** A0.1：从「phobias」重命名而来，避免与 sheet.phobias[] 撞名。老预设里的 phobias 字段由 loadPreset 做一次性回落兼容。 */
  backgroundFears: string;
  /** @deprecated 老预设使用此键；loadPreset 仍会读取作为 backgroundFears 的回落。 */
  phobias?: string;
}

export interface CharacterPreset {
  name: string;
  data: CharacterPresetData;
}

interface CharacterPresetsState {
  presets: CharacterPreset[];
}

interface CharacterPresetsStore extends CharacterPresetsState {
  savePreset: (data: CharacterPresetData) => boolean;
  deletePreset: (name: string) => void;
}

export const useCharacterPresetsStore = create<CharacterPresetsStore>()(
  persist(
    (set, get) => ({
      presets: [],
      savePreset: (data) => {
        const pn = (typeof prompt === 'function' ? prompt('请输入预设名称:') : '')?.trim();
        if (!pn) return false;
        const filtered = get().presets.filter(p => p.name !== pn);
        set({ presets: [...filtered, { name: pn, data }].slice(-10) });
        return true;
      },
      deletePreset: (name) => {
        set((s) => ({ presets: s.presets.filter(p => p.name !== name) }));
      },
    }),
    {
      name: 'coc_char_presets',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state as unknown as Record<string, unknown>) as Partial<CharacterPresetsState>,
    },
  ),
);
