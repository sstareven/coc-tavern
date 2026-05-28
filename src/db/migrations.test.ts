import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './database';
import { migrateFromLocalStorage } from './migrations';

describe('migrations', () => {
  beforeEach(async () => {
    await db.kvStore.clear();
    localStorage.clear();
  });

  it('migrates localStorage data to Dexie', async () => {
    localStorage.setItem('coc_settings_v2', '{"soundEnabled":true}');
    await migrateFromLocalStorage();
    const rec = await db.kvStore.get('coc_settings_v2');
    expect(rec?.value).toBe('{"soundEnabled":true}');
  });

  it('clears localStorage after migration', async () => {
    localStorage.setItem('coc_settings_v2', 'x');
    await migrateFromLocalStorage();
    expect(localStorage.getItem('coc_settings_v2')).toBeNull();
  });

  it('is idempotent (does not re-migrate)', async () => {
    localStorage.setItem('coc_settings_v2', 'first');
    await migrateFromLocalStorage();
    localStorage.setItem('coc_settings_v2', 'second'); // simulate new data
    await migrateFromLocalStorage(); // should skip
    const rec = await db.kvStore.get('coc_settings_v2');
    expect(rec?.value).toBe('first'); // still the first migration
  });
});
