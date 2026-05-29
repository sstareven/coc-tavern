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
  /** 开场白 — the character's first message / greeting */
  greeting: string;
  /** 角色描述 — character description for the AI prompt */
  description: string;
  /** 角色性格 — personality traits for the AI prompt */
  personality: string;
  /** 场景设定 — current scenario description */
  scenario: string;
  /** 用户设定描述 — persona / user description */
  personaDescription: string;
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
  rightPage: string;
  rightHeader: string;
  rightContent: string;
  rightChoices: ChoiceItem[];
  sceneInfo?: SceneInfo;
  summary?: string;
  diceResults?: DiceRecord[];
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
  trigger: string[];
  position: 'relative' | 'depth';
  depth: number;
  order: number;
  content: string;
  enabled: boolean;
  /** 'marker' = fixed system item (Main Prompt, World Info etc.), 'prompt' = user-created */
  kind: 'marker' | 'prompt';
  /** If true, only toggle allowed (no edit/remove). Chat Examples, Chat History */
  readOnly?: boolean;
  /** Signal from ST format-converter import — set on library items during import */
  _library?: boolean;
  /** Original name preserved from ST format import for dirty-checking */
  _originalName?: string;
  /** Signal that content is auto-filled from external source — read-only in editor */
  _contentReadOnly?: boolean;
}

export interface ChatPreset {
  id: string;
  name: string;
  // Samplers
  temperature: number;
  frequencyPenalty: number;
  presencePenalty: number;
  repetitionPenalty: number;
  topP: number;
  topK: number;
  minP: number;
  topA: number;
  // Token / context
  maxTokens: number;
  unlockContext: boolean;
  contextLength: number;
  maxResponseTokens: number;
  alternativeReplies: number;
  // Stream / reasoning
  streamEnabled: boolean;
  reasoningEffort: 'auto' | 'low' | 'medium' | 'high' | 'max';
  showThoughts: boolean;
  responseLength: 'auto' | 'short' | 'medium' | 'long';
  seed: number;
  // Behavior
  charNameBehavior: 'none' | 'completion' | 'content';
  continueSuffix: 'none' | 'space' | 'newline' | 'doublenewline';
  continuePrefill: boolean;
  assistantPrefill: string;
  // System / prefix
  systemPrompt: string;
  userPrefix: string;
  assistantPrefix: string;
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
  /** SillyTavern preset-scoped regex scripts */
  regexScripts?: RegexScript[];
  /** Tavern Helper preset-scoped scripts (from extensions.tavern_helper) */
  tavernHelperScripts?: THScriptTree[];
  /** Tavern Helper preset-scoped variables */
  tavernHelperVars?: Record<string, THVariable>;
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
  pages: BookPage[];
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

// ===== Tavern Helper (酒馆助手) - Script System =====
export interface THScript {
  id: string;
  type: 'script';
  enabled: boolean;
  name: string;
  content: string;
  info: string;
}

export interface THScriptFolder {
  id: string;
  type: 'folder';
  name: string;
  icon: string;
  color: string;
  children: THScriptTree[];
}

export type THScriptTree = THScript | THScriptFolder;

// ===== Tavern Helper Variables =====
export type THScope = 'global' | 'preset' | 'chat' | 'character';

export interface THVariable {
  name: string;
  value: string;
  updatedAt?: number;
}

// ===== Macro Variables =====
export interface MacroVarStore {
  [name: string]: string;
}

// ===== Prompt Template Settings =====
export interface PTSettings {
  enabled: boolean;
  generateEnabled: boolean;
  generateLoaderEnabled: boolean;
  injectLoaderEnabled: boolean;
  renderEnabled: boolean;
  renderLoaderEnabled: boolean;
  codeBlocksEnabled: boolean;
  permanentEvaluation: boolean;
  filterChatMessage: boolean;
  chatDepth: number;
  autosaveEnabled: boolean;
  preloadWorldinfo: boolean;
  withContextDisabled: boolean;
  debugEnabled: boolean;
  invertEnabled: boolean;
  compileWorkers: boolean;
  sandbox: boolean;
  cacheEnabled: 0 | 1 | 2;
  cacheSize: number;
  cacheHasher: 'h32ToString' | 'h64ToString';
}

export type THCodeCollapse = 'all' | 'frontend' | 'disable';

export interface THRenderSettings {
  renderEnabled: boolean;
  renderDepth: number;
  codeCollapse: THCodeCollapse;
  blobUrlRendering: boolean;
  disableCodeHighlight: boolean;
  allowStreamRender: boolean;
}

export interface THOptimizeSettings {
  optimizeMessageLoad: boolean;
  forceWorldbookSettings: boolean;
  maximizePresetContext: boolean;
}

// ===== Tooltip Keywords =====
export type KeywordDB = Record<string, string>;
