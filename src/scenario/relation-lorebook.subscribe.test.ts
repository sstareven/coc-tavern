import { describe, it, expect, beforeEach } from 'vitest';
import { subscribeRelationLorebook } from './relation-lorebook';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { scenarioEntriesToLoreEntries } from './scenario-injection';
import type { ScenarioDoc } from '../types/scenario';
import type { CharacterSheet } from '../types';

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

function makeDoc(sid: string): ScenarioDoc {
  return {
    id: sid,
    meta: { name: '订阅测试', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [
      {
        id: 'a', role: 'protagonist', sheet: makeSheet('阿尔伯特'),
        npcAttrs: { identityTag: '', attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
        relations: [],
      },
      {
        id: 'b', role: 'optional', sheet: makeSheet('本'),
        npcAttrs: { identityTag: '', attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
        relations: [],
      },
    ],
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [],
    darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 0, updatedAt: 0,
  };
}

describe('subscribeRelationLorebook', () => {
  const SID = 'sid_subscribe';
  const BOOK_ID = `__scenario_${SID}`;

  beforeEach(() => {
    // 重置 stores
    useScenarioStore.setState({
      builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {},
    });
    useLorebookStore.setState({
      books: {
        [BOOK_ID]: {
          name: '[剧本] 订阅测试',
          enabled: true,
          entries: scenarioEntriesToLoreEntries([]),
        },
      },
    });
    useScenarioStore.getState().upsert(makeDoc(SID));
  });

  it('修改 characters[].relations 触发 lorebook 重新渲染', () => {
    const unsubscribe = subscribeRelationLorebook(SID);

    // 初始：无关系 → 不应有 rel_* 条目
    let entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    expect(Object.keys(entries).filter((k) => k.startsWith('rel_'))).toHaveLength(0);

    // 加一条 a → b friend
    useScenarioStore.getState().applyPatch(SID, {
      patchCharacters: [
        {
          ...useScenarioStore.getState().getById(SID)!.characters[0],
          relations: [{ targetId: 'b', type: 'friend' }],
        },
      ],
    });

    entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    const relKeys = Object.keys(entries).filter((k) => k.startsWith('rel_'));
    expect(relKeys.length).toBeGreaterThan(0);
    expect(relKeys).toContain('rel_a');
    expect(relKeys).toContain('rel_b');
    expect(entries['rel_a'].content).toContain('friend');

    unsubscribe();
  });

  it('unsubscribe 之后再改不再触发更新', () => {
    const unsubscribe = subscribeRelationLorebook(SID);
    unsubscribe();

    useScenarioStore.getState().applyPatch(SID, {
      patchCharacters: [
        {
          ...useScenarioStore.getState().getById(SID)!.characters[0],
          relations: [{ targetId: 'b', type: 'enemy' }],
        },
      ],
    });

    const entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    expect(Object.keys(entries).filter((k) => k.startsWith('rel_'))).toHaveLength(0);
  });

  it('book 不存在时订阅不抛错（静默跳过）', () => {
    expect(() => {
      const unsub = subscribeRelationLorebook('sid_no_book');
      unsub();
    }).not.toThrow();
  });
});
