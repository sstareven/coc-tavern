// src/scenario/relation-lorebook.test.ts
import { describe, it, expect } from 'vitest';
import { buildRelationEntries } from './relation-lorebook';
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';
import type { CharacterSheet } from '../types';

// 极简 sheet 工厂——仅填关系渲染读取的字段
function makeSheet(name: string): CharacterSheet {
  return {
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
    halfFifth: {} as CharacterSheet['halfFifth'],
    secondary: {
      hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    skills: {},
    identity: { name, occupation: '', age: 30, gender: '', birthplace: '', residence: '', id: '' },
    description: '', 
    posture: '', statusConditions: [], dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false, phobias: [], manias: [], known_spells: [],
    recovery: {},
  };
}

function makeChar(id: string, name: string, opts: Partial<ScenarioCharacter> = {}): ScenarioCharacter {
  return {
    id,
    role: opts.role ?? 'optional',
    sheet: makeSheet(name),
    npcAttrs: {
      identityTag: opts.npcAttrs?.identityTag ?? '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations: opts.relations,
    presentAtStart: opts.presentAtStart,
    createdAt: opts.createdAt,
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sid_test',
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
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
  };
}

describe('buildRelationEntries — spec §10.1', () => {
  it('纯出边：A → B(mentor) + A → C(friend)，生成 A 的条目首段含出边渲染', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'mentor', note: '皇家学院三年' },
        { targetId: 'c', type: 'friend' },
      ] }),
      makeChar('b', '本'),
      makeChar('c', '查理'),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a');
    expect(a).toBeDefined();
    expect(a!.content).toContain('阿尔伯特');
    expect(a!.content).toContain('本');
    expect(a!.content).toContain('mentor');
    expect(a!.content).toContain('皇家学院三年');
    expect(a!.content).toContain('查理');
    expect(a!.content).toContain('friend');
    expect(a!.category).toBe('人物');
    expect(a!.priority).toBe(800);
    expect(a!.position).toBe(1);
    expect(a!.constant).toBe(false);
    expect(a!.cachePolicy).toBe('dynamic_suffix');
  });

  it('纯入边：B 自己没 relations，但被 A 指向 → 仍生成 B 的条目（含反查段）', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'enemy' },
      ] }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    const b = entries.find((e) => e.id === '__scenario_sid_test_rel_b');
    expect(b).toBeDefined();
    expect(b!.content).toContain('本');
    expect(b!.content).toContain('阿尔伯特');
    expect(b!.content).toContain('enemy');
  });

  it('混合：A 同时有出边与被他人指向，两段都渲染', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'friend' },
      ] }),
      makeChar('b', '本'),
      makeChar('c', '查理', { relations: [
        { targetId: 'a', type: 'rival' },
      ] }),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a');
    expect(a).toBeDefined();
    expect(a!.content).toContain('本');         // 出边
    expect(a!.content).toContain('friend');
    expect(a!.content).toContain('查理');       // 入边
    expect(a!.content).toContain('rival');
  });

  it('无关系且无入边：不生成条目', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特'),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    expect(entries).toHaveLength(0);
  });

  it('id 形如 __scenario_<sid>_rel_<charId>', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [{ targetId: 'b', type: 'friend' }] }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    expect(entries.map((e) => e.id).sort()).toEqual([
      '__scenario_sid_test_rel_a',
      '__scenario_sid_test_rel_b',
    ]);
  });

  it('keys 包含姓名 + identityTag', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', {
        npcAttrs: { identityTag: '老侦探' } as ScenarioCharacter['npcAttrs'],
        relations: [{ targetId: 'b', type: 'friend' }],
      }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a')!;
    expect(a.keys).toContain('阿尔伯特');
    expect(a.keys).toContain('老侦探');
  });
});
