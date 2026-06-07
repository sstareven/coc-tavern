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
  /** 技能：base = 起始值；current = 当前值；ticked = 本场冒险触发了「成功后打勾」标记（M2 经验提升机制使用）。 */
  skills: Record<string, { base: number; current: number; ticked?: boolean }>;
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
  /** 当前姿态 — 站立/倒下/昏迷/被束缚 等，供 LLM 遵守物理约束 */
  posture: string;
  /** 状态条件 — 极度口渴/身体着火/中毒 等持续状态 */
  statusConditions: StatusCondition[];
  /**
   * 一【游戏日】内累计的理智损失（A2 不定性疯狂阈值 = maxSan/5 / 单日）。
   * 由 A2 post-settle evaluator 在 sceneInfo.date 变更时清零（NOT 每回合）。
   * 同时 A2.4 评估器读此字段判定 indefinite 触发。
   */
  dailySanLoss: number;
  /** 临时疯狂（COC7e 表 VII/VIII）：active=true 时角色处于发作，roundsLeft 为剩余回合。entry 是表内 1..10 的命中点数（A2.3 起统一存数字，对齐 schema/redirect 的 number 校验）。 */
  temporaryInsanity: {
    active: boolean;
    roundsLeft: number;
    bout?: { mode: 'realtime' | 'summary'; table: 'VII' | 'VIII'; entry: number };
  };
  /** 不定性疯狂（A2.4）：累计达 maxSan/5 / 单日 后触发，需 1d10 个月恢复或经治疗。daysLeft 为剩余恢复天数。 */
  indefiniteInsanity: { active: boolean; daysLeft: number };
  /** 永久性疯狂（SAN 归零）。布尔标志即可：触发即终局，没有阶段或残量。 */
  permanentInsanity: boolean;
  /** 恐惧症（A2 临时/不定性疯狂获得的长期 phobia 标签）。与 statusConditions 正交。 */
  phobias: string[];
  /** 狂躁症（A2 临时/不定性疯狂获得的长期 mania 标签）。与 statusConditions 正交。 */
  manias: string[];
  /** 已知法术（B1 法术系统）。仅记法术 id/名，详细 cost/effect 在法术库 / 世界书内。 */
  known_spells: string[];
  /** 恢复进度（C2 长期/短期恢复机制）：HP/SAN 下一次恢复的 epoch ms 时间戳——B1.6 (M2) 落地时再补默认值。 */
  recovery: { hpRegenAtMs?: number; sanRegenAtMs?: number };
  /** Step 5 玩家填写的「初始物品」原文，进游戏前由 LLM 抽取入 useInventoryStore；preset 模式下空字符串 */
  initialItemsRaw?: string;
}

/** 角色的持续状态条件（如中毒、着火、极度口渴）。 */
export interface StatusCondition {
  name: string;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  description: string;
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
  /** 本页 LLM 产生的线索/NPC/地图更新——随页面持久化，用于删页时从剩余页面重建这些派生状态。 */
  clues?: ClueInput[];
  npcUpdates?: NpcUpdate[];
  mapUpdates?: MapUpdates;
  /** 本页独立抽取的地点元素（页锚定，随页持久化，供删页重放重建）。 */
  locationElements?: LocationElementInput[];
  darkThread?: DarkThreadData;
  /** 本回合结束时的角色卡快照（HP/SAN/MP/姿态/状态/技能等）——供删页回溯人物状态。 */
  sheetSnapshot?: CharacterSheet;
  /** 本回合结束时的 NPC 名册快照（按 id）——供删页快照式回溯人物状态（含战斗结算的昏迷/死亡等）。 */
  npcSnapshot?: Record<string, NpcProfile>;
  /** 本页生成记录：本次主生成消耗的 token 与耗时，随页面持久化、翻回该页即显示。 */
  genStats?: PageGenStats;
  /** 脱战后固化的战斗日志（页锚定，随页持久化，供删页重放重建）。 */
  combatLog?: CombatLog;
  /** A2 重设: 本页 LLM 输出的 SAN check 气泡条目(对应叙事正文里嵌的 <san id="N"/> 标签)。
   *  随页持久化, 删页/翻页时 SanityBubble 列表据此重建; 玩家点击解决态在 useSanityBubbleStore.resolved。 */
  sanityCheckPrompts?: SanityCheckPrompt[];
}

