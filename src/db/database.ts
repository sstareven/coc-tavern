import Dexie, { type EntityTable } from 'dexie';

interface KVRecord {
  key: string;
  value: string;
}

export const db = new Dexie('abyssal_archive') as Dexie & {
  kvStore: EntityTable<KVRecord, 'key'>;
};

db.version(1).stores({
  kvStore: '&key',
});
