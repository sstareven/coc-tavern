import { describe, it, expect } from 'vitest';
import { getDBBuild, resolveSkillBase, roll3D6, roll2D6, CHAR_ROLL } from './coc-rules';import { deriveSecondaryStats } from './coc-rules';

// ============================================================
// getDBBuild — Damage Bonus / Build 判定
// COC 7th: STR+SIZ → DB & Build
// ============================================================
describe('getDBBuild', () => {
  it('strPlusSiz 2–64 → -2 / build -2', () => {
    expect(getDBBuild(2)).toEqual({ db: '-2', build: -2 });
    expect(getDBBuild(64)).toEqual({ db: '-2', build: -2 });
    expect(getDBBuild(33)).toEqual({ db: '-2', build: -2 });
  });

  it('strPlusSiz 65–84 → -1 / build -1', () => {
    expect(getDBBuild(65)).toEqual({ db: '-1', build: -1 });
    expect(getDBBuild(84)).toEqual({ db: '-1', build: -1 });
  });

  it('strPlusSiz 85–124 → 0 / build 0 (no bonus)', () => {
    expect(getDBBuild(85)).toEqual({ db: '0', build: 0 });
    expect(getDBBuild(124)).toEqual({ db: '0', build: 0 });
    expect(getDBBuild(100)).toEqual({ db: '0', build: 0 });
  });

  it('strPlusSiz 125–164 → +1D4 / build 1', () => {
    expect(getDBBuild(125)).toEqual({ db: '+1D4', build: 1 });
    expect(getDBBuild(164)).toEqual({ db: '+1D4', build: 1 });
  });

  it('strPlusSiz 165–204 → +1D6 / build 2', () => {
    expect(getDBBuild(165)).toEqual({ db: '+1D6', build: 2 });
    expect(getDBBuild(204)).toEqual({ db: '+1D6', build: 2 });
  });

  it('strPlusSiz ≥ 205 → +1D6 / build 2 (caps at max)', () => {
    expect(getDBBuild(205)).toEqual({ db: '+1D6', build: 2 });
    expect(getDBBuild(300)).toEqual({ db: '+1D6', build: 2 });
  });

  it('edge: strPlusSiz 0–1 falls through to -1 bracket (min STR+SIZ in practice > 2)', () => {
    // getDBBuild(0): 0 >= 2 is false → falls to next check: 0 <= 84 = true → -1
    expect(getDBBuild(0)).toEqual({ db: '-1', build: -1 });
    expect(getDBBuild(1)).toEqual({ db: '-1', build: -1 });
  });
});

