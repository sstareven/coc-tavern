import Dexie, { type EntityTable } from 'dexie';
import type { LoreBook, ChatPreset, ChatSession, Extension } from '../types';

interface LorebookRow { id: string; data: LoreBook; }
interface PresetRow { id: string; data: ChatPreset; }
interface ChatRow { id: string; data: ChatSession; }
interface SettingsRow { key: string; value: unknown; }
interface ExtensionRow { id: string; data: Extension; }

export class CocDatabase extends Dexie {
  lorebooks!: EntityTable<LorebookRow, 'id'>;
  presets!: EntityTable<PresetRow, 'id'>;
  chatSessions!: EntityTable<ChatRow, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  extensions!: EntityTable<ExtensionRow, 'id'>;

  constructor() {
    super('coc-tavern');
    this.version(1).stores({
      lorebooks: 'id',
      presets: 'id',
      chatSessions: 'id',
      settings: 'key',
      extensions: 'id',
    });
  }
}

export const db = new CocDatabase();
