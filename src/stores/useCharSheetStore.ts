import { create } from 'zustand';
import type { CharacterSheet } from '../types';

export const defaultSheet: CharacterSheet = {
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
  posture: '站立',
  statusConditions: [],
};

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  setSheet: (sheet: CharacterSheet) => void;
  reset: () => void;
}

/**
 * 是否为「默认/空白」角色卡（用廉价标记判定，非深比较）：
 * 名字为空 + STR/CON 为 0 + 无任何技能。用于跳过持久化空卡。
 */
export function isDefaultSheet(sheet: CharacterSheet): boolean {
  return (
    sheet.identity.name === '' &&
    sheet.characteristics.STR === 0 &&
    sheet.characteristics.CON === 0 &&
    Object.keys(sheet.skills).length === 0
  );
}

export const useCharSheetStore = create<CharSheetStore>()((set) => ({
  sheet: defaultSheet,
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  setSheet: (sheet: CharacterSheet) => set({ sheet }),
  reset: () => set({ sheet: defaultSheet }),
}));
