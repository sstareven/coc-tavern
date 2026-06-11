import { describe, it, expect, beforeEach, vi } from 'vitest';
import { triggerBout } from '../bout-dispatch';
import { boutEvaluator, _resetBoutEvaluatorCacheForTest } from '../bout-evaluator';
import { applyCharsheetRedirect } from '../mvu-charsheet-redirect';
import { useCharSheetStore, migrateSheet } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import type { EvaluatorContext } from '../post-settle-evaluators';
import type { CharacterSheet } from '../../types';
import type { MvuPatchReport } from '../mvu-jsonpatch';
import { setTreePath } from '../mvu-var-access';

/**
 * C3 — 潜伏疯狂（Latent Insanity, COC7e p132）测试套件。
 *
 * 规则：临时疯狂发作结束后，调查员进入 1D10 小时潜伏疯狂期。
 * 在此期间，任何 ≥1 点 SAN 损失立即触发新一轮疯狂发作（跳过 |delta|≥5 阈值）。
 */

// stub fetch (bout-dispatch summary 分支可能 fire-and-forget callDsSubagent)
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) })) as unknown as typeof fetch,
);

function baseSheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return migrateSheet({
    identity: { name: '测试者', occupation: '记者', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 50, max: 80 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    ...over,
  });
}

function mkCtx(overSheet?: Partial<CharacterSheet>): EvaluatorContext {
  if (overSheet) {
    useCharSheetStore.getState().setSheet(baseSheet(overSheet));
  }
  return {
    sheet: useCharSheetStore.getState().sheet,
    statData: useVariableStore.getState().statData,
    patchReport: { applied: 0, failed: [] },
    applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
  };
}

