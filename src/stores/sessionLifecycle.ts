import { useChatStore } from './useChatStore';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
import { useInventoryStore, normalizeItems } from './useInventoryStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeywordStore } from './useKeywordStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useTavernHelperStore } from './useTavernHelperStore';
import { useLorebookStore } from './useLorebookStore';
import type { GameVariable, BookPage } from '../types';
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

/** Reserved gameVars row name holding the MVU statData nested tree as a JSON blob. */
const STAT_DATA_ROW_NAME = '__statData__';

/**
 * 恢复某会话的完整游戏态。Dexie v2：从关系表加载（pages + 6 个 gameState 域），
 * 而非从已废弃的 chat blob gameState 字段读取。委托 loadConversation（已串行化）。
 */
export function restoreSessionGameState(sessionId: string): Promise<void> {
  return loadConversation(sessionId);
}

/**
 * 清空所有按会话隔离的内存态。P0-1：角色卡也必须重置为 defaultSheet——
 * 否则切到无角色卡行的会话时残留上一会话角色（且后续 save 会把它写进当前会话行 = 数据污染）。
 */
export function clearAllGameState() {
  useCharSheetStore.getState().setSheet(defaultSheet);
  useInventoryStore.getState().clearAll();
  useDarkThreadStore.getState().clearAll();
  useVariableStore.getState().clearAll();
  useTavernHelperStore.getState().setMacroVars({});
  useLorebookStore.getState().clearSummaryEntries();
  useKeywordStore.getState().replaceAll({});
  // 书本页面也必须重置——否则删活跃会话(无后续 loadConversation)后旧页面残留,
  // 下次发消息经 buildContextFromPages 注入 LLM = 跨会话混档。回退到全新序章。
  useBookStore.getState().resetToPrologue();
}

/** 从本会话页面重建剧情摘要世界书条目（与 useChatPipeline 每回合写摘要逻辑一致）。
 *  摘要是 page.summary 的派生投影，不单独持久化——切档加载页面后由此重建，
 *  修复「切档清空 __auto_summaries 却从不重建致旧会话剧情回顾丢失」的 bug。 */
function rebuildSummariesFromPages(pages: BookPage[]): void {
  const lore = useLorebookStore.getState();
  for (const page of pages) {
    if (!page.summary || !page.id) continue;
    const keys = page.keywords ? Object.keys(page.keywords).join(', ') : page.leftHeader;
    if (!keys.trim()) continue;
    lore.upsertSummaryEntry(page.id, keys, `[剧情回顾] ${page.summary}`, `摘要: ${page.leftHeader}`);
  }
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

// P1-2: 单一全局序列化链。所有公共 DB 写操作（save/load/delete/switch）经 enqueue() 串行，
// 杜绝交错/撕裂。用单链（而非 per-cid map）是刻意：app 同时只有一个活跃会话，且 cross-cid 操作
// （如切走 A 的同时 delete B）也必须串行，否则 save 重建 delete 刚删的行 = 孤儿复活。
// .catch 保持链存活，单次失败不毒化后续。
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn); // 无论上一步成败都运行
  chain = run.then(() => undefined, () => undefined); // 链本身吞错，避免一次失败毒化整条链
  return run;
}

/**
 * 将当前内存态（书本页面 + 6 个 gameState 域 + 会话元数据）快照写入关系表。
 * 单个 rw 事务覆盖所有子表，保证一致性。子表用「先删后 bulkPut」——bulkPut 不会移除已删行。
 * charsheets：非默认卡 put；默认/空白卡跳过持久化并删除任何残留行（P0-1，避免 load 误覆盖）。
 *
 * Inner（未入队）版本——供 switchConversation 在自身单次 enqueue 内复用，避免双重入队死锁。
 */
