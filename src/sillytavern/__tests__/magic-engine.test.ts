import { describe, it, expect } from 'vitest';
import { resolveSpellCast } from '../magic-engine';
import type { Rng } from '../combat-engine';

/**
 * 构造可预测 d100 结果的 RNG 序列。
 * d100WithDice(0,0,rng) 按顺序消费 2 次 rng：
 *   1) ones = Math.floor(rng() * 10)    → 0..9
 *   2) tens = Math.floor(rng() * 10)*10 → 0,10,..,90
 * finalRoll = tens + ones，若 tens=0 且 ones=0 则 100。
 */
function rngForD100(...rolls: number[]): Rng {
  const values: number[] = [];
  for (const roll of rolls) {
    if (roll === 100) {
      // ones=0 → rng returns 0/10=0, tens=0 → rng returns 0/10=0
      values.push(0, 0);
    } else {
      const ones = roll % 10;
      const tens = Math.floor(roll / 10);
      // rng() * 10 → Math.floor → ones;  rng() * 10 → Math.floor → tens
      values.push(ones / 10, tens / 10);
    }
  }
  let idx = 0;
  return () => {
    if (idx >= values.length) throw new Error(`rng exhausted at index ${idx}`);
    return values[idx++];
  };
}

const baseSpell = { mpCost: 6, sanCost: 4 };

