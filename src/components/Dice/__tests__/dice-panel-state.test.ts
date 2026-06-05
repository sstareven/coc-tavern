import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deriveUiStateAfterRoll,
  previewLuckResult,
  commitButtonLabel,
  maxLuckSpend,
} from '../dice-panel-state';
import { useDiceStore } from '../../../stores/useDiceStore';
import { useCharSheetStore, defaultSheet } from '../../../stores/useCharSheetStore';
import { useVariableStore } from '../../../stores/useVariableStore';

// ============================================================
// A1.5 — DicePanel 子状态机 + 幸运 slider 预览 (纯逻辑层)
//
// 本仓 vitest = node env, 不跑 jsdom/RTL, 故 DicePanel.tsx 的渲染交互
// 不能用 React Testing Library 直接断言。改抽出可独立测的状态机原语:
//   - deriveUiStateAfterRoll: 滚后落到 rolled / pushable 哪一支
//   - previewLuckResult: slider 拖到 N 点时预览结果级
//   - commitButtonLabel: spend=0 → 直接落账, spend>0 → 确认扣 N 点幸运
//   - maxLuckSpend: slider 上限钳位
//
// 行为级集成由 useDiceStore.commitWithLuck/commitAsPush 的现有 A1.3/A1.4 测试覆盖。
// 这里补 6 个 case 锁定 UI 状态推导逻辑。
// ============================================================

describe('A1.5 DicePanel 子状态机 (纯逻辑)', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 60, bonusDice: 0, sanCheck: false, mode: 'check',
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

  it('test 1 — 成功后状态机 → rolled (展示「花费幸运/直接落账」, 没有推骰按钮)', () => {
    expect(deriveUiStateAfterRoll({
      resultType: 'success', sanCheck: false, mode: 'check',
    })).toBe('rolled');
  });

  it('test 2 — 失败 + 普通检定 → pushable (展示「推骰」按钮)', () => {
    expect(deriveUiStateAfterRoll({
      resultType: 'failure', sanCheck: false, mode: 'check',
    })).toBe('pushable');
  });

  it('test 3 — 失败 + SAN check → rolled (SAN 不可推骰, 但仍可花幸运)', () => {
    expect(deriveUiStateAfterRoll({
      resultType: 'failure', sanCheck: true, mode: 'check',
    })).toBe('rolled');
    // 对抗检定的失败也不能推骰
    expect(deriveUiStateAfterRoll({
      resultType: 'failure', sanCheck: false, mode: 'opposed',
    })).toBe('rolled');
  });

  it('test 4 — slider 预览: 原骰 65 扣 5 → finalRoll=60, target=60, success', () => {
    const preview = previewLuckResult(65, 5, 60, false);
    expect(preview.previewRoll).toBe(60);
    expect(preview.previewResult).toBe('success');
  });

  it('test 5 — 「确认扣点」按钮文案: spend=0 → 直接落账; spend=8 → 确认扣 8 点幸运', () => {
    expect(commitButtonLabel(0)).toBe('直接落账');
    expect(commitButtonLabel(8)).toBe('确认扣 8 点幸运');
    expect(commitButtonLabel(1)).toBe('确认扣 1 点幸运');
  });

  it('test 6 — slider 上限钳位: min(luck, originalRoll-1)', () => {
    // luck=70, originalRoll=65 → 钳到 64 (扣到 finalRoll=1 不算)
    expect(maxLuckSpend(65, 70)).toBe(64);
    // luck=5, originalRoll=65 → 钳到 5 (扣不起更多)
    expect(maxLuckSpend(65, 5)).toBe(5);
    // luck=0 → 0
    expect(maxLuckSpend(65, 0)).toBe(0);
    // originalRoll=1 → 0 (没法再扣)
    expect(maxLuckSpend(1, 70)).toBe(0);
  });
});

// ============================================================
// A1.5 行为级回归 — DicePanel 通过 store API 串通 staging→commit 全链路 (不渲染 UI)
// ============================================================
describe('A1.5 DicePanel→store 集成 (行为级)', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 60, bonusDice: 0, sanCheck: false, mode: 'check',
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

  it('test 7 — 失败 → 推骰: commitAsPush(reason) 写 pushed=true + pushReason + pushedFrom', () => {
    const rng = vi.spyOn(Math, 'random');
    // 一掷: 0.5/0.5 → 55 → target=30 失败
    rng.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    useDiceStore.setState({ target: 30, mode: 'check', sanCheck: false });
    useDiceStore.getState().rollStaged('图书馆使用');

    const ctx = useDiceStore.getState().lastRollContext!;
    // UI 应推到 pushable
    expect(deriveUiStateAfterRoll({
      resultType: ctx.originalResult, sanCheck: ctx.sanCheck, mode: ctx.mode,
    })).toBe('pushable');

    // 二掷: 0.1/0.1 → 11 → target=30, 11≤15 → hard-success
    rng.mockReturnValueOnce(0.1).mockReturnValueOnce(0.1);
    useDiceStore.getState().commitAsPush('再翻一遍');

    const rec = useDiceStore.getState().history[0];
    expect(rec.pushed).toBe(true);
    expect(rec.pushReason).toBe('再翻一遍');
    expect(rec.pushedFrom).toEqual({ roll: 55, type: 'failure' });
    rng.mockRestore();
  });

  it('test 8 — 成功 → commitNow 直接落账 (无 pushed/luckSpent)', () => {
    const rng = vi.spyOn(Math, 'random');
    // 0.3/0.0 → 30 → target=60 → success
    rng.mockReturnValueOnce(0.3).mockReturnValueOnce(0.0);
    useDiceStore.setState({ target: 60, mode: 'check', sanCheck: false });
    useDiceStore.getState().rollStaged('侦查');

    expect(deriveUiStateAfterRoll({
      resultType: useDiceStore.getState().lastRollContext!.originalResult,
      sanCheck: false, mode: 'check',
    })).toBe('rolled');

    useDiceStore.getState().commitNow();
    const rec = useDiceStore.getState().history[0];
    expect(rec.pushed).toBeUndefined();
    expect(rec.luckSpent).toBeUndefined();
    expect(rec.type).toBe('hard-success');
    rng.mockRestore();
  });
});
