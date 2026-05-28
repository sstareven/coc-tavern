import { db } from './database';

const LS_KEYS = [
  'coc_settings_v2',
  'coc_character',
  'coc_lorebooks_v1',
  'coc_th_v2',
  'coc_chat_v1',
  'coc_char_presets',
] as const;

const FLAG = '_migration_v1';

export async function migrateFromLocalStorage(): Promise<void> {
  const alreadyDone = await db.kvStore.get(FLAG);
  if (alreadyDone) return;

  let migrated = 0;
  for (const key of LS_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      await db.kvStore.put({ key, value: raw });
      migrated++;
    } catch (err) {
      console.error(`[DB] Migration failed for "${key}":`, err);
    }
  }

  await db.kvStore.put({ key: FLAG, value: 'true' });
  // Delete localStorage after successful migration
  for (const key of LS_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
  console.log(`[DB] Migrated ${migrated}/${LS_KEYS.length} keys from localStorage`);
}
