import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerEvaluator,
  unregisterEvaluator,
  runPostSettleEvaluators,
  clearEvaluatorsForTest,
  type EvaluatorContext,
} from './post-settle-evaluators';
import { useCharSheetStore, migrateSheet } from '../stores/useCharSheetStore';
import { useVariableStore } from '../stores/useVariableStore';
import type { MvuOpError } from './mvu-jsonpatch';

beforeEach(() => {
  clearEvaluatorsForTest();
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(migrateSheet({
    secondary: {
      hp: { current: 10, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 8, max: 8 },
      luck: 55, mov: 8, db: '0', build: 0,
    },
  }));
});

describe('post-settle-evaluators — registry', () => {
  it('registerEvaluator + runPostSettleEvaluators 调度注册的函数', () => {
    const calls: string[] = [];
    registerEvaluator('alpha', () => { calls.push('alpha'); });
    registerEvaluator('beta', () => { calls.push('beta'); });
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual(['alpha', 'beta']);
  });

  it('unregisterEvaluator 移除注册', () => {
    const calls: string[] = [];
    registerEvaluator('once', () => { calls.push('once'); });
    unregisterEvaluator('once');
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual([]);
  });

  it('register 同名覆盖旧函数(不重复触发)', () => {
    const calls: string[] = [];
    registerEvaluator('x', () => { calls.push('v1'); });
    registerEvaluator('x', () => { calls.push('v2'); });
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual(['v2']);
  });
});

describe('post-settle-evaluators — 应用 ops 不被 MVU 快照回滚 (G3)', () => {
  it('SAN-1 evaluator 实际持久化到 sheet', () => {
    const sanBefore = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanBefore).toBe(60);

    registerEvaluator('san-decay', (ctx: EvaluatorContext) => {
      ctx.applyCorrectiveOps([
        { op: 'delta', path: '/调查员/理智值/当前', value: -1 },
      ]);
    });

    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });

    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(59);
  });

  it('evaluator 抛错被吞掉,其他 evaluator 仍跑(隔离)', () => {
    const calls: string[] = [];
    registerEvaluator('boom', () => { throw new Error('on purpose'); });
    registerEvaluator('after-boom', () => { calls.push('after-boom'); });
    expect(() =>
      runPostSettleEvaluators({
        sheet: useCharSheetStore.getState().sheet,
        statData: {},
        patchReport: { applied: 0, failed: [] },
        applyCorrectiveOps: () => [],
      }),
    ).not.toThrow();
    expect(calls).toEqual(['after-boom']);
  });

  it('applyCorrectiveOps 的返回值(failed ops)能被 evaluator 读取', () => {
    let capturedErrors: MvuOpError[] = [];
    registerEvaluator('observer', (ctx) => {
      capturedErrors = ctx.applyCorrectiveOps([
        { op: 'replace', path: '/调查员/foobar/zzz', value: 1 },
      ]);
    });
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    expect(capturedErrors).toHaveLength(1);
    expect(capturedErrors[0].path).toBe('调查员.foobar.zzz');
  });
});
