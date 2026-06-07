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

describe('useScenarioStore.applyRelationDelta', () => {
  beforeEach(resetStore);

  it('newType=具体枚举 → 新增 relations 项', () => {
    const charA = makeChar('cA', '甲');
    const doc = makeDoc({ id: 'scn_r1', characters: [charA, makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r1', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend', reason: '一起经历了码头那晚' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r1')!;
    const rels = updated.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ targetId: 'cB', type: 'friend', note: '一起经历了码头那晚' });
  });

  it('newType=具体枚举 → 已有同 targetId 项 replace type 而非追加', () => {
    const charA = makeChar('cA', '甲', { relations: [{ targetId: 'cB', type: 'friend' }] });
    const doc = makeDoc({ id: 'scn_r2', characters: [charA, makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r2', [
      { sourceId: 'cA', targetId: 'cB', newType: 'enemy' },
    ]);

    const rels = useScenarioStore.getState().getById('scn_r2')!.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0].type).toBe('enemy');
  });

  it('newType=stranger → 删除该 targetId 出边', () => {
    const charA = makeChar('cA', '甲', {
      relations: [
        { targetId: 'cB', type: 'friend' },
        { targetId: 'cC', type: 'rival' },
      ],
    });
    const doc = makeDoc({ id: 'scn_r3', characters: [charA, makeChar('cB', '乙'), makeChar('cC', '丙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r3', [
      { sourceId: 'cA', targetId: 'cB', newType: 'stranger' },
    ]);

    const rels = useScenarioStore.getState().getById('scn_r3')!.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0].targetId).toBe('cC');
  });

  it('多条 deltas 同回合应用 → 顺序生效', () => {
    const doc = makeDoc({ id: 'scn_r4', characters: [makeChar('cA', '甲'), makeChar('cB', '乙'), makeChar('cC', '丙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r4', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
      { sourceId: 'cA', targetId: 'cC', newType: 'enemy' },
      { sourceId: 'cB', targetId: 'cA', newType: 'friend' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r4')!;
    const aRels = updated.characters.find(c => c.id === 'cA')!.relations!;
    const bRels = updated.characters.find(c => c.id === 'cB')!.relations!;
    expect(aRels).toHaveLength(2);
    expect(bRels).toHaveLength(1);
    expect(bRels[0]).toMatchObject({ targetId: 'cA', type: 'friend' });
  });

  it('builtin 剧本 → 触发 forkMap 副本(不污染 builtin)', () => {
    const builtin = makeDoc({ id: 'scn_builtin', builtin: true, characters: [makeChar('cA', '甲'), makeChar('cB', '乙')] });
    useScenarioStore.setState({ builtins: [builtin], userScenarios: [], forkMap: {} });

    useScenarioStore.getState().applyRelationDelta('scn_builtin', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);

    const s = useScenarioStore.getState();
    // builtin 原文不变
    expect(s.builtins[0].characters.find(c => c.id === 'cA')!.relations).toBeUndefined();
    // 副本被 fork 出来,带新关系
    expect(s.userScenarios).toHaveLength(1);
    expect(s.forkMap['scn_builtin']).toBe(s.userScenarios[0].id);
    const forkedA = s.userScenarios[0].characters.find(c => c.id === 'cA')!;
    expect(forkedA.relations).toEqual([{ targetId: 'cB', type: 'friend' }]);
  });

  it('未知 scenarioId → 静默无操作', () => {
    useScenarioStore.getState().applyRelationDelta('not_exist', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);
    expect(useScenarioStore.getState().userScenarios).toEqual([]);
  });

  it('未知 sourceId → 跳过该条 delta,其余仍生效', () => {
    const doc = makeDoc({ id: 'scn_r5', characters: [makeChar('cA', '甲'), makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r5', [
      { sourceId: 'nope', targetId: 'cB', newType: 'enemy' },
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r5')!;
    expect(updated.characters.find(c => c.id === 'cA')!.relations).toEqual([{ targetId: 'cB', type: 'friend' }]);
  });
});

describe('ScenarioPatch.removeCharacterIds', () => {
  beforeEach(resetStore);

  it('应该移除指定 id 的 character', () => {
    const doc = makeDoc({
      id: 'scn_rm1',
      characters: [makeChar('c1', '甲'), makeChar('c2', '乙', { role: 'player_created' }), makeChar('c3', '丙')],
    });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyPatch('scn_rm1', { removeCharacterIds: ['c2'] });

    const after = useScenarioStore.getState().getById('scn_rm1')!;
    expect(after.characters.map(c => c.id)).toEqual(['c1', 'c3']);
  });

  it('removeCharacterIds 与 patchCharacters 同 patch 内时，先移除再 upsert', () => {
    const doc = makeDoc({ id: 'scn_rm2', characters: [makeChar('c1', '甲'), makeChar('c2', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyPatch('scn_rm2', {
      removeCharacterIds: ['c1'],
      patchCharacters: [makeChar('c3', '丙')],
    });

    const after = useScenarioStore.getState().getById('scn_rm2')!;
    expect(after.characters.map(c => c.id).sort()).toEqual(['c2', 'c3']);
  });

  it('removeCharacterIds 未命中任何 id 应是 no-op', () => {
    const doc = makeDoc({ id: 'scn_rm3', characters: [makeChar('c1', '甲')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyPatch('scn_rm3', { removeCharacterIds: ['nope'] });

    const after = useScenarioStore.getState().getById('scn_rm3')!;
    expect(after.characters.map(c => c.id)).toEqual(['c1']);
  });
});
