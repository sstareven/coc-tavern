import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useNarrationStore } from '../stores/useNarrationStore';
import { useBookStore } from '../stores/useBookStore';
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';
import type { NpcProfile } from '../types';

// 桩掉 callDsSubagent —— 注入可控的 parsed 返回
vi.mock('./subagent-call', () => ({
  callDsSubagent: vi.fn(),
}));
import { callDsSubagent } from './subagent-call';

// 桩 useSettingsStore —— 提供最低限的 api 三件套 + apiModel
vi.mock('../stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      apiBaseUrl: 'https://api.test',
      apiKey: 'k',
      apiModel: 'test-model',
    }),
  },
}));

// 构造一个最低限度的 ScenarioDoc, 注入 useScenarioStore.builtins
function makeChar(id: string, name: string, relations: ScenarioCharacter['relations'] = []): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: { identity: { name } } as ScenarioCharacter['sheet'],
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations,
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sc-test',
    builtin: false,
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
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

function makeNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', favorability: 0,
    appearance: '', personality: '', innerThoughts: '',
    memories: [], experience: '', backstory: '', possessions: [],
    isPresent: true, inParty, createdAt: 0, updatedAt: 0,
  };
}

describe('evaluatePartyRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNarrationStore.getState().clearPending();
    useNpcStore.getState().clearAll();
    useScenarioStore.setState({
      builtins: [],
      userScenarios: [makeDoc([
        makeChar('a', 'Alice', [{ targetId: 'b', type: 'friend' }]),
        makeChar('b', 'Bob'),
      ])],
      activeId: 'sc-test',
      lastPicked: null,
      forkMap: {},
    });
    // book store 一页占位, 让 addPageSubCallStat 有位置
    useBookStore.setState({
      pages: [{ leftHeader: '', leftContent: '', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }],
      pageIndex: 0,
    } as Partial<ReturnType<typeof useBookStore.getState>> as never);
  });

  it('LLM 返回有效 deltas 时 applyRelationDelta 被调用', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [{ sourceId: 'a', targetId: 'b', newType: 'enemy', reason: '争吵' }] },
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'Alice 与 Bob 大吵一架。',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    const doc = useScenarioStore.getState().getById('sc-test');
    const a = doc?.characters.find((c) => c.id === 'a');
    const edge = a?.relations?.find((r) => r.targetId === 'b');
    expect(edge?.type).toBe('enemy');
  });

  it('两个队友变敌对 → leaveParty + 旁白追加', async () => {
    // 把 Alice 与 Bob 都拉进队
    useNpcStore.setState({
      profiles: {
        a: makeNpc('a', 'Alice', true),
        b: makeNpc('b', 'Bob', true),
      },
    } as Partial<ReturnType<typeof useNpcStore.getState>> as never);
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [{ sourceId: 'a', targetId: 'b', newType: 'enemy', reason: '反目' }] },
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'Alice 与 Bob 反目成仇。',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    const lines = useNarrationStore.getState().pending;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('Alice') || l.includes('Bob'))).toBe(true);
    // 至少一方 inParty=false
    const profs = useNpcStore.getState().profiles;
    expect(profs.a.inParty === false || profs.b.inParty === false).toBe(true);
  });

  it('callDsSubagent 抛错 → console.warn 不抛, 主流程继续', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await expect(evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'x',
      sessionId: 'sess-1',
      playerId: 'player',
    })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('parsed 为 null(JSON 解析失败) → 跳过 applyRelationDelta', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({ parsed: null, usage: {} });
    const spy = vi.spyOn(useScenarioStore.getState(), 'applyRelationDelta');
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'x',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('deltas 为空数组 → 不应用且不脱队', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [] },
      usage: {},
    });
    useNpcStore.setState({
      profiles: { a: makeNpc('a', 'Alice', true), b: makeNpc('b', 'Bob', true) },
    } as Partial<ReturnType<typeof useNpcStore.getState>> as never);
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'no change',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    expect(useNpcStore.getState().profiles.a.inParty).toBe(true);
    expect(useNpcStore.getState().profiles.b.inParty).toBe(true);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });
});
