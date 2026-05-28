import type { StateStorage } from 'zustand/middleware';
import { db } from './database';

export function createDexieStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      const record = await db.kvStore.get(name);
      return (record?.value as string) ?? null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
      await db.kvStore.put({ key: name, value });
    },
    removeItem: async (name: string): Promise<void> => {
      await db.kvStore.delete(name);
    },
  };
}
