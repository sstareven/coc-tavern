import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type {
  BookPage,
  ChatMessage,
  CharacterSheet,
  InventoryItem,
  GameVariable,
  Clue,
  NpcProfile,
  MapLocation,
  MapEdge,
  LocationElement,
  KeyPillar,
  PlotAnchors,
  Encounter,
} from '../types';
import type { DarkThreadEntry, BadEnding } from '../stores/useDarkThreadStore';

// ===== KV (legacy single-table blob store; v1, unchanged in v2) =====
interface KVRecord {
  key: string;
  value: string;
}

// ===== Relational row shapes (v2) =====
// Conversation metadata. Pages + gameState domains live in child tables.
export interface ConversationRow {
  id: string;
  name: string;
  presetId: string | null;
  lorebookIds: string[];
  messages: ChatMessage[];
  /** Denormalized count of rows in the `pages` table for this conversation. */
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

// One storybook page. Compound primary key [conversationId+index].
export type PageRow = { conversationId: string; index: number } & BookPage;

// COC character sheet, one per conversation. Primary key conversationId.
export interface CharsheetRow {
  conversationId: string;
  sheet: CharacterSheet;
}

// One inventory item. Compound primary key [conversationId+itemId].
export type InventoryRow = { conversationId: string; itemId: string } & InventoryItem;

// One dark-thread entry. Compound primary key [conversationId+entryId].
export type DarkThreadRow = { conversationId: string; entryId: string } & DarkThreadEntry;

// One keyword definition. Compound primary key [conversationId+word].
export interface KeywordRow {
  conversationId: string;
  word: string;
  meaning: string;
}

// One MVU game variable. Compound primary key [conversationId+name].
export type GameVarRow = { conversationId: string; name: string } & GameVariable;

// One clue (independent clue library). Compound primary key [conversationId+clueId].
export type ClueRow = { conversationId: string; clueId: string } & Clue;

// One NPC profile. Compound primary key [conversationId+npcId].
export type NpcRow = { conversationId: string; npcId: string } & NpcProfile;

// One map location node. Compound primary key [conversationId+locationId].
export type MapLocationRow = { conversationId: string; locationId: string } & MapLocation;

// One map edge. Compound primary key [conversationId+edgeId].
export type MapEdgeRow = { conversationId: string; edgeId: string } & MapEdge;

// One location element. Compound primary key [conversationId+elementId].
export type LocationElementRow = { conversationId: string; elementId: string } & LocationElement;

// One TavernHelper macro variable. Compound primary key [conversationId+name].
export interface MacroVarRow {
  conversationId: string;
  name: string;
  value: string;
}

// 本局坏结局，一行/会话。主键 conversationId（与 charsheets 同范式的单行表）。
export interface DarkEndingRow {
  conversationId: string;
  ending: BadEnding;
}

// 拯救世界系统：本局真相支柱 + 拯救模式，一行/会话（守秘人机密）。
export interface KeyClueRow {
  conversationId: string;
  pillars: KeyPillar[];
  saveWorldMode: boolean;
}

// 本局剧情蓝图（骨架+约束+威胁依赖），一行/会话（守秘人机密，开局生成）。
export interface PlotAnchorRow {
  conversationId: string;
  anchors: PlotAnchors;
}

// 进行中战斗（一行/会话；脱战后删行、内容固化进 BookPage.combatLog）。
export interface CombatRow {
  conversationId: string;
  encounter: Encounter;
}

export const db = new Dexie('abyssal_archive') as Dexie & {
  kvStore: EntityTable<KVRecord, 'key'>;
  conversations: EntityTable<ConversationRow, 'id'>;
  pages: EntityTable<PageRow>;
  charsheets: EntityTable<CharsheetRow, 'conversationId'>;
  inventory: EntityTable<InventoryRow>;
  darkThreads: EntityTable<DarkThreadRow>;
  keywords: EntityTable<KeywordRow>;
  gameVars: EntityTable<GameVarRow>;
  macroVars: EntityTable<MacroVarRow>;
  clues: EntityTable<ClueRow>;
  npcProfiles: EntityTable<NpcRow>;
  mapLocations: EntityTable<MapLocationRow>;
  mapEdges: EntityTable<MapEdgeRow>;
  locationElements: EntityTable<LocationElementRow>;
  darkEndings: EntityTable<DarkEndingRow, 'conversationId'>;
  keyClues: EntityTable<KeyClueRow, 'conversationId'>;
  plotAnchors: EntityTable<PlotAnchorRow, 'conversationId'>;
  combat: EntityTable<CombatRow, 'conversationId'>;
};

db.version(1).stores({
  kvStore: '&key',
});

/** v2 schema definition. Exported so tests can build isolated DB instances
 *  that reproduce the exact same store layout + upgrade hook. */
export const V2_SCHEMA = {
  kvStore: '&key', // unchanged
  conversations: '&id, updatedAt',
  pages: '[conversationId+index], conversationId',
  charsheets: '&conversationId',
  inventory: '[conversationId+itemId], conversationId',
  darkThreads: '[conversationId+entryId], conversationId',
  keywords: '[conversationId+word], conversationId',
  gameVars: '[conversationId+name], conversationId',
  macroVars: '[conversationId+name], conversationId',
} as const;

db.version(2).stores(V2_SCHEMA).upgrade(upgradeV2);

/** v3: 新增独立线索库表（新表，无数据迁移）。 */
export const V3_SCHEMA = {
  ...V2_SCHEMA,
  clues: '[conversationId+clueId], conversationId',
} as const;

db.version(3).stores(V3_SCHEMA);

/** v4: 新增 NPC 档案表（新表，无数据迁移）。 */
export const V4_SCHEMA = {
  ...V3_SCHEMA,
  npcProfiles: '[conversationId+npcId], conversationId',
} as const;

db.version(4).stores(V4_SCHEMA);

/** v5: 新增地图地点/连线表（新表，无数据迁移）。 */
export const V5_SCHEMA = {
  ...V4_SCHEMA,
  mapLocations: '[conversationId+locationId], conversationId',
  mapEdges: '[conversationId+edgeId], conversationId',
} as const;

db.version(5).stores(V5_SCHEMA);

/** v6: 新增「坏结局」单行表（一行/会话，无数据迁移）。 */
export const V6_SCHEMA = {
  ...V5_SCHEMA,
  darkEndings: '&conversationId',
} as const;

db.version(6).stores(V6_SCHEMA);

/** v7: 新增「地点元素」表（新表，无数据迁移）。 */
export const V7_SCHEMA = {
  ...V6_SCHEMA,
  locationElements: '[conversationId+elementId], conversationId',
} as const;

db.version(7).stores(V7_SCHEMA);

/** v8: 新增「拯救世界」关键线索/真相支柱单行表（一行/会话，无数据迁移）。 */
export const V8_SCHEMA = {
  ...V7_SCHEMA,
  keyClues: '&conversationId',
} as const;

db.version(8).stores(V8_SCHEMA);

/** v9: 新增「剧情锚点」单行表（一行/会话，无数据迁移）。 */
export const V9_SCHEMA = {
  ...V8_SCHEMA,
  plotAnchors: '&conversationId',
} as const;

db.version(9).stores(V9_SCHEMA);

/** v10: 新增「进行中战斗」单行表（无数据迁移）。 */
export const V10_SCHEMA = {
  ...V9_SCHEMA,
  combat: '&conversationId',
} as const;

db.version(10).stores(V10_SCHEMA);

export const V2_UPGRADE_FAILED = '_v2_upgrade_failed';

// Minimal shapes for parsing the legacy persisted blobs.
interface LegacyGameState {
  character?: CharacterSheet;
  inventory?: InventoryItem[];
  darkThread?: DarkThreadEntry[];
  keywords?: Record<string, string>;
  variables?: Record<string, GameVariable>;
  macroVars?: Record<string, string>;
}

interface LegacyChatSession {
  id: string;
  name: string;
  messages?: ChatMessage[];
  pages?: BookPage[];
  presetId?: string | null;
  lorebookIds?: string[];
  createdAt?: number;
  updatedAt?: number;
  gameState?: LegacyGameState;
}

interface PersistEnvelope<T> {
  state?: T;
  version?: number;
}

function parseEnvelope<T>(raw: string | undefined): T | null {
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as PersistEnvelope<T> | T;
    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      return ((parsed as PersistEnvelope<T>).state ?? null) as T | null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * v1 -> v2 upgrade: explode the `coc_chat_v1` blob (and per-session gameState)
 * into relational tables. Per-session gameState WINS ??standalone residual
 * blobs (coc_character / coc_darkthread_v1 / coc_keywords_v1) are last-active
 * leftovers and are intentionally NOT used as a source of truth here.
 *
 * Idempotent (rewrites the same rows from the same source blob on re-run),
 * never deletes the source blobs, and records `_v2_upgrade_failed` in kvStore
 * if anything throws so callers can detect a partial migration.
 */
export async function upgradeV2(tx: Transaction): Promise<void> {
  try {
    const kv = tx.table<KVRecord, string>('kvStore');
    const chatRec = await kv.get('coc_chat_v1');
    const chat = parseEnvelope<{ sessions?: LegacyChatSession[] }>(chatRec?.value);
    const sessions = chat?.sessions;
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    const conversations = tx.table<ConversationRow, string>('conversations');
    const pages = tx.table<PageRow>('pages');
    const charsheets = tx.table<CharsheetRow, string>('charsheets');
    const inventory = tx.table<InventoryRow>('inventory');
    const darkThreads = tx.table<DarkThreadRow>('darkThreads');
    const keywords = tx.table<KeywordRow>('keywords');
    const gameVars = tx.table<GameVarRow>('gameVars');
    const macroVars = tx.table<MacroVarRow>('macroVars');

    for (const session of sessions) {
      if (!session || typeof session.id !== 'string') continue;
      const cid = session.id;
      const now = Date.now();

      const pageList = Array.isArray(session.pages) ? session.pages : [];
      const pageRows: PageRow[] = pageList.map((page, index) => ({
        ...page,
        conversationId: cid,
        index,
      }));

      await conversations.put({
        id: cid,
        name: typeof session.name === 'string' ? session.name : '',
        presetId: session.presetId ?? null,
        lorebookIds: Array.isArray(session.lorebookIds) ? session.lorebookIds : [],
        messages: Array.isArray(session.messages) ? session.messages : [],
        pageCount: pageRows.length,
        createdAt: typeof session.createdAt === 'number' ? session.createdAt : now,
        updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : now,
      });

      await pages.where('conversationId').equals(cid).delete();
      if (pageRows.length > 0) await pages.bulkPut(pageRows);

      const gs = session.gameState;

      // charsheet (one per conversation; put = upsert)
      if (gs?.character) {
        await charsheets.put({ conversationId: cid, sheet: gs.character });
      } else {
        await charsheets.delete(cid);
      }

      // inventory
      await inventory.where('conversationId').equals(cid).delete();
      if (Array.isArray(gs?.inventory) && gs.inventory.length > 0) {
        const rows: InventoryRow[] = gs.inventory.map((item) => ({
          ...item,
          conversationId: cid,
          itemId: item.id,
        }));
        await inventory.bulkPut(rows);
      }

      // darkThreads
      await darkThreads.where('conversationId').equals(cid).delete();
      if (Array.isArray(gs?.darkThread) && gs.darkThread.length > 0) {
        const rows: DarkThreadRow[] = gs.darkThread.map((entry) => ({
          ...entry,
          conversationId: cid,
          entryId: entry.id,
        }));
        await darkThreads.bulkPut(rows);
      }

      // keywords
      await keywords.where('conversationId').equals(cid).delete();
      if (gs?.keywords) {
        const rows: KeywordRow[] = Object.entries(gs.keywords).map(([word, meaning]) => ({
          conversationId: cid,
          word,
          meaning,
        }));
        if (rows.length > 0) await keywords.bulkPut(rows);
      }

      // gameVars (MVU variables)
      await gameVars.where('conversationId').equals(cid).delete();
      if (gs?.variables) {
        const rows: GameVarRow[] = Object.entries(gs.variables).map(([name, variable]) => ({
          ...variable,
          conversationId: cid,
          name,
        }));
        if (rows.length > 0) await gameVars.bulkPut(rows);
      }

      // macroVars (TavernHelper /set variables)
      await macroVars.where('conversationId').equals(cid).delete();
      if (gs?.macroVars) {
        const rows: MacroVarRow[] = Object.entries(gs.macroVars).map(([name, value]) => ({
          conversationId: cid,
          name,
          value,
        }));
        if (rows.length > 0) await macroVars.bulkPut(rows);
      }
    }
  } catch (err) {
    console.error('[DB] v2 upgrade failed:', err);
    try {
      await tx.table<KVRecord, string>('kvStore').put({
        key: V2_UPGRADE_FAILED,
        value: 'true',
      });
    } catch {
      // best-effort flag; swallow secondary failure
    }
    // Re-throw so Dexie ABORTS the version transaction: the v2 schema bump is
    // NOT committed (verno stays 1), every partial relational write is rolled
    // back, and the source coc_chat_v1 blob is preserved. The upgrade hook then
    // re-runs on the next db.open(), converting a permanent silent partial
    // migration into a safe, idempotent retry. The flag write above rolls back
    // with the rest of the transaction; the binding failure signal is the
    // un-advanced version, not the (best-effort) flag.
    throw err;
  }
}
