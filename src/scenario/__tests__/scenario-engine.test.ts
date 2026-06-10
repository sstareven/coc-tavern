// scenario-engine: D1 失败回滚 / preset 错路径 + D2 deepMergePreserve 语义钉死
//
// 不连真 LLM、不进 IndexedDB——把所有 store 和 expand-prologue/extract-initial-items 都 mock,
// 只校验 activateScenario 抛错路径上 lorebook removeBook / setSessionScenario(null) 是否被调,
// 以及 deepMergePreserve 在「叶子保留 / null !== undefined / 深嵌套」等边界下的行为。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScenarioDoc } from '../../types/scenario';

// ── store mocks ────────────────────────────────────────────────────────
const getByIdMock = vi.fn();
const setSheetMock = vi.fn();
const npcApplyUpdatesMock = vi.fn();
const npcReplaceAllMock = vi.fn();
const setStatDataMock = vi.fn();
const statDataRef: { current: Record<string, unknown> } = { current: {} };
const upsertBookMock = vi.fn();
const removeBookMock = vi.fn();
const setSessionScenarioMock = vi.fn();
const applyChangesMock = vi.fn();
const invReplaceAllMock = vi.fn();
const bookPagesRef: { current: unknown[] } = { current: [] };
const replacePageMock = vi.fn();
const appendPageMock = vi.fn();
const goToPageMock = vi.fn();
const resetToPrologueMock = vi.fn();
const setPageAcquiredItemsMock = vi.fn();
const setPageInventoryChangesMock = vi.fn();
const sheetRef: { current: { initialItemsRaw?: string } } = { current: {} };
// A3 + B2 snapshot/restore 用的 store 字段补全
const mapApplyUpdatesMock = vi.fn();
const mapReplaceAllMock = vi.fn();
// M10: joinParty 与 relation-graph 用例
const joinPartyMock = vi.fn();
const canJoinPartyMock = vi.fn();
const hasHostileEdgeMock = vi.fn();

vi.mock('../../stores/useScenarioStore', () => ({
  useScenarioStore: {
    getState: () => ({ getById: getByIdMock, userScenarios: [], builtins: [] }),
    // M3 Task 3 引入 subscribeRelationLorebook，会在 activateScenario 里挂订阅。
    // 测试不触发 store 变化，只需 subscribe 返回 unsubscribe 即可。
    subscribe: vi.fn(() => () => {}),
  },
}));
vi.mock('../../stores/useCharSheetStore', () => ({
  useCharSheetStore: { getState: () => ({ setSheet: setSheetMock, sheet: sheetRef.current }) },
}));
vi.mock('../../stores/useNpcStore', () => ({
  useNpcStore: { getState: () => ({
    applyUpdates: npcApplyUpdatesMock,
    replaceAll: npcReplaceAllMock,
    joinParty: joinPartyMock,
    profiles: {},
  }) },
}));
vi.mock('../../stores/useVariableStore', () => ({
  useVariableStore: {
    getState: () => ({ statData: statDataRef.current, setStatData: setStatDataMock }),
  },
}));
vi.mock('../../stores/useLorebookStore', () => ({
  useLorebookStore: {
    getState: () => ({ upsertBook: upsertBookMock, removeBook: removeBookMock, books: {} }),
  },
}));
vi.mock('../../stores/useInventoryStore', () => ({
  useInventoryStore: { getState: () => ({ applyChanges: applyChangesMock, replaceAll: invReplaceAllMock, items: [] }) },
}));
vi.mock('../../stores/useMapStore', () => ({
  useMapStore: {
    getState: () => ({
      applyUpdates: mapApplyUpdatesMock,
      replaceAll: mapReplaceAllMock,
      locations: {},
      edges: [],
      currentLocationId: null,
    }),
  },
}));
vi.mock('../../stores/useBookStore', () => ({
  useBookStore: {
    getState: () => ({
      pages: bookPagesRef.current,
      replacePage: replacePageMock,
      appendPage: appendPageMock,
      goToPage: goToPageMock,
      resetToPrologue: resetToPrologueMock,
      setPageAcquiredItems: setPageAcquiredItemsMock,
      setPageInventoryChanges: setPageInventoryChangesMock,
    }),
  },
}));
vi.mock('../../stores/useChatStore', () => ({
  useChatStore: {
    getState: () => ({
      sessions: [],
      activeId: null,
      setSessionScenario: setSessionScenarioMock,
    }),
  },
}));

// expand-prologue 默认抛错;每个测试自己 override
const expandPrologueMock = vi.fn();
vi.mock('../expand-prologue', () => ({
  expandPrologueToPage: (...args: unknown[]) => expandPrologueMock(...args),
}));
// initial-items 默认返回空数组(避免 step 4 噪声)
const extractInitialItemsMock = vi.fn();
vi.mock('../initial-items-extractor', () => ({
  extractInitialItems: (...args: unknown[]) => extractInitialItemsMock(...args),
}));

vi.mock('../relation-graph', () => ({
  canJoinParty: (...args: unknown[]) => canJoinPartyMock(...args),
  hasHostileEdge: (...args: unknown[]) => hasHostileEdgeMock(...args),
}));

