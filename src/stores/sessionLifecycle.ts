import { useChatStore } from './useChatStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useInventoryStore, normalizeItems } from './useInventoryStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeywordStore } from './useKeywordStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useTavernHelperStore } from './useTavernHelperStore';
import { useLorebookStore } from './useLorebookStore';
import type { GameVariable } from '../types';
import {
  db,
  type ConversationRow,
  type PageRow,
  type InventoryRow,
  type DarkThreadRow,
  type KeywordRow,
  type GameVarRow,
  type MacroVarRow,
} from '../db/database';


/**
 * 恢复某会话的完整游戏态。Dexie v2：从关系表加载（pages + 6 个 gameState 域），
 * 而非从已废弃的 chat blob gameState 字段读取。委托 loadConversation。
 */
export function restoreSessionGameState(sessionId: string): Promise<void> {
  return loadConversation(sessionId);
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

// ===== Dexie v2 relational persistence =====

/**
 * 将当前内存态（书本页面 + 6 个 gameState 域 + 会话元数据）快照写入关系表。
 * 单个 rw 事务覆盖所有子表，保证一致性。子表用「先删后 bulkPut」——bulkPut 不会移除已删行。
 * charsheets 用 put（每会话一行）。conversations 行同步 name/presetId/lorebookIds/messages/pageCount/updatedAt。
 */
export async function saveConversation(cid: string): Promise<void> {
  if (!cid) return;
  const session = useChatStore.getState().sessions.find((s) => s.id === cid);
  if (!session) return;

  const pages = useBookStore.getState().pages;
  const sheet = useCharSheetStore.getState().sheet;
  const items = useInventoryStore.getState().items;
  const entries = useDarkThreadStore.getState().entries;
  const keywords = useKeywordStore.getState().keywords;
  const variables = useVariableStore.getState().variables;
  const macroVars = useTavernHelperStore.getState().macroVars;

  const pageRows: PageRow[] = pages.map((page, index) => ({ ...page, conversationId: cid, index }));
  const inventoryRows: InventoryRow[] = items.map((item) => ({ ...item, conversationId: cid, itemId: item.id }));
  const darkThreadRows: DarkThreadRow[] = entries.map((entry) => ({ ...entry, conversationId: cid, entryId: entry.id }));
  const keywordRows: KeywordRow[] = Object.entries(keywords).map(([word, meaning]) => ({ conversationId: cid, word, meaning }));
  const gameVarRows: GameVarRow[] = Object.entries(variables).map(([name, variable]) => ({ ...variable, conversationId: cid, name }));
  const macroVarRows: MacroVarRow[] = Object.entries(macroVars).map(([name, value]) => ({ conversationId: cid, name, value }));

  const conversationRow: ConversationRow = {
    id: cid,
    name: session.name,
    presetId: session.presetId,
    lorebookIds: session.lorebookIds ?? [],
    messages: session.messages,
    pageCount: pageRows.length,
    createdAt: session.createdAt,
    updatedAt: Date.now(),
  };

  await db.transaction(
    'rw',
    ['conversations', 'pages', 'charsheets', 'inventory', 'darkThreads', 'keywords', 'gameVars', 'macroVars'],
    async () => {
      await db.conversations.put(conversationRow);

      await db.pages.where('conversationId').equals(cid).delete();
      if (pageRows.length > 0) await db.pages.bulkPut(pageRows);

      await db.charsheets.put({ conversationId: cid, sheet });

      await db.inventory.where('conversationId').equals(cid).delete();
      if (inventoryRows.length > 0) await db.inventory.bulkPut(inventoryRows);

      await db.darkThreads.where('conversationId').equals(cid).delete();
      if (darkThreadRows.length > 0) await db.darkThreads.bulkPut(darkThreadRows);

      await db.keywords.where('conversationId').equals(cid).delete();
      if (keywordRows.length > 0) await db.keywords.bulkPut(keywordRows);

      await db.gameVars.where('conversationId').equals(cid).delete();
      if (gameVarRows.length > 0) await db.gameVars.bulkPut(gameVarRows);

      await db.macroVars.where('conversationId').equals(cid).delete();
      if (macroVarRows.length > 0) await db.macroVars.bulkPut(macroVarRows);
    },
  );

  // 同步内存会话的 pageCount，供会话列表展示（不触发 pages 持久化——pages 已入关系表）。
  useChatStore.getState().savePages(pages);
}

/**
 * 从关系表读取某会话的全部子表，先 clearAll 再 replaceAll 进 5 个内存 store + macroVars + variables + 书本页面。
 * load = clear + set，保证不残留上一会话数据。
 */
export async function loadConversation(cid: string): Promise<void> {
  if (!cid) return;

  const [pageRows, charRow, inventoryRows, darkThreadRows, keywordRows, gameVarRows, macroVarRows] = await Promise.all([
    db.pages.where('conversationId').equals(cid).toArray(),
    db.charsheets.get(cid),
    db.inventory.where('conversationId').equals(cid).toArray(),
    db.darkThreads.where('conversationId').equals(cid).toArray(),
    db.keywords.where('conversationId').equals(cid).toArray(),
    db.gameVars.where('conversationId').equals(cid).toArray(),
    db.macroVars.where('conversationId').equals(cid).toArray(),
  ]);

  // 先清空所有按会话隔离的内存态，杜绝跨对话泄漏。
  clearAllGameState();

  // 书本页面（按 index 排序还原顺序，剥离关系键）
  const pages = pageRows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ conversationId: _cid, index: _index, ...page }) => page);
  useBookStore.getState().setPages(pages);

  // 角色卡
  if (charRow) useCharSheetStore.getState().setSheet(charRow.sheet);

  // 物品栏（剥离关系键，normalizeItems 由 replaceAll 内部处理）
  const items = inventoryRows.map(({ conversationId: _cid, itemId: _itemId, ...item }) => item);
  useInventoryStore.getState().replaceAll(normalizeItems(items));

  // 暗线
  const entries = darkThreadRows.map(({ conversationId: _cid, entryId: _entryId, ...entry }) => entry);
  useDarkThreadStore.getState().replaceAll(entries);

  // 关键词
  const keywords: Record<string, string> = {};
  for (const row of keywordRows) keywords[row.word] = row.meaning;
  useKeywordStore.getState().replaceAll(keywords);

  // MVU 变量
  const variables: Record<string, GameVariable> = {};
  for (const { conversationId: _cid, name, ...variable } of gameVarRows) {
    variables[name] = { ...variable, name };
  }
  useVariableStore.getState().replaceAll(variables);

  // 宏变量
  const macroVars: Record<string, string> = {};
  for (const row of macroVarRows) macroVars[row.name] = row.value;
  useTavernHelperStore.getState().setMacroVars(macroVars);

  // 同步内存会话的 pages/pageCount，供 getActivePages 与会话列表使用。
  useChatStore.getState().setActive(cid);
  useChatStore.getState().savePages(pages);
}

