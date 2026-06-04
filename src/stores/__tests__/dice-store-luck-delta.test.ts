import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import { useCharSheetStore, defaultSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';

// ============================================================
// A1.4 — commitWithLuck → applyCorrectiveOps → sheet.secondary.luck
// 端到端通路：dice store 写 op:delta /调查员/幸运 → variable store applyCorrectiveOps
// → applyMvuPatch redirect → applyCharsheetRedirect → useCharSheetStore.setSheet 落地。
// 不改 mvu-charsheet-redirect.ts（isNumericCharsheetTarget('调查员.幸运') 已 true，
// secondary==='luck' && op==='delta' 已支持，0~99 已钳位）。
//
// 注：vi.spyOn 后必须 spy.mockRestore() 显式还原——本仓的 vitest 4 中
// afterEach+vi.restoreAllMocks 对 Zustand 状态对象方法的还原不稳，
// 上一测的 spy 包装会泄漏到下一测的 .mock.calls。
// ============================================================
describe('A1.4 commitWithLuck → applyCorrectiveOps → sheet.luck', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 65, bonusDice: 0, sanCheck: false, mode: 'check',
      isProgrammatic: false, programmaticSkill: undefined,
      programmaticContext: undefined, onProgrammaticResolve: undefined,
      isStaged: false, lastRollContext: null,
    } as any);
    useVariableStore.getState().clearAll();
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      secondary: { ...defaultSheet.secondary, luck: 70 },
    });
  });

  it('扣 10 luck：sheet.secondary.luck 70→60，applyCorrectiveOps 接到 [{op:delta,path:/调查员/幸运,value:-10}]', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    // tens=6,ones=5 → 65 → 65>60 failure
    rng.mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60, sanCheck: false });
    useDiceStore.getState().rollStaged('侦查');

    useDiceStore.getState().commitWithLuck(10);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([
      { op: 'delta', path: '/调查员/幸运', value: -10 },
    ]);
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(60);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('spend 钳到 luck 上限：luck=5 时 commitWithLuck(99) 只扣 5（luck→0，record.luckSpent=5）', () => {
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      secondary: { ...defaultSheet.secondary, luck: 5 },
    });
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');

    useDiceStore.getState().commitWithLuck(99);

    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(0);
    expect(useDiceStore.getState().history[0].luckSpent).toBe(5);
    // 钳位发生在 dice store 层：自纠 op 也只扣 5。
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([
      { op: 'delta', path: '/调查员/幸运', value: -5 },
    ]);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('spend=0 短路：不调 applyCorrectiveOps，luck 不变', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');

    useDiceStore.getState().commitWithLuck(0);

    expect(spy).not.toHaveBeenCalled();
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(70);
    expect(useDiceStore.getState().history[0].luckSpent).toBe(0);
    spy.mockRestore();
    rng.mockRestore();
  });
});
