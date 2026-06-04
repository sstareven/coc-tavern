import { describe, it, expect } from 'vitest';
import {
  rollSkillImprovement,
  isDevelopmentEligible,
  crossed90Threshold,
  roll2d6,
  buildDevelopmentRows,
  buildDevelopmentOps,
  hasTickedDevelopmentSkill,
} from '../skill-improvement';
import type { CharacterSheet } from '../../types';

/* ============================== isDevelopmentEligible ============================== */

describe('A3.4 isDevelopmentEligible', () => {
  it('普通技能可成长', () => {
    expect(isDevelopmentEligible('侦查')).toBe(true);
    expect(isDevelopmentEligible('图书馆使用')).toBe(true);
    expect(isDevelopmentEligible('枪械(手枪)')).toBe(true);
  });
  it('信用评级 排除（职业起点 / 财富线，独立通路）', () => {
    expect(isDevelopmentEligible('信用评级')).toBe(false);
  });
  it('克苏鲁神话 排除（神秘剧情专属）', () => {
    expect(isDevelopmentEligible('克苏鲁神话')).toBe(false);
  });
  it('语言（母语 / 其他 / 具体语言）允许成长', () => {
    expect(isDevelopmentEligible('语言(母语)')).toBe(true);
    expect(isDevelopmentEligible('语言(其他)')).toBe(true);
    expect(isDevelopmentEligible('语言(拉丁语)')).toBe(true);
  });
});

/* ============================== rollSkillImprovement ============================== */

describe('A3.4 rollSkillImprovement', () => {
  it('rng=()=>0.5 → d100=51, current=40 → 51>40 → improved (d10=floor(0.5*10)+1=6) → final=46', () => {
    const r = rollSkillImprovement(40, () => 0.5);
    expect(r.d100).toBe(51);
    expect(r.improved).toBe(true);
    expect(r.d10).toBe(6);
    expect(r.finalValue).toBe(46);
  });
  it('rng=()=>0.05 → d100=6, current=50 → 6 ≤ 50 → unchanged', () => {
    const r = rollSkillImprovement(50, () => 0.05);
    expect(r.d100).toBe(6);
    expect(r.improved).toBe(false);
    expect(r.d10).toBe(0);
    expect(r.finalValue).toBe(50);
  });
  it('high-skill 96 边界：d100=96, current=98 → 仍 improved（≥96 触发）', () => {
    // 要让 d100 = 96 → floor(rng*100)+1 = 96 → rng ∈ [0.95, 0.96)
    // 第二次 rng → d10
    let i = 0;
    const seq = [0.955, 0.0];
    const rng = () => seq[i++];
    const r = rollSkillImprovement(98, rng);
    expect(r.d100).toBe(96);
    expect(r.improved).toBe(true);
    expect(r.d10).toBe(1); // floor(0*10)+1 = 1
    expect(r.finalValue).toBe(99); // min(99, 98+1)
  });
  it('上限 99 钳位：current=98, d10=5 → final=99（不超 99）', () => {
    let i = 0;
    const seq = [0.999, 0.4]; // d100=100, d10=5
    const r = rollSkillImprovement(98, () => seq[i++]);
    expect(r.d100).toBe(100);
    expect(r.improved).toBe(true);
    expect(r.finalValue).toBe(99);
  });
});

/* ============================== crossed90Threshold ============================== */

describe('A3.4 crossed90Threshold', () => {
  it('85 → 92 跨越', () => {
    expect(crossed90Threshold(85, 92)).toBe(true);
  });
  it('90 → 95 不算跨越（before 已 ≥90）', () => {
    expect(crossed90Threshold(90, 95)).toBe(false);
  });
  it('60 → 89 未跨越', () => {
    expect(crossed90Threshold(60, 89)).toBe(false);
  });
  it('89 → 90 边界跨越（after===90）', () => {
    expect(crossed90Threshold(89, 90)).toBe(true);
  });
});

/* ============================== roll2d6 ============================== */

describe('A3.4 roll2d6 (deterministic)', () => {
  it('rng=()=>0 → 1+1=2', () => {
    expect(roll2d6(() => 0)).toBe(2);
  });
  it('rng=()=>0.999 → 6+6=12', () => {
    expect(roll2d6(() => 0.999)).toBe(12);
  });
  it('rng=()=>0.5 → 4+4=8（floor(0.5*6)+1=4）', () => {
    expect(roll2d6(() => 0.5)).toBe(8);
  });
});

/* ============================== buildDevelopmentRows ============================== */