import { activateScenario, deepMergePreserve } from '../scenario-engine';

function emptyDoc(over: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: 'sc-1',
    builtin: false,
    meta: {
      name: 'X', type: '调查', durationHint: '3-5h', difficulty: 2,
      headcountHint: '1人', sanLossHint: '中', blurb: '',
    },
    prologueSeed: '种子',
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
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  statDataRef.current = {};
  bookPagesRef.current = [];
  sheetRef.current = {};
  // M10: 默认 canJoinParty 返回 { ok: false } / hasHostileEdge 返回 false,各用例按需 override
  canJoinPartyMock.mockReturnValue({ ok: false, reason: 'stranger' });
  hasHostileEdgeMock.mockReturnValue(false);
  // vi.clearAllMocks() 只清调用记录不清 implementation;D1 用例曾给 appendPageMock 装了
  // throw 实现, 不重置会污染后续 M10 用例。这里把 page 写入类 mock 重置为 noop。
  appendPageMock.mockReset();
  replacePageMock.mockReset();
  expandPrologueMock.mockReset();
  // 默认让 crypto.randomUUID 存在(scenario-engine 用)
  if (!(globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID) {
    (globalThis as { crypto?: { randomUUID?: () => string } }).crypto = {
      randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2),
    };
  }
});

describe('D1 — activateScenario 失败回滚', () => {
  it('扩首页 + 兜底 page0 写入也抛错 → removeBook(scenarioBookId) + setSessionScenario(null) 都被调', async () => {
    const doc = emptyDoc({
      id: 'sc-rollback',
      characters: [{
        id: 'c-rollback',
        role: 'protagonist' as const,
        sheet: {} as never,
        npcAttrs: {
          identityTag: '', attitudeDefault: 0, relationshipDefault: '',
          locationDefault: '', publicBio: '', hiddenBio: '',
        },
      }],
    });
    getByIdMock.mockReturnValue(doc);
    // expandPrologueToPage 在 scenario-engine 内部被 try/catch 兜底成 FALLBACK_CHOICES,
    // 不会直接 propagate;真正能触发外层 catch 回滚的是后续 appendPage/replacePage 失败。
    // 这里让 expand 抛错走兜底分支,再让 appendPage 抛错触发外层 catch。
    expandPrologueMock.mockRejectedValue(new Error('LLM 扩首页 boom'));
    appendPageMock.mockImplementation(() => { throw new Error('append boom'); });

    await expect(activateScenario('sc-rollback', 'newChar', 0)).rejects.toThrow('append boom');

    expect(upsertBookMock).toHaveBeenCalledTimes(1);
    expect(removeBookMock).toHaveBeenCalledWith('__scenario_sc-rollback');
    expect(setSessionScenarioMock).toHaveBeenCalledWith(null);
  });

  it('preset 模式 charIdx=undefined → throw,不挂 book / 不写 sessionScenario', async () => {
    const doc = emptyDoc({
      characters: [{
        id: 'c1',
        role: 'protagonist',
        sheet: {} as never,
        npcAttrs: {
          identityTag: '', attitudeDefault: 0, relationshipDefault: '',
          locationDefault: '', publicBio: '', hiddenBio: '',
        },
      }],
    });
    getByIdMock.mockReturnValue(doc);

    await expect(activateScenario('sc-1', 'preset', undefined)).rejects.toThrow(/preset 模式必须显式传 charIdx/);

    expect(upsertBookMock).not.toHaveBeenCalled();
    expect(setSessionScenarioMock).not.toHaveBeenCalled();
  });

  it('preset 模式 charIdx 指向 locked_npc → throw', async () => {
    const doc = emptyDoc({
      characters: [{
        id: 'c1',
        role: 'locked_npc',
        sheet: {} as never,
        npcAttrs: {
          identityTag: '', attitudeDefault: 0, relationshipDefault: '',
          locationDefault: '', publicBio: '', hiddenBio: '',
        },
      }],
    });
    getByIdMock.mockReturnValue(doc);

    await expect(activateScenario('sc-1', 'preset', 0)).rejects.toThrow(/锁定不可扮演/);
    expect(upsertBookMock).not.toHaveBeenCalled();
  });
});

