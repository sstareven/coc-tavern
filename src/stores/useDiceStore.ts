import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';
import { randD10, d100, determineResult } from '../sillytavern/dice-engine';

interface DiceStore {
  isOpen: boolean; mode: DiceMode; target: number; bonusDice: number; sanCheck: boolean;
  tens: number; ones: number; finalTens: number; bonusTens: number; oppTens: number; oppOnes: number;
  originalRoll: number; finalRoll: number; resultType: DiceResultType | null; history: DiceRecord[];
  open: () => void; close: () => void;
  setMode: (m: DiceMode) => void; setTarget: (t: number) => void;
  toggleBonus: () => void; togglePenalty: () => void; toggleSan: () => void;
  roll: () => void; addRecord: (r: DiceRecord) => void;
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
  originalRoll: 0, finalRoll: 0, resultType: null, history: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setMode: (m) => set({ mode: m }),
  setTarget: (t) => set({ target: t }),
  toggleBonus: () => set((s) => ({ bonusDice: s.bonusDice > 0 ? 0 : 1 })),
  togglePenalty: () => set((s) => ({ bonusDice: s.bonusDice < 0 ? 0 : -1 })),
  toggleSan: () => set((s) => ({ sanCheck: !s.sanCheck })),
  roll: () => {
    const s = get();
    const t = randD10(), o = randD10();
    let bt = 0;
    if (s.bonusDice !== 0) bt = randD10();
    let ft = t;
    if (s.bonusDice > 0) ft = Math.min(t, bt);
    else if (s.bonusDice < 0) ft = Math.max(t, bt);
    const originalRoll = d100(t, o);
    const finalRoll = d100(ft, o);
    const resultType = determineResult(finalRoll, s.target, s.sanCheck);
    const oppTens = s.mode === 'opposed' ? randD10() : 0;
    const oppOnes = s.mode === 'opposed' ? randD10() : 0;
    set({ tens: t, ones: o, finalTens: ft, bonusTens: bt, oppTens, oppOnes, originalRoll, finalRoll, resultType });
    get().addRecord({
      skill: s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定',
      roll: String(finalRoll).padStart(2, '0'),
      target: String(s.target),
      type: resultType,
      time: Date.now(),
    });
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
}));