/** 单页的生成记录：优先 API 真实 usage，拿不到时为按字数估算（estimated=true）。 */
export interface PageGenStats {
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
  estimated: boolean;
  /** DeepSeek 上下文缓存命中/未命中 token（主生成）——供缓存命中面板按页/按天统计；删页随页移除。 */
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  /** 本页生成时刻(epoch ms)——供缓存面板按天分组 X 轴。 */
  at?: number;
  /**
   * 生成完成那一刻，主 RPM 桶 60 秒滑动窗口内已发出的请求数（实测 Request-Per-Minute，
   * 非 settings.rpmLimit 配置上限）。供 TokenDisplay 右下角显示「当时发了 N 次请求」。
   * 老存档/老页为 undefined → 跳过显示。
   */
  rpm?: number;
  /**
   * 生成时使用的模型名（settings.apiModel 快照）——CacheStatsPanel 据此区分 flash/pro
   * 走对应费率算 cost、并把曲线按模型分双线显示。老存档为 undefined → 用默认 pro 价。
   */
  model?: string;
  /**
   * 本页所有 LLM 子调用的累积统计（按时间顺序追加）——主回合之外的所有 LLM 请求都
   * 在这里留账：MVU 提取、起始物品、坏结局、关键线索、线索整合、NPC 补写、地点元素、
   * 地图自检、时间跳跃、战斗探测、行动补写 #1/#2/...。每条记 label / model / 命中 /
   * 未命中 / 输出 / 时刻，让缓存面板能按子调用细分显示。
   */
  subCalls?: PageSubCallStat[];
}

/** 单次子调用的统计（细分缓存命中、按页归档）。 */
export interface PageSubCallStat {
  /** 任务标识：「MVU」/「起始物品」/「坏结局」/「关键线索」/「线索整合」/「NPC 补写」/
   *  「地点元素」/「地图自检」/「时间跳跃」/「战斗探测」/「行动补写 #N」等。 */
  label: string;
  /** 该次调用使用的模型名（决定缓存费率 tier）。 */
  model?: string;
  /** 输入命中 token 数（DeepSeek prompt_cache_hit_tokens）。 */
  hit?: number;
  /** 输入未命中 token 数（DeepSeek prompt_cache_miss_tokens）。 */
  miss?: number;
  /** 输入 token 总数（hit + miss 的兜底；某些端点不返回 hit/miss 拆分时填 prompt_tokens 全量）。 */
  promptTokens?: number;
  /** 输出 token 数。 */
  output?: number;
  /** 调用结束时刻（epoch ms），用于排序与按天分组。 */
  at?: number;
}

// ===== LLM 派生更新（随页面持久化，供删页重建）=====
/** 线索受控分类标签词表：LLM 只能从此集合给线索打标签，UI 据此做多选筛选。 */
export const CLUE_TAGS = ['人物', '地点', '物证', '事件', '组织', '超自然', '推理'] as const;
export type ClueTag = (typeof CLUE_TAGS)[number];

export interface ClueInput {
  name: string;
  summary?: string;
  discoveryNarrative?: string;
  foundAtPage?: string;
  relatedTo?: string[];
  /** 受控分类标签（已按 CLUE_TAGS 白名单过滤） */
  tags?: string[];
  /** 由「线索整合」归纳而来的推理线索（非现场发现），UI 区分高亮 */
  synthesized?: boolean;
  /** 演化：本条新线索由哪条已有线索（按名）升华而来；给出则系统归档旧线索 */
  evolvesFrom?: string;
}