describe('magic-engine — resolveSpellCast POW 对抗', () => {
  // ── 对抗胜负 ──

  it('caster wins when caster level > target level', () => {
    // casterPow=60, roll=01 → critical (roll=1)
    // targetPow=50, roll=80 → fail (80 > 50)
    const rng = rngForD100(1, 80);
    const result = resolveSpellCast(60, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(true);
    expect(result.casterLevel).toBe('critical');
    expect(result.targetLevel).toBe('fail');
    expect(result.casterRoll).toBe(1);
    expect(result.targetRoll).toBe(80);
  });

  it('caster loses on tie — defender advantage', () => {
    // Both roll success level: casterPow=50, roll=40 → success; targetPow=50, roll=45 → success
    const rng = rngForD100(40, 45);
    const result = resolveSpellCast(50, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(false);
    expect(result.casterLevel).toBe('success');
    expect(result.targetLevel).toBe('success');
  });

  it('caster loses when target level > caster level', () => {
    // casterPow=50, roll=80 → fail; targetPow=60, roll=01 → critical
    const rng = rngForD100(80, 1);
    const result = resolveSpellCast(50, 60, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(false);
    expect(result.casterLevel).toBe('fail');
    expect(result.targetLevel).toBe('critical');
  });

  it('caster hard vs target success → caster wins', () => {
    // casterPow=60, roll=25 → hard (25 <= 60/2=30); targetPow=50, roll=45 → success (45 <= 50)
    const rng = rngForD100(25, 45);
    const result = resolveSpellCast(60, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(true);
    expect(result.casterLevel).toBe('hard');
    expect(result.targetLevel).toBe('success');
  });

  it('both fumble → tie → defender wins', () => {
    // casterPow=30 (skill<50 → fumble floor 96), roll=98 → fumble
    // targetPow=30, roll=97 → fumble
    const rng = rngForD100(98, 97);
    const result = resolveSpellCast(30, 30, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(false);
    expect(result.casterLevel).toBe('fumble');
    expect(result.targetLevel).toBe('fumble');
  });

  // ── MP 消耗 ──

  it('success deducts full spell MP cost', () => {
    // casterPow=60, roll=01 → critical; targetPow=50, roll=80 → fail
    const rng = rngForD100(1, 80);
    const result = resolveSpellCast(60, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(true);
    expect(result.mpSpent).toBe(6); // baseSpell.mpCost
    expect(result.hpSacrificed).toBe(0);
  });

  it('failure deducts only 1 MP', () => {
    // casterPow=50, roll=80 → fail; targetPow=60, roll=30 → hard
    const rng = rngForD100(80, 30);
    const result = resolveSpellCast(50, 60, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(false);
    expect(result.mpSpent).toBe(1);
    expect(result.hpSacrificed).toBe(0);
  });

  // ── HP 代偿 ──

  it('HP sacrifice when MP insufficient and allowed', () => {
    // Success with mpCost=6 but only 3 MP → need 3 from HP (hp=12, can spare 11)
    const rng = rngForD100(1, 80);
    const result = resolveSpellCast(60, 50, baseSpell, 3, 12, true, rng);
    expect(result.success).toBe(true);
    expect(result.mpSpent).toBe(6); // 3 MP + 3 HP = 6 total
    expect(result.hpSacrificed).toBe(3);
  });

  it('no HP sacrifice when not allowed', () => {
    // Success with mpCost=6 but only 3 MP, allowHpSacrifice=false
    const rng = rngForD100(1, 80);
    const result = resolveSpellCast(60, 50, baseSpell, 3, 12, false, rng);
    expect(result.success).toBe(true);
    expect(result.mpSpent).toBe(3); // only what MP was available
    expect(result.hpSacrificed).toBe(0);
  });

  it('cannot sacrifice last HP point', () => {
    // Success with mpCost=6, MP=0, HP=4, allow sacrifice
    // Can sacrifice at most HP-1=3, so mpSpent = 0 + 3 = 3
    const rng = rngForD100(1, 80);
    const result = resolveSpellCast(60, 50, baseSpell, 0, 4, true, rng);
    expect(result.success).toBe(true);
    expect(result.mpSpent).toBe(3); // 0 MP + 3 HP sacrifice
    expect(result.hpSacrificed).toBe(3);
  });

  it('0 MP caster with HP sacrifice — failure costs 1 HP', () => {
    // Failure: mpNeeded=1, MP=0, HP=5, allow sacrifice → sacrifice 1 HP
    const rng = rngForD100(80, 1);
    const result = resolveSpellCast(50, 60, baseSpell, 0, 5, true, rng);
    expect(result.success).toBe(false);
    expect(result.mpSpent).toBe(1); // 0 MP + 1 HP
    expect(result.hpSacrificed).toBe(1);
  });

  it('0 MP and only 1 HP — cannot sacrifice last HP, mpSpent capped', () => {
    // Failure: mpNeeded=1, MP=0, HP=1 → can't sacrifice last HP → hpSacrificed=0
    const rng = rngForD100(80, 1);
    const result = resolveSpellCast(50, 60, baseSpell, 0, 1, true, rng);
    expect(result.success).toBe(false);
    expect(result.mpSpent).toBe(0); // nothing available
    expect(result.hpSacrificed).toBe(0);
  });

  // ── SAN 消耗 ──

  it('SAN cost is always applied regardless of success', () => {
    // Success case
    const rng1 = rngForD100(1, 80);
    const r1 = resolveSpellCast(60, 50, baseSpell, 10, 12, false, rng1);
    expect(r1.success).toBe(true);
    expect(r1.sanLost).toBe(4);

    // Failure case
    const rng2 = rngForD100(80, 1);
    const r2 = resolveSpellCast(50, 60, baseSpell, 10, 12, false, rng2);
    expect(r2.success).toBe(false);
    expect(r2.sanLost).toBe(4);
  });

  // ── 极端成功等级 ──

  it('extreme success level calculated correctly', () => {
    // casterPow=60, roll=10 → extreme (10 <= 60/5=12)
    // targetPow=50, roll=50 → success (50 <= 50)
    const rng = rngForD100(10, 50);
    const result = resolveSpellCast(60, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(true);
    expect(result.casterLevel).toBe('extreme');
    expect(result.targetLevel).toBe('success');
  });

  it('roll 100 is handled correctly (fumble for high skill)', () => {
    // casterPow=80, roll=100 → fumble (100 >= fumbleFloor=100)
    // targetPow=50, roll=40 → success
    const rng = rngForD100(100, 40);
    const result = resolveSpellCast(80, 50, baseSpell, 10, 12, false, rng);
    expect(result.success).toBe(false);
    expect(result.casterLevel).toBe('fumble');
    expect(result.casterRoll).toBe(100);
  });
});
