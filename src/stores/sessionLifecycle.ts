import { useChatStore } from './useChatStore';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
import { useInventoryStore, normalizeItems } from './useInventoryStore';
import { useClueStore } from './useClueStore';
import { useNpcStore } from './useNpcStore';
import { useMapStore } from './useMapStore';
import { useLocationElementStore } from './useLocationElementStore';
import { useKeyClueStore } from './useKeyClueStore';
import { useAnchorStore } from './useAnchorStore';
import { useCombatStore, isOrphanedEncounter } from './useCombatStore';
import { useDiceStore } from './useDiceStore';
import { useChoiceLockStore } from './useChoiceLockStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeywordStore } from './useKeywordStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { createInitialStatData } from '../sillytavern/mvu-initial-statdata';
import { useTavernHelperStore } from './useTavernHelperStore';
import { useLorebookStore } from './useLorebookStore';
import { isCharsheetPath } from '../sillytavern/mvu-charsheet-redirect';
import { getTreePath, setTreePath } from '../sillytavern/mvu-var-access';
import { clearAllDiagnostics, clearDiagnosticsFor } from '../sillytavern/prefix-cache-diagnostics';
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
  type ClueRow,
  type NpcRow,
  type MapLocationRow,
  type MapEdgeRow,
  type LocationElementRow,
} from '../db/database';

/** Reserved gameVars row name holding the MVU statData nested tree as a JSON blob. */
const STAT_DATA_ROW_NAME = '__statData__';

/**
 * 清空所有按会话隔离的内存态。P0-1：角色卡也必须重置为 defaultSheet——
 * 否则切到无角色卡行的会话时残留上一会话角色（且后续 save 会把它写进当前会话行 = 数据污染）。
 */
