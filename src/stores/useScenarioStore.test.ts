import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from './useScenarioStore';
import type { ScenarioDoc, ScenarioCharacter, ScenarioRelation } from '../types/scenario';
import type { CharacterSheet } from '../types';

function emptySheet(): CharacterSheet {
  return {
    identity: { name: '', age: 30, sex: '', residence: '', birthplace: '', occupation: '' },
    characteristics: { STR: 50, CON: 50, SIZ: 50, DEX: 50, APP: 50, INT: 50, POW: 50, EDU: 50 },
    derived: { hp: 10, sanCurrent: 50, sanStart: 50, sanMax: 99, mpCurrent: 10, mpMax: 10, luck: 50, mov: 8, db: '0', build: 0 },
    skills: {}, customSkills: [], tickedSkills: [],
    background: { description: '', traits: '', beliefs: '', significantPeople: '', meaningfulLocations: '', treasuredPossessions: '', injuries: '', backgroundFears: '' },
    items: [], initialItemsRaw: '',
  } as unknown as CharacterSheet;
}

function makeChar(id: string, name: string, over: Partial<ScenarioCharacter> = {}): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: { ...emptySheet(), identity: { ...emptySheet().identity, name } },
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    ...over,
  };
}

function makeDoc(over: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: over.id ?? 'scn_test_1',
    builtin: over.builtin ?? false,
    meta: { name: 'T', type: '调查', durationHint: '1-2h', difficulty: 3, headcountHint: '1-3人', sanLossHint: '中', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: over.characters ?? [],
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

function resetStore(): void {
  useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
}

describe('useScenarioStore.mergePatch — patchCharacters 浅合并', () => {
  beforeEach(resetStore);

  it('patchCharacters 仅含 id+relations 时,保留 sheet/npcAttrs,只覆盖 relations', () => {
    const charA = makeChar('cA', '甲', {
      sheet: { ...emptySheet(), identity: { ...emptySheet().identity, name: '甲', age: 42 } } as CharacterSheet,
      npcAttrs: {
        identityTag: '医生',
        attitudeDefault: 30,
        relationshipDefault: '熟人',
        locationDefault: '诊所',
        publicBio: '镇上唯一的医生',
        hiddenBio: '',
      },
    });
    const doc = makeDoc({ id: 'scn_x', characters: [charA] });
    useScenarioStore.setState({ userScenarios: [doc] });

    const relations: ScenarioRelation[] = [{ targetId: 'cB', type: 'friend' }];
    useScenarioStore.getState().applyPatch('scn_x', {
      patchCharacters: [{ id: 'cA', relations } as ScenarioCharacter],
    });

    const updated = useScenarioStore.getState().getById('scn_x')!;
    const merged = updated.characters.find(c => c.id === 'cA')!;
    expect(merged.relations).toEqual(relations);
    expect(merged.npcAttrs.identityTag).toBe('医生');
    expect(merged.npcAttrs.publicBio).toBe('镇上唯一的医生');
    expect(merged.sheet.identity.name).toBe('甲');
    expect((merged.sheet.identity as { age: number }).age).toBe(42);
  });

  it('patchCharacters 新增不存在的 id → 直接插入(作为整条记录)', () => {
    const doc = makeDoc({ id: 'scn_y', characters: [] });
    useScenarioStore.setState({ userScenarios: [doc] });

    const newChar = makeChar('cNew', '新人', { role: 'player_created', createdAt: 999 });
    useScenarioStore.getState().applyPatch('scn_y', { patchCharacters: [newChar] });

    const updated = useScenarioStore.getState().getById('scn_y')!;
    expect(updated.characters).toHaveLength(1);
    expect(updated.characters[0].id).toBe('cNew');
    expect(updated.characters[0].role).toBe('player_created');
    expect(updated.characters[0].createdAt).toBe(999);
  });

  it('patchCharacters 同时含 presentAtStart=true 与已有字段合并不丢失', () => {
    const charA = makeChar('cA', '甲');
    const doc = makeDoc({ id: 'scn_z', characters: [charA] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyPatch('scn_z', {
      patchCharacters: [{ id: 'cA', presentAtStart: true } as ScenarioCharacter],
    });

    const merged = useScenarioStore.getState().getById('scn_z')!.characters.find(c => c.id === 'cA')!;
    expect(merged.presentAtStart).toBe(true);
    expect(merged.sheet.identity.name).toBe('甲');
    expect(merged.role).toBe('optional');
  });
});