describe('A3.4 buildDevelopmentRows — 资格筛选 + 顺序消费 RNG', () => {
  it('只取 ticked=true 且 isDevelopmentEligible 的技能', () => {
    const skills = {
      侦查: { current: 40, ticked: true },
      聆听: { current: 50, ticked: false },          // 未打钩 → 排除
      信用评级: { current: 30, ticked: true },        // 排除技能
      克苏鲁神话: { current: 5, ticked: true },       // 排除技能
      '语言(其他)': { current: 25, ticked: true },    // 语言可成长
    };
    // rng = ()=>0.5 → 每行: d100=51, d10=6
    const rows = buildDevelopmentRows(skills, () => 0.5);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(['侦查', '语言(其他)'].sort());
  });

  it('提升路径：current=40, rng=()=>0.5 → d100=51 improved, d10=6, after=46', () => {
    const skills = { 侦查: { current: 40, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => 0.5);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: '侦查', before: 40, after: 46, d100: 51, d10: 6, improved: true, crossed90: false,
    });
    expect(rows[0].sanBonus).toBeUndefined();
  });

  it('未提升路径：current=80, rng=()=>0.05 → d100=6, 不提升, after=before', () => {
    const skills = { 历史: { current: 80, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => 0.05);
    expect(rows[0].improved).toBe(false);
    expect(rows[0].after).toBe(80);
    expect(rows[0].d10).toBe(0);
    expect(rows[0].crossed90).toBe(false);
  });

  it('跨越 90% → sanBonus = roll2d6 用同一 rng 续掷', () => {
    // 设计 rng 序列：d100=99, d10=5, 2d6 → 3,4
    const seq = [
      0.985, // d100 = floor(0.985*100)+1 = 99
      0.45,  // d10  = floor(0.45*10)+1 = 5  → before=88, after=93 跨越
      0.4,   // 2d6 第一颗 = floor(0.4*6)+1 = 3
      0.6,   // 2d6 第二颗 = floor(0.6*6)+1 = 4
    ];
    let i = 0;
    const skills = { 神秘学: { current: 88, ticked: true } };
    const rows = buildDevelopmentRows(skills, () => seq[i++]);
    expect(rows[0].before).toBe(88);
    expect(rows[0].after).toBe(93);
    expect(rows[0].improved).toBe(true);
    expect(rows[0].crossed90).toBe(true);
    expect(rows[0].sanBonus).toBe(7); // 3+4
  });

  it('未 ticked 的全空 → 空数组', () => {
    const rows = buildDevelopmentRows({ 侦查: { current: 40 } }, () => 0.5);
    expect(rows).toEqual([]);
  });
});

/* ============================== buildDevelopmentOps ============================== */

describe('A3.4 buildDevelopmentOps — 正确发 ops', () => {
  it('improved 行：replace current + replace ticked=false', () => {
    const rows = [
      { name: '侦查', before: 40, after: 46, d100: 51, d10: 6, improved: true, crossed90: false },
    ];
    const ops = buildDevelopmentOps(rows);
    expect(ops).toEqual([
      { op: 'replace', path: '/调查员/技能/侦查/current', value: 46 },
      { op: 'replace', path: '/调查员/技能/侦查/ticked', value: false },
    ]);
  });

  it('未提升行：仅清打钩（不写 current）', () => {
    const rows = [
      { name: '历史', before: 80, after: 80, d100: 6, d10: 0, improved: false, crossed90: false },
    ];
    const ops = buildDevelopmentOps(rows);
    expect(ops).toEqual([
      { op: 'replace', path: '/调查员/技能/历史/ticked', value: false },
    ]);
  });

  it('crossed90 行：replace current + clear ticked + delta SAN bonus', () => {
    const rows = [
      { name: '神秘学', before: 88, after: 93, d100: 99, d10: 5, improved: true, crossed90: true, sanBonus: 7 },
    ];
    const ops = buildDevelopmentOps(rows);
    expect(ops).toEqual([
      { op: 'replace', path: '/调查员/技能/神秘学/current', value: 93 },
      { op: 'replace', path: '/调查员/技能/神秘学/ticked', value: false },
      { op: 'delta', path: '/调查员/理智值/当前', value: 7 },
    ]);
  });

  it('多行混合：保留每行的相对顺序', () => {
    const rows = [
      { name: '侦查', before: 40, after: 46, d100: 51, d10: 6, improved: true, crossed90: false },
      { name: '神秘学', before: 88, after: 93, d100: 99, d10: 5, improved: true, crossed90: true, sanBonus: 7 },
      { name: '历史', before: 80, after: 80, d100: 6, d10: 0, improved: false, crossed90: false },
    ];
    const ops = buildDevelopmentOps(rows);
    // 侦查: 2 op；神秘学: 3 op；历史: 1 op；共 6
    expect(ops).toHaveLength(6);
    expect(ops[0]).toEqual({ op: 'replace', path: '/调查员/技能/侦查/current', value: 46 });
    expect(ops[4]).toEqual({ op: 'delta', path: '/调查员/理智值/当前', value: 7 });
    expect(ops[5]).toEqual({ op: 'replace', path: '/调查员/技能/历史/ticked', value: false });
  });
});

/* ============================== hasTickedDevelopmentSkill ============================== */

describe('A3.4 hasTickedDevelopmentSkill', () => {
  function sheetWith(skills: CharacterSheet['skills']): CharacterSheet {
    return { skills } as unknown as CharacterSheet;
  }
  it('有任一 ticked 普通技能 → true', () => {
    expect(hasTickedDevelopmentSkill(sheetWith({ 侦查: { base: 25, current: 40, ticked: true } }))).toBe(true);
  });
  it('全 ticked=false → false', () => {
    expect(hasTickedDevelopmentSkill(sheetWith({ 侦查: { base: 25, current: 40, ticked: false } }))).toBe(false);
  });
  it('唯一 ticked 是 信用评级 / 克苏鲁神话 → false', () => {
    expect(hasTickedDevelopmentSkill(sheetWith({ 信用评级: { base: 30, current: 30, ticked: true } }))).toBe(false);
    expect(hasTickedDevelopmentSkill(sheetWith({ 克苏鲁神话: { base: 0, current: 5, ticked: true } }))).toBe(false);
  });
  it('混合：排除技能 ticked + 普通技能 ticked → true', () => {
    expect(hasTickedDevelopmentSkill(sheetWith({
      信用评级: { base: 30, current: 30, ticked: true },
      侦查: { base: 25, current: 40, ticked: true },
    }))).toBe(true);
  });
});
