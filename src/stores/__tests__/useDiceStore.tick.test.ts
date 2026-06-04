import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore, shouldTickSkill } from '../useDiceStore';
import { useCharSheetStore, defaultSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';
import type { DiceRecord } from '../../types';

// A3.3 — emitTickOp 落地：commit* → applyCorrectiveOps([{op:'replace',path:'/调查员/技能/X/ticked',value:true}])
// 仅成功档 + 非 luck-spent + 非 SAN + 非通用标签 + 非排除技能（信用评级/克苏鲁神话）。

describe('A3.3 shouldTickSkill (pure helper)', () => {
  function rec(over: Partial<DiceRecord> = {}): DiceRecord {
    return {
      skill: '侦查', roll: '30', target: '60', type: 'success', time: 0, ...over,
    } as DiceRecord;
  }
  it('成功+技能 → true', () => {
    expect(shouldTickSkill(rec({ type: 'success' }))).toBe(true);
    expect(shouldTickSkill(rec({ type: 'hard-success' }))).toBe(true);
    expect(shouldTickSkill(rec({ type: 'extreme-success' }))).toBe(true);
    expect(shouldTickSkill(rec({ type: 'crit-success' }))).toBe(true);
  });
  it('失败档 → false', () => {
    expect(shouldTickSkill(rec({ type: 'failure' }))).toBe(false);
    expect(shouldTickSkill(rec({ type: 'crit-failure' }))).toBe(false);
  });
  it('luck-spent 成功 → false（growthTickEligible=false）', () => {
    expect(shouldTickSkill(rec({ type: 'success', growthTickEligible: false }))).toBe(false);
  });
  it('排除技能（信用评级 / 克苏鲁神话）→ false', () => {
    expect(shouldTickSkill(rec({ skill: '信用评级', type: 'success' }))).toBe(false);
    expect(shouldTickSkill(rec({ skill: '克苏鲁神话', type: 'success' }))).toBe(false);
  });
  it('通用标签（检定/奖励骰/惩罚骰/SAN）→ false', () => {
    expect(shouldTickSkill(rec({ skill: '检定', type: 'success' }))).toBe(false);
    expect(shouldTickSkill(rec({ skill: '奖励骰', type: 'success' }))).toBe(false);
    expect(shouldTickSkill(rec({ skill: '惩罚骰', type: 'success' }))).toBe(false);
    expect(shouldTickSkill(rec({ skill: '理智检定', type: 'success' }))).toBe(false);
  });
});

describe('A3.3 useDiceStore — commit* 触发 emitTickOp → applyCorrectiveOps', () => {
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
      skills: { ...defaultSheet.skills, 侦查: { base: 25, current: 40, ticked: false } },
    });
  });

  it('commitNow 成功 → applyCorrectiveOps 收到 ticked replace true', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    // tens=2,ones=5 → 25 → 25<=60 success
    rng.mockReturnValueOnce(0.2).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitNow();

    // 找到 tick op 调用
    const tickCall = spy.mock.calls.find((c) =>
      Array.isArray(c[0]) && (c[0] as any[])[0]?.path === '/调查员/技能/侦查/ticked',
    );
    expect(tickCall).toBeDefined();
    expect((tickCall![0] as any[])[0]).toEqual({ op: 'replace', path: '/调查员/技能/侦查/ticked', value: true });
    expect(useCharSheetStore.getState().sheet.skills.侦查.ticked).toBe(true);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('commitNow 失败 → 不写 ticked', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    // tens=9,ones=5 → 95 → 95>60 failure
    rng.mockReturnValueOnce(0.9).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitNow();

    const tickCall = spy.mock.calls.find((c) =>
      Array.isArray(c[0]) && (c[0] as any[])[0]?.path === '/调查员/技能/侦查/ticked',
    );
    expect(tickCall).toBeUndefined();
    expect(useCharSheetStore.getState().sheet.skills.侦查.ticked).toBe(false);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('commitWithLuck 改写成功（luckSpent>0）→ growthTickEligible=false → 不写 ticked', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    // tens=6,ones=5 → 65 → 65>60 failure；扣 luck=10 → 55 ≤ 60 success
    rng.mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitWithLuck(10);

    // 应有 luck delta 调用，但 NO ticked 调用
    const tickCall = spy.mock.calls.find((c) =>
      Array.isArray(c[0]) && (c[0] as any[])[0]?.path === '/调查员/技能/侦查/ticked',
    );
    expect(tickCall).toBeUndefined();
    expect(useDiceStore.getState().history[0].growthTickEligible).toBe(false);
    expect(useCharSheetStore.getState().sheet.skills.侦查.ticked).toBe(false);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('commitAsPush 推骰成功 → 写 ticked（R6：推骰仍计成长）', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    // 初次 staged：tens=9,ones=5 → 95 failure
    rng.mockReturnValueOnce(0.9).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    // 推骰：tens=2,ones=0 → 20 success
    rng.mockReturnValueOnce(0.2).mockReturnValueOnce(0);
    useDiceStore.getState().commitAsPush('重新调查');

    const tickCall = spy.mock.calls.find((c) =>
      Array.isArray(c[0]) && (c[0] as any[])[0]?.path === '/调查员/技能/侦查/ticked',
    );
    expect(tickCall).toBeDefined();
    expect((tickCall![0] as any[])[0].value).toBe(true);
    expect(useCharSheetStore.getState().sheet.skills.侦查.ticked).toBe(true);
    spy.mockRestore();
    rng.mockRestore();
  });

  it('SAN 检定成功 → 不写 ticked（sanCheck 用通用标签或被显式排除）', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.2).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 60, sanCheck: true });
    // sanCheck 时 skillLabel 走默认 '检定'，会被 NON_TICKABLE_LABELS 拦截
    useDiceStore.getState().rollStaged();
    useDiceStore.getState().commitNow();

    const tickCall = spy.mock.calls.find((c) =>
      Array.isArray(c[0]) && (c[0] as any[])[0]?.path?.includes('/ticked'),
    );
    expect(tickCall).toBeUndefined();
    spy.mockRestore();
    rng.mockRestore();
  });
});
