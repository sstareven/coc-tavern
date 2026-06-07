import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useChatStore } from '../../stores/useChatStore';
import { useCharSheetStore, defaultSheet } from '../../stores/useCharSheetStore';
import type { ScenarioDoc } from '../../types/scenario';

function makeScenario(id: string): ScenarioDoc {
  const now = Date.now();
  return {
    id,
    builtin: false,
    meta: { name: '测试剧本', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1人', sanLossHint: '低', blurb: '' },
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
    createdAt: now,
    updatedAt: now,
  };
}

describe('CharacterCreator handleConfirm 流程改造（M4）', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
    useChatStore.setState({ sessions: [], activeId: null } as Partial<ReturnType<typeof useChatStore.getState>> as never);
    useCharSheetStore.getState().setSheet(defaultSheet);
  });

  it('applyPatch 把自创卡作为 player_created 写入剧本 characters[]', async () => {
    const scn = makeScenario('test-scn-confirm-1');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });

    // 模拟 handleConfirm 关键路径(精简版,与生产实现对齐):构造 sheet → applyPatch
    const { applyPatch } = useScenarioStore.getState();
    const newCharId = `INV-TEST-001`;
    const sheet = { ...JSON.parse(JSON.stringify(defaultSheet)), identity: { ...defaultSheet.identity, name: '约翰·肯特', id: newCharId } };
    applyPatch(scn.id, {
      patchCharacters: [{
        id: newCharId,
        role: 'player_created',
        sheet,
        npcAttrs: {
          identityTag: '',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
        },
        createdAt: 12345,
      }],
    });

    const next = useScenarioStore.getState().getById(scn.id);
    expect(next).toBeDefined();
    const created = next!.characters.find((c) => c.id === newCharId);
    expect(created).toBeDefined();
    expect(created?.role).toBe('player_created');
    expect(created?.sheet.identity.name).toBe('约翰·肯特');
    expect(created?.createdAt).toBe(12345);
  });

  it('applyPatch 不会触发新会话（不调用 startNewConversation）', async () => {
    const scn = makeScenario('test-scn-confirm-2');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });
    const beforeSessions = useChatStore.getState().sessions.length;

    const { applyPatch } = useScenarioStore.getState();
    applyPatch(scn.id, {
      patchCharacters: [{
        id: 'INV-TEST-002',
        role: 'player_created',
        sheet: JSON.parse(JSON.stringify(defaultSheet)),
        npcAttrs: {
          identityTag: '',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
        },
        createdAt: Date.now(),
      }],
    });

    const afterSessions = useChatStore.getState().sessions.length;
    expect(afterSessions).toBe(beforeSessions); // 无新会话创建
  });

  it('多次 applyPatch 同 id 时不重复追加（覆盖现有）', () => {
    const scn = makeScenario('test-scn-confirm-3');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });
    const { applyPatch } = useScenarioStore.getState();
    const charId = 'INV-TEST-DUP';
    const baseChar = {
      id: charId,
      role: 'player_created' as const,
      sheet: JSON.parse(JSON.stringify(defaultSheet)),
      npcAttrs: {
        identityTag: '',
        attitudeDefault: 0,
        relationshipDefault: '',
        locationDefault: '',
        publicBio: '',
        hiddenBio: '',
      },
      createdAt: 1000,
    };
    applyPatch(scn.id, { patchCharacters: [baseChar] });
    applyPatch(scn.id, { patchCharacters: [{ ...baseChar, createdAt: 2000 }] });
    const next = useScenarioStore.getState().getById(scn.id);
    const hits = next!.characters.filter((c) => c.id === charId);
    expect(hits).toHaveLength(1);
    expect(hits[0].createdAt).toBe(2000);
  });
});
