// applyScenarioPatch 各分支 + 不可变性 + validateScenarioPatch
import { describe, it, expect } from 'vitest';
import { applyScenarioPatch, validateScenarioPatch } from '../scenario-patch';
import type { ScenarioDoc, ScenarioEntry, DarkPhase, BadEnding, ScenarioCharacter } from '../../types/scenario';

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
      id: 'c1', role: 'npc_only', sheet,
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
});
