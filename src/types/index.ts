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

// ===== Scene Info =====
export interface SceneInfo {
  date: string;
  weekday: string;
  time: string;
  weather: string;
  location: string;
}

// ===== Storybook Pages =====
export interface BookPage {
  leftHeader: string;
  leftContent: string;
  leftPage: string;
  rightHeader: string;
  rightContent: string;
  rightChoices: ChoiceItem[];
  sceneInfo?: SceneInfo;
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
// 0-9: before_char/after_char/before_exm/after_exm/before_an/after_an/system_d/user_d/ai_d/anchor
export type InsertPosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface LoreEntry {
  name: string;
  keys: string;
  content: string;
  logic: 'AND' | 'OR' | 'NOT';
  priority: number;
  disabled: boolean;
  constant: boolean;
  position: InsertPosition;
  depth: number;
  probability: number;
}

export interface LoreBook {
  name: string;
  entries: Record<string, LoreEntry>;
  enabled: boolean;
}

// ===== Presets =====
export interface PromptItem {
  id: string;
  name: string;
  role: 'system' | 'user' | 'assistant';
  trigger: 'normal' | 'continue' | 'ai_assist' | 'alt_reply' | 'regenerate' | 'silent';
  position: 'relative' | 'depth';
  depth: number;
  order: number;
  content: string;
  enabled: boolean;
  /** 'marker' = fixed system item (Main Prompt, World Info etc.), 'prompt' = user-created */
  kind: 'marker' | 'prompt';
  /** If true, only toggle allowed (no edit/remove). Chat Examples, Chat History */
  readOnly?: boolean;
}

export interface ChatPreset {
  id: string;
  name: string;
  temperature: number;
  frequencyPenalty: number;
  presencePenalty: number;
  topP: number;
  topK: number;
  maxTokens: number;
  systemPrompt: string;
  userPrefix: string;
  assistantPrefix: string;
  unlockContext: boolean;
  contextLength: number;
  maxResponseTokens: number;
  alternativeReplies: number;
  // Quick prompts
  mainPrompt: string;
  auxiliaryPrompt: string;
  postHistoryPrompt: string;
  // Utility prompts
  aiAssistPrompt: string;
  worldBookTemplate: string;
  scenarioTemplate: string;
  personalityTemplate: string;
  groupChatPrompt: string;
  newChatPrompt: string;
  newGroupChatPrompt: string;
  newExampleChatPrompt: string;
  continuePrompt: string;
  emptyMessagePrompt: string;
  promptItems: PromptItem[];
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

// ===== Regex Scripts =====
export type RegexPlacement = 1 | 2 | 3 | 5 | 6;
// 1=USER_INPUT, 2=AI_OUTPUT, 3=SLASH_COMMAND, 5=WORLD_INFO, 6=REASONING
export type SubstituteFindRegex = 0 | 1 | 2; // NONE | RAW | ESCAPED
export type RegexScriptType = 'global' | 'preset';

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: RegexPlacement[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: SubstituteFindRegex;
  minDepth: number | null;
  maxDepth: number | null;
}

export interface RegexPresetItem {
  id: string;
}

export interface RegexPreset {
  id: string;
  name: string;
  isSelected: boolean;
  global: RegexPresetItem[];
  preset: RegexPresetItem[];
}

// ===== MVU Game Variables =====
export interface GameVariable {
  name: string;
  value: string;
  locked: boolean;
  source: 'system' | 'character' | 'llm' | 'manual';
  updatedAt: number;
}

// ===== Tooltip Keywords =====
export type KeywordDB = Record<string, string>;