export interface NpcUpdate {
  name: string;
  /** 指定 NPC id（剧本注入路径用，保留剧本固定 id；缺省由 store 在新建档时分配 UUID） */
  id?: string;
  identity?: string;
  faction?: string;
  gender?: string;
  appearanceAge?: string;
  characteristics?: Partial<Record<COC7Characteristic, number>>;
  derived?: string;
  skills?: Record<string, number>;
  favorabilityDelta?: number;
  appearance?: string;
  personality?: string;
  innerThoughts?: string;
  addMemory?: string;
  /** 记忆梗概：AI 用 2-4 句浓缩此前关键互动；系统据此精简逐条旧记忆 */
  memorySummary?: string;
  experience?: string;
  backstory?: string;
  possessions?: string[];
  isPresent?: boolean;
  status?: string;
  /** 当前生命/理智/魔法值增量（受伤/恢复/损失理智时给出，正=增负=减；系统自动钳制到 [0, 推算最大值]）。 */
  hpDelta?: number;
  sanDelta?: number;
  mpDelta?: number;
  /** 剧本预设锚点：scenarioCharacterToNpc 注入时为 true；applyUpdates 据此跳过 backstory/innerThoughts 覆盖，防 KP 暗线被 LLM 主回合覆写。 */
  isScenarioPreset?: boolean;
  /** 剧本 hiddenBio 保护副本（KP 视角动机/秘密）：与 innerThoughts 同源但锁定不被 LLM 覆写。 */
  scenarioHiddenBio?: string;
}

export interface MapUpdates {
  current?: string;
  newLocations?: { name: string; description?: string }[];
  newEdges?: { from: string; to: string; type?: 'bidirectional' | 'oneway'; description?: string }[];
}

export interface DarkThreadData {
  development: string;
  progress: number;
  threatLevel: string;
  foreshadowing: string;
}

/**
 * 理智检定气泡(A2 重设): LLM 在叙事正文嵌内联标记 <san id="N"/> + 在主 JSON 顶层 sanityCheckPrompts
 * 数组里给出对应条目。玩家点击气泡 → SanityCheckPanel 跑 POW/INT/skill d100 检定 → 按结果掷扣 SAN。
 *
 * - id:           唯一标识(与叙事中 <san id="N"/> 的 N 对应);可用 'p1','p2'等任意字符串
 * - trigger:      检定触发的简短描述(玩家可见,如"目睹同伴被撕碎")
 * - checkType:    'POW'(理智底层属性) | 'INT'(看清诡异) | 'skill'(需 checkSkill 字段)
 * - checkSkill:   仅 checkType='skill' 时填(如 '克苏鲁神话')
 * - difficulty:   d100 难度等级 — normal(原值)/hard(/2)/extreme(/5)
 * - sanLossSuccess: 通过检定时的 SAN 损失骰表达式("0" / "1D2" / "0/1D6" 取斜杠左侧)
 * - sanLossFail:    未通过检定时的 SAN 损失骰表达式("1D6" / "1D10" / "0/1D6" 取斜杠右侧)
 */
export interface SanityCheckPrompt {
  id: string;
  trigger: string;
  checkType: 'POW' | 'INT' | 'skill';
  checkSkill?: string;
  difficulty: 'normal' | 'hard' | 'extreme';
  sanLossSuccess: string;
  sanLossFail: string;
}

// ===== Inventory System =====
export type ItemCategory = 'weapon' | 'tool' | 'consumable' | 'clue' | 'key_item' | 'misc';

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  quantity: number;
  isKeyItem: boolean;
  acquiredAt: number;
}

export type InventoryAction = 'add' | 'remove' | 'update';

export interface InventoryChange {
  action: InventoryAction;
  name: string;
  category?: ItemCategory;
  quantity?: number;
  description?: string;
}

