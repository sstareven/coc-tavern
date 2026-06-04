import { describe, it, expect, vi } from 'vitest';
import {
  shouldStage,
  applyLuckSpend,
  applyPushReroll,
  rebuildInputText,
  buildPushedRecord,
  buildLuckSpentRecord,
  type StagingTrigger,
} from '../option-staging';
import type { DiceRecord } from '../../types';

// ============================================================
// A1.8 — RightPage 选项检定 staging 纯函数层测试
//
// 覆盖：
//   - shouldStage 门控：poly/hidden/opposed/sanCheck 全部拒绝；普通 check 才进 staging
//   - applyLuckSpend：扣点重算（含 96-100 与 SAN 的拒绝路径，appliedSpend=0）
//   - applyPushReroll：二次掷骰（用 mock rng 钉住结果）
//   - rebuildInputText：替换正文顶部 [XX] 行；防御性回退
//   - buildPushedRecord / buildLuckSpentRecord：DiceRecord 投影
// ============================================================

function makeTrigger(over: Partial<StagingTrigger> = {}): StagingTrigger {
  const baseRecord: DiceRecord = {
    skill: '图书馆使用',
    roll: '55',
    target: '60',
    type: 'failure',
    time: 0,
    page: 3,
  };
  return {
    kind: 'check',
    skill: '图书馆使用',
    target: 60,
    originalRoll: 55,
    originalResult: 'failure',
    sanCheck: false,
    inputText: '[图书馆使用 d100=55/60 失败]\n查阅旧报纸',
    resultLine: '[图书馆使用 d100=55/60 失败]\n',
    baseText: '查阅旧报纸',
    page: 3,
    record: baseRecord,
    ...over,
  };
}

describe('A1.8 shouldStage — staging 门控', () => {
  it('test 1 — 普通 check + 非 SAN + 非对抗 → 进 staging', () => {
    expect(shouldStage({ kind: 'check', sanCheck: false, opposed: false })).toBe(true);
  });

  it('test 2 — SAN 检定 → 直接落账，不进 staging', () => {
    expect(shouldStage({ kind: 'check', sanCheck: true, opposed: false })).toBe(false);
  });

  it('test 3 — 对抗检定 → 直接落账，不进 staging（对抗不可推骰且语义不同）', () => {
    expect(shouldStage({ kind: 'check', sanCheck: false, opposed: true })).toBe(false);
  });

  it('test 4 — 多面骰（伤害/理智骰）→ 直接落账（不是 d100，无幸运/推骰语义）', () => {
    expect(shouldStage({ kind: 'poly', sanCheck: false, opposed: false })).toBe(false);
  });

  it('test 5 — 暗骰（心理学等）→ 直接落账（玩家不可见结果，不能弹浮层）', () => {
    expect(shouldStage({ kind: 'hidden', sanCheck: false, opposed: false })).toBe(false);
  });
});

describe('A1.8 applyLuckSpend — 扣点重算 + 拒绝路径', () => {
  it('test 6 — 失败(55)/target=40 扣 0 点 → finalRoll=55, 仍失败（40 < 55 = 失败）', () => {
    const r = applyLuckSpend(55, 0, 40, false, '图书馆使用');
    expect(r.finalRoll).toBe(55);
    expect(r.resultType).toBe('failure');
    expect(r.appliedSpend).toBe(0);
  });

  it('test 7 — 失败(55)/target=40 扣 16 点 → finalRoll=39, success', () => {
    const r = applyLuckSpend(55, 16, 40, false, '图书馆使用');
    expect(r.finalRoll).toBe(39);
    expect(r.resultType).toBe('success');
    expect(r.appliedSpend).toBe(16);
    expect(r.line).toContain('[图书馆使用 d100=39/40');
    expect(r.line).toContain('幸运扣16点');
  });

  it('test 8 — 96-100 不可救援：applyLuckToRoll 拒绝，appliedSpend=0', () => {
    const r = applyLuckSpend(98, 50, 60, false, '图书馆使用');
    // dice-engine 拒绝路径：finalRoll 不变, appliedSpend=0
    expect(r.finalRoll).toBe(98);
    expect(r.appliedSpend).toBe(0);
  });

  it('test 9 — SAN 检定不可扣幸运：applyLuckToRoll 拒绝', () => {
    const r = applyLuckSpend(55, 10, 60, true, '理智检定');
    expect(r.finalRoll).toBe(55);
    expect(r.appliedSpend).toBe(0);
  });
});

describe('A1.8 applyPushReroll — 推骰二次掷', () => {
  it('test 10 — mock rng → 0.5/0.5 → newRoll=55; target=30 → 仍失败', () => {
    const rng = vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    const r = applyPushReroll(30, false, '图书馆使用', '再翻一遍', rng);
    expect(r.newRoll).toBe(55);
    expect(r.newResult).toBe('failure');
    expect(r.line).toContain('推骰: 再翻一遍');
  });

  it('test 11 — mock rng → 0.1/0.1 → newRoll=11; target=60 → extreme-success (11 ≤ 60/5=12)', () => {
    const rng = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.1);
    const r = applyPushReroll(60, false, '侦查', '仔细看', rng);
    expect(r.newRoll).toBe(11);
    expect(r.newResult).toBe('extreme-success');
  });

  it('test 12 — 推骰 00,00 → roll=100 → crit-failure', () => {
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0);
    const r = applyPushReroll(60, false, '侦查', '强行', rng);
    expect(r.newRoll).toBe(100);
    expect(r.newResult).toBe('crit-failure');
  });
});

describe('A1.8 rebuildInputText — 替换正文顶部 [XX] 行', () => {
  it('test 13 — 旧行能匹配：新行覆盖旧行', () => {
    const oldText = '[图书馆使用 d100=55/60 失败]\n查阅旧报纸';
    const out = rebuildInputText(oldText, '[图书馆使用 d100=55/60 失败]\n', '[图书馆使用 d100=11/60 困难成功]\n');
    expect(out).toBe('[图书馆使用 d100=11/60 困难成功]\n查阅旧报纸');
  });

  it('test 14 — 旧行不匹配（被改写过）：防御性回退为「新行 + 原文」', () => {
    const tampered = '某些被改写过的文本';
    const out = rebuildInputText(tampered, '[XX]\n', '[YY]\n');
    expect(out).toBe('[YY]\n某些被改写过的文本');
  });
});

describe('A1.8 buildPushedRecord / buildLuckSpentRecord — DiceRecord 投影', () => {
  it('test 15 — buildPushedRecord 携带 pushed=true + pushedFrom（原失败信息）', () => {
    const trigger = makeTrigger();
    const rec = buildPushedRecord(trigger, { newRoll: 11, newResult: 'hard-success', reason: '再翻一遍' });
    expect(rec.pushed).toBe(true);
    expect(rec.pushReason).toBe('再翻一遍');
    expect(rec.pushedFrom).toEqual({ roll: 55, type: 'failure' });
    expect(rec.roll).toBe('11');
    expect(rec.type).toBe('hard-success');
    expect(rec.skill).toBe('图书馆使用');
  });

  it('test 16 — buildLuckSpentRecord 携带 luckSpent + growthTickEligible=false (R7)', () => {
    const trigger = makeTrigger();
    const rec = buildLuckSpentRecord(trigger, { finalRoll: 50, resultType: 'success', appliedSpend: 5 });
    expect(rec.luckSpent).toBe(5);
    expect(rec.growthTickEligible).toBe(false);
    expect(rec.roll).toBe('50');
    expect(rec.type).toBe('success');
  });
});