export function clearAllGameState() {
  useCharSheetStore.getState().setSheet(defaultSheet);
  useCharSheetStore.getState().close();
  useInventoryStore.getState().clearAll();
  useInventoryStore.getState().close();
  useClueStore.getState().clearAll();
  useNpcStore.getState().clearAll();
  useNpcStore.getState().close();
  useMapStore.getState().clearAll();
  useMapStore.getState().close();
  useLocationElementStore.getState().clearAll();
  useDiceStore.getState().clearAll();
  useChoiceLockStore.getState().unlock();
  useDarkThreadStore.getState().clearAll();
  useKeyClueStore.getState().clearAll();
  useAnchorStore.getState().clearAll();
  useCombatStore.getState().clearAll();
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

/**
 * 开新会话的【权威入口】：清空所有按会话隔离的内存态 → 创建新会话（createSession 内部自动设为活跃）。
 *
 * 隔离不变量集中在此一处，杜绝调用方逐个手动清空时漏掉某个 store——历史上 CharacterCreator 漏清了
 * clues/npc/map、ChatlistPanel 什么都没清，导致「正玩存档A时开新游戏B，B 继承了 A 的线索/名册/地图」
 * 的跨档泄漏（两档物理上存了同一份被污染数据，切档看似没切）。
 *
 * 注：上一会话的数据已由每回合 auto-save（persistActiveGameState）持久化到关系表，此处【刻意不再快照
 * 上一会话】——若先 enqueue 保存旧会话、再同步 clearAllGameState，被入队的保存会在 clear 之后才执行、
 * 读到已清空的内存 → 反而把旧存档清空。故只清不存，与既有 new-game 语义一致。
 */
export function startNewConversation(name: string): string {
  clearAllGameState();
  clearAllDiagnostics(); // 旧 sessionId 的前缀诊断快照对新游戏无意义,清掉防 stateBySession Map 累积
  // 种子化世界/剧情/暗线 statData 树——否则 LLM 的 世界.*、剧情.暗线.* JSONPatch replace 会因 path 不存在而失败。
  // 覆盖所有新开局路径(含 ChatlistPanel「新建对话」);CharacterCreator 之后的显式 setStatData 仍幂等。
  useVariableStore.getState().setStatData(createInitialStatData());
  return useChatStore.getState().createSession(name);
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
  const clues = useClueStore.getState().clues;
  const npcs = Object.values(useNpcStore.getState().profiles);
  const mapState = useMapStore.getState();
  const locationElements = useLocationElementStore.getState().elements;
  const entries = useDarkThreadStore.getState().entries;
  const badEnding = useDarkThreadStore.getState().badEnding;
  const keyClueState = useKeyClueStore.getState();
  const anchorState = useAnchorStore.getState();
  const combatEncounter = useCombatStore.getState().encounter;
  const keywords = useKeywordStore.getState().keywords;
  const variables = useVariableStore.getState().variables;
  const statData = useVariableStore.getState().statData;
  const macroVars = useTavernHelperStore.getState().macroVars;

  const pageRows: PageRow[] = pages.map((page, index) => ({ ...page, conversationId: cid, index }));
  const inventoryRows: InventoryRow[] = items.map((item) => ({ ...item, conversationId: cid, itemId: item.id }));
  const clueRows: ClueRow[] = clues.map((clue) => ({ ...clue, conversationId: cid, clueId: clue.id }));
  const npcRows: NpcRow[] = npcs.map((npc) => ({ ...npc, conversationId: cid, npcId: npc.id }));
  const mapLocationRows: MapLocationRow[] = mapState.locations.map((l) => ({ ...l, conversationId: cid, locationId: l.id }));
  const mapEdgeRows: MapEdgeRow[] = mapState.edges.map((e) => ({ ...e, conversationId: cid, edgeId: e.id }));
  const locationElementRows: LocationElementRow[] = locationElements.map((el) => ({ ...el, conversationId: cid, elementId: el.id }));
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
    ['conversations', 'pages', 'charsheets', 'inventory', 'clues', 'npcProfiles', 'mapLocations', 'mapEdges', 'locationElements', 'darkThreads', 'darkEndings', 'keyClues', 'plotAnchors', 'combat', 'keywords', 'gameVars', 'macroVars'],
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

      await db.clues.where('conversationId').equals(cid).delete();
      if (clueRows.length > 0) await db.clues.bulkPut(clueRows);

      await db.npcProfiles.where('conversationId').equals(cid).delete();
      if (npcRows.length > 0) await db.npcProfiles.bulkPut(npcRows);

      await db.mapLocations.where('conversationId').equals(cid).delete();
      if (mapLocationRows.length > 0) await db.mapLocations.bulkPut(mapLocationRows);

      await db.mapEdges.where('conversationId').equals(cid).delete();
      if (mapEdgeRows.length > 0) await db.mapEdges.bulkPut(mapEdgeRows);

      await db.locationElements.where('conversationId').equals(cid).delete();
      if (locationElementRows.length > 0) await db.locationElements.bulkPut(locationElementRows);

      await db.darkThreads.where('conversationId').equals(cid).delete();
      if (darkThreadRows.length > 0) await db.darkThreads.bulkPut(darkThreadRows);

      // 坏结局（单行/会话）：有则 put，无则删除任何残留行（与 charsheets 同范式）。
      if (badEnding) {
        await db.darkEndings.put({ conversationId: cid, ending: badEnding });
      } else {
        await db.darkEndings.delete(cid);
      }

      // 拯救世界：有支柱则 put（守秘人机密单行），无则删残留行（与 darkEndings 同范式）。
      if (keyClueState.pillars.length > 0) {
        await db.keyClues.put({ conversationId: cid, pillars: keyClueState.pillars, saveWorldMode: keyClueState.saveWorldMode });
      } else {
        await db.keyClues.delete(cid);
      }

      // 剧情锚点（单行/会话）：有节点则 put，无则删残留行。
      if (anchorState.anchors.nodes.length > 0) {
        await db.plotAnchors.put({ conversationId: cid, anchors: anchorState.anchors });
      } else {
        await db.plotAnchors.delete(cid);
      }

      // 进行中战斗（单行/会话）：有 encounter 则 put（半成品保留），无则删残留行。
      if (combatEncounter) {
        await db.combat.put({ conversationId: cid, encounter: combatEncounter });
      } else {
        await db.combat.delete(cid);
      }

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

  // 先清空所有按会话隔离的内存态，杜绝跨对话泄漏——【必须在任何 DB 读取之前】：
  // 若读取事务抛错（DB 损坏/迁移不全），clearAllGameState 仍已执行，不会残留上一会话内存态。
  // 同步把 activeId 切到目标会话，使「已清空内存 ↔ activeId」形成原子步：即便随后的读事务抛错，
  // 内存(空)与 activeId(=cid) 仍一致，不会出现「activeId 指向旧会话、内存却已清空」的撕裂。
  clearAllGameState();
  useChatStore.getState().setActive(cid);

  // P1-4：7 个读包在单一只读事务里，杜绝读偏斜（并发写在两读之间提交会产生跨域不一致快照）。
  const [pageRows, charRow, inventoryRows, clueRows, npcRows, mapLocationRows, mapEdgeRows, locationElementRows, darkThreadRows, darkEndingRow, keyClueRow, plotAnchorRow, combatRow, keywordRows, gameVarRows, macroVarRows] =
    await db.transaction(
      'r',
      ['pages', 'charsheets', 'inventory', 'clues', 'npcProfiles', 'mapLocations', 'mapEdges', 'locationElements', 'darkThreads', 'darkEndings', 'keyClues', 'plotAnchors', 'combat', 'keywords', 'gameVars', 'macroVars'],
      async () =>
        Promise.all([
          db.pages.where('conversationId').equals(cid).toArray(),
          db.charsheets.get(cid),
          db.inventory.where('conversationId').equals(cid).toArray(),
          db.clues.where('conversationId').equals(cid).toArray(),
          db.npcProfiles.where('conversationId').equals(cid).toArray(),
          db.mapLocations.where('conversationId').equals(cid).toArray(),
          db.mapEdges.where('conversationId').equals(cid).toArray(),
          db.locationElements.where('conversationId').equals(cid).toArray(),
          db.darkThreads.where('conversationId').equals(cid).toArray(),
          db.darkEndings.get(cid),
          db.keyClues.get(cid),
          db.plotAnchors.get(cid),
          db.combat.get(cid),
          db.keywords.where('conversationId').equals(cid).toArray(),
          db.gameVars.where('conversationId').equals(cid).toArray(),
          db.macroVars.where('conversationId').equals(cid).toArray(),
        ]),
    );

  // 书本页面（按 index 排序还原顺序，剥离关系键）
  const pages = pageRows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ conversationId: _cid, index: _index, ...page }) => page);
  useBookStore.getState().setPages(pages);

  // 检定历史：从各页 diceResults 重建（newest-first），并补上页码（与实时游戏 pageIndex+1 编号一致），
  // 使「检定记录」面板随存档持久、与页面一致且带页码。
  useDiceStore.getState().setHistory(
    pages.flatMap((p, i) => (p.diceResults ?? []).map((r) => ({ ...r, page: r.page ?? i + 1 }))).reverse(),
  );

  // 剧情摘要（小总结）：clearAllGameState 已清空全局 __auto_summaries 书，这里从本会话页面
  // 重建摘要条目——否则切档后旧会话的「剧情回顾」上下文永久丢失（摘要本是 page.summary 的派生投影）。
  // 生成逻辑与 useChatPipeline 每回合写摘要处保持一致。
  rebuildSummariesFromPages(pages);

  // 角色卡：P0-1 无条件设置——无行则回退默认卡，杜绝残留上一会话角色。
  useCharSheetStore.getState().setSheet(charRow?.sheet ?? defaultSheet);

  // 物品栏（剥离关系键，normalizeItems 由 replaceAll 内部处理）
  const items = inventoryRows.map(({ conversationId: _cid, itemId: _itemId, ...item }) => item);
  useInventoryStore.getState().replaceAll(normalizeItems(items));

  // 线索库（剥离关系键）
  const clues = clueRows.map(({ conversationId: _cid, clueId: _clueId, ...clue }) => clue);
  useClueStore.getState().replaceAll(clues);

  // NPC 档案（剥离关系键）
  const npcs = npcRows.map(({ conversationId: _cid, npcId: _npcId, ...npc }) => npc);
  useNpcStore.getState().replaceAll(npcs);

  // 地图（地点 + 连线，剥离关系键）
  const mapLocations = mapLocationRows.map(({ conversationId: _cid, locationId: _lid, ...loc }) => loc);
  const mapEdges = mapEdgeRows.map(({ conversationId: _cid, edgeId: _eid, ...edge }) => edge);
  useMapStore.getState().replaceAll({ locations: mapLocations, edges: mapEdges });

  // 地点元素（剥离关系键）
  const locationElements = locationElementRows.map(({ conversationId: _cid, elementId: _eid, ...el }) => el);
  useLocationElementStore.getState().replaceAll(locationElements);

  // 暗线
  const entries = darkThreadRows.map(({ conversationId: _cid, entryId: _entryId, ...entry }) => entry);
  useDarkThreadStore.getState().replaceAll(entries);
  // 坏结局（单行/会话）：无行则为 null（clearAllGameState 已置 null，此处显式恢复以覆盖切档）。
  useDarkThreadStore.getState().setBadEnding(darkEndingRow?.ending ?? null);
  // 拯救世界：真相支柱 + 拯救模式（无行则空，clearAllGameState 已清，此处显式恢复以覆盖切档）。
  useKeyClueStore.getState().replaceAll(keyClueRow?.pillars ?? [], keyClueRow?.saveWorldMode ?? false);
  // 剧情锚点（单行/会话）：无行则空蓝图（clearAllGameState 已清，此处显式恢复以覆盖切档）。
  useAnchorStore.getState().replaceAll(plotAnchorRow?.anchors ?? { nodes: [], constraints: [], threatDependencies: [] });
  useCombatStore.getState().replaceAll(combatRow?.encounter ?? null);
  // 读档自愈：删页/回溯曾删掉战斗锚定页，使存档里的 encounter 悬空(非空却面板隐形)，
  // 会静默堵死所有进战入口(名册攻击/选项格斗/行动补写)。锚定页已不在现存 pages → 视为脱战清除。
  if (isOrphanedEncounter(useCombatStore.getState().encounter, useBookStore.getState().pages.map((p) => p.id ?? ''))) {
    useCombatStore.getState().clearCombat();
  }

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
      } catch (err) {
        // 损坏则视为空树
        console.warn('[sessionLifecycle] __statData__ blob 解析失败，回退空树:', err);
      }
      continue;
    }
    variables[name] = { ...variable, name };
  }
  // 老存档兼容：legacy flat 点路径变量(世界.*/剧情.* 等叙事状态,非 调查员.*)回灌进 statData 树，
  // 使其在纯 JSON Patch 读路径下仍可读、并被 statData 快照注入；仅当树未含该路径时回灌(blob 优先)。
  for (const [vname, gv] of Object.entries(variables)) {
    if (!vname.includes('.') || isCharsheetPath(vname)) continue;
    if (getTreePath(statData, vname) !== undefined) continue;
    setTreePath(statData, vname, gv.value);
  }
  useVariableStore.getState().replaceAll(variables);
  useVariableStore.getState().setStatData(statData);

  // 地图当前地点：从世界状态(世界.地点)解析，高亮地图网络中对应节点。
  const worldLoc = getTreePath(statData, '世界.地点');
  if (typeof worldLoc === 'string' && worldLoc.trim()) {
    useMapStore.getState().setCurrentByName(worldLoc);
  }

  // 宏变量
  const macroVars: Record<string, string> = {};
  for (const row of macroVarRows) macroVars[row.name] = row.value;
  useTavernHelperStore.getState().setMacroVars(macroVars);

  // 同步内存会话的 pages/pageCount，供 getActivePages 与会话列表使用。
  // （activeId 已在函数开头清空内存后同步设置，此处只需同步 pages。）
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
    ['conversations', 'pages', 'charsheets', 'inventory', 'clues', 'npcProfiles', 'mapLocations', 'mapEdges', 'locationElements', 'darkThreads', 'darkEndings', 'keyClues', 'plotAnchors', 'combat', 'keywords', 'gameVars', 'macroVars'],
    async () => {
      await db.conversations.delete(cid);
      await db.pages.where('conversationId').equals(cid).delete();
      await db.charsheets.delete(cid);
      await db.inventory.where('conversationId').equals(cid).delete();
      await db.clues.where('conversationId').equals(cid).delete();
      await db.npcProfiles.where('conversationId').equals(cid).delete();
      await db.mapLocations.where('conversationId').equals(cid).delete();
      await db.mapEdges.where('conversationId').equals(cid).delete();
      await db.locationElements.where('conversationId').equals(cid).delete();
      await db.darkThreads.where('conversationId').equals(cid).delete();
      await db.darkEndings.delete(cid);
      await db.keyClues.delete(cid);
      await db.plotAnchors.delete(cid);
      await db.combat.delete(cid);
      await db.keywords.where('conversationId').equals(cid).delete();
      await db.gameVars.where('conversationId').equals(cid).delete();
      await db.macroVars.where('conversationId').equals(cid).delete();
    },
  );
  clearDiagnosticsFor(cid); // 释放该会话的前缀诊断快照(违反 session-isolation invariant 的修复)
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