async function saveConversationInner(cid: string): Promise<void> {
  if (!cid) return;
  const session = useChatStore.getState().sessions.find((s) => s.id === cid);
  if (!session) return;

  const pages = useBookStore.getState().pages;
  const sheet = useCharSheetStore.getState().sheet;
  const items = useInventoryStore.getState().items;
  const entries = useDarkThreadStore.getState().entries;
  const keywords = useKeywordStore.getState().keywords;
  const variables = useVariableStore.getState().variables;
  const statData = useVariableStore.getState().statData;
  const macroVars = useTavernHelperStore.getState().macroVars;

  const pageRows: PageRow[] = pages.map((page, index) => ({ ...page, conversationId: cid, index }));
  const inventoryRows: InventoryRow[] = items.map((item) => ({ ...item, conversationId: cid, itemId: item.id }));
  const darkThreadRows: DarkThreadRow[] = entries.map((entry) => ({ ...entry, conversationId: cid, entryId: entry.id }));
  const keywordRows: KeywordRow[] = Object.entries(keywords).map(([word, meaning]) => ({ conversationId: cid, word, meaning }));
  const gameVarRows: GameVarRow[] = Object.entries(variables).map(([name, variable]) => ({ ...variable, conversationId: cid, name }));
  // MVU statData (nested narrative tree) persisted as a single reserved blob row.
  if (Object.keys(statData).length > 0) {
    gameVarRows.push({
      conversationId: cid,
      name: STAT_DATA_ROW_NAME,
      value: JSON.stringify(statData),
      locked: false,
      source: 'llm',
      updatedAt: Date.now(),
    });
  }
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

  const sheetIsDefault = isDefaultSheet(sheet);

  await db.transaction(
    'rw',
    ['conversations', 'pages', 'charsheets', 'inventory', 'darkThreads', 'keywords', 'gameVars', 'macroVars'],
    async () => {
      await db.conversations.put(conversationRow);

      await db.pages.where('conversationId').equals(cid).delete();
      if (pageRows.length > 0) await db.pages.bulkPut(pageRows);

      // P0-1：默认/空白角色卡不持久化（避免 load 时误把全 0 卡覆盖到无角色会话）；
      // 已成默认则删除任何残留行。
      if (!sheetIsDefault) {
        await db.charsheets.put({ conversationId: cid, sheet });
      } else {
        await db.charsheets.delete(cid);
      }

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

/** 公共入口：经 enqueue 串行化。 */
export function saveConversation(cid: string): Promise<void> {
  return enqueue(() => saveConversationInner(cid));
}

/**
 * 从关系表读取某会话的全部子表，先 clearAll 再 replaceAll 进 5 个内存 store + macroVars + variables + 书本页面。
 * load = clear + set，保证不残留上一会话数据。
 *
 * Inner（未入队）版本——供 switchConversation 复用。
 */
async function loadConversationInner(cid: string): Promise<void> {
  if (!cid) return;

  // P1-4：7 个读包在单一只读事务里，杜绝读偏斜（并发写在两读之间提交会产生跨域不一致快照）。
  const [pageRows, charRow, inventoryRows, darkThreadRows, keywordRows, gameVarRows, macroVarRows] =
    await db.transaction(
      'r',
      ['pages', 'charsheets', 'inventory', 'darkThreads', 'keywords', 'gameVars', 'macroVars'],
      async () =>
        Promise.all([
          db.pages.where('conversationId').equals(cid).toArray(),
          db.charsheets.get(cid),
          db.inventory.where('conversationId').equals(cid).toArray(),
          db.darkThreads.where('conversationId').equals(cid).toArray(),
          db.keywords.where('conversationId').equals(cid).toArray(),
          db.gameVars.where('conversationId').equals(cid).toArray(),
          db.macroVars.where('conversationId').equals(cid).toArray(),
        ]),
    );

  // 先清空所有按会话隔离的内存态，杜绝跨对话泄漏。
  clearAllGameState();

  // 书本页面（按 index 排序还原顺序，剥离关系键）
  const pages = pageRows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ conversationId: _cid, index: _index, ...page }) => page);
  useBookStore.getState().setPages(pages);

  // 剧情摘要（小总结）：clearAllGameState 已清空全局 __auto_summaries 书，这里从本会话页面
  // 重建摘要条目——否则切档后旧会话的「剧情回顾」上下文永久丢失（摘要本是 page.summary 的派生投影）。
  // 生成逻辑与 useChatPipeline 每回合写摘要处保持一致。
  rebuildSummariesFromPages(pages);

  // 角色卡：P0-1 无条件设置——无行则回退默认卡，杜绝残留上一会话角色。
  useCharSheetStore.getState().setSheet(charRow?.sheet ?? defaultSheet);

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
  let statData: Record<string, unknown> = {};
  for (const { conversationId: _cid, name, ...variable } of gameVarRows) {
    if (name === STAT_DATA_ROW_NAME) {
      // 保留的 statData blob 行:解析回嵌套树,不进扁平 variables。
      try {
        const parsed: unknown = JSON.parse(variable.value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          statData = parsed as Record<string, unknown>;
        }
      } catch { /* 损坏则视为空树 */ }
      continue;
    }
    variables[name] = { ...variable, name };
  }
  useVariableStore.getState().replaceAll(variables);
  useVariableStore.getState().setStatData(statData);

  // 宏变量
  const macroVars: Record<string, string> = {};
  for (const row of macroVarRows) macroVars[row.name] = row.value;
  useTavernHelperStore.getState().setMacroVars(macroVars);

  // 同步内存会话的 pages/pageCount，供 getActivePages 与会话列表使用。
  useChatStore.getState().setActive(cid);
  useChatStore.getState().savePages(pages);
}

