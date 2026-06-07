// applyScenarioPatch 各分支 + 不可变性 + validateScenarioPatch
import { describe, it, expect } from 'vitest';
import { applyScenarioPatch, validateScenarioPatch } from '../scenario-patch';
import type { ScenarioDoc, ScenarioEntry, DarkPhase, BadEnding, ScenarioCharacter, ScenarioCustomSkill } from '../../types/scenario';
import type { Occupation } from '../../sillytavern/coc-data';

// 构造最小可用 doc;每个测试都从这个深拷贝开始,避免互相污染
function makeDoc(over: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: 'doc_1',
    builtin: false,
    meta: { name: 'A', type: '调查', durationHint: '3-5h', difficulty: 2, headcountHint: '1人', sanLossHint: '中', blurb: 'x' },
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
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

const e = (id: string, over: Partial<ScenarioEntry> = {}): ScenarioEntry => ({
  id, category: '地点', comment: id, keys: id, content: 'c', constant: false, position: 0, priority: 10, cachePolicy: 'auto',
  ...over,
});

describe('applyScenarioPatch', () => {
  it('upsertEntries: 新 id push 末尾,旧 id 原地替换', () => {
    const doc = makeDoc({ entries: [e('a'), e('b')] });
    const out = applyScenarioPatch(doc, { upsertEntries: [e('b', { comment: 'B2' }), e('c')] });
    expect(out.entries.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.entries.find(x => x.id === 'b')?.comment).toBe('B2');
  });

  it('removeEntryIds: 按 id 过滤', () => {
    const doc = makeDoc({ entries: [e('a'), e('b'), e('c')] });
    const out = applyScenarioPatch(doc, { removeEntryIds: ['b'] });
    expect(out.entries.map(x => x.id)).toEqual(['a', 'c']);
  });

  it('recategorize: 改 category', () => {
    const doc = makeDoc({ entries: [e('a'), e('b')] });
    const out = applyScenarioPatch(doc, { recategorize: [{ id: 'a', category: '人物' }] });
    expect(out.entries.find(x => x.id === 'a')?.category).toBe('人物');
    expect(out.entries.find(x => x.id === 'b')?.category).toBe('地点');
  });

  it('setCachePolicies: 改 cachePolicy', () => {
    const doc = makeDoc({ entries: [e('a'), e('b')] });
    const out = applyScenarioPatch(doc, { setCachePolicies: [{ id: 'a', cachePolicy: 'static_prefix' }] });
    expect(out.entries.find(x => x.id === 'a')?.cachePolicy).toBe('static_prefix');
    expect(out.entries.find(x => x.id === 'b')?.cachePolicy).toBe('auto');
  });

  it('upsertDarkTimeline: 按 id upsert', () => {
    const p1: DarkPhase = { id: 'p1', threshold: 30, title: 'T1', triggers: [], directorNote: 'n', autoUnlockKeys: [] };
    const doc = makeDoc({ darkTimeline: [p1] });
    const p1New: DarkPhase = { ...p1, title: 'T1B' };
    const p2: DarkPhase = { id: 'p2', threshold: 60, title: 'T2', triggers: [], directorNote: 'n', autoUnlockKeys: [] };
    const out = applyScenarioPatch(doc, { upsertDarkTimeline: [p1New, p2] });
    expect(out.darkTimeline.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(out.darkTimeline[0].title).toBe('T1B');
  });

  it('upsertBadEndings: 按 id upsert', () => {
    const b1: BadEnding = { id: 'b1', condition: 'x', narrative: 'n', accelerators: [] };
    const doc = makeDoc({ badEndings: [b1] });
    const out = applyScenarioPatch(doc, {
      upsertBadEndings: [
        { ...b1, narrative: 'n2' },
        { id: 'b2', condition: 'y', narrative: 'm', accelerators: [] },
      ],
    });
    expect(out.badEndings.map(b => b.id)).toEqual(['b1', 'b2']);
    expect(out.badEndings[0].narrative).toBe('n2');
  });

  it('patchMeta: 浅合并保留未指定字段', () => {
    const doc = makeDoc();
    const out = applyScenarioPatch(doc, { patchMeta: { name: 'NEW' } });
    expect(out.meta.name).toBe('NEW');
    expect(out.meta.type).toBe('调查');
  });

  it('patchCharacters: 按 id upsert', () => {
    const sheet = {} as ScenarioCharacter['sheet']; // sheet 不深检
    const c1: ScenarioCharacter = {
      id: 'c1', role: 'optional', sheet,
      npcAttrs: { identityTag: '管家', attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
    };
    const doc = makeDoc({ characters: [c1] });
    const out = applyScenarioPatch(doc, {
      patchCharacters: [
        { ...c1, npcAttrs: { ...c1.npcAttrs, attitudeDefault: 50 } },
        { ...c1, id: 'c2' },
      ],
    });
    expect(out.characters.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(out.characters[0].npcAttrs.attitudeDefault).toBe(50);
  });

  it('upsertOccupations: 按 name upsert(同 name 覆盖,异 name 追加)', () => {
    const o1: Occupation = { name: '骑士', crMin: 20, crMax: 50, skills: ['剑术', '骑马'] };
    const doc = makeDoc({ customOccupations: [o1] });
    const o1New: Occupation = { ...o1, crMax: 80 };
    const o2: Occupation = { name: '吟游诗人', crMin: 10, crMax: 40, skills: ['取悦', '乐器'] };
    const out = applyScenarioPatch(doc, { upsertOccupations: [o1New, o2] });
    expect(out.customOccupations.map(o => o.name)).toEqual(['骑士', '吟游诗人']);
    expect(out.customOccupations[0].crMax).toBe(80);
  });

  it('removeOccupationNames: 按 name 过滤', () => {
    const a: Occupation = { name: 'A', crMin: 9, crMax: 30, skills: [] };
    const b: Occupation = { name: 'B', crMin: 9, crMax: 30, skills: [] };
    const c: Occupation = { name: 'C', crMin: 9, crMax: 30, skills: [] };
    const doc = makeDoc({ customOccupations: [a, b, c] });
    const out = applyScenarioPatch(doc, { removeOccupationNames: ['B'] });
    expect(out.customOccupations.map(o => o.name)).toEqual(['A', 'C']);
  });

  it('upsertCustomSkills: 按 name upsert(同 name 覆盖,异 name 追加)', () => {
    const s1: ScenarioCustomSkill = { name: '骑马', base: 5, cat: '运动系' };
    const doc = makeDoc({ customSkills: [s1] });
    const s1New: ScenarioCustomSkill = { ...s1, base: 25 };
    const s2: ScenarioCustomSkill = { name: '咒语吟唱', base: 'EDU', cat: '生活系' };
    const out = applyScenarioPatch(doc, { upsertCustomSkills: [s1New, s2] });
    expect(out.customSkills.map(s => s.name)).toEqual(['骑马', '咒语吟唱']);
    expect(out.customSkills[0].base).toBe(25);
  });

  it('removeCustomSkillNames: 按 name 过滤', () => {
    const s1: ScenarioCustomSkill = { name: '骑马', base: 5, cat: '运动系' };
    const s2: ScenarioCustomSkill = { name: '驾飞船', base: 'DEX_HALF', cat: '运动系' };
    const doc = makeDoc({ customSkills: [s1, s2] });
    const out = applyScenarioPatch(doc, { removeCustomSkillNames: ['骑马'] });
    expect(out.customSkills.map(s => s.name)).toEqual(['驾飞船']);
  });

  it('addToBlacklist: 集合并集自动去重', () => {
    const doc = makeDoc({ skillBlacklist: ['汽车驾驶', '电子学'] });
    const out = applyScenarioPatch(doc, { addToBlacklist: ['汽车驾驶', '计算机使用'] });
    expect(out.skillBlacklist.length).toBe(3);
    expect(new Set(out.skillBlacklist)).toEqual(new Set(['汽车驾驶', '电子学', '计算机使用']));
  });

  it('removeFromBlacklist: 过滤不存在项天然成立(不报错)', () => {
    const doc = makeDoc({ skillBlacklist: ['汽车驾驶', '电子学'] });
    const out = applyScenarioPatch(doc, { removeFromBlacklist: ['汽车驾驶', '不存在的技能'] });
    expect(out.skillBlacklist).toEqual(['电子学']);
  });

  it('扩展字段不可变性: 原 doc.customOccupations/customSkills/skillBlacklist 引用不被改', () => {
    const origOcc: Occupation[] = [{ name: '骑士', crMin: 20, crMax: 50, skills: ['剑术'] }];
    const origSkills: ScenarioCustomSkill[] = [{ name: '骑马', base: 5, cat: '运动系' }];
    const origBlk: string[] = ['电子学'];
    const doc = makeDoc({ customOccupations: origOcc, customSkills: origSkills, skillBlacklist: origBlk });
    const snapOcc = origOcc.slice();
    const snapSkills = origSkills.slice();
    const snapBlk = origBlk.slice();
    const out = applyScenarioPatch(doc, {
      upsertOccupations: [{ name: '吟游诗人', crMin: 10, crMax: 40, skills: [] }],
      upsertCustomSkills: [{ name: '咒语吟唱', base: 'EDU', cat: '生活系' }],
      addToBlacklist: ['汽车驾驶'],
    });
    expect(origOcc).toEqual(snapOcc);
    expect(origSkills).toEqual(snapSkills);
    expect(origBlk).toEqual(snapBlk);
    expect(out.customOccupations).not.toBe(doc.customOccupations);
    expect(out.customSkills).not.toBe(doc.customSkills);
    expect(out.skillBlacklist).not.toBe(doc.skillBlacklist);
  });

  it('不可变性: 原 doc.entries/darkTimeline/characters 引用不被改', () => {
    const origEntries = [e('a')];
    const origDark: DarkPhase[] = [{ id: 'p1', threshold: 10, title: 't', triggers: [], directorNote: 'n', autoUnlockKeys: [] }];
    const doc = makeDoc({ entries: origEntries, darkTimeline: origDark });
    const snapshotEntries = origEntries.slice();
    const snapshotDark = origDark.slice();
    const out = applyScenarioPatch(doc, { upsertEntries: [e('b')], upsertDarkTimeline: [{ id: 'p2', threshold: 50, title: 't2', triggers: [], directorNote: 'n', autoUnlockKeys: [] }] });
    expect(origEntries).toEqual(snapshotEntries);
    expect(origDark).toEqual(snapshotDark);
    expect(out).not.toBe(doc);
    expect(out.entries).not.toBe(doc.entries);
  });

  it('updatedAt 被刷新为当前时间', () => {
    const doc = makeDoc({ updatedAt: 0 });
    const before = Date.now();
    const out = applyScenarioPatch(doc, { patchMeta: { name: 'X' } });
    expect(out.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('空 patch: 返回结构相同的新 doc(updatedAt 变)', () => {
    const doc = makeDoc({ entries: [e('a')], updatedAt: 0 });
    const out = applyScenarioPatch(doc, {});
    expect(out.entries).toEqual(doc.entries);
    expect(out.updatedAt).toBeGreaterThanOrEqual(doc.updatedAt);
  });
});

describe('validateScenarioPatch', () => {
  it('合法 patch 通过', () => {
    expect(validateScenarioPatch({ upsertEntries: [e('a')] })).toBe(true);
    expect(validateScenarioPatch({ removeEntryIds: ['x'] })).toBe(true);
    expect(validateScenarioPatch({ patchMeta: { name: 'x', difficulty: 3 } })).toBe(true);
    expect(validateScenarioPatch({})).toBe(true);
  });

  it('非对象 / null / 数组 都不通过', () => {
    expect(validateScenarioPatch(null)).toBe(false);
    expect(validateScenarioPatch('x')).toBe(false);
    expect(validateScenarioPatch([])).toBe(false);
  });

  it('字段类型错: 不通过', () => {
    expect(validateScenarioPatch({ removeEntryIds: [1, 2] })).toBe(false);
    expect(validateScenarioPatch({ recategorize: [{ id: 'a', category: '不存在的类' }] })).toBe(false);
    expect(validateScenarioPatch({ setCachePolicies: [{ id: 'a', cachePolicy: 'wrong' }] })).toBe(false);
    expect(validateScenarioPatch({ patchMeta: { name: 123 } })).toBe(false);
    expect(validateScenarioPatch({ upsertEntries: [{ id: 'a' }] })).toBe(false);
  });

  it('扩展字段合法: 通过', () => {
    expect(validateScenarioPatch({ upsertOccupations: [{ name: 'X', crMin: 9, crMax: 30, skills: ['a'] }] })).toBe(true);
    expect(validateScenarioPatch({ removeOccupationNames: ['X'] })).toBe(true);
    expect(validateScenarioPatch({ upsertCustomSkills: [{ name: '骑马', base: 5, cat: '运动系' }] })).toBe(true);
    expect(validateScenarioPatch({ removeCustomSkillNames: ['骑马'] })).toBe(true);
    expect(validateScenarioPatch({ addToBlacklist: ['汽车驾驶'] })).toBe(true);
    expect(validateScenarioPatch({ removeFromBlacklist: ['汽车驾驶'] })).toBe(true);
  });

  it('upsertOccupations 类型错: 不通过', () => {
    // 缺 crMin
    expect(validateScenarioPatch({ upsertOccupations: [{ name: 'X', crMax: 30, skills: [] }] })).toBe(false);
    // skills 元素非 string
    expect(validateScenarioPatch({ upsertOccupations: [{ name: 'X', crMin: 9, crMax: 30, skills: [1] }] })).toBe(false);
    // 非数组
    expect(validateScenarioPatch({ upsertOccupations: 'oops' })).toBe(false);
  });

  it('removeOccupationNames 类型错: 不通过', () => {
    expect(validateScenarioPatch({ removeOccupationNames: [1, 2] })).toBe(false);
    expect(validateScenarioPatch({ removeOccupationNames: 'X' })).toBe(false);
  });

  it('upsertCustomSkills 类型错: 不通过', () => {
    // base 非合法 union
    expect(validateScenarioPatch({ upsertCustomSkills: [{ name: '骑马', base: 'WRONG', cat: '运动系' }] })).toBe(false);
    // 缺 cat
    expect(validateScenarioPatch({ upsertCustomSkills: [{ name: '骑马', base: 5 }] })).toBe(false);
    // 非数组
    expect(validateScenarioPatch({ upsertCustomSkills: { name: 'x' } })).toBe(false);
  });

  it('removeCustomSkillNames 类型错: 不通过', () => {
    expect(validateScenarioPatch({ removeCustomSkillNames: [true] })).toBe(false);
    expect(validateScenarioPatch({ removeCustomSkillNames: 123 })).toBe(false);
  });

  it('addToBlacklist 类型错: 不通过', () => {
    expect(validateScenarioPatch({ addToBlacklist: [1] })).toBe(false);
    expect(validateScenarioPatch({ addToBlacklist: '汽车' })).toBe(false);
  });

  it('removeFromBlacklist 类型错: 不通过', () => {
    expect(validateScenarioPatch({ removeFromBlacklist: [null] })).toBe(false);
    expect(validateScenarioPatch({ removeFromBlacklist: {} })).toBe(false);
  });
});