describe('D2 — deepMergePreserve 语义钉死', () => {
  it('base 有 leaf=true,seed 同 path={} → 保留 true(不被空对象吞)', () => {
    const base = { 剧情: { 已解锁: { 钥匙: true } } };
    const seed = { 剧情: { 已解锁: {} } };
    const out = deepMergePreserve(base, seed) as { 剧情: { 已解锁: Record<string, unknown> } };
    expect(out.剧情.已解锁.钥匙).toBe(true);
  });

  it('base 是 plainObject + seed 是数组 → 当前实现保留 base(数组视作叶子由 base 接管;base 已存在故不被替换)', () => {
    const base = { 名册: { 主角: '阿福' } };
    const seed = { 名册: ['a', 'b'] };
    const out = deepMergePreserve(base, seed) as { 名册: unknown };
    // 钉死:base 是 plainObject,seed 是数组(非 plainObject) → 当前实现走 "base 已存在叶子" 分支 → 保留 base
    expect(out.名册).toEqual({ 主角: '阿福' });
  });

  it('base 是 null + seed 是 object → seed 不被吞(null !== undefined,保留 null)', () => {
    // 钉死:base[k] === null 时 base 已经"有值"(非 undefined),seed 不该覆盖
    const base = { 暗线: null };
    const seed = { 暗线: { 描述: '潜伏' } };
    const out = deepMergePreserve(base as Record<string, unknown>, seed);
    expect(out.暗线).toBe(null);
  });

  it('嵌套深 3 层都保留 base 已有字段', () => {
    const base = { 剧情: { 主线: { 章节: { 当前: '第三章' } } } };
    const seed = { 剧情: { 主线: { 章节: { 当前: '第一章', 下一: '第二章' } } } };
    const out = deepMergePreserve(base, seed) as {
      剧情: { 主线: { 章节: { 当前: string; 下一: string } } };
    };
    expect(out.剧情.主线.章节.当前).toBe('第三章'); // 保留
    expect(out.剧情.主线.章节.下一).toBe('第二章'); // 新增
  });

  it('seed 嵌套对象写入 base 缺失路径时,JSON 克隆切断引用共享', () => {
    const sharedSeedSub = { sub: 1 };
    const base = {};
    const seed = { a: sharedSeedSub };
    const out = deepMergePreserve(base, seed) as { a: { sub: number } };
    expect(out.a).toEqual({ sub: 1 });
    // 不复用同一引用
    expect(out.a).not.toBe(sharedSeedSub);
  });
});

describe('M10 — activateScenario 开场建场 + 准入 + 敌对冲突', () => {
  // 这一 describe 块要求 scenario-engine.ts 按 presentAtStart 字段建场:
  //   - presentAtStart=true 且非玩家本人 → applyUpdates({isPresent:true,isScenarioPreset:true})
  //   - canJoinParty 通过 → joinParty(id);失败 → 仅 isPresent
  //   - 两个 presentAtStart=true 互为敌对 → 后到者强制 isPresent=false + console.warn
  // 实现见 §5.3 + §4.2 R5。
  function charWithPresent(
    id: string,
    name: string,
    presentAtStart: boolean,
    role: 'protagonist' | 'optional' | 'locked_npc' = 'optional',
  ) {
    return {
      id,
      role,
      presentAtStart,
      sheet: { identity: { name } } as never,
      npcAttrs: {
        identityTag: '', attitudeDefault: 0, relationshipDefault: '',
        locationDefault: '', publicBio: '', hiddenBio: '',
      },
    };
  }

  it('presentAtStart=true 且与玩家非敌对 → applyUpdates(isPresent=true) + joinParty 入队', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-a',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-friend', '朋友', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    canJoinPartyMock.mockReturnValue({ ok: true }); // 准入通过

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    await activateScenario('sc-m10-a', 'preset', 0);

    // applyUpdates 必须有一笔 c-friend 且 isPresent=true
    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const friendUpdate = flat.find((u) => u.id === 'c-friend');
    expect(friendUpdate).toBeTruthy();
    expect(friendUpdate?.isPresent).toBe(true);
    // 入队
    expect(joinPartyMock).toHaveBeenCalledWith('c-friend');
  });

  it('presentAtStart=true 但 canJoinParty 返回 false → 仅 isPresent,不入队', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-b',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-stranger', '陌生人', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    canJoinPartyMock.mockReturnValue({ ok: false, reason: 'stranger' }); // 拒绝入队

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    await activateScenario('sc-m10-b', 'preset', 0);

    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const strangerUpdate = flat.find((u) => u.id === 'c-stranger');
    expect(strangerUpdate).toBeTruthy();
    expect(strangerUpdate?.isPresent).toBe(true);
    // 但不该 joinParty
    expect(joinPartyMock).not.toHaveBeenCalledWith('c-stranger');
  });

  it('两个 presentAtStart=true 互为敌对 → 后到者强制 isPresent=false + console.warn', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-c',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-a', 'A', true, 'optional'),
        charWithPresent('c-b', 'B', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    // canJoinParty 一律 false(本用例只关心 isPresent 决策)
    canJoinPartyMock.mockReturnValue({ ok: false, reason: 'stranger' });
    // hasHostileEdge: A 与 B 之间互为敌对(任一方向 true 都算敌对)
    hasHostileEdgeMock.mockImplementation((_doc: unknown, aId: unknown, bId: unknown) => {
      const pair = [aId, bId].sort().join('|');
      return pair === ['c-a', 'c-b'].sort().join('|');
    });

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await activateScenario('sc-m10-c', 'preset', 0);

    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const aUpdate = flat.find((u) => u.id === 'c-a');
    const bUpdate = flat.find((u) => u.id === 'c-b');
    expect(aUpdate?.isPresent).toBe(true);   // 先到者保留
    expect(bUpdate?.isPresent).toBe(false);  // 后到者强制不在场
    // 留痕
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toMatch(/开场冲突|敌对|hostile/i);

    warnSpy.mockRestore();
  });
});
