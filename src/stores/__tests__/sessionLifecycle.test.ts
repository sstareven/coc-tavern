// D4 — clearAllGameState(prevScenarioId?) 顺序解耦:
//   显式传 prevScenarioId 时即使 activeId 已被改写,旧剧本 book 仍会被 unloadScenario 卸掉。
//   不传时回退到从 sessions 反查(向后兼容)。
//
// 静态 import scenario-engine 触发 import 解析,但 scenario-engine 内部经 dynamic import
// 加载,需要 mock 整个模块。把 useLorebookStore.removeBook 直接 mock 来验证调用。

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { removeBookMock, unloadScenarioMock, sessionsRef } = vi.hoisted(() => ({
  removeBookMock: (globalThis as { __mock_removeBookMock?: ReturnType<typeof vi.fn> }).__mock_removeBookMock = vi.fn(),
  unloadScenarioMock: (globalThis as { __mock_unloadScenarioMock?: ReturnType<typeof vi.fn> }).__mock_unloadScenarioMock = vi.fn(),
  sessionsRef: { value: [] as Array<{ id: string; scenarioId?: string }>, activeId: null as string | null },
}));

vi.mock('../useLorebookStore', () => ({
  useLorebookStore: {
    getState: () => ({
      removeBook: removeBookMock,
      clearSummaryEntries: vi.fn(),
      upsertSummaryEntry: vi.fn(),
    }),
  },
}));
vi.mock('../../scenario/scenario-engine', () => ({
  unloadScenario: (id: string) => unloadScenarioMock(id),
}));