// ===== Clue Library（独立线索库）=====
export interface Clue {
  id: string;
  name: string;
  /** 一句话简述 */
  summary: string;
  /** 发现细节 —— 多句描述角色从中发现了什么蛛丝马迹 */
  discoveryNarrative: string;
  /** 在第几页/回合发现 */
  foundAtPage?: string;
  /** 关联的人/地/事关键词 */
  relatedTo?: string[];
  /** 受控分类标签（CLUE_TAGS 子集），供 UI 多选筛选 */
  tags?: string[];
  /** 由「线索整合」归纳而来的推理线索（玩家主动让 LLM 汇总），UI 区分高亮 */
  synthesized?: boolean;
  acquiredAt: number;
  /** 线索状态：active 显示并注入；archived 已演化、隐藏但保留可回溯。缺省视为 active */
  status?: 'active' | 'archived';
  /** 本线索由哪条线索演化而来（旧线索 id） */
  evolvedFrom?: string;
  /** 本线索（已归档）演化成了哪条新线索（新线索 id） */
  evolvedIntoId?: string;
  /** 显著程度：major 为演化出的更关键线索，UI 高亮、注入加★ */
  tier?: 'normal' | 'major';
  /** 关键线索标记：本线索揭示的「真相支柱」id（拯救世界系统）。非空即为关键线索。 */
  keyPillarId?: string;
}

// ===== 拯救世界系统（关键线索 / 真相支柱）=====
/** 真相支柱：开局生成的守秘人机密，揭示全部 3 个即开启拯救世界模式。 */
export interface KeyPillar {
  id: string;
  /** 简短标题（守秘人视角，如「凶手身份」）。 */
  title: string;
  /** 该支柱的机密真相内容（绝不向玩家泄露原文）。 */
  secret: string;
  /** 是否已被某线索揭示。 */
  uncovered: boolean;
  /** 揭示它的线索名（展示/回溯用）。 */
  uncoveredByClue?: string;
}

/** 剧情锚点：开局生成的一个「必达节点」（默认推进路线上的里程碑）。 */
export interface AnchorNode {
  id: string;
  title: string;        // 简短节点名，如「抵达极地死城」
  description: string;  // 1-2 句：该节点剧情应发生什么
}

/** 本局剧情蓝图：开局一次生成、整局固定（单行/会话）。 */
export interface PlotAnchors {
  /** 3-6 个有序必达节点（默认推进路线）。 */
  nodes: AnchorNode[];
  /** 3-5 条全局硬约束（地理/因果保证）。 */
  constraints: string[];
  /** 威胁达成坏结局所依赖之物（= 玩家可逻辑性瓦解的关键靶子）。 */
  threatDependencies: string[];
}

// ===== Map System（地点有向连线网络）=====
export interface MapLocation {
  id: string;
  name: string;
  description: string;
  /** 可选画布坐标（缺省时由前端自动布局） */
  x?: number;
  y?: number;
}

export interface MapEdge {
  id: string;
  fromId: string;
  toId: string;
  /** bidirectional: A<->B 自由通行；oneway: A-->B 单向不可逆 */
  type: 'bidirectional' | 'oneway';
  description?: string;
}

// ===== Location Elements（地点元素：挂在地点下的环境特征/陈设/可注意之物，与线索正交）=====
/** 地点元素受控分类：LLM 只能从此集合选 category，非法值回落「其他」。 */
export const LOCATION_ELEMENT_CATEGORIES = ['陈设', '机关', '痕迹', '通道', '容器', '异常', '其他'] as const;
export type LocationElementCategory = (typeof LOCATION_ELEMENT_CATEGORIES)[number];

export interface LocationElement {
  id: string;
  /** 父子关联键：用地点【名称】而非 id——删页重放会给地点重分配随机 id，按 id 必成孤儿；名称稳定且地图本就用名称匹配。 */
  locationName: string;
  name: string;
  category: LocationElementCategory;
  description: string;
  createdAt: number;
}

/** 抽取/页锚定用的轻量输入（无 id/createdAt，store 落地时补全）。 */
export interface LocationElementInput {
  locationName: string;
  name: string;
  category: LocationElementCategory;
  description: string;
}

