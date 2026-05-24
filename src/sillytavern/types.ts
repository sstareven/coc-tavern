import type { LoreBook, LoreEntry, ChatPreset, ChatMessage, ChatSession, Extension } from '../types';

export type { LoreBook, LoreEntry, ChatPreset, ChatMessage, ChatSession, Extension };

// ===== Tavern-specific types =====

export type UserRole = 'admin' | 'user' | 'viewer';

export type PromptOrder = 'fixed' | 'random' | 'smart';

export type ApiProvider = 'openai' | 'anthropic' | 'custom';

export interface VariableMapping {
  name: string;
  value: string;
  locked: boolean;
}

export interface TavernConfig {
  apiUrl: string;
  apiKey: string;
  provider: ApiProvider;
  model: string;
  contextSize: number;
}
