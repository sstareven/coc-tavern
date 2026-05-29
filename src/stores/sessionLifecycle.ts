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
