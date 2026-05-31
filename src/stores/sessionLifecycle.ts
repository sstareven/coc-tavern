import { useChatStore } from './useChatStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useInventoryStore } from './useInventoryStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeywordStore } from './useKeywordStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useTavernHelperStore } from './useTavernHelperStore';
import { useLorebookStore } from './useLorebookStore';

export function restoreSessionGameState(sessionId: string) {
  const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
  if (!session) return;

  if (session.pages.length > 0) {
    useBookStore.getState().setPages(session.pages);
  }

  const gs = session.gameState;

  // 无条件清空所有按会话隔离的内存态，再用本会话存档覆盖——杜绝上一个会话的数据泄漏。
  // 关键：即使本会话 gameState 缺某字段（旧存档），对应 store 也已被清空，不会残留上一会话数据。
  // variables / macroVars 此前既不在快照也不在恢复集里，是跨对话泄漏的主因（SAN 等会串档）。
  clearAllGameState();

  if (!gs) return;

  if (gs.character) useCharSheetStore.getState().setSheet(gs.character);
  if (gs.inventory) useInventoryStore.getState().replaceAll(gs.inventory);
  if (gs.darkThread) useDarkThreadStore.getState().replaceAll(gs.darkThread);
  if (gs.keywords) useKeywordStore.getState().replaceAll(gs.keywords);
  if (gs.variables) useVariableStore.getState().replaceAll(gs.variables);
  if (gs.macroVars) useTavernHelperStore.getState().setMacroVars(gs.macroVars);
}

export function clearAllGameState() {
  useInventoryStore.getState().clearAll();
  useDarkThreadStore.getState().clearAll();
  useVariableStore.getState().clearAll();
  useTavernHelperStore.getState().setMacroVars({});
  useLorebookStore.getState().clearSummaryEntries();
  useKeywordStore.getState().replaceAll({});
}

export function cleanupOrphanGameState() {
  const { sessions, activeId } = useChatStore.getState();
  if (sessions.length === 0 || !activeId) {
    clearAllGameState();
    return;
  }
  const sessionExists = sessions.some((s) => s.id === activeId);
  if (!sessionExists) {
    clearAllGameState();
  }
}

/**
 * 将书本 store 当前页面同步保存到活跃会话存档。
 * 手动增删改页面（删除页、编辑页等绕过 useChatPipeline 的操作）后必须调用，
 * 否则改动只停留在内存书本里，回主菜单/读档时会被会话里的旧页面覆盖。
 */
export function persistActivePages() {
  useChatStore.getState().savePages(useBookStore.getState().pages);
}

/**
 * 将书本页面 + 完整游戏状态（角色/物品/暗线/关键词/变量/宏变量）快照写回活跃会话存档。
 * 删除页面并撤销其物品变化后必须调用，否则读档时会从旧 gameState 复活已撤销的物品。
 * variables/macroVars 纳入快照，确保它们按会话隔离、不跨对话泄漏。
 */
export function persistActiveGameState() {
  useChatStore.getState().saveGameState(useBookStore.getState().pages, {
    character: useCharSheetStore.getState().sheet ?? undefined,
    inventory: useInventoryStore.getState().items,
    darkThread: useDarkThreadStore.getState().entries,
    keywords: useKeywordStore.getState().keywords,
    variables: useVariableStore.getState().variables,
    macroVars: useTavernHelperStore.getState().macroVars,
  });
}