// ===== NPC System（在场/离场 NPC 角色卡）=====
export interface NpcProfile {
  id: string;
  name: string;
  /** 身份/职业 */
  identity: string;
  /** 阵营/立场（可选） */
  faction?: string;
  gender?: string;
  /** 外观年龄印象，如「四十出头」 */
  appearanceAge?: string;
  /** 基础属性（仅在 NPC 可能参战/检定时给出，键用 STR/INT 等） */
  characteristics?: Partial<Record<COC7Characteristic, number>>;
  /** 衍生数值文本，如 HP 12 / SAN 55 / DB +1D4 */
  derived?: string;
  /** 所有技能：技能名→值 */
  skills?: Record<string, number>;
  /** 好感度（对玩家角色）：-100 极端敌对 ~ 0 中立 ~ 100 盲目信任 */
  favorability: number;
  /** 外观印象 */
  appearance: string;
  /** 性格 */
  personality: string;
  /** 内心想法（KP 视角，玩家通常不可直接得知） */
  innerThoughts: string;
  /** 与调查员互动的记忆（按时间累积） */
  memories: string[];
  /** 滚动「记忆梗概」：由 AI 折叠旧互动而成，配合 memories 的最近若干条一起展示/注入 */
  memorySummary?: string;
  /** 人物经历 */
  experience: string;
  /** 背景故事 */
  backstory: string;
  /** 随身物品 */
  possessions: string[];
  /** 是否在场(场景内,可被旁白引用/对话/上下文注入) */
  isPresent: boolean;
  /**
   * 是否在玩家小队(显式同队标记,与 isPresent 解耦)。
   * - undefined/false: 不在小队,仅"在场"或"缺席"
   * - true: 玩家显式邀请入队;LLM 主回合 npcUpdates 不会改此字段(避免抢权)
   * 仅玩家 UI 操作 + post-settle party-relation-evaluator 自动脱队评估器可写。
   */
  inParty?: boolean;
  /** 状态：活跃/昏迷/重伤/已死亡/失踪 等 */
  status?: string;
  /** 当前生命/理智/魔法值（缺省=按属性推算的最大值；最大值仍由 parseNpcDerived 现算）。受 npcUpdates 的 hp/san/mpDelta 与战斗结算回写更新。 */
  hpCurrent?: number;
  sanCurrent?: number;
  mpCurrent?: number;
  /** 剧本预设锚点：scenarioCharacterToNpc 写入；applyUpdates 据此跳过 backstory/innerThoughts，防止 LLM 主回合覆盖 KP 暗线核心。 */
  isScenarioPreset?: boolean;
  /** 剧本 hiddenBio 保护副本（KP 视角动机/秘密）：与 innerThoughts 同源但锁定不被 LLM 覆写。 */
  scenarioHiddenBio?: string;
  createdAt: number;
  updatedAt: number;
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
  /** 战斗检定标记：来自即时战斗面板的检定（与剧情检定区分/筛选）。 */
  context?: 'combat';
  /** 检定用途（战斗用）：攻击命中/伤害骰/闪避/反击/体质对抗/速度检定等。 */
  purpose?: string;
  /** 本次掷骰的逐颗骰子（供书页内滚骰动画渲染）；伤害记录必填，d100 检定可省。 */
  dice?: { value: number; faces: number }[];
  /** R4 推动检定：本次记录系推动检定后的二次结果（pushedFrom 含原失败信息）。 */
  pushed?: boolean;
  /** R7 幸运消耗：本次检定消耗的幸运点数（达成升级所用）。 */
  luckSpent?: number;
  /** 推动理由（玩家/AI 填写，用于历史回顾）。 */
  pushReason?: string;
  /** 推动检定的原始失败记录（仅 pushed=true 时存在）。 */
  pushedFrom?: { roll: number; type: DiceResultType };
  /** R6 成长打钩：本次成功是否计入下次成长检定（用于 ticked 标记落地）。 */
  growthTickEligible?: boolean;
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
  /** 当前会话激活的剧本 id（剧本系统）；老会话 / 「自由探索」可为 undefined 或 '__free'。持久化随 chat blob。 */
  scenarioId?: string;
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

// ===== Combat System =====
export type CombatFaction = 'player' | 'ally' | 'enemy';

export interface CombatWeapon {
  name: string;
  skill: number;
  damage: string;          // 伤害骰式，如 "1D10"、"1D8+1D4"、"1D3"
  impaling: boolean;
  ranged: boolean;
  baseRange?: number;
  attacksPerRound: number;
  loadedAmmo?: number;     // 枪械当前已装弹
  magazine?: number;       // 弹匣容量
  ammoItemName?: string;   // 玩家备弹对应的随身物品名
  reserveAmmo?: number;    // NPC 备弹(NPC 不走库存)
}

export interface CombatantFlags {
  majorWound: boolean;
  dying: boolean;
  unconscious: boolean;
  dead: boolean;
  prone: boolean;
  weaponJammed: boolean;
  /** 已逃离/脱离战斗（区别于倒下/死亡——显示「脱离」而非「倒下」）。 */
  fled: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  faction: CombatFaction;
  controlledBy: 'player' | 'ai';
  dex: number;
  str: number;
  siz: number;
  con: number;
  mov: number;
  fighting: number;
  dodge: number;
  firearm?: number;
  /** 急救技能(COC7e 起始 30%);供 ally 在队友濒死时尝试急救。缺省 = 30。 */
  firstAid?: number;
  /** 伤害加值骰式（如 '1d4' / '0' / '-1'）；近战伤害结算时叠加。 */
  damageBonus?: string;
  hp: number;
  maxHp: number;
  armor: number;
  weapons: CombatWeapon[];
  flags: CombatantFlags;
  tendency?: { attack: number; flee: number };
  roundDefenses: number;
}

export type CombatEndReason = 'victory' | 'defeat' | 'disengage' | 'flee' | 'enemy_retreat' | 'surrender';

/** 战技种类（COC7e 6.3 战技）：缴械/擒抱/推倒/击晕。 */
export type ManeuverKind = 'disarm' | 'grapple' | 'shove' | 'knockout';

/** 一次滚骰演示（同时投出若干骰子）：检定骰(d100，按 type 配色)或伤害骰(damage=true)。 */
export interface CombatRollViz {
  title?: string;
  damage?: boolean;
  dice: { value: number; faces: number; type?: DiceResultType; caption?: string }[];
  total?: number;
  /** 伤害骰滚定后要演出的掉血过渡（血条延后到此刻才下降）。 */
  hp?: { id: string; from: number; to: number; max: number };
  /** 本次检定的行动者 combatant id（供面板高亮「轮到谁」）。 */
  actor?: string;
}

export interface CombatLogEntry {
  kind: 'narrative' | 'roll';
  text: string;
  /** 该行揭示【前】要依次演示的滚骰(检定→伤害)；供书页内滚骰动画与日志交替播放。 */
  rolls?: CombatRollViz[];
}

export interface CombatBystander {
  id: string;
  name: string;
  friendly: boolean;
  joinChance: number;
  combatant?: Combatant;
}

export interface Encounter {
  active: boolean;
  round: number;
  turnOrder: string[];
  currentIdx: number;
  combatants: Combatant[];
  bystanders: CombatBystander[];
  playerTargetId: string | null;
  log: CombatLogEntry[];
  diceRecords: DiceRecord[];
  status: 'active' | 'resolving' | 'ended';
  endReason?: CombatEndReason;
  /** 战斗所属页的稳定 id——战斗面板只在查看该页时显示(翻去别页见正常左右页)。 */
  anchorPageId?: string;
  /** 触发本场战斗的选项/动作文本——脱战生成正文时并入输入。 */
  opener?: string;
  /** 测试战斗（/战斗测试 指令建场）：脱战后【不推进正文】，直接清场。 */
  test?: boolean;
  /**
   * AI 近战/战技攻击玩家时挂起：玩家在 UI 选「闪避/反击/战技反击」后才结算该次攻击并继续推进。
   * 远程攻击不挂起(规则书 p93:被射击不能反击/闪避,直接命中骰)。
   */
  pendingDefense?: {
    attackerId: string;
    kind: 'attack' | 'maneuver';
    /** kind='attack' 时攻击者武器索引 */
    weaponIdx?: number;
    /** kind='maneuver' 时战技种类 */
    maneuverKind?: ManeuverKind;
  } | null;
}

export interface CombatLog {
  entries: CombatLogEntry[];
  endReason: CombatEndReason;
}
