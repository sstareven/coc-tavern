import { describe, it, expect, beforeEach } from 'vitest';
import { boutEvaluator, _resetBoutEvaluatorCacheForTest } from '../bout-evaluator';
import {
  clearEvaluatorsForTest,
  runPostSettleEvaluators,
  registerEvaluator,
  type EvaluatorContext,
} from '../post-settle-evaluators';
import { useCharSheetStore, migrateSheet } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { useDiceStore } from '../../stores/useDiceStore';
import type { CharacterSheet } from '../../types';
import type { MvuPatchReport } from '../mvu-jsonpatch';

// A2 重设: 基础角色卡——SAN 60/80、INT 70、daily 0、未疯。
function baseSheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return migrateSheet({
    identity: { name: '田中', occupation: '记者', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    dailySanLoss: 0,
    ...over,
  });
}

function ctx(over: Partial<EvaluatorContext> = {}): EvaluatorContext {
  return {
    sheet: useCharSheetStore.getState().sheet,
    statData: useVariableStore.getState().statData,
    patchReport: { applied: 0, failed: [] },
    applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    ...over,
  };
}

beforeEach(() => {
  clearEvaluatorsForTest();
  _resetBoutEvaluatorCacheForTest();
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(baseSheet());
  useDiceStore.setState({
    isOpen: false,
    isProgrammatic: false,
    programmaticSkill: undefined,
    programmaticContext: undefined,
    onProgrammaticResolve: undefined,
  });
});

describe('boutEvaluator — 永久疯狂触发(SAN ≤ 0)', () => {
  it('SAN 当前已降到 0 / negative → 写 /调查员/永久疯狂 = true', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      secondary: {
        hp: { current: 12, max: 12 }, san: { current: 0, max: 80 }, mp: { current: 10, max: 10 },
        luck: 50, mov: 8, db: '0', build: 0,
      },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -60, episodeId: 'perm-1' },
    };
    boutEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(true);
    // 永久疯狂触发即终局,不再写临时疯狂。
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
  });
});

describe('boutEvaluator — 不定性疯狂触发(当日累计 ≥ maxSan/5)', () => {
  it('单次损失 + 当日累计达到阈值 → 写 /调查员/不定性疯狂/active = true(不触发 Bout)', () => {
    useCharSheetStore.getState().setSheet(baseSheet({
      secondary: {
        hp: { current: 12, max: 12 }, san: { current: 54, max: 80 }, mp: { current: 10, max: 10 },
        luck: 50, mov: 8, db: '0', build: 0,
      },
      dailySanLoss: 10,
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -6, episodeId: 'indef-1' },
    };
    boutEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.indefiniteInsanity.active).toBe(true);
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(false);
    // indefinite 优先级高于 Bout, 不触发临时疯狂。
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
  });
});

describe('boutEvaluator — 临时疯狂发作(|delta| ≥ 5、不触发不定/永久)', () => {
  it('单次 -5 损失 → 直接 triggerBout 写入 /调查员/临时疯狂/active', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'bout-1' },
    };
    boutEvaluator(ctx({ patchReport }));
    // A2 重设: 不再绕 DicePanel 跑 INT, 直接进 Bout。
    expect(useDiceStore.getState().isOpen).toBe(false);
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBeGreaterThanOrEqual(1);
  });

  it('|delta| < 5 → 不触发临时疯狂(不达 Bout 阈值)', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -2, episodeId: 'nobout-1' },
    };
    boutEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
    expect(useDiceStore.getState().isOpen).toBe(false);
  });
});

describe('boutEvaluator — 指纹去重(同 episodeId 不重复触发)', () => {
  it('同一 episodeId 跑两次 → 仅第一次触发 Bout', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'fp-dup' },
    };
    boutEvaluator(ctx({ patchReport }));
    const roundsAfterFirst = useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft;
    expect(roundsAfterFirst).toBeGreaterThanOrEqual(1);

    // 第二次同 fingerprint, roundsLeft 不应再被覆盖。
    boutEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBe(roundsAfterFirst);
  });
});

describe('boutEvaluator — 无 SAN 损失 / 正向恢复 → 无操作', () => {
  it('sanDelta=0 / charSheetDeltas 缺失 → 不触发任何分支', () => {
    boutEvaluator(ctx({ patchReport: { applied: 0, failed: [] } }));
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(false);
    expect(useCharSheetStore.getState().sheet.indefiniteInsanity.active).toBe(false);
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
  });

  it('sanDelta>0 (恢复) → 不触发任何分支', () => {
    const patchReport: MvuPatchReport = {
      applied: 1, failed: [],
      charSheetDeltas: { sanDelta: 5, episodeId: 'recover-1' },
    };
    boutEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
  });
});

describe('boutEvaluator — 通过 runPostSettleEvaluators 注册流跑通', () => {
  it('registerEvaluator(bout, ...) 后由 runPostSettleEvaluators 调度', () => {
    registerEvaluator('bout', boutEvaluator);
    const patchReport: MvuPatchReport = {
      applied: 1, failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'runner-1' },
    };
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
  });
});
