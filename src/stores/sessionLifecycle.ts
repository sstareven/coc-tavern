import { useChatStore } from './useChatStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useInventoryStore } from './useInventoryStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeywordStore } from './useKeywordStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useLorebookStore } from './useLorebookStore';

export function restoreSessionGameState(sessionId: string) {
  const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
  if (!session) return;

  if (session.pages.length > 0) {
    useBookStore.getState().setPages(session.pages);
  }

  const gs = session.gameState;
  if (!gs) return;

  if (gs.character) useCharSheetStore.getState().setSheet(gs.character);
  if (gs.inventory) useInventoryStore.getState().replaceAll(gs.inventory);
  if (gs.darkThread) useDarkThreadStore.getState().replaceAll(gs.darkThread);
  if (gs.keywords) useKeywordStore.getState().replaceAll(gs.keywords);
}

export function clearAllGameState() {
  useInventoryStore.getState().clearAll();
  useDarkThreadStore.getState().clearAll();
  useVariableStore.getState().clearAll();
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
 * 将书本页面 + 完整游戏状态（角色/物品/暗线/关键词）快照写回活跃会话存档。
 * 删除页面并撤销其物品变化后必须调用，否则读档时会从旧 gameState 复活已撤销的物品。
 */
export function persistActiveGameState() {
  useChatStore.getState().saveGameState(useBookStore.getState().pages, {
    character: useCharSheetStore.getState().sheet ?? undefined,
    inventory: useInventoryStore.getState().items,
    darkThread: useDarkThreadStore.getState().entries,
    keywords: useKeywordStore.getState().keywords,
  });
}
