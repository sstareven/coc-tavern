import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { db, V2_SCHEMA, upgradeV2, V2_UPGRADE_FAILED } from './database';

describe('database', () => {
  beforeEach(async () => {
    await db.kvStore.clear();
  });

  it('puts and gets a kvStore record', async () => {
    await db.kvStore.put({ key: 'test', value: 'hello' });
    const rec = await db.kvStore.get('test');
    expect(rec?.value).toBe('hello');
  });

  it('deletes a kvStore record', async () => {
    await db.kvStore.put({ key: 'del', value: 'x' });
    await db.kvStore.delete('del');
    expect(await db.kvStore.get('del')).toBeUndefined();
  });
});

describe('database v2 relational tables', () => {
  beforeEach(async () => {
    await Promise.all([
      db.conversations.clear(),
      db.pages.clear(),
      db.charsheets.clear(),
      db.inventory.clear(),
      db.darkThreads.clear(),
      db.keywords.clear(),
      db.gameVars.clear(),
      db.macroVars.clear(),
    ]);
  });

  it('round-trips a conversation row', async () => {
    await db.conversations.put({
      id: 'c1',
      name: 'Session 1',
      presetId: null,
      lorebookIds: ['lb1'],
      messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
      pageCount: 0,
      createdAt: 10,
      updatedAt: 20,
    });
    const row = await db.conversations.get('c1');
    expect(row?.name).toBe('Session 1');
    expect(row?.lorebookIds).toEqual(['lb1']);
    expect(row?.messages).toHaveLength(1);
  });

  it('queries conversations by updatedAt index', async () => {
    await db.conversations.bulkPut([
      { id: 'a', name: 'A', presetId: null, lorebookIds: [], messages: [], pageCount: 0, createdAt: 0, updatedAt: 5 },
      { id: 'b', name: 'B', presetId: null, lorebookIds: [], messages: [], pageCount: 0, createdAt: 0, updatedAt: 9 },
    ]);
    const ordered = await db.conversations.orderBy('updatedAt').toArray();
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('uses compound [conversationId+index] key for pages', async () => {
    await db.pages.bulkPut([
      { conversationId: 'c1', index: 0, leftHeader: '', leftContent: '', leftPage: 'p0', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
      { conversationId: 'c1', index: 1, leftHeader: '', leftContent: '', leftPage: 'p1', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
      { conversationId: 'c2', index: 0, leftHeader: '', leftContent: '', leftPage: 'q0', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
    ]);
    const c1Pages = await db.pages.where('conversationId').equals('c1').sortBy('index');
    expect(c1Pages.map((p) => p.leftPage)).toEqual(['p0', 'p1']);
    const c2Pages = await db.pages.where('conversationId').equals('c2').toArray();
    expect(c2Pages).toHaveLength(1);
  });

  it('range-deletes child rows by conversationId', async () => {
    await db.inventory.bulkPut([
      { conversationId: 'c1', itemId: 'i1', id: 'i1', name: 'Lantern', category: 'tool', description: '', quantity: 1, isKeyItem: false, acquiredAt: 0 },
      { conversationId: 'c2', itemId: 'i2', id: 'i2', name: 'Knife', category: 'weapon', description: '', quantity: 1, isKeyItem: false, acquiredAt: 0 },
    ]);
    await db.inventory.where('conversationId').equals('c1').delete();
    expect(await db.inventory.where('conversationId').equals('c1').count()).toBe(0);
    expect(await db.inventory.where('conversationId').equals('c2').count()).toBe(1);
  });
});

// ===== v1 -> v2 upgrade (isolated DB instances) =====
const CHAT_KEY = 'coc_chat_v1';

function envelope(state: unknown): string {
  return JSON.stringify({ state, version: 0 });
}

interface IsolatedDb extends Dexie {
  kvStore: Dexie.Table<{ key: string; value: string }, string>;
  conversations: Dexie.Table<Record<string, unknown>, string>;
  pages: Dexie.Table<Record<string, unknown>>;
  charsheets: Dexie.Table<Record<string, unknown>, string>;
  inventory: Dexie.Table<Record<string, unknown>>;
  darkThreads: Dexie.Table<Record<string, unknown>>;
  keywords: Dexie.Table<Record<string, unknown>>;
  gameVars: Dexie.Table<Record<string, unknown>>;
  macroVars: Dexie.Table<Record<string, unknown>>;
}

/** Build a fresh v1 DB under a unique name, seed kvStore, then reopen at v2
 *  with the exact production schema + upgrade hook to exercise upgradeV2. */
async function seedV1AndUpgrade(name: string, chatBlob: string | null): Promise<IsolatedDb> {
  const v1 = new Dexie(name);
  v1.version(1).stores({ kvStore: '&key' });
  await v1.open();
  if (chatBlob !== null) {
    await (v1 as unknown as IsolatedDb).kvStore.put({ key: CHAT_KEY, value: chatBlob });
  }
  v1.close();

  const v2 = new Dexie(name) as IsolatedDb;
  v2.version(1).stores({ kvStore: '&key' });
  v2.version(2).stores(V2_SCHEMA).upgrade(upgradeV2);
  await v2.open();
  return v2;
}

describe('upgradeV2 migration', () => {
  const created: Dexie[] = [];

  function uniqueName(): string {
    const n = `abyssal_upgrade_test_${Math.random().toString(36).slice(2)}`;
    return n;
  }

  afterEach(async () => {
    for (const d of created) {
      d.close();
      await Dexie.delete(d.name);
    }
    created.length = 0;
  });

  async function open(name: string, blob: string | null): Promise<IsolatedDb> {
    const d = await seedV1AndUpgrade(name, blob);
    created.push(d);
    return d;
  }

  it('explodes a chat blob into conversations + pages + gameState tables', async () => {
    const blob = envelope({
      activeId: 's1',
      sessions: [
        {
          id: 's1',
          name: 'The Haunting',
          presetId: 'p1',
          lorebookIds: ['lb1', 'lb2'],
          messages: [{ id: 'm1', role: 'user', content: 'enter', timestamp: 1 }],
          createdAt: 100,
          updatedAt: 200,
          pages: [
            { id: 'pg0', leftHeader: '', leftContent: '', leftPage: 'A', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
            { id: 'pg1', leftHeader: '', leftContent: '', leftPage: 'B', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
          ],
          gameState: {
            character: { identity: { name: 'Investigator', id: 'inv1' } },
            inventory: [
              { id: 'i1', name: 'Lantern', category: 'tool', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 0 },
            ],
            darkThread: [
              { id: 'd1', timestamp: 5, progress: 30, threatLevel: 'low', details: 'shadow', foreshadowing: 'fog' },
            ],
            keywords: { Cthulhu: 'the great old one' },
            variables: { hp: { name: 'hp', value: '10', locked: false, source: 'system', updatedAt: 0 } },
            macroVars: { mood: 'tense' },
          },
        },
      ],
    });
    const d = await open(uniqueName(), blob);

    const conv = await d.conversations.get('s1');
    expect(conv?.name).toBe('The Haunting');
    expect(conv?.presetId).toBe('p1');
    expect(conv?.lorebookIds).toEqual(['lb1', 'lb2']);
    expect(conv?.pageCount).toBe(2);
    expect(conv?.createdAt).toBe(100);
    expect(conv?.updatedAt).toBe(200);

    const pages = await d.pages.where('conversationId').equals('s1').sortBy('index');
    expect(pages.map((p) => p.leftPage)).toEqual(['A', 'B']);
    expect(pages.map((p) => p.index)).toEqual([0, 1]);

    const sheet = await d.charsheets.get('s1');
    expect((sheet?.sheet as Record<string, unknown>)).toBeDefined();

    const inv = await d.inventory.where('conversationId').equals('s1').toArray();
    expect(inv).toHaveLength(1);
    expect(inv[0].itemId).toBe('i1');

    const dts = await d.darkThreads.where('conversationId').equals('s1').toArray();
    expect(dts[0].entryId).toBe('d1');

    const kws = await d.keywords.where('conversationId').equals('s1').toArray();
    expect(kws[0].word).toBe('Cthulhu');
    expect(kws[0].meaning).toBe('the great old one');

    const gv = await d.gameVars.where('conversationId').equals('s1').toArray();
    expect(gv[0].name).toBe('hp');
    expect(gv[0].value).toBe('10');

    const mv = await d.macroVars.where('conversationId').equals('s1').toArray();
    expect(mv[0].name).toBe('mood');
    expect(mv[0].value).toBe('tense');
  });

  it('migrates multiple sessions independently', async () => {
    const blob = envelope({
      sessions: [
        { id: 'a', name: 'A', pages: [{ leftPage: 'x', leftHeader: '', leftContent: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }] },
        { id: 'b', name: 'B', pages: [] },
      ],
    });
    const d = await open(uniqueName(), blob);
    expect(await d.conversations.count()).toBe(2);
    expect((await d.conversations.get('a'))?.pageCount).toBe(1);
    expect((await d.conversations.get('b'))?.pageCount).toBe(0);
  });

  it('does NOT delete the source coc_chat_v1 blob', async () => {
    const blob = envelope({ sessions: [{ id: 's1', name: 'Keep', pages: [] }] });
    const d = await open(uniqueName(), blob);
    const rec = await d.kvStore.get(CHAT_KEY);
    expect(rec?.value).toBe(blob);
  });

  it('is a no-op when there is no chat blob', async () => {
    const d = await open(uniqueName(), null);
    expect(await d.conversations.count()).toBe(0);
    expect(await d.kvStore.get(V2_UPGRADE_FAILED)).toBeUndefined();
  });

  it('is a no-op for an empty sessions array', async () => {
    const d = await open(uniqueName(), envelope({ sessions: [] }));
    expect(await d.conversations.count()).toBe(0);
  });

  it('tolerates a malformed (non-JSON) blob without throwing', async () => {
    const d = await open(uniqueName(), 'not-json{{{');
    expect(await d.conversations.count()).toBe(0);
    // malformed parse is handled gracefully (returns null), not a thrown error
    expect(await d.kvStore.get(V2_UPGRADE_FAILED)).toBeUndefined();
  });

  it('handles a session with no gameState (meta + pages only)', async () => {
    const blob = envelope({
      sessions: [{ id: 's1', name: 'Bare', pages: [{ leftPage: 'only', leftHeader: '', leftContent: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }] }],
    });
    const d = await open(uniqueName(), blob);
    expect(await d.charsheets.get('s1')).toBeUndefined();
    expect(await d.inventory.where('conversationId').equals('s1').count()).toBe(0);
    expect(await d.pages.where('conversationId').equals('s1').count()).toBe(1);
  });

  it('is idempotent — re-running upgradeV2 yields the same rows', async () => {
    const name = uniqueName();
    const blob = envelope({
      sessions: [
        {
          id: 's1',
          name: 'Idem',
          pages: [{ leftPage: 'A', leftHeader: '', leftContent: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }],
          gameState: { keywords: { foo: 'bar' } },
        },
      ],
    });
    const d = await open(name, blob);
    expect(await d.pages.where('conversationId').equals('s1').count()).toBe(1);
    expect(await d.keywords.where('conversationId').equals('s1').count()).toBe(1);

    // Re-run the upgrade body directly within a transaction over all tables.
    await d.transaction(
      'rw',
      [d.kvStore, d.conversations, d.pages, d.charsheets, d.inventory, d.darkThreads, d.keywords, d.gameVars, d.macroVars],
      async (tx) => {
        await upgradeV2(tx);
      }
    );

    expect(await d.conversations.count()).toBe(1);
    expect(await d.pages.where('conversationId').equals('s1').count()).toBe(1);
    expect(await d.keywords.where('conversationId').equals('s1').count()).toBe(1);
  });
});

// ===== Failure-safety: mid-migration abort semantics =====
describe('upgradeV2 failure safety', () => {
  const names: string[] = [];

  function uniqueName(): string {
    const n = `abyssal_failsafe_test_${Math.random().toString(36).slice(2)}`;
    names.push(n);
    return n;
  }

  afterEach(async () => {
    for (const n of names) {
      await Dexie.delete(n);
    }
    names.length = 0;
  });

  /** Seed a v1 DB with a chat blob (closed afterwards) so a fresh v2 open
   *  triggers upgradeV2 against real persisted data. */
  async function seedV1(name: string, chatBlob: string): Promise<void> {
    const v1 = new Dexie(name);
    v1.version(1).stores({ kvStore: '&key' });
    await v1.open();
    await (v1 as unknown as IsolatedDb).kvStore.put({ key: CHAT_KEY, value: chatBlob });
    v1.close();
  }

  /** Open a fresh v2 instance at the production schema. Optionally inject a
   *  failure by replacing pages.bulkPut with a throwing stub (typed as the
   *  method's own signature — no `as any`). The stub throws on the Nth call. */
  function makeV2(name: string): IsolatedDb {
    const v2 = new Dexie(name) as IsolatedDb;
    v2.version(1).stores({ kvStore: '&key' });
    v2.version(2).stores(V2_SCHEMA).upgrade(upgradeV2);
    return v2;
  }

  it('aborts the version bump (verno stays 1) when a child write fails mid-migration', async () => {
    const name = uniqueName();
    // Two sessions, each with pages -> pages.bulkPut is called once per session.
    const blob = envelope({
      sessions: [
        { id: 'a', name: 'A', pages: [{ leftPage: 'pa', leftHeader: '', leftContent: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }] },
        { id: 'b', name: 'B', pages: [{ leftPage: 'pb', leftHeader: '', leftContent: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }] },
      ],
    });
    await seedV1(name, blob);

    const v2 = makeV2(name);
    // Inject mid-loop failure inside the upgrade transaction. upgradeV2 writes
    // via the transaction-scoped `tx.table('pages')` proxy, so spying on
    // `db.pages.bulkPut` would NOT intercept it. A Dexie `creating` hook,
    // however, fires for every row created on the `pages` store — including
    // writes made through the upgrade transaction. Throw on the 2nd created
    // page row (session 'b') to simulate a partial-migration failure.
    let pageCreates = 0;
    const onCreating = () => {
      pageCreates += 1;
      if (pageCreates >= 2) {
        throw new Error('injected mid-migration failure');
      }
    };
    v2.pages.hook('creating', onCreating);

    // The injected throw must propagate out of upgradeV2 and abort the open.
    let openRejected = false;
    try {
      await v2.open();
    } catch {
      openRejected = true;
    }
    v2.pages.hook('creating').unsubscribe(onCreating);
    v2.close();
    expect(openRejected).toBe(true);

    // BINDING SIGNAL: re-open at the SAME schema with NO injection. Because the
    // failed upgrade transaction aborted, the version bump must NOT have been
    // committed — verno is still 1 on the fresh open BEFORE the (now clean)
    // upgrade re-runs. We capture verno immediately after the v1-only open.
    const v1Check = new Dexie(name);
    v1Check.version(1).stores({ kvStore: '&key' });
    await v1Check.open();
    // If the aborted upgrade had committed, IndexedDB would already be at v2
    // and opening at declared v1 would throw VersionError. A clean open here
    // proves the store version did not advance past 1.
    expect(v1Check.verno).toBe(1);
    // Source blob preserved (never deleted) and NO partial conversation rows
    // survived the abort — kvStore still the only table with data.
    const blobRec = await (v1Check as unknown as IsolatedDb).kvStore.get(CHAT_KEY);
    expect(blobRec?.value).toBe(blob);
    v1Check.close();

    // And a clean retry at v2 now completes the migration for BOTH sessions.
    const reopened = makeV2(name);
    await reopened.open();
    expect(reopened.verno).toBe(2);
    expect(await reopened.conversations.count()).toBe(2);
    reopened.close();
  });
});

describe('v11: consoleLogs table', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
  });

  it('exposes consoleLogs table with the new schema', async () => {
    expect(db.consoleLogs).toBeDefined();

    const row = {
      sessionId: 's1',
      pageIndex: 3,
      ts: 1000,
      level: 'log' as const,
      message: '[cache-diag] hello',
    };
    const id = await db.consoleLogs.add(row);
    expect(typeof id).toBe('number');

    const fetched = await db.consoleLogs
      .where('[sessionId+pageIndex]')
      .equals(['s1', 3])
      .first();
    expect(fetched?.message).toBe('[cache-diag] hello');

    await db.consoleLogs.where('sessionId').equals('s1').delete();
    const count = await db.consoleLogs.where('sessionId').equals('s1').count();
    expect(count).toBe(0);
  });
});
