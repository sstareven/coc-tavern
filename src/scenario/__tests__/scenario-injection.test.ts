// scenario-injection: entries → LoreEntry / statData seed / character → NpcProfile
import { describe, it, expect } from 'vitest';
import {
  scenarioEntriesToLoreEntries,
  buildScenarioStatDataSeed,
  scenarioCharacterToNpc,
} from '../scenario-injection';
import type { ScenarioDoc, ScenarioEntry, ScenarioCharacter } from '../../types/scenario';

const baseEntry = (over: Partial<ScenarioEntry> = {}): ScenarioEntry => ({
  id: 'e1', category: '地点', comment: '灯塔', keys: '灯塔', content: '灰雾里的灯塔。',
  constant: false, position: 0, priority: 20, cachePolicy: 'auto',
  ...over,
});

describe('scenarioEntriesToLoreEntries', () => {
  it('键名加 scn_ 前缀;priority + offset 默认 1000', () => {
    const out = scenarioEntriesToLoreEntries([baseEntry({ id: 'e1', priority: 5 })]);
    expect(Object.keys(out)).toEqual(['scn_e1']);
    expect(out['scn_e1'].priority).toBe(1005);
  });

  it('offset 可自定义', () => {
    const out = scenarioEntriesToLoreEntries([baseEntry({ priority: 10 })], 50);
    expect(out['scn_e1'].priority).toBe(60);
  });

  it('字段映射: comment→name / keys/content/constant/position / inclusionGroup', () => {
    const out = scenarioEntriesToLoreEntries([baseEntry({ constant: true, position: 4 })]);
    const x = out['scn_e1'];
    expect(x.name).toBe('灯塔');
    expect(x.keys).toBe('灯塔');
    expect(x.content).toBe('灰雾里的灯塔。');
    expect(x.constant).toBe(true);
    expect(x.position).toBe(4);
    expect(x.inclusionGroup).toBe('category:地点');
  });

  it('hidden=true → disabled=true', () => {
    const out = scenarioEntriesToLoreEntries([baseEntry({ hidden: true }), baseEntry({ id: 'e2' })]);
    expect(out['scn_e1'].disabled).toBe(true);
    expect(out['scn_e2'].disabled).toBe(false);
  });

  it('空数组 → 空对象', () => {
    expect(scenarioEntriesToLoreEntries([])).toEqual({});
  });
});

describe('buildScenarioStatDataSeed', () => {
  const docOf = (over: Partial<ScenarioDoc> = {}): ScenarioDoc => ({
    id: 'd', builtin: false,
    meta: { name: 'X', type: '调查', durationHint: '3-5h', difficulty: 2, headcountHint: '1人', sanLossHint: '中', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: [], entries: [], darkTimeline: [], badEndings: [],
    authorNotes: '', schemaVersion: 1, createdAt: 0, updatedAt: 0, ...over,
  });

  it('暗线进度=0, 威胁等级=潜伏, 结局类型空, 已解锁是空对象 (nested tree shape, 匹配 getTreePath)', () => {
    const seed = buildScenarioStatDataSeed(docOf()) as {
      剧情: { 暗线: { 进度: number; 威胁等级: string }; 结局类型: string; 已解锁: Record<string, unknown> };
    };
    expect(seed.剧情.暗线.进度).toBe(0);
    expect(seed.剧情.暗线.威胁等级).toBe('潜伏');
    expect(seed.剧情.结局类型).toBe('');
    expect(seed.剧情.已解锁).toEqual({});
  });

  it('暗线描述取 darkTimeline[0].directorNote;无暗线则空串', () => {
    const empty = buildScenarioStatDataSeed(docOf()) as { 剧情: { 暗线: { 描述: string } } };
    expect(empty.剧情.暗线.描述).toBe('');
    const withDark = docOf({ darkTimeline: [{ id: 'p1', threshold: 30, title: '', triggers: [], directorNote: '一切都在崩坏。', autoUnlockKeys: [] }] });
    const withDarkSeed = buildScenarioStatDataSeed(withDark) as { 剧情: { 暗线: { 描述: string } } };
    expect(withDarkSeed.剧情.暗线.描述).toBe('一切都在崩坏。');
  });
});

describe('scenarioCharacterToNpc', () => {
  const sheetWith = (name: string, skills?: Record<string, { current?: number; base?: number }>) =>
    ({ identity: { name }, skills, characteristics: { STR: 50 } } as unknown as ScenarioCharacter['sheet']);

  const c = (over: Partial<ScenarioCharacter> = {}): ScenarioCharacter => ({
    id: 'c1', role: 'npc_only', sheet: sheetWith(''),
    npcAttrs: {
      identityTag: '管家', attitudeDefault: 30, relationshipDefault: '雇主家眷',
      locationDefault: '宅邸', publicBio: '老人,沉默', hiddenBio: '知晓密室密码',
    },
    ...over,
  });

  it('sheet.identity.name 非空 → 取 sheet.identity.name;否则 fall back identityTag → id', () => {
    expect(scenarioCharacterToNpc(c({ sheet: sheetWith('阿福') })).name).toBe('阿福');
    expect(scenarioCharacterToNpc(c()).name).toBe('管家');
    const noTag = c({ sheet: sheetWith(''), npcAttrs: { ...c().npcAttrs, identityTag: '' } });
    expect(scenarioCharacterToNpc(noTag).name).toBe('c1');
  });

  it('npcAttrs 字段映射: identityTag/favorability/innerThoughts/backstory/faction', () => {
    const out = scenarioCharacterToNpc(c());
    expect(out.identity).toBe('管家');
    expect(out.favorability).toBe(30);
    expect(out.innerThoughts).toBe('知晓密室密码');
    expect(out.backstory).toBe('老人,沉默');
    expect(out.faction).toBe('雇主家眷');
  });

  it('relationshipDefault 空 → faction = undefined', () => {
    const out = scenarioCharacterToNpc(c({ npcAttrs: { ...c().npcAttrs, relationshipDefault: '' } }));
    expect(out.faction).toBeUndefined();
  });

  it('skills: 取 current,缺失则取 base,数字才入', () => {
    const out = scenarioCharacterToNpc(c({
      sheet: sheetWith('阿福', {
        聆听: { current: 70, base: 25 },
        侦查: { base: 35 },
        话术: {},
      }),
    }));
    expect(out.skills).toEqual({ 聆听: 70, 侦查: 35 });
  });

  it('isPresent 默认 false(剧本载入时离场)', () => {
    expect(scenarioCharacterToNpc(c()).isPresent).toBe(false);
  });
});
