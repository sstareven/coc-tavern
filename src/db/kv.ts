import { db } from './database';

const cache = new Map<string, string>();
let initialized = false;

export async function initKvCache(): Promise<void> {
  if (initialized) return;
  const all = await db.kvStore.toArray();
  for (const { key, value } of all) cache.set(key, value);
  // Also pull in existing localStorage keys and migrate them
  const migrateKeys = [
    'coc_presets_v1', 'coc_last_preset',
    'coc_ext_v1', 'coc_changelog_seen', 'coc_presets_migrated_v3',
  ];
  for (const key of migrateKeys) {
    const val = localStorage.getItem(key);
    if (val !== null && !cache.has(key)) {
      cache.set(key, val);
      db.kvStore.put({ key, value: val });
      localStorage.removeItem(key);
    }
  }
  initialized = true;
}

export function kvGet(key: string): string | null {
  return cache.get(key) ?? null;
}

export function kvSet(key: string, value: string): void {
  cache.set(key, value);
  db.kvStore.put({ key, value });
}

export function kvDelete(key: string): void {
  cache.delete(key);
  db.kvStore.delete(key);
}
