import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CharacterSheet } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

const defaultSheet: CharacterSheet = {
  characteristics: { STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0 },
  halfFifth: { STR:{half:0,fifth:0}, CON:{half:0,fifth:0}, POW:{half:0,fifth:0}, DEX:{half:0,fifth:0}, APP:{half:0,fifth:0}, SIZ:{half:0,fifth:0}, INT:{half:0,fifth:0}, EDU:{half:0,fifth:0} },
  secondary: { hp:{current:0,max:0}, san:{current:0,max:0}, mp:{current:0,max:0}, luck:0, mov:0, db:'0', build:0 },
  skills: {},
  identity: { name:'', occupation:'', age:0, gender:'', birthplace:'', residence:'', id:'' },
  greeting: '',
  description: '',
  personality: '',
  scenario: '',
  personaDescription: '',
};

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  setSheet: (sheet: CharacterSheet) => void;
}

export const useCharSheetStore = create<CharSheetStore>()(
  persist(
    (set) => ({
      sheet: defaultSheet,
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      close: () => set({ isOpen: false }),
      setSheet: (sheet: CharacterSheet) => set({ sheet }),
    }),
    {
      name: 'coc_character',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state as unknown as Record<string, unknown>) as Partial<CharSheetStore>,
    },
  ),
);
