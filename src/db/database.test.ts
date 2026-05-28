import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './database';

describe('database', () => {
  beforeEach(async () => {
    await db.kvStore.clear();
  });

  it('puts and gets a record', async () => {
    await db.kvStore.put({ key: 'test', value: 'hello' });
    const rec = await db.kvStore.get('test');
    expect(rec?.value).toBe('hello');
  });

  it('deletes a record', async () => {
    await db.kvStore.put({ key: 'del', value: 'x' });
    await db.kvStore.delete('del');
    expect(await db.kvStore.get('del')).toBeUndefined();
  });
});