/** 公共入口：经 enqueue 串行化。 */
export function loadConversation(cid: string): Promise<void> {
  return enqueue(() => loadConversationInner(cid));
}

/**
 * 范围删除某会话的全部子表 + pages + conversations 行，单事务。
 *
 * Inner（未入队）版本。
 */
async function deleteConversationInner(cid: string): Promise<void> {
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

/** 公共入口：经 enqueue 串行化（与 save/load 共用同一条链，避免 delete 与 save 撕裂）。 */
export function deleteConversation(cid: string): Promise<void> {
  return enqueue(() => deleteConversationInner(cid));
}

// ===== Switch =====
// 串行化会话切换：save(prev) → setActive(next) → load(next)，统一走全局 enqueue 链
// （与 save/load/delete 共用）。latest-wins 守卫确保只加载最后请求的目标。
let pendingTarget: string | null = null;

export function switchConversation(id: string): Promise<void> {
  pendingTarget = id;
  // P1-5：在此同步捕获 prevId——并发的 createSession 会在链外同步改 activeId，
  // 若在 .then 内才读 activeId 会读到那个更新的 id，导致保存错会话（prev 永不保存）。
  const prevId = useChatStore.getState().activeId;
  // 单次 enqueue 覆盖 save(prev)+load(next)，整个切换是一条原子链步；内部用 *Inner（未入队）
  // 版本，避免等待本步已持有的同一条链而自死锁。
  return enqueue(async () => {
    // latest-wins：若已有更晚的切换请求，跳过本次 load
    if (pendingTarget !== id) return;

    if (prevId && prevId !== id) {
      await saveConversationInner(prevId);
    }
    // 再次检查 latest-wins（save 期间可能又来新请求）
    if (pendingTarget !== id) return;

    useChatStore.getState().setActive(id);
    await loadConversationInner(id);
  });
}

/**
 * 将书本 store 当前页面同步保存到活跃会话存档（关系表）。
 * 手动增删改页面（删除页、编辑页等绕过 useChatPipeline 的操作）后必须调用，
 * 否则改动只停留在内存书本里，回主菜单/读档时会被关系表里的旧页面覆盖。
 * 同步更新内存 pages，再经 enqueue 串行化全量快照到关系表。
 */
export function persistActivePages(): Promise<void> {
  const activeId = useChatStore.getState().activeId;
  // 同步更新内存 pages（会话列表/读档依赖 pageCount，保留旧测试可观察行为）
  useChatStore.getState().savePages(useBookStore.getState().pages);
  if (!activeId) return Promise.resolve();
  return saveConversation(activeId);
}

/**
 * 将书本页面 + 完整游戏状态（角色/物品/暗线/关键词/变量/宏变量）快照写回活跃会话存档。
 * 删除页面并撤销其物品变化后必须调用，否则读档时会从旧 gameState 复活已撤销的物品。
 * 现委托 saveConversation 全量快照（经 enqueue 串行化）。
 */
export function persistActiveGameState(): Promise<void> {
  const activeId = useChatStore.getState().activeId;
  // 同步内存会话的 pages/pageCount（供会话列表展示），再全量快照到关系表。
  // gameState 各域已是 live store 内存态，saveConversation 直接从中读取。
  useChatStore.getState().savePages(useBookStore.getState().pages);
  if (!activeId) return Promise.resolve();
  return saveConversation(activeId);
}