vi.mock('../useChatStore', () => ({
  useChatStore: {
    getState: () => ({
      sessions: sessionsRef.value,
      activeId: sessionsRef.activeId,
      setSessionScenario: vi.fn(),
      createSession: vi.fn(),
      setActive: vi.fn(),
      savePages: vi.fn(),
    }),
  },
}));
vi.mock('../useCharSheetStore', () => ({
  useCharSheetStore: {
    getState: () => ({
      setSheet: vi.fn(), close: vi.fn(),
    }),
  },
  defaultSheet: {},
  isDefaultSheet: () => true,
  migrateSheet: (x: unknown) => x ?? {},
}));
vi.mock('../useInventoryStore', () => ({
  useInventoryStore: {
    getState: () => ({ clearAll: vi.fn(), close: vi.fn(), replaceAll: vi.fn() }),
  },
  normalizeItems: (x: unknown) => x,
}));
vi.mock('../useClueStore', () => ({
  useClueStore: { getState: () => ({ clearAll: vi.fn(), replaceAll: vi.fn() }) },
}));
vi.mock('../useNpcStore', () => ({
  useNpcStore: { getState: () => ({ clearAll: vi.fn(), close: vi.fn(), replaceAll: vi.fn() }) },
}));
vi.mock('../useMapStore', () => ({
  useMapStore: {
    getState: () => ({ clearAll: vi.fn(), close: vi.fn(), replaceAll: vi.fn(), setCurrentByName: vi.fn() }),
  },
}));
vi.mock('../useLocationElementStore', () => ({
  useLocationElementStore: { getState: () => ({ clearAll: vi.fn(), replaceAll: vi.fn() }) },
}));
vi.mock('../useKeyClueStore', () => ({
  useKeyClueStore: { getState: () => ({ clearAll: vi.fn(), replaceAll: vi.fn() }) },
}));
vi.mock('../useAnchorStore', () => ({
  useAnchorStore: { getState: () => ({ clearAll: vi.fn(), replaceAll: vi.fn() }) },
}));
vi.mock('../useCombatStore', () => ({
  useCombatStore: {
    getState: () => ({ clearAll: vi.fn(), encounter: null, clearCombat: vi.fn(), replaceAll: vi.fn() }),
  },
  isOrphanedEncounter: () => false,
}));
vi.mock('../useDiceStore', () => ({
  useDiceStore: { getState: () => ({ clearAll: vi.fn(), setHistory: vi.fn() }) },
}));
vi.mock('../useChoiceLockStore', () => ({
  useChoiceLockStore: { getState: () => ({ unlock: vi.fn() }) },
}));
vi.mock('../useDarkThreadStore', () => ({
  useDarkThreadStore: {
    getState: () => ({ clearAll: vi.fn(), setBadEnding: vi.fn(), replaceAll: vi.fn() }),
  },
}));
vi.mock('../useKeywordStore', () => ({
  useKeywordStore: { getState: () => ({ replaceAll: vi.fn() }) },
}));
vi.mock('../useBookStore', () => ({
  useBookStore: { getState: () => ({ resetToPrologue: vi.fn(), pages: [], setPages: vi.fn() }) },
}));
vi.mock('../useSanityBubbleStore', () => ({
  useSanityBubbleStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('../useVariableStore', () => ({
  useVariableStore: {
    getState: () => ({ clearAll: vi.fn(), setStatData: vi.fn(), statData: {}, replaceAll: vi.fn() }),
  },
}));
vi.mock('../../sillytavern/mvu-initial-statdata', () => ({ createInitialStatData: () => ({}) }));
vi.mock('../useTavernHelperStore', () => ({
  useTavernHelperStore: { getState: () => ({ setMacroVars: vi.fn(), macroVars: {} }) },
}));
vi.mock('../../sillytavern/mvu-charsheet-redirect', () => ({ isCharsheetPath: () => false }));
vi.mock('../../sillytavern/mvu-var-access', () => ({
  getTreePath: () => undefined,
  setTreePath: () => undefined,
}));
vi.mock('../../sillytavern/prefix-cache-diagnostics', () => ({
  clearAllDiagnostics: vi.fn(),
  clearDiagnosticsFor: vi.fn(),
}));
// kvStore 最小可用 mock:useScenarioStore.clearForkMap 经 zustand persist setItem 走这里,
// 不 mock 时 db.kvStore=undefined 触发 unhandled rejection(测试本身仍 pass 但日志吵)。
vi.mock('../../db/database', () => ({
  db: {
    kvStore: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    },
  },
}));

import { clearAllGameState } from '../sessionLifecycle';

function setSessionsState(sessions: Array<{ id: string; scenarioId?: string }>, activeId: string | null) {
  sessionsRef.value = sessions;
  sessionsRef.activeId = activeId;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSessionsState([], null);
});

describe('D4 — clearAllGameState 显式 prevScenarioId 顺序解耦', () => {
  // dynamic import().then 是 microtask 链;用 setTimeout(0) 把断言推到下一个 macrotask 后,
  // 等 await import + 之后的 .then 都完成。
  const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 10));

  it('显式传 prevScenarioId=sc-x → unloadScenario 被调,即便 activeId 已切到新会话', async () => {
    setSessionsState([{ id: 'new-conv', scenarioId: undefined }], 'new-conv');

    clearAllGameState('sc-x');
    await flushMicrotasks();

    expect(unloadScenarioMock).toHaveBeenCalledWith('sc-x');
  });

  it('不传 prevScenarioId → 回退到从 sessions 反查(向后兼容)', async () => {
    setSessionsState([{ id: 'cur', scenarioId: 'sc-from-sessions' }], 'cur');

    clearAllGameState();
    await flushMicrotasks();

    expect(unloadScenarioMock).toHaveBeenCalledWith('sc-from-sessions');
  });

  it('不传 prevScenarioId 且当前会话也无 scenarioId → 不调 unloadScenario', async () => {
    setSessionsState([{ id: 'cur', scenarioId: undefined }], 'cur');

    clearAllGameState();
    await flushMicrotasks();

    expect(unloadScenarioMock).not.toHaveBeenCalled();
  });
});

// `removeBookMock` 暴露给类型校验避免 unused-import lint; 实际断言通过 unloadScenarioMock 进行,
// 因为 sessionLifecycle 把卸剧本的工作委托给 scenario-engine.unloadScenario(里面才调 removeBook)。
void removeBookMock;
