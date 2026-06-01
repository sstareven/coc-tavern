import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';
import { randD10, d100, determineResult } from '../sillytavern/dice-engine';
import { useBookStore } from './useBookStore';

interface DiceStore {
  isOpen: boolean; mode: DiceMode; target: number; bonusDice: number; sanCheck: boolean;
  tens: number; ones: number; finalTens: number; bonusTens: number; oppTens: number; oppOnes: number;
  originalRoll: number; finalRoll: number; resultType: DiceResultType | null; history: DiceRecord[];
  pending: DiceRecord[];
  open: () => void; close: () => void;
  setMode: (m: DiceMode) => void; setTarget: (t: number) => void;
  toggleBonus: () => void; togglePenalty: () => void; toggleSan: () => void;
  roll: () => void; addRecord: (r: DiceRecord) => void;
  // 剧情选项的检定先暂存，待剧情真正推进后由 commitPending 落入 history，
  // 避免「点了选项但没提交/提交失败」时留下永不成真的记录。手动骰子面板(roll)不走这条。
  stashRecord: (r: DiceRecord) => void;
  commitPending: () => void;
  clearPending: () => void;
  /** 用一组记录替换历史（newest-first，取前 20）——供读档/删页从页面 diceResults 重建。 */
  setHistory: (records: DiceRecord[]) => void;
  /** 清空检定历史与暂存——切换/读取会话时调用，杜绝跨档残留。 */
  clearAll: () => void;
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
  originalRoll: 0, finalRoll: 0, resultType: null, history: [], pending: [],
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
      page: useBookStore.getState().pageIndex + 1,
    });
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
  stashRecord: (r) => set((s) => ({ pending: [...s.pending, r] })),
  commitPending: () => set((s) => ({
    history: [...[...s.pending].reverse(), ...s.history].slice(0, 20),
    pending: [],
  })),
  clearPending: () => set({ pending: [] }),
  setHistory: (records) => set({ history: records.slice(0, 20), pending: [] }),
  clearAll: () => set({ history: [], pending: [] }),
}));