// ============================================================
// resolveSkillBase — 技能基础值计算
// ============================================================
describe('resolveSkillBase', () => {
  it('numeric base returned as-is', () => {
    expect(resolveSkillBase(20, {})).toBe(20);
    expect(resolveSkillBase(0, {})).toBe(0);
    expect(resolveSkillBase(99, {})).toBe(99);
  });

  it("DEX_HALF: returns floor(DEX / 2)", () => {
    expect(resolveSkillBase('DEX_HALF', { DEX: 80 })).toBe(40);
    expect(resolveSkillBase('DEX_HALF', { DEX: 65 })).toBe(32);
    expect(resolveSkillBase('DEX_HALF', { DEX: 99 })).toBe(49);
  });

  it('DEX_HALF: missing DEX defaults to 50', () => {
    expect(resolveSkillBase('DEX_HALF', {})).toBe(25);
    expect(resolveSkillBase('DEX_HALF', { STR: 80 })).toBe(25);
  });

  it('DEX_HALF: DEX=0 → 0', () => {
    expect(resolveSkillBase('DEX_HALF', { DEX: 0 })).toBe(0);
  });

  it('EDU: returns EDU value directly', () => {
    expect(resolveSkillBase('EDU', { EDU: 60 })).toBe(60);
    expect(resolveSkillBase('EDU', { EDU: 75 })).toBe(75);
  });

  it('EDU: missing EDU defaults to 50', () => {
    expect(resolveSkillBase('EDU', {})).toBe(50);
    expect(resolveSkillBase('EDU', { STR: 60 })).toBe(50);
  });
});
// ============================================================
// deriveSecondaryStats — 次生属性派生（HP/SAN/MP/DB/Build）
// 替代 CharacterCreator 中 derived useMemo 与 handleConfirm 的重复内联公式
// ============================================================
describe('deriveSecondaryStats', () => {
  it('hpMax = floor((SIZ + CON) / 10)', () => {
    expect(deriveSecondaryStats({ SIZ: 60, CON: 50 }).hpMax).toBe(11);
    expect(deriveSecondaryStats({ SIZ: 65, CON: 64 }).hpMax).toBe(12); // 129/10 → 12
    expect(deriveSecondaryStats({ SIZ: 0, CON: 0 }).hpMax).toBe(0);
  });

  it('sanMax = POW when mythosSkill defaults to 0', () => {
    expect(deriveSecondaryStats({ POW: 70 }).sanMax).toBe(70);
    expect(deriveSecondaryStats({ POW: 50 }).sanMax).toBe(50);
  });

  it('sanMax = min(POW, 99 - mythosSkill) with Cthulhu Mythos', () => {
    expect(deriveSecondaryStats({ POW: 60 }, 0).sanMax).toBe(60);
    expect(deriveSecondaryStats({ POW: 60 }, 15).sanMax).toBe(60); // 99-15=84 > 60
    expect(deriveSecondaryStats({ POW: 80 }, 30).sanMax).toBe(69); // 99-30=69 < 80
  });

  it('mpMax = floor(POW / 5)', () => {
    expect(deriveSecondaryStats({ POW: 70 }).mpMax).toBe(14);
    expect(deriveSecondaryStats({ POW: 52 }).mpMax).toBe(10); // 52/5 → 10
    expect(deriveSecondaryStats({ POW: 0 }).mpMax).toBe(0);
  });

  it('db/build 桥接 getDBBuild(STR + SIZ)', () => {
    expect(deriveSecondaryStats({ STR: 50, SIZ: 50 })).toMatchObject({ db: '0', build: 0 });
    expect(deriveSecondaryStats({ STR: 65, SIZ: 65 })).toMatchObject({ db: '+1D4', build: 1 });
    expect(deriveSecondaryStats({ STR: 90, SIZ: 80 })).toMatchObject({ db: '+1D6', build: 2 });
  });

  it('缺省特征回退为 0（与 derived useMemo 的 ?? 0 一致）', () => {
    const r = deriveSecondaryStats({});
    expect(r.hpMax).toBe(0);
    expect(r.sanMax).toBe(0);
    expect(r.mpMax).toBe(0);
    expect(r).toMatchObject({ db: '-1', build: -1 }); // getDBBuild(0) 落入 -1 档
  });

  it('完整角色：返回全部五个字段且数值与原内联公式等价', () => {
    const chars = { STR: 60, CON: 70, SIZ: 65, POW: 55, DEX: 50, APP: 50, INT: 60, EDU: 70 };
    const r = deriveSecondaryStats(chars);
    expect(r).toEqual({
      hpMax: Math.floor((65 + 70) / 10), // 13
      sanMax: 55,
      mpMax: Math.floor(55 / 5), // 11
      db: getDBBuild(60 + 65).db,
      build: getDBBuild(60 + 65).build,
    });
  });
});

// ============================================================
// roll3D6 / roll2D6 — 骰子范围
// ============================================================
describe('roll3D6', () => {
  it('returns 3–18 (1d6 × 3)', () => {
    for (let i = 0; i < 200; i++) {
      const v = roll3D6();
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(18);
    }
  });
});

describe('roll2D6', () => {
  it('returns 2–12 (1d6 × 2)', () => {
    for (let i = 0; i < 200; i++) {
      const v = roll2D6();
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(12);
    }
  });
});

// ============================================================
// CHAR_ROLL — 属性骰点映射
// ============================================================
describe('CHAR_ROLL', () => {
  const keys3D6 = ['STR', 'CON', 'POW', 'DEX', 'APP'];
  const keys2D6 = ['SIZ', 'INT'];

  it('3D6-based characteristics: STR/CON/POW/DEX/APP are roll3D6*5 (15–90)', () => {
    for (const key of keys3D6) {
      for (let i = 0; i < 10; i++) {
        const v = CHAR_ROLL[key]();
        expect(v).toBeGreaterThanOrEqual(15);
        expect(v).toBeLessThanOrEqual(90);
        expect(v % 5).toBe(0); // must be multiple of 5
      }
    }
  });

  it('2D6+6-based characteristics: SIZ/INT are (roll2D6+6)*5 (40–90)', () => {
    for (const key of keys2D6) {
      for (let i = 0; i < 10; i++) {
        const v = CHAR_ROLL[key]();
        expect(v).toBeGreaterThanOrEqual(40);
        expect(v).toBeLessThanOrEqual(90);
        expect(v % 5).toBe(0);
      }
    }
  });

  it('EDU: (roll2D6+6)*5 — same as SIZ/INT (40–90)', () => {
    for (let i = 0; i < 10; i++) {
      const v = CHAR_ROLL['EDU']();
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(90);
      expect(v % 5).toBe(0);
    }
  });
});
