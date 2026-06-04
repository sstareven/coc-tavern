import { describe, it, expect, beforeEach } from 'vitest';
import { sanityEvaluator, _resetSanityEvaluatorCacheForTest } from '../sanity-evaluator';
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

// A2.4：基础角色卡——SAN 60/80、INT 70、daily 0、未疯。
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
  _resetSanityEvaluatorCacheForTest();
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(baseSheet());
  // 重置 DicePanel 状态，避免上一个 test 留下的 isProgrammatic 跨用例污染。
  useDiceStore.setState({
    isOpen: false,
    isProgrammatic: false,
    programmaticSkill: undefined,
    programmaticContext: undefined,
    onProgrammaticResolve: undefined,
  });
});

describe('sanityEvaluator — 永久疯狂触发（SAN ≤ 0）', () => {
  it('SAN 当前已降到 0 / negative → 写 /调查员/永久疯狂 = true', () => {
    // 模拟 LLM 写过 SAN delta=-60，redirect 把 SAN 钳到 0 但 sanDelta 仍透出真实 delta。
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
    sanityEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(true);
    // 永久疯狂触发即终局，不打开 DicePanel。
    expect(useDiceStore.getState().isOpen).toBe(false);
  });
});

describe('sanityEvaluator — 不定性疯狂触发（当日累计 ≥ maxSan/5）', () => {
  it('单次损失 + 当日累计达到阈值 → 写 /调查员/不定性疯狂/active = true（不开 INT 检定）', () => {
    // maxSan=80 阈值=16；dailyAccumulated=10 + 本次|delta|=6 → 16，触发。delta=-6 ≥5 也会过 INT 阈值，
    // 但 indefinite 优先级高，evaluator 不应再打开 DicePanel。
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
    sanityEvaluator(ctx({ patchReport }));
    expect(useCharSheetStore.getState().sheet.indefiniteInsanity.active).toBe(true);
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(false);
    expect(useDiceStore.getState().isOpen).toBe(false);
  });
});

describe('sanityEvaluator — INT 检定弹窗（|delta| ≥ 5、不触发不定/永久）', () => {
  it('单次 -5 损失 → 打开 DicePanel 程序性检定（INT=70 为目标）', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'int-1' },
    };
    sanityEvaluator(ctx({ patchReport }));
    const ds = useDiceStore.getState();
    expect(ds.isOpen).toBe(true);
    expect(ds.isProgrammatic).toBe(true);
    expect(ds.programmaticSkill).toBe('INT');
    expect(ds.target).toBe(70);
    expect(typeof ds.onProgrammaticResolve).toBe('function');
  });

  it('|delta| < 5 → 不开 DicePanel（不达 INT 阈值）', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -2, episodeId: 'noint-1' },
    };
    sanityEvaluator(ctx({ patchReport }));
    expect(useDiceStore.getState().isOpen).toBe(false);
  });
});

describe('sanityEvaluator — 指纹去重（同 episodeId 不重复触发）', () => {
  it('同一 episodeId 跑两次 → 仅第一次开 DicePanel', () => {
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'fp-dup' },
    };
    sanityEvaluator(ctx({ patchReport }));
    expect(useDiceStore.getState().isOpen).toBe(true);

    // 关掉 panel 模拟第一次已落账
    useDiceStore.setState({
      isOpen: false, isProgrammatic: false,
      programmaticSkill: undefined, programmaticContext: undefined, onProgrammaticResolve: undefined,
    });

    sanityEvaluator(ctx({ patchReport }));
    expect(useDiceStore.getState().isOpen).toBe(false); // 指纹命中，不重复弹
  });
});

describe('sanityEvaluator — 无 SAN 损失 / 正向恢复 → 无操作', () => {
  it('sanDelta=0 → 不触发任何分支', () => {
    sanityEvaluator(ctx({ patchReport: { applied: 0, failed: [] } }));
    expect(useDiceStore.getState().isOpen).toBe(false);
    expect(useCharSheetStore.getState().sheet.permanentInsanity).toBe(false);
    expect(useCharSheetStore.getState().sheet.indefiniteInsanity.active).toBe(false);
  });

  it('sanDelta>0 (恢复) → 不触发任何分支', () => {
    const patchReport: MvuPatchReport = {
      applied: 1, failed: [],
      charSheetDeltas: { sanDelta: 5, episodeId: 'recover-1' },
    };
    sanityEvaluator(ctx({ patchReport }));
    expect(useDiceStore.getState().isOpen).toBe(false);
  });
});

describe('sanityEvaluator — 通过 runPostSettleEvaluators 注册流跑通', () => {
  it('registerEvaluator(sanity, ...) 后由 runPostSettleEvaluators 调度', () => {
    // 显式重新注册（beforeEach 已 clearEvaluatorsForTest 抹掉了模块加载注册的副本）
    registerEvaluator('sanity', sanityEvaluator);
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
    expect(useDiceStore.getState().isOpen).toBe(true);
  });
});

describe('sanityEvaluator — INT 检定失败 → 调用 triggerBout（boutMode realtime）', () => {
  it('onResolve 收到 failure → 触发 triggerBout 写入 temporaryInsanity.active', () => {
    const patchReport: MvuPatchReport = {
      applied: 1, failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'intfail-1' },
    };
    sanityEvaluator(ctx({ patchReport }));
    const resolver = useDiceStore.getState().onProgrammaticResolve;
    expect(typeof resolver).toBe('function');
    // 模拟 INT 检定失败回调
    resolver!('failure', 99);
    // triggerBout 写 /调查员/临时疯狂 → redirect 落到 sheet.temporaryInsanity.active=true
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBeGreaterThanOrEqual(1);
  });
});
