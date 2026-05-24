import { create } from 'zustand';
import type { CharacterSheet } from '../types';

const STORAGE_KEY = 'coc_character';

const defaultSheet: CharacterSheet = {
  characteristics: { STR: 70, CON: 50, POW: 80, DEX: 65, APP: 45, SIZ: 55, INT: 75, EDU: 70 },
  halfFifth: { STR:{half:35,fifth:14}, CON:{half:25,fifth:10}, POW:{half:40,fifth:16}, DEX:{half:32,fifth:13}, APP:{half:22,fifth:9}, SIZ:{half:27,fifth:11}, INT:{half:37,fifth:15}, EDU:{half:35,fifth:14} },
  secondary: { hp:{current:10,max:10}, san:{current:72,max:80}, mp:{current:16,max:16}, luck:55, mov:8, db:'+1D4', build:1 },
  skills: { '图书馆使用':{base:20,current:60}, '驾驶':{base:20,current:50}, '心理学':{base:10,current:70} },
  identity: { name:'霍华德·菲利普斯', occupation:'私家侦探', age:34, gender:'男', birthplace:'马萨诸塞州', residence:'阿卡姆', id:'INV-1925-042' },
};

function loadFromStorage(): CharacterSheet {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.characteristics && parsed.identity) return parsed as CharacterSheet;
    }
  } catch { /* ignore corrupt data */ }
  return defaultSheet;
}

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  setSheet: (sheet: CharacterSheet) => void;
}

export const useCharSheetStore = create<CharSheetStore>((set) => ({
  sheet: loadFromStorage(),
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  setSheet: (sheet: CharacterSheet) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet)); } catch { /* quota exceeded */ }
    set({ sheet });
  },
}));