/**
 * 范围删除某会话的全部子表 + pages + conversations 行，单事务。
 */
export async function deleteConversation(cid: string): Promise<void> {
  if (!cid) return;
  await db.transaction(
    'rw',
    ['conversations', 'pages', 'charsheets', 'inventory', 'darkThreads', 'keywords', 'gameVars', 'macroVars'],
    async () => {
      await db.conversations.delete(cid);
      await db.pages.where('conversationId').equals(cid).delete();
      await db.charsheets.delete(cid);
      await db.inventory.where('conversationId').equals(cid).delete();
      await db.darkThreads.where('conversationId').equals(cid).delete();
      await db.keywords.where('conversationId').equals(cid).delete();
      await db.gameVars.where('conversationId').equals(cid).delete();
      await db.macroVars.where('conversationId').equals(cid).delete();
    },
  );
}

// ===== Switch mutex =====
// 串行化会话切换：save(prev) → setActive(next) → load(next)。
// 链式 promise 保证不会并发；latest-wins 守卫确保只加载最后请求的目标；.catch 保持链存活。
let switchChain: Promise<void> = Promise.resolve();
let pendingTarget: string | null = null;

export function switchConversation(id: string): Promise<void> {
  pendingTarget = id;
  switchChain = switchChain
    .catch(() => {
      // 上一次切换若失败，吞掉错误以保持链存活
    })
    .then(async () => {
      // latest-wins：若已有更晚的切换请求，跳过本次 load
      if (pendingTarget !== id) return;

      const prevId = useChatStore.getState().activeId;
      if (prevId && prevId !== id) {
        await saveConversation(prevId);
      }
      // 再次检查 latest-wins（save 期间可能又来新请求）
      if (pendingTarget !== id) return;

      useChatStore.getState().setActive(id);
      await loadConversation(id);
    });
  return switchChain;
}

/**
 * 将书本 store 当前页面同步保存到活跃会话存档（关系表）。
 * 手动增删改页面（删除页、编辑页等绕过 useChatPipeline 的操作）后必须调用，
 * 否则改动只停留在内存书本里，回主菜单/读档时会被关系表里的旧页面覆盖。
 * 现委托 saveConversation 全量快照（pages + gameState 一并落库）。
 */
export function persistActivePages(): Promise<void> {
  const activeId = useChatStore.getState().activeId;
  if (!activeId) {
    // 无活跃会话时退化为仅同步内存（保留旧测试行为）
    useChatStore.getState().savePages(useBookStore.getState().pages);
    return Promise.resolve();
  }
  // 先同步内存 pages，再全量快照到关系表
  useChatStore.getState().savePages(useBookStore.getState().pages);
  return saveConversation(activeId);
}

/**
 * 将书本页面 + 完整游戏状态（角色/物品/暗线/关键词/变量/宏变量）快照写回活跃会话存档。
 * 删除页面并撤销其物品变化后必须调用，否则读档时会从旧 gameState 复活已撤销的物品。
 * 现委托 saveConversation 全量快照。
 */
export function persistActiveGameState(): Promise<void> {
  const activeId = useChatStore.getState().activeId;
  // 同步内存会话的 pages/pageCount（供会话列表展示），再全量快照到关系表。
  // gameState 各域已是 live store 内存态，saveConversation 直接从中读取。
  useChatStore.getState().savePages(useBookStore.getState().pages);
  if (!activeId) return Promise.resolve();
  return saveConversation(activeId);
}
