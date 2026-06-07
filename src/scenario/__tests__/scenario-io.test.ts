// scenario-io: export/import round-trip + 校验失败分支
import { describe, it, expect } from 'vitest';
import { exportScenarioToJson, importScenarioFromJson } from '../scenario-io';
import type { ScenarioDoc } from '../../types/scenario';

function makeDoc(over: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: 'doc_1',
    builtin: false,
    meta: { name: '测试', type: '调查', durationHint: '3-5h', difficulty: 2, headcountHint: '1人', sanLossHint: '中', blurb: '' },
    prologueSeed: '',
    recommendedSkills: ['聆听'],
    recommendedOccupations: ['记者'],
    characters: [],
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 100,
    updatedAt: 100,
    ...over,
  };
}

describe('scenario-io round-trip', () => {
  it('export → import 后等价 doc', () => {
    const doc = makeDoc({
      entries: [{ id: 'e1', category: '地点', comment: 'X', keys: 'x', content: 'c', constant: true, position: 0, priority: 5, cachePolicy: 'auto' }],
    });
    const json = exportScenarioToJson(doc);
    const result = importScenarioFromJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual(doc);
    }
  });

  it('envelope 含 schemaVersion + exportedAt', () => {
    const json = exportScenarioToJson(makeDoc());
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.scenario).toBeDefined();
  });

  it('import: JSON 损坏 → ok:false', () => {
    const r = importScenarioFromJson('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/);
  });

  it('import: 根不是对象 → ok:false', () => {
    expect(importScenarioFromJson('123').ok).toBe(false);
    expect(importScenarioFromJson('null').ok).toBe(false);
  });

  it('import: schemaVersion ≠ 1 → ok:false', () => {
    const env = { schemaVersion: 2, exportedAt: 'x', scenario: makeDoc() };
    const r = importScenarioFromJson(JSON.stringify(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schemaVersion/);
  });

  it('import: scenario 字段结构非法 → ok:false', () => {
    const env = { schemaVersion: 1, exportedAt: 'x', scenario: { id: 'x' /* 缺 meta 等 */ } };
    const r = importScenarioFromJson(JSON.stringify(env));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/scenario/);
  });

  it('import: meta.type 枚举越界 → ok:false', () => {
    const bad = makeDoc();
    (bad.meta as unknown as Record<string, unknown>).type = '不存在的类型';
    const env = { schemaVersion: 1, exportedAt: 'x', scenario: bad };
    expect(importScenarioFromJson(JSON.stringify(env)).ok).toBe(false);
  });
});
