import { describe, it, expect } from 'vitest';
import {
  applyLuckToRoll,
  isPushEligible,
  type PushSkillCategory,
} from '../dice-engine';
import type { DiceResultType } from '../../types';

// ============================================================
// A1.2 — applyLuckToRoll（R7 幸运消耗）
// ============================================================
describe('applyLuckToRoll — 拒绝路径不扣点数（appliedSpend=0）', () => {
  it('SAN 检定：拒绝 + reason 含 SAN + 不扣点数', () => {
    const r = applyLuckToRoll(40, 60, 20, /*sanCheck*/ true, /*isDamageRoll*/ false, /*isLuckRoll*/ false);
    expect(r.finalRoll).toBe(40);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/SAN/);
  });

  it('伤害骰：拒绝 + reason 含「伤害」 + 不扣点数', () => {
    const r = applyLuckToRoll(8, 0, 5, false, /*isDamageRoll*/ true, false);
    expect(r.finalRoll).toBe(8);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/伤害/);
  });

  it('幸运自检：拒绝（不可拿幸运救幸运检定）', () => {
    const r = applyLuckToRoll(70, 50, 30, false, false, /*isLuckRoll*/ true);
    expect(r.finalRoll).toBe(70);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toBeDefined();
  });

  it('100：无法靠幸运救援（reason 含 100/大失败/01 之一）', () => {
    const r = applyLuckToRoll(100, 50, 50, false, false, false);
    expect(r.finalRoll).toBe(100);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/大失败|01|100/);
  });

  it('96 + 低技能：96-100 区间无法被幸运扭转', () => {
    const r = applyLuckToRoll(96, /*lowSkill*/ 30, 80, false, false, false);
    expect(r.finalRoll).toBe(96);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/大失败|01|100/);
  });

  it('01：大成功本身不可改（拒绝救援）', () => {
    const r = applyLuckToRoll(1, 60, 30, false, false, false);
    expect(r.finalRoll).toBe(1);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/大失败|01|100/);
  });
});

describe('applyLuckToRoll — 成功路径', () => {
  it('R7 哈维案例：roll=35 + spend=30 + target=30 → finalRoll=5（extreme）', () => {
    const r = applyLuckToRoll(35, 30, 30, false, false, false);
    expect(r.finalRoll).toBe(5);
    expect(r.appliedSpend).toBe(30);
    expect(r.reason).toBeUndefined();
  });

  it('spend=50 + roll=10 → finalRoll 钳到 1（不会跌成 0/负值）', () => {
    const r = applyLuckToRoll(10, 80, 50, false, false, false);
    expect(r.finalRoll).toBe(1);
    expect(r.appliedSpend).toBe(50);
  });

  it('spend=0 → 返回原 roll、不附 reason、不扣点数', () => {
    const r = applyLuckToRoll(65, 70, 0, false, false, false);
    expect(r.finalRoll).toBe(65);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toBeUndefined();
  });
});

// ============================================================
// A1.2 — isPushEligible（R4 推动检定资格）
// ============================================================
describe('isPushEligible — 禁用门类', () => {
  it.each<[PushSkillCategory]>([['fighting'], ['firearms'], ['dodge']])(
    '%s 门类的普通失败也不许推',
    (cat) => {
      expect(isPushEligible(cat, 'failure', false, false)).toBe(false);
    },
  );
});

describe('isPushEligible — SAN/伤害/成功类一律不可推', () => {
  it('SAN 检定（general + failure + sanCheck=true）→ false', () => {
    expect(isPushEligible('general', 'failure', true, false)).toBe(false);
  });

  it('伤害骰（general + failure + isDamageRoll=true）→ false', () => {
    expect(isPushEligible('general', 'failure', false, true)).toBe(false);
  });

  it.each<[DiceResultType]>([
    ['success'],
    ['hard-success'],
    ['extreme-success'],
    ['crit-success'],
  ])('结果=%s（成功类）不可推', (rt) => {
    expect(isPushEligible('general', rt, false, false)).toBe(false);
  });

  it('crit-failure 不可推（已经爆掉，没救）', () => {
    expect(isPushEligible('general', 'crit-failure', false, false)).toBe(false);
  });
});

describe('isPushEligible — 允许路径', () => {
  it('潜行（general 门类）+ 普通失败 → 可推', () => {
    // 潜行在 COC7e 归入 general 调查向技能；plain failure 时允许玩家声明再尝试。
    expect(isPushEligible('general', 'failure', false, false)).toBe(true);
  });

  it('侦察/调查（investigation 门类）+ 普通失败 → 可推', () => {
    expect(isPushEligible('investigation', 'failure', false, false)).toBe(true);
  });
});
