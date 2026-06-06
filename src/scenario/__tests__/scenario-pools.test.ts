// scenario-pools 单测 — 验证职业/技能池在三种状态下的隔离/合并/黑名单行为
import { describe, it, expect } from 'vitest';
import {
  getScenarioOccupationPool,
  getScenarioSkillPool,
  getScenarioSkillDescMap,
} from '../scenario-pools';
import { ALL_SKILLS, COC_OCCUPATIONS, SKILL_DESC } from '../../sillytavern/coc-data';
import type { ScenarioDoc, ScenarioCustomSkill } from '../../types/scenario';
import type { Occupation } from '../../sillytavern/coc-data';

// 构造剧本的最小骨架(满足 ScenarioDoc 形态,具体字段不影响 pool 函数)
function makeScn(overrides: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: 'sc-test',
    meta: {
      name: '测试剧本', type: '调查', durationHint: '1-2h', difficulty: 1,
      headcountHint: '1', sanLossHint: '低', blurb: '',
    },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [],
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const ROME_CENTURION: Occupation = {
  name: '百夫长',
  crMin: 30, crMax: 60,
  skills: ['格斗(短剑)', '聆听', '侦查', '说服', '心理学', '导航', '急救', '历史'],
};

describe('getScenarioOccupationPool', () => {
  it('剧本为空(自由探索) → 回退 COC_OCCUPATIONS 全集', () => {
    expect(getScenarioOccupationPool(undefined)).toBe(COC_OCCUPATIONS);
    expect(getScenarioOccupationPool(null)).toBe(COC_OCCUPATIONS);
  });

  it('customOccupations 为空数组 → 同样回退全集', () => {
    const scn = makeScn({ customOccupations: [] });
    expect(getScenarioOccupationPool(scn)).toBe(COC_OCCUPATIONS);
  });

  it('customOccupations 非空 → 严格隔离,只返回本剧本职业', () => {
    const scn = makeScn({ customOccupations: [ROME_CENTURION] });
    const pool = getScenarioOccupationPool(scn);
    expect(pool).toEqual([ROME_CENTURION]);
    // 关键:罗马剧本里不会看到「会计」
    expect(pool.some(o => o.name === '会计')).toBe(false);
  });
});

describe('getScenarioSkillPool', () => {
  it('剧本为空 → 返回 ALL_SKILLS 全集', () => {
    const pool = getScenarioSkillPool(undefined);
    expect(pool).toHaveLength(ALL_SKILLS.length);
  });

  it('skillBlacklist 中的技能被剔除', () => {
    const scn = makeScn({ skillBlacklist: ['汽车驾驶', '射击(手枪)'] });
    const pool = getScenarioSkillPool(scn);
    expect(pool.some(s => s.name === '汽车驾驶')).toBe(false);
    expect(pool.some(s => s.name === '射击(手枪)')).toBe(false);
    // 其它技能仍在
    expect(pool.some(s => s.name === '聆听')).toBe(true);
  });

  it('customSkills 中的全新技能追加在末尾', () => {
    const custom: ScenarioCustomSkill = { name: '骑马', base: 5, cat: '运动系', desc: '驾驭马匹' };
    const scn = makeScn({ customSkills: [custom] });
    const pool = getScenarioSkillPool(scn);
    expect(pool.some(s => s.name === '骑马')).toBe(true);
    // ALL_SKILLS 没有"骑马",所以"骑马"位置在末尾
    const last = pool[pool.length - 1];
    expect(last.name).toBe('骑马');
  });

  it('customSkills 同名技能覆盖 ALL_SKILLS 对应项(同位置替换,而非追加)', () => {
    // ALL_SKILLS 已有"骑术"(base=5),自定义改为 base=25 + desc
    const override: ScenarioCustomSkill = { name: '骑术', base: 25, cat: '运动系', desc: '剧本特化版' };
    const scn = makeScn({ customSkills: [override] });
    const pool = getScenarioSkillPool(scn);
    const matches = pool.filter(s => s.name === '骑术');
    // 关键:不允许同名重复(否则技能网格会出两次)
    expect(matches).toHaveLength(1);
    // base 已被覆盖
    expect(matches[0].base).toBe(25);
    expect(matches[0].desc).toBe('剧本特化版');
  });

  it('黑名单 + 自定义 + 覆盖 三者协同(罗马场景)', () => {
    const scn = makeScn({
      skillBlacklist: ['汽车驾驶'],
      customSkills: [
        { name: '骑马', base: 5, cat: '运动系' },        // 新增
        { name: '骑术', base: 25, cat: '运动系' },       // 覆盖
      ],
    });
    const pool = getScenarioSkillPool(scn);
    expect(pool.some(s => s.name === '汽车驾驶')).toBe(false); // 黑名单生效
    expect(pool.some(s => s.name === '骑马')).toBe(true);       // 新增生效
    expect(pool.filter(s => s.name === '骑术')).toHaveLength(1); // 覆盖,不重复
  });
});

describe('getScenarioSkillDescMap', () => {
  it('剧本为空 → 返回 SKILL_DESC 原映射', () => {
    expect(getScenarioSkillDescMap(undefined)).toBe(SKILL_DESC);
  });

  it('customSkills.desc 合并入返回值', () => {
    const scn = makeScn({
      customSkills: [{ name: '骑马', base: 5, cat: '运动系', desc: '驾驭马匹' }],
    });
    const map = getScenarioSkillDescMap(scn);
    expect(map['骑马']).toBe('驾驭马匹');
  });

  it('黑名单技能的描述也被剔除', () => {
    // SKILL_DESC 里"汽车驾驶"原本可能有(取决于 coc-data 实际数据);
    // 不论是否存在,黑名单后必不在 map 里
    const scn = makeScn({ skillBlacklist: ['汽车驾驶'] });
    const map = getScenarioSkillDescMap(scn);
    expect(map['汽车驾驶']).toBeUndefined();
  });
});
