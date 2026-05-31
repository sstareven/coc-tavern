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
  id?: string;
  leftHeader: string;
  leftContent: string;
  leftPage: string;
  rightPage: string;
  rightHeader: string;
  rightContent: string;
  rightChoices: ChoiceItem[];
  sceneInfo?: SceneInfo;
  summary?: string;
  keywords?: Record<string, string>;
  diceResults?: DiceRecord[];
  inventoryChanges?: InventoryChange[];
  rewrite?: RewriteBlock;
  /** 行动补写拾取已直接入库的物品名，用于阻止后续正文 API 对同名物品重复计数。随页面持久化。 */
  acquiredItems?: string[];
}

// ===== Inventory System =====
export type ItemCategory = 'weapon' | 'tool' | 'consumable' | 'clue' | 'key_item' | 'misc';

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  quantity: number;
  equipped: boolean;
  /** 能否被装备（武器/工具/可佩戴物为 true；信件/纸张/线索等为 false）。缺省时按 category 兜底推定。 */
  equippable?: boolean;
  isKeyItem: boolean;
  acquiredAt: number;
}

export type InventoryAction = 'add' | 'remove' | 'equip' | 'unequip' | 'update';

export interface InventoryChange {
  action: InventoryAction;
  name: string;
  category?: ItemCategory;
  quantity?: number;
  description?: string;
  equipped?: boolean;
  equippable?: boolean;
}

export interface ChoiceItem {
  num: string;
  text: string;
  action: string;
  /** 行动补写专用：玩家拾取意图选项上附带的获取物品（仅当该物品已在当前场景叙述中出现）。 */
  itemGain?: { name: string; category?: ItemCategory };
}

export interface RewriteBlock {
  /** 承接玩家意图的过渡叙述,不含结果、不推进剧情 */
  text: string;
  /** 4 个候选行动选项,编号续接原选项(V–VIII) */
  choices: ChoiceItem[];
  /** 触发补写时玩家的原始输入,用于重新续写复用与匹配 */
  sourceInput: string;
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
  /** 该检定发生时的书本页码（1 基，pageIndex+1）；老记录可能缺省。 */
  page?: number;
  /** 检定种类：普通 d100 检定 / 多面骰（伤害·理智损失）。缺省视为 check。 */
  kind?: 'check' | 'poly';
}

// ===== Lorebooks =====
// 0-9: before_char/after_char/before_exm/after_exm/before_an/after_an/system_d/user_d/ai_d/anchor
export type InsertPosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MatchLogic = 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL';

export interface LoreEntry {
  name: string;
  keys: string;
  content: string;
  logic: MatchLogic;
  priority: number;
  disabled: boolean;
  constant: boolean;
  position: InsertPosition;
  depth: number;
  probability: number;
  secondaryKeys: string;
  scanDepth: number;
  caseSensitive: number;
  matchWholeWord: number;
  groupScoring: number;
  automationId: string;
  inclusionGroup: string;
  prioritizeInclusion: boolean;
  groupWeight: number;
  sticky: number;
  cooldown: number;
  delay: number;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  excludeRecursion: boolean;
  ignoreReplyLimit: boolean;
  // ── Character filter — 角色过滤（白/黑名单），空 names+tags = 不过滤 ──
  characterFilter?: { isExclude: boolean; names: string[]; tags: string[] };
  // ── Triggers — 生成类型触发，空数组/undefined = 不限 ──
  triggers?: ('normal' | 'continue' | 'regenerate' | 'quiet')[];
  // ── Additional matching sources — 额外匹配来源（SillyTavern 兼容）──
  matchPersonaDescription?: boolean;
  matchCharacterDescription?: boolean;
  matchCharacterPersonality?: boolean;
  matchCharacterDepthPrompt?: boolean;
  matchScenario?: boolean;
  matchCreatorNotes?: boolean;
}

export interface LoreBook {
  name: string;
  entries: Record<string, LoreEntry>;
  enabled: boolean;
  /** 作用域：global=所有会话生效（默认）；chat=仅绑定到当前会话时生效 */
  scope?: 'global' | 'chat';
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

// ===== Session Game State (per-save isolation) =====
export interface SessionGameState {
  character?: CharacterSheet;
  inventory?: InventoryItem[];
  darkThread?: { id: string; timestamp: number; progress: number; threatLevel: string; details: string; foreshadowing: string }[];
  keywords?: Record<string, string>;
  /** MVU 游戏变量（调查员.生命值.当前 等）。按会话隔离，避免跨对话泄漏。 */
  variables?: Record<string, GameVariable>;
  /** TavernHelper 宏变量（/set 设置）。按会话隔离。 */
  macroVars?: Record<string, string>;
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
  /** In-memory only for the active session; NOT persisted in the lightweight chat blob (Dexie v2). Pages live in the `pages` table. */
  pages: BookPage[];
  presetId: string | null;
  lorebookIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Denormalized page count for session-list display without loading the pages table. */
  pageCount?: number;
  /** In-memory only; gameState is persisted per-conversation in relational child tables (Dexie v2), not in the chat blob. */
  gameState?: SessionGameState;
}

// ===== Extensions =====
export interface Extension {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  /** 可选元数据（路径/URL）；运行时不加载它，仅展示。实际执行 `code`。 */
  entryPoint: string;
  /** 内联脚本代码：经 extensionsToScripts 转 TH 脚本，在 th-script-engine 受限沙箱执行（可定义 init/onSend/onReceive）。 */
  code?: string;
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
