import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import { useCharSheetStore, defaultSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';

// ============================================================
// A1.3 — useDiceStore staging（rollStaged/commitWithLuck/commitAsPush/commitNow）
// 行为级（非纯函数）：recomputeRollWithLuck 是文件局部辅助，canStartPush A1.5 起对外导出，
// 二者仅通过 store API（commitWithLuck/commitAsPush）间接覆盖。
// ============================================================
describe('A1.3 useDiceStore staging', () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rollStaged 不落 history，仅写 lastRollContext + isStaged', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.4)  // tens=4
       .mockReturnValueOnce(0.2); // ones=2 → originalRoll=42
    useDiceStore.setState({ target: 60, mode: 'check', sanCheck: false });
    useDiceStore.getState().rollStaged('侦查');
    const s = useDiceStore.getState();
    expect(s.history).toEqual([]);
    expect(s.isStaged).toBe(true);
    expect(s.lastRollContext).not.toBeNull();
    expect(s.lastRollContext?.skill).toBe('侦查');
    expect(s.lastRollContext?.target).toBe(60);
    expect(s.lastRollContext?.originalRoll).toBe(42);
  });

  it('commitNow 把 staged 落 history 并清 staging', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.4).mockReturnValueOnce(0.2);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitNow();
    const s = useDiceStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].skill).toBe('侦查');
    expect(s.history[0].target).toBe('60');
    expect(s.isStaged).toBe(false);
    expect(s.lastRollContext).toBeNull();
  });

  it('commitWithLuck 改写 finalRoll/resultType，标记 luckSpent + growthTickEligible=false', () => {
    const rng = vi.spyOn(Math, 'random');
    // tens=6, ones=5 → originalRoll=65 → 65>60=failure；spend=5 → finalRoll=60 → success
    rng.mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60, sanCheck: false });
    useDiceStore.getState().rollStaged('侦查');
    expect(useDiceStore.getState().lastRollContext?.originalRoll).toBe(65);
    expect(useDiceStore.getState().lastRollContext?.originalResult).toBe('failure');

    useDiceStore.getState().commitWithLuck(5);

    const r = useDiceStore.getState().history[0];
    expect(r.luckSpent).toBe(5);
    expect(r.growthTickEligible).toBe(false);
    expect(r.type).toBe('success');
    expect(r.roll).toBe('60');
    expect(useDiceStore.getState().isStaged).toBe(false);
    expect(useDiceStore.getState().lastRollContext).toBeNull();
  });

  it('commitAsPush 二次掷骰：pushed=true，pushedFrom 携带原 roll/type，并清 staging', () => {
    const rng = vi.spyOn(Math, 'random');
    // 一掷：tens=9, ones=9 → originalRoll=99 → 99>30=failure（target=30 时 96-100 也不会被 SAN-low-skill 反转，sanCheck=false 但 target=30<50 命中低技能规则 ⇒ crit-failure）
    // 调整：用 0.5/0.5 → 55 → 55>30=failure
    rng.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 30, sanCheck: false, mode: 'check' });
    useDiceStore.getState().rollStaged('图书馆使用');
    expect(useDiceStore.getState().lastRollContext?.originalRoll).toBe(55);
    expect(useDiceStore.getState().lastRollContext?.originalResult).toBe('failure');

    // 二掷：tens=1, ones=1 → 11 → target=30 → 30/2=15 → 11<=15 hard-success
    rng.mockReturnValueOnce(0.1).mockReturnValueOnce(0.1);
    useDiceStore.getState().commitAsPush('翻箱倒柜再找一遍');

    const r = useDiceStore.getState().history[0];
    expect(r.pushed).toBe(true);
    expect(r.pushReason).toBe('翻箱倒柜再找一遍');
    expect(r.pushedFrom).toEqual({ roll: 55, type: 'failure' });
    expect(useDiceStore.getState().isStaged).toBe(false);
    expect(useDiceStore.getState().lastRollContext).toBeNull();
  });

  it('clearAll 重置 staging 状态（lastRollContext null，isStaged false）', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.4).mockReturnValueOnce(0.2);
    useDiceStore.getState().rollStaged('侦查');
    expect(useDiceStore.getState().isStaged).toBe(true);

    useDiceStore.getState().clearAll();
    const s = useDiceStore.getState();
    expect(s.isStaged).toBe(false);
    expect(s.lastRollContext).toBeNull();
    expect(s.history).toEqual([]);
  });
});