function seqRollD10(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 设置游戏 epoch（分钟）到 statData */
function setEpoch(epoch: number): void {
  const sd = useVariableStore.getState().statData;
  setTreePath(sd, '世界.时间.epoch', epoch);
}

beforeEach(() => {
  useVariableStore.getState().clearAll();
  _resetBoutEvaluatorCacheForTest();
  useCharSheetStore.getState().setSheet(baseSheet());
});

// ──────────────────────────────────────────────────────────
// 1. triggerBout 写入 latentInsanity
// ──────────────────────────────────────────────────────────

describe('triggerBout — latent insanity emission', () => {
  it('realtime bout with epoch > 0 → 写入 latentInsanity{active:true, expiresAtEpoch}', () => {
    setEpoch(1000); // 1000 分钟
    // rollD10 sequence: [7 (roundsLeft), 3 (entry), 5 (latentHours)]
    const out = triggerBout(mkCtx(), 'realtime', seqRollD10([7, 3, 5]));
    expect(out.latentHours).toBe(5);
    const li = useCharSheetStore.getState().sheet.latentInsanity;
    expect(li).toBeDefined();
    expect(li!.active).toBe(true);
    expect(li!.expiresAtEpoch).toBe(1000 + 5 * 60); // 1000 + 300 = 1300
  });

  it('summary bout with epoch > 0 → 写入 latentInsanity', () => {
    setEpoch(2000);
    // rollD10 sequence: [4 (entry), 8 (latentHours)]
    const out = triggerBout(mkCtx(), 'summary', seqRollD10([4, 8]));
    expect(out.latentHours).toBe(8);
    const li = useCharSheetStore.getState().sheet.latentInsanity;
    expect(li).toBeDefined();
    expect(li!.active).toBe(true);
    expect(li!.expiresAtEpoch).toBe(2000 + 8 * 60);
  });

  it('epoch = 0 → 降级不写 latentInsanity，latentHours = 0', () => {
    // epoch 默认为 0（空 statData）
    const out = triggerBout(mkCtx(), 'realtime', seqRollD10([5, 3, 7]));
    expect(out.latentHours).toBe(0);
    const li = useCharSheetStore.getState().sheet.latentInsanity;
    expect(li).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────
// 2. boutEvaluator — latent phase triggers bout on any SAN loss ≥ 1
// ──────────────────────────────────────────────────────────

describe('boutEvaluator — latent insanity triggers bout on SAN loss ≥ 1', () => {
  it('SAN loss = -1（不到 |5| 阈值）+ latent active + bout not active → 触发新 bout', () => {
    setEpoch(1500);
    useCharSheetStore.getState().setSheet(baseSheet({
      latentInsanity: { active: true, expiresAtEpoch: 2000 },
      temporaryInsanity: { active: false, roundsLeft: 0 },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -1, episodeId: 'latent-1' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    // 即便 |delta|=1 < 5，latent phase 也直接触发了新 bout。
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
  });

  it('SAN loss = -3（不到 |5| 阈值）+ latent active + bout not active → 触发新 bout', () => {
    setEpoch(1500);
    useCharSheetStore.getState().setSheet(baseSheet({
      latentInsanity: { active: true, expiresAtEpoch: 2000 },
      temporaryInsanity: { active: false, roundsLeft: 0 },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -3, episodeId: 'latent-3' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
  });

  it('bout still active 时 latent 不介入（不重复触发）', () => {
    setEpoch(1500);
    useCharSheetStore.getState().setSheet(baseSheet({
      latentInsanity: { active: true, expiresAtEpoch: 2000 },
      temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: 2 } },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -2, episodeId: 'latent-boutactive' },
    };
    // 记录旧的 roundsLeft
    const oldRoundsLeft = useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft;
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    // |delta|=2 < 5 且 bout active → latent 不介入 → 不触发新 bout（现有 bout 不受干扰）
    // bout active 期间 intRollNeeded=false(|2|<5)，所以也不走正常 bout 路径。
    // roundsLeft 应保持不变。
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBe(oldRoundsLeft);
  });
});

// ──────────────────────────────────────────────────────────
// 3. latent insanity 到期自动清除
// ──────────────────────────────────────────────────────────

describe('boutEvaluator — latent insanity expiry', () => {
  it('epoch >= expiresAtEpoch → latent 被清除，SAN loss < 5 不触发 bout', () => {
    setEpoch(2500); // 已超过 expiresAtEpoch
    useCharSheetStore.getState().setSheet(baseSheet({
      latentInsanity: { active: true, expiresAtEpoch: 2000 },
      temporaryInsanity: { active: false, roundsLeft: 0 },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -2, episodeId: 'latent-expired' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    // latent 已过期 → 不走 latent 路径 → |delta|=2 < 5 → 不触发 bout
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
    // latent 标志被清除
    expect(useCharSheetStore.getState().sheet.latentInsanity).toBeUndefined();
  });

  it('epoch exactly = expiresAtEpoch → 视为已过期（边界）', () => {
    setEpoch(2000);
    useCharSheetStore.getState().setSheet(baseSheet({
      latentInsanity: { active: true, expiresAtEpoch: 2000 },
      temporaryInsanity: { active: false, roundsLeft: 0 },
    }));
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -1, episodeId: 'latent-boundary' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    // epoch == expiresAtEpoch → 过期 → 不触发
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
    expect(useCharSheetStore.getState().sheet.latentInsanity).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────
// 4. 正常 SAN 损失流程（无 latent）不受影响
// ──────────────────────────────────────────────────────────

describe('boutEvaluator — normal flow without latent insanity', () => {
  it('无 latentInsanity + |delta| < 5 → 不触发 bout', () => {
    setEpoch(1000);
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -2, episodeId: 'normal-nobout' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(false);
  });

  it('无 latentInsanity + |delta| >= 5 → 正常触发 bout', () => {
    setEpoch(1000);
    const patchReport: MvuPatchReport = {
      applied: 1,
      failed: [],
      charSheetDeltas: { sanDelta: -5, episodeId: 'normal-bout' },
    };
    boutEvaluator({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport,
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });
    expect(useCharSheetStore.getState().sheet.temporaryInsanity.active).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// 5. charsheet redirect — 潜伏疯狂路径
// ──────────────────────────────────────────────────────────

describe('applyCharsheetRedirect — 潜伏疯狂', () => {
  function blankSheet(): CharacterSheet {
    return migrateSheet({});
  }

  it('调查员.潜伏疯狂 replace 整树 → 写入 latentInsanity', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.潜伏疯狂', 'replace',
      { active: true, expiresAtEpoch: 3000 });
    expect(r?.sheet.latentInsanity).toEqual({ active: true, expiresAtEpoch: 3000 });
  });

  it('调查员.潜伏疯狂 replace null → 清除 latentInsanity', () => {
    const s = migrateSheet({ latentInsanity: { active: true, expiresAtEpoch: 3000 } });
    const r = applyCharsheetRedirect(s, '调查员.潜伏疯狂', 'replace', null);
    expect(r?.sheet.latentInsanity).toBeUndefined();
  });

  it('调查员.潜伏疯狂.active replace true → active=true 保留 expiresAtEpoch', () => {
    const s = migrateSheet({ latentInsanity: { active: true, expiresAtEpoch: 5000 } });
    const r = applyCharsheetRedirect(s, '调查员.潜伏疯狂.active', 'replace', true);
    expect(r?.sheet.latentInsanity?.active).toBe(true);
    expect(r?.sheet.latentInsanity?.expiresAtEpoch).toBe(5000);
  });

  it('调查员.潜伏疯狂.active replace false → 清除 latentInsanity', () => {
    const s = migrateSheet({ latentInsanity: { active: true, expiresAtEpoch: 5000 } });
    const r = applyCharsheetRedirect(s, '调查员.潜伏疯狂.active', 'replace', false);
    expect(r?.sheet.latentInsanity).toBeUndefined();
  });

  it('调查员.潜伏疯狂.expiresAtEpoch replace → 更新 expiresAtEpoch', () => {
    const s = migrateSheet({ latentInsanity: { active: true, expiresAtEpoch: 3000 } });
    const r = applyCharsheetRedirect(s, '调查员.潜伏疯狂.expiresAtEpoch', 'replace', 6000);
    expect(r?.sheet.latentInsanity?.expiresAtEpoch).toBe(6000);
    expect(r?.sheet.latentInsanity?.active).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// 6. migrateSheet — latentInsanity 迁移
// ──────────────────────────────────────────────────────────

describe('migrateSheet — latentInsanity field', () => {
  it('空数据 → latentInsanity undefined', () => {
    const sheet = migrateSheet({});
    expect(sheet.latentInsanity).toBeUndefined();
  });

  it('有效数据 → 保留', () => {
    const sheet = migrateSheet({ latentInsanity: { active: true, expiresAtEpoch: 1234 } });
    expect(sheet.latentInsanity).toEqual({ active: true, expiresAtEpoch: 1234 });
  });

  it('active=false → 丢弃（无效态不持久化）', () => {
    const sheet = migrateSheet({ latentInsanity: { active: false, expiresAtEpoch: 1234 } });
    expect(sheet.latentInsanity).toBeUndefined();
  });

  it('缺 expiresAtEpoch → 丢弃', () => {
    const sheet = migrateSheet({ latentInsanity: { active: true } as never });
    expect(sheet.latentInsanity).toBeUndefined();
  });
});
