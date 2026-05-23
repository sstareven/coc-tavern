// ===== COC 7th Character =====
export type COC7Characteristic = 'STR' | 'CON' | 'POW' | 'DEX' | 'APP' | 'SIZ' | 'INT' | 'EDU';

export interface CharacterSheet {
  characteristics: Record<COC7Characteristic, number>;
  halfFifth: Record<COC7Characteristic, { half: number; fifth: number }>;
  secondary: {
    hp: { current: number; max: number };
    san: { current: number; max: number };
    mp: { current: number; max: number };
    luck: number;
    mov: number;
    db: string;
    build: number;
  };
  skills: Record<string, { base: number; current: number }>;
  identity: {
    name: string;
    occupation: string;
    age: number;
    gender: string;
    birthplace: string;
    residence: string;
    id: string;
  };
}

// ===== Storybook Pages =====
export interface BookPage {
  leftHeader: string;
  leftContent: string;
  leftPage: string;
  rightHeader: string;
  rightContent: string;
  rightChoices: ChoiceItem[];
}

export interface ChoiceItem {
  num: string;
  text: string;
  action: string;
}

// ===== Dice =====
export type DiceResultType = 'crit-success' | 'extreme-success' | 'hard-success' | 'success' | 'failure' | 'crit-failure';
export type DiceMode = 'check' | 'opposed' | 'free';

export interface DiceRecord {
  skill: string;
  roll: string;
  target: string;
  type: DiceResultType;
  time: number;
}

// ===== Lorebooks =====
export interface LoreEntry {
  name: string;
  keys: string;
  content: string;
  logic: 'AND' | 'OR' | 'NOT';
  priority: number;
}

export interface LoreBook {
  name: string;
  entries: Record<string, LoreEntry>;
}

// ===== Presets =====
export interface ChatPreset {
  id: string;
  name: string;
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  repetitionPenalty: number;
  systemPrompt: string;
  userPrefix: string;
  assistantPrefix: string;
}

// ===== Chat Sessions =====
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  presetId: string | null;
  lorebookIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ===== Extensions =====
export interface Extension {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  entryPoint: string;
}

// ===== Tooltip Keywords =====
export type KeywordDB = Record<string, string>;
