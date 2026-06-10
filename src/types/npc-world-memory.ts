/**
 * Agent Memory 系统类型定义
 *
 * - NpcMemory：每位重要/核心 NPC 一份心智档案（硬字段 + 散文）
 * - WorldMemory：每会话一份世界整体心思
 * - 由 useNpcMemoryStore / useWorldMemoryStore 管理
 *
 * 设计 spec：docs/superpowers/specs/2026-06-10-npc-world-agent-memory-design.md
 */

export type EmotionEnum =
  | '敌意'
  | '警惕'
  | '中立'
  | '友好'
  | '暧昧'
  | '恐惧';

export const EMOTION_VALUES: ReadonlyArray<EmotionEnum> = [
  '敌意',
  '警惕',
  '中立',
  '友好',
  '暧昧',
  '恐惧',
] as const;

export function normalizeEmotion(value: unknown): EmotionEnum {
  if (typeof value === 'string' && (EMOTION_VALUES as readonly string[]).includes(value)) {
    return value as EmotionEnum;
  }
  return '中立';
}

export interface NpcRelationship {
  /** 关系对象 NPC 的真名（程序内 findIdByName 解析到 id；解析失败保留 name 供 LLM 上下文） */
  target: string;
  emotion: EmotionEnum;
  /** 一句话描述关系内容（"暗恋多年但没敢说" / "怀疑她偷了家产"） */
  note: string;
}

export interface NpcMemory {
  /** 当前主要目标（"找回失踪的弟弟"） */
  goal: string;
  /** 下回合打算做的具体事（"把调查员引到码头"） */
  nextMove: string;
  /** 对调查员的信任度，-1 ~ 1，0 中立 */
  trustOnPC: number;
  /** 对调查员的情绪倾向 */
  emotionToPC: EmotionEnum;
  /** 没告诉调查员的秘密清单 */
  secrets: string[];
  /** 与其他 NPC 的关系（单向：A 信任 B ≠ B 信任 A） */
  relationships: NpcRelationship[];
  /** 自由散文心思（第一人称，200~500 字） */
  prose: string;
  /** 最后更新回合索引（pages.length 写入时刻） */
  updatedAt: number;
}

export const EMPTY_NPC_MEMORY: NpcMemory = {
  goal: '',
  nextMove: '',
  trustOnPC: 0,
  emotionToPC: '中立',
  secrets: [],
  relationships: [],
  prose: '',
  updatedAt: 0,
};

/**
 * 模板填充——「路人/undefined → 重要」升级时使用 / NpcOverlay 手动立卡 fail-open 兜底。
 * goal/nextMove/prose 必须留空串:
 * - useNpcMemoryStore.applyUpdates 的 isPreset 守护对剧本预设 NPC「已有非空 goal/nextMove/prose」时
 *   拒绝主回合 LLM 覆盖。模板若塞占位文案,会让剧本预设 NPC 永远锁死在套话上。
 * - 改空串后:isPreset 守护自然通过 (empty.trim() falsy),主回合 megaagent npcMemoryUpdates 能写进去。
 * - UI 端 NpcOverlay 对 goal/nextMove 空已有 fallback「（未浮现）」,prose 空时不渲染段落。
 */
export function buildImportantNpcMemoryTemplate(updatedAt: number): NpcMemory {
  return {
    goal: '',
    nextMove: '',
    trustOnPC: 0,
    emotionToPC: '中立',
    secrets: [],
    relationships: [],
    prose: '',
    updatedAt,
  };
}

/**
 * LLM 输出的 NPC Memory 增量
 * - 所有字段可选（LLM 不写就保持原值）
 * - 通过 name 定位（findIdByName 解析）
 */
export interface NpcMemoryUpdate {
  /** 被更新的 NPC 真名（程序内 findIdByName 解析到 id） */
  name: string;
  goal?: string;
  nextMove?: string;
  trustOnPC?: number;
  emotionToPC?: EmotionEnum;
  /** 增量追加的秘密（与现有 secrets 合并去重） */
  secretsAdd?: string[];
  /** 增量追加/更新的关系（同 target 覆盖 emotion+note，新 target 追加） */
  relationshipsUpsert?: NpcRelationship[];
  /** 散文心思（非空时整段覆盖；空字符串/undefined 保持原值） */
  prose?: string;
}

export interface WorldMemory {
  /** 暗线推进描述（开关开启时同步写回 useDarkThreadStore.addEntry） */
  darkThread: string;
  /** 重要词意义（开关开启时同步写回 useKeywordStore.addKeywords） */
  keywordMeanings: Record<string, string>;
  /** 当前氛围/紧张度描述 */
  atmosphere: string;
  /** 已铺好但还没触发的剧情提示 */
  unrevealed: string[];
  /** 世界整体心思散文 */
  prose: string;
  /** 最后更新回合索引 */
  updatedAt: number;
}

export const EMPTY_WORLD_MEMORY: WorldMemory = {
  darkThread: '',
  keywordMeanings: {},
  atmosphere: '',
  unrevealed: [],
  prose: '',
  updatedAt: 0,
};

/**
 * 世界 Memory 子调用的输出（写入 useWorldMemoryStore 前的中间形态）
 * 子调用不一定每次都全量产出——空字符串/缺失字段保持原值
 */
export interface WorldMemoryUpdate {
  darkThread?: string;
  keywordMeaningsUpsert?: Record<string, string>;
  atmosphere?: string;
  unrevealedReplace?: string[];
  prose?: string;
}

/**
 * NPC Memory 立卡子调用的请求形态
 */
export interface NpcMemoryCardInput {
  npcId: string;
  /** NPC 真名（用于 prompt） */
  npcName: string;
  /** 当前 NpcProfile 简要描述（identity/locationName/sheet 摘要） */
  npcDigest: string;
  /** 当前剧情 / 上一页正文摘要（让心智档案合上下文） */
  scenarioCtx: string;
}

export type NpcMemoryCardResult = NpcMemory | null;

/**
 * 世界 Memory 子调用的请求形态
 */
export interface WorldMemoryUpdateInput {
  /** 当前 WorldMemory 完整快照（让 LLM 知道现在的状态再增量） */
  current: WorldMemory;
  /** 上一页 / 本回合主回合 narrative 摘要 */
  recentNarrative: string;
  /** 剧本背景（首次 bootstrap 时填，后续可空） */
  scenarioCtx?: string;
  /** 是否是首次 bootstrap（startNewConversation / 老存档开关切到 ON） */
  bootstrap?: boolean;
}

export type WorldMemoryUpdateResult = WorldMemoryUpdate | null;
