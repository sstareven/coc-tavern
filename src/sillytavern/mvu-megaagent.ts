// src/sillytavern/mvu-megaagent.ts —— 每回合综合调用 A
//
// 设计目标(per memory mvu-api-owns-all-variables-2rpm-target):
//   把原先 9-11 个 fire-and-forget 子调用合并成 1 次 MVU API 综合调用,让单回合稳态 2 RPM。
//   主 API 出正文 + MVU 综合 A 出所有变量(包括暗线/关键词/线索整合/地点元素/地图自检/线索评估/小队关系演化等)。
//
// 不并入综合 A(独立保留):
//   - combat-detector(时序敏感,要立刻进战触发面板渲染)
//   - npc-rectifier(走 rewrite 桶,与 MVU 不抢额度)
//   - 行动补写 / 人物背景补写(用户主动触发,不在主回合循环)
//
// 字段顺序(2026-06-08 重排,推升 prompt cache 命中率; 2026-06-10 npcMemoryUpdates 挪到 partyRelations 后,避免尾部截断丢心智):
//   variables → darkThread → evaluateKeyClues → keywordMeanings → locationElements →
//   partyRelations → npcMemoryUpdates → clueIntegration → locationIntegration → mapReconcile
//   原因:
//   - 小且核心的字段在前(variables/darkThread/evaluateKeyClues);
//   - 整合类大块(clueIntegration/locationIntegration/mapReconcile)放中后,触发率低,
//     即使中段截断主体仍稳定。
//   - cleanedText 和 _meta 已删除 (2026-06-10): cleanedText 1-3KB 大块, 全代码无消费方;
//     _meta.skippedTasks/notes 同样 0 consumer。两者一起删省 1-3KB completion + 推升尾部安全距离。
//   - 触发矩阵在代码侧严格判定(由 buildMegaAgentInput 计算 trigger 对象),不让 LLM 自决。
//
// user payload 字段顺序(2026-06-08 反转):
//   稳定段(跨页几乎恒定:调查员/职业/badEndingDesc/阈值常量/livePillars)放 user 头部 →
//   固定分隔符 `\n--- 本回合动态输入 ---\n` →
//   动态段(narrative/currentLocationName/relations/clues/maps/triggers)放尾部。
//   原因:DeepSeek prompt cache 沿 prefix 命中,稳定段前置可让 SUBAGENT_SHARED_SYSTEM 200t +
//   SYSTEM_PROMPT_A 800-1000t + 稳定段 1.5-2.3k 共同形成 ~2.5-3.5k 稳定区,命中率从 24-32% 推升到 55-65%。

import { callDsSubagent } from './subagent-call';
import { useVariableStore } from '../stores/useVariableStore';
import { useDarkThreadStore } from '../stores/useDarkThreadStore';
import { useKeywordStore } from '../stores/useKeywordStore';
import { useClueStore } from '../stores/useClueStore';
import { useLocationElementStore } from '../stores/useLocationElementStore';
import { useMapStore } from '../stores/useMapStore';
import { useKeyClueStore } from '../stores/useKeyClueStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useNarrationStore } from '../stores/useNarrationStore';
import { useRescueStore } from '../stores/useRescueStore';
import { detectPartyConflicts } from '../scenario/relation-graph';
import type { RelationType, ScenarioCharacter } from '../types/scenario';
import { extractVariablesWithLLM } from './mvu-extractor';
import type { TokenUsage } from './stream-parser';
import { getTreePath, setTreePath } from './mvu-var-access';
import { formatEpochDisplay, computeExpectedProgress, clampDarkThreadProgress } from './time-engine';
import { useNpcMemoryStore } from '../stores/useNpcMemoryStore';
import { normalizeEmotion, type NpcMemoryUpdate } from '../types/npc-world-memory';

// ────────── 阈值常量(代码侧判定触发) ──────────

/** 活跃线索池超过此值触发 clueIntegration 合并。 */
export const CLUE_ACTIVE_CAP = 12;

/** 当前地点元素超过此值触发 locationIntegration 收敛。 */
export const LOCATION_ELEMENT_CAP = 8;

/** 综合 A 输出 JSON Schema(在 system prompt 内嵌)。字段顺序经过抗截尾排列:小且核心在前,大块整合在后。 */
const OUTPUT_SCHEMA_DESC = `{
  "variables": [ { "name": "string", "value": "string" } ],
  "darkThread": null | {
    "development": "string",
    "progress": 0-100,
    "threatLevel": "潜伏"|"浮现"|"紧迫"|"爆发",
    "foreshadowing": "string"
  },
  "evaluateKeyClues": null | { "matches": [ { "pillarId": "string", "clueName": "string" } ] },
  "keywordMeanings": { "<关键词>": "string" },
  "locationElements": null | {
    "locationName": "string",
    "elements": [ { "name": "string", "category": "string", "description": "string" } ]
  },
  "partyRelations": null | {
    "deltas": [ { "sourceId": "string", "targetId": "string", "newType": "family|lover|friend|colleague|mentor|rival|enemy|acquaintance|stranger", "reason"?: "string" } ]
  },
  "timeDelta": { "days": number, "hours": number, "minutes": number },
  "npcMemoryUpdates": null | [ {
    "name": "string",
    "goal"?: "string",
    "nextMove"?: "string",
    "trustOnPC"?: -1~1,
    "emotionToPC"?: "敌意"|"警惕"|"中立"|"友好"|"暧昧"|"恐惧",
    "secretsAdd"?: ["string"],
    "relationshipsUpsert"?: [ { "target": "string", "emotion": "敌意|警惕|中立|友好|暧昧|恐惧", "note": "string" } ],
    "prose"?: "string"
  } ],
  "clueIntegration": null | {
    "synthesized": [ { "name": "string", "summary": "string", "discoveryNarrative": "string", "relatedTo": ["string"], "tags": ["string"] } ],
    "originalClueIds": ["string"]
  },
  "locationIntegration": null | {
    "locationName": "string",
    "mergedElements": [ { "name": "string", "category": "string", "description": "string" } ]
  },
  "mapReconcile": null | {
    "addEdges": [ { "from": "string", "to": "string", "description": "string" } ],
    "removeEdges": [ { "from": "string", "to": "string" } ],
    "merges": [ { "keep": "string", "drop": "string" } ]
  }
}`;

const SYSTEM_PROMPT_A = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人兼 MVU 解析引擎。我会给你本回合主回合产出的完整叙事文本,以及当前游戏状态快照(线索表/NPC表/地点元素表/地图/暗线进度/真相支柱/已知关键词集/阈值)。请一次性产出所有结构化结果,严格按下方 JSON Schema 输出。

输出原则:
1. 严格输出单一 JSON 对象,禁止 Markdown / 代码围栏 / 解释文字。
2. 字段顺序按 Schema 给定(核心高价值字段在前,可选大体量字段在后),防止思考模型尾部截断。
3. 任何子任务在本回合不适用(触发条件未命中),把对应字段置为 null 或空数组/空对象,但字段必须存在不可省略。
4. 守秘人最高机密(坏结局、真相支柱机密、暗线幕后动作)不得反过来注入到 cleanedText 或 foreshadowing 露给玩家。该约束保留只为防止 darkThread.foreshadowing 误写机密 — schema 已删 cleanedText 字段。
5. progress 单调不减且不得低于输入的 currentProgress;75+ 自动 threatLevel='紧迫' 或 '爆发'。
6. 关键词释义只产出 unknownKeywords 列表里的词;已知词不要重复。
7. clueIntegration / locationIntegration / mapReconcile:仅当触发标志 trigger.* 为 true 时填充,否则该字段为 null。
8. evaluateKeyClues.matches 只匹配「本回合新线索 newClues + 未揭示支柱 livePillars」,已揭示支柱不出现。
9. 一律不揣测未给的事实;线索/NPC/地点必须能从叙事中找到出处。

触发标志说明(输入的 trigger 对象):
- trigger.clueIntegrate:活跃线索 > CLUE_ACTIVE_CAP 时为 true。
- trigger.locationIntegrate:当前地点元素 > LOCATION_ELEMENT_CAP 时为 true。
- trigger.mapReconcile:本回合 newLocations 或 newEdges 存在时为 true。
- trigger.locationElementExtract:当前地点存在且叙事有新描述时为 true。
- trigger.keywordMeanings:unknownKeywords.length > 0 时为 true。
- trigger.darkThread:除 isEpilogue=true 外永远 true。
- trigger.evaluateKeyClues:newClues.length > 0 且 livePillars.length > 0 时为 true。
- trigger.partyRelations:小队人数≥2 或叙事中多角色互动时为 true;返回真实发生变化的边,无变化返回 {"deltas":[]};"newType":"stranger" 表示删除该边变回陌生。
- trigger.npcMemoryUpdates:agentMemoryEnabled=true 且本回合有 importance ∈ {核心,重要} 的 NPC 出场或动作时为 true。**仅对本回合被叙事直接涉及（出场/对调查员有反应/发起动作）的 NPC 输出 update**，未涉及的 NPC 不要写。所有字段可选——只写本回合"心思真的变化"的字段，无变化整条 update 不输出。trustOnPC 范围 -1~1（每回合最多 ±0.3 的微调，避免剧烈跳变）。emotionToPC / relationships[].emotion 必须落六选一枚举。relationshipsUpsert 仅写本回合关系发生变化的对象；target 一律写 NPC 真名。secretsAdd 仅追加新秘密（不输出整段已有秘密）。prose 仅当心思发生实质性演变时整段重写（300~500 字）。agentMemoryEnabled=false 时整个字段输出 null（不要给空数组）。
- trigger.timeDelta:永远 true（每回合都有时间流逝）。根据叙事活动类型估算增量：战斗/对峙 1~10 分钟，对话/搜索 10~30 分钟，图书馆查阅/大范围搜索 1~4 小时，城际旅行 数小时~1 天，休息/过夜 8~12 小时。即使叙事是回忆/闪回，时间增量给 {"days":0,"hours":0,"minutes":0}。

**npcMemoryUpdates 硬性规则**：
- 当 agentMemoryEnabled=true 时，必须为**所有在本回合叙事中出现或在场的 NPC** 输出 nextMove 更新（即使目标/情绪未变，nextMove 也必须反映叙事结束时该 NPC 的实际下一步计划）。
- nextMove 的描述应该对应叙事**结束时刻**的状态，而非叙事开始时的计划。

输出 Schema:
${OUTPUT_SCHEMA_DESC}`;

// ────────── 输入/输出类型 ──────────

export interface NewClueInput {
  name: string;
  summary?: string;
  discoveryNarrative?: string;
}

export interface MegaAgentTrigger {
  darkThread: boolean;
  keywordMeanings: boolean;
  evaluateKeyClues: boolean;
  locationElementExtract: boolean;
  clueIntegrate: boolean;
  locationIntegrate: boolean;
  mapReconcile: boolean;
  partyRelations: boolean;
  npcMemoryUpdates: boolean;
  timeDelta: boolean;
}

export interface PartyRelationDelta {
  sourceId: string;
  targetId: string;
  newType: RelationType | 'stranger';
  reason?: string;
}

export interface MegaAgentInput {
  /** scenarioId(可空,自由会话时无剧本即无关系图)。 */
  scenarioId: string | null;
  /** 玩家(调查员)在剧本里的角色 id(自由会话时无)。 */
  playerId: string | null;
  /** 当前剧本关系图序列化(跨页基本恒定,放稳定段)。 */
  currentRelationsDigest: string;
  narrative: string;
  investigatorName: string;
  occupation: string;
  currentLocationName: string | null;
  isEpilogue: boolean;
  darkThreadProgress: number;
  darkThreadThreatLevel: string;
  badEndingDesc: string;
  livePillars: { id: string; title: string; secret: string }[];
  newClues: NewClueInput[];
  activeCluesDigest: { name: string; summary?: string }[];
  locExistingNames: string[];
  locElementCount: number;
  mapLocationsDigest: { id: string; name: string; description?: string }[];
  mapEdgesDigest: { from: string; to: string; description?: string }[];
  newMapDigest: { newLocations: string[]; newEdges: { from: string; to: string }[] };
  unknownKeywords: string[];
  /** Agent Memory 开关 effective 值(2026-06-10);false 时 LLM 不输出 npcMemoryUpdates。 */
  agentMemoryEnabled: boolean;
  /** 当前重要/核心 NPC 的心智档案摘要(供 LLM 增量参考;关闭时空串)。 */
  npcMemoryDigest: string;
  /** 当前剧情已过时间(分钟) + 显示用字符串(2026-06-10)。 */
  currentTimeEpoch: number;
  currentTimeDisplay: string;
  /** 剧本推荐时间跨度(分钟)；无剧本时 0。 */
  storyDurationMinutes: number;
  trigger: MegaAgentTrigger;
}

export interface MegaAgentResult {
  variables: Record<string, string>;
  darkThread: { development: string; progress: number; threatLevel: string; foreshadowing: string } | null;
  keywordMeanings: Record<string, string>;
  evaluateKeyClues: { matches: { pillarId: string; clueName: string }[] } | null;
  locationElements: { locationName: string; elements: { name: string; category: string; description: string }[] } | null;
  clueIntegration: {
    synthesized: { name: string; summary: string; discoveryNarrative: string; relatedTo: string[]; tags: string[] }[];
    originalClueIds: string[];
  } | null;
  locationIntegration: {
    locationName: string;
    mergedElements: { name: string; category: string; description: string }[];
  } | null;
  mapReconcile: {
    addEdges: { from: string; to: string; description?: string }[];
    removeEdges: { from: string; to: string }[];
    merges: { keep: string; drop: string }[];
  } | null;
  partyRelations: { deltas: PartyRelationDelta[] } | null;
  /** 本回合剧情时间增量(2026-06-10)。 */
  timeDelta: { days: number; hours: number; minutes: number } | null;
  /** 本回合 NPC 心智档案增量(2026-06-10);agentMemoryEnabled=false 时为 null。 */
  npcMemoryUpdates: NpcMemoryUpdate[] | null;
  /** 集成测试/UI 显示用。 */
  usage?: TokenUsage;
  /** 走回退路径时为 true(综合 A 失败,只拿到 variables)。 */
  fallback?: boolean;
}

// ────────── 输入构造 ──────────

/**
 * 从当前 store 快照构造 MegaAgentInput。
 * narrative:本回合主响应产出的左+右内容。
 * extras:主响应解析后的新线索/新地图变更等(由 useChatPipeline 提供)。
 */
export function buildMegaAgentInput(opts: {
  narrative: string;
  isEpilogue: boolean;
  newClues: NewClueInput[];
  newLocations: string[];
  newEdges: { from: string; to: string }[];
  /** <kw> 标签未知关键词(已过滤 store 已有)。 */
  unknownKeywords: string[];
  /** 当前会话剧本 id(自由会话为 null)。 */
  scenarioId: string | null;
  /** 当前玩家(调查员)在剧本里的角色 id(自由会话为 null)。 */
  playerId: string | null;
  /** Agent Memory 开关 effective 值(2026-06-10)。 */
  agentMemoryEnabled: boolean;
}): MegaAgentInput {
  const sheet = useCharSheetStore.getState().sheet;
  const investigatorName = sheet?.identity?.name ?? '调查员';
  const occupation = sheet?.identity?.occupation ?? '职业不详';

  const mapState = useMapStore.getState();
  const currentLoc = mapState.locations.find((l) => l.id === mapState.currentLocationId);
  const currentLocationName = currentLoc?.name ?? null;

  const dtState = useDarkThreadStore.getState();
  const dtLatest = dtState.entries[dtState.entries.length - 1];
  const darkThreadProgress = dtLatest?.progress ?? 0;
  const darkThreadThreatLevel = dtLatest?.threatLevel ?? '潜伏';
  const badEndingDesc = dtState.badEnding?.description ?? '';

  const livePillars = useKeyClueStore.getState().pillars
    .filter((p) => !p.uncovered)
    .map((p) => ({ id: p.id, title: p.title, secret: p.secret }));

  const activeCluesDigest = useClueStore.getState().clues
    .filter((c) => c.status !== 'archived')
    .slice(0, 30)
    .map((c) => ({ name: c.name, summary: c.summary }));

  const locExistingNames = currentLocationName
    ? useLocationElementStore.getState().getByLocation(currentLocationName).map((e) => e.name)
    : [];
  const locElementCount = locExistingNames.length;

  const mapLocationsDigest = mapState.locations.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
  }));
  const mapEdgesDigest = mapState.edges.map((e) => ({
    from: e.fromId,
    to: e.toId,
    description: e.description,
  }));

  // 关系图序列化:跨页基本恒定,放稳定段以利缓存命中。
  let currentRelationsDigest = '(自由会话,无关系图)';
  let partyRelationsTrigger = false;
  if (opts.scenarioId && opts.scenarioId !== '__free' && opts.playerId) {
    const doc = useScenarioStore.getState().getById(opts.scenarioId);
    if (doc) {
      currentRelationsDigest = renderRelationsDigest(doc.characters, opts.playerId);
      // 触发判定:小队人数 ≥2 才触发 partyRelations 子任务。
      // 旧版用「叙事中包含中文括号对话」做兜底, 但 COC 跑团几乎每回合都有 NPC 对话, 等于无脑触发,
      // 浪费 LLM 在 1v1 场景上做关系演化判定 (1v1 关系靠 npcMemoryUpdates 通道 trustOnPC/emotionToPC 就够)
      const partySize = useNpcStore.getState().getParty().length;
      partyRelationsTrigger = partySize >= 2;
    }
  }

  // 触发矩阵 — 代码侧严格判定
  const trigger: MegaAgentTrigger = {
    darkThread: !opts.isEpilogue,
    keywordMeanings: opts.unknownKeywords.length > 0,
    evaluateKeyClues: opts.newClues.length > 0 && livePillars.length > 0,
    locationElementExtract: !!currentLocationName,
    clueIntegrate: activeCluesDigest.length > CLUE_ACTIVE_CAP,
    locationIntegrate: locElementCount > LOCATION_ELEMENT_CAP,
    mapReconcile: opts.newLocations.length > 0 || opts.newEdges.length > 0,
    partyRelations: partyRelationsTrigger,
    npcMemoryUpdates: opts.agentMemoryEnabled,
    timeDelta: true,
  };

  // NPC Memory 摘要(Agent Memory 开启时构造;关闭直接空串以保 prompt 缓存命中)。
  let npcMemoryDigest = '';
  if (opts.agentMemoryEnabled) {
    const npcStore = useNpcStore.getState();
    const memStore = useNpcMemoryStore.getState();
    const lines: string[] = [];
    for (const [id, mem] of Object.entries(memStore.memories)) {
      const profile = npcStore.profiles[id];
      if (!profile) continue;
      if (profile.importance !== '核心' && profile.importance !== '重要') continue;
      lines.push(`- ${profile.name}(${profile.importance}): goal="${mem.goal}" nextMove="${mem.nextMove}" emo=${mem.emotionToPC}/${mem.trustOnPC.toFixed(2)}`);
    }
    npcMemoryDigest = lines.length > 0 ? lines.join('\n') : '(尚无心智档案,请按需新建)';
  }

  const varState = useVariableStore.getState();
  const currentTimeEpoch = Number(getTreePath(varState.statData, '世界.时间.epoch')) || 0;
  const currentTimeDisplay = String(getTreePath(varState.statData, '世界.时间.display') || '');
  const scenarioDoc = (opts.scenarioId && opts.scenarioId !== '__free')
    ? useScenarioStore.getState().getById(opts.scenarioId) : null;
  const storyDurationMinutes = scenarioDoc?.storyDurationMinutes ?? 0;

  return {
    scenarioId: opts.scenarioId,
    playerId: opts.playerId,
    currentRelationsDigest,
    narrative: opts.narrative,
    investigatorName,
    occupation,
    currentLocationName,
    isEpilogue: opts.isEpilogue,
    darkThreadProgress,
    darkThreadThreatLevel,
    badEndingDesc,
    livePillars,
    newClues: opts.newClues,
    activeCluesDigest,
    locExistingNames,
    locElementCount,
    mapLocationsDigest,
    mapEdgesDigest,
    newMapDigest: { newLocations: opts.newLocations, newEdges: opts.newEdges },
    unknownKeywords: opts.unknownKeywords,
    agentMemoryEnabled: opts.agentMemoryEnabled,
    npcMemoryDigest,
    currentTimeEpoch,
    currentTimeDisplay,
    storyDurationMinutes,
    trigger,
  };
}

/** 跨页基本恒定(仅在 LLM 更新关系后变化),放稳定段以利前缀缓存命中。 */
function renderRelationsDigest(chars: ScenarioCharacter[], playerId: string): string {
  const nameById = new Map(chars.map((c) => [c.id, c.sheet?.identity?.name || c.id]));
  const lines: string[] = [];
  for (const c of chars) {
    if (!c.relations?.length) continue;
    const src = nameById.get(c.id) ?? c.id;
    for (const r of c.relations) {
      const tgt = nameById.get(r.targetId) ?? r.targetId;
      const tag = c.id === playerId ? '玩家' : '';
      lines.push(`- ${tag}${src}(${c.id}) → ${tgt}(${r.targetId}): ${r.type}${r.note ? `(${r.note})` : ''}`);
    }
  }
  if (lines.length === 0) return '(当前关系图为空)';
  return lines.join('\n');
}

function formatUserPayload(input: MegaAgentInput): string {
  const livePillarsText = input.livePillars.length > 0
    ? input.livePillars.map((p, i) => `${i + 1}. id=${p.id} title=${p.title} secret=${p.secret}`).join('\n')
    : '(无)';

  // ── 稳定段(跨页基本恒定,放头部以利 prompt cache 命中) ──
  // 调查员卡 / badEndingDesc / livePillars / 阈值常量 / 关系图序列化 都属于跨页变更极少的项。
  const stable = `当前会话不变信息:
- 调查员:${input.investigatorName}(职业:${input.occupation})
- 注定坏结局(机密):${input.badEndingDesc || '(未生成)'}
- 阈值常量:CLUE_ACTIVE_CAP=${CLUE_ACTIVE_CAP},LOCATION_ELEMENT_CAP=${LOCATION_ELEMENT_CAP}
- 剧本推荐时间跨度: ${input.storyDurationMinutes > 0 ? input.storyDurationMinutes + '分钟' : '(无)'}
- 未揭示真相支柱(机密,仅未揭示):
${livePillarsText}
- 当前剧本关系图:
${input.currentRelationsDigest}`;

  // ── 动态段(跨页变化大,放尾部) ──
  const dynamic = `--- 本回合动态输入 ---
本回合叙事(左+右内容拼接):
<narrative>
${input.narrative}
</narrative>

本回合动态状态:
- 当前地点:${input.currentLocationName ?? '(未定位)'}
- isEpilogue:${input.isEpilogue}
- 暗线当前进度:${input.darkThreadProgress},威胁等级:${input.darkThreadThreatLevel}
- 本回合主 API 已解析的新线索 newClues:${JSON.stringify(input.newClues)}
- 活跃线索池快照(最多 30 条):${JSON.stringify(input.activeCluesDigest)}
- 当前地点已有元素名清单:${JSON.stringify(input.locExistingNames)}
- 当前地点元素总数:${input.locElementCount}
- 地图地点表:${JSON.stringify(input.mapLocationsDigest)}
- 地图边表:${JSON.stringify(input.mapEdgesDigest)}
- 本回合主 API 报告的 newLocations/newEdges:${JSON.stringify(input.newMapDigest)}
- 叙事中出现且未知的关键词 unknownKeywords:${JSON.stringify(input.unknownKeywords)}
- 触发标志:${JSON.stringify(input.trigger)}
- 当前剧情已过时间: epoch=${input.currentTimeEpoch}分钟 display="${input.currentTimeDisplay}"
- Agent Memory 开关 agentMemoryEnabled:${input.agentMemoryEnabled}${input.agentMemoryEnabled ? `\n- 当前 NPC 心智档案摘要(供增量参考):\n${input.npcMemoryDigest}` : ''}

请按 Schema 一次性输出全部字段。`;

  return `${stable}\n\n${dynamic}`;
}

// ────────── 主入口 ──────────

const EMPTY_RESULT: Omit<MegaAgentResult, 'usage' | 'fallback'> = {
  variables: {},
  darkThread: null,
  keywordMeanings: {},
  evaluateKeyClues: null,
  locationElements: null,
  clueIntegration: null,
  locationIntegration: null,
  mapReconcile: null,
  partyRelations: null,
  timeDelta: null,
  npcMemoryUpdates: null,
};

interface RunOpts {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

/**
 * 综合 A 单次调用。失败时回落到 mvu-extractor 旧路径仅取 variables,其他字段返回空(下回合 trigger 仍可命中)。
 */
export async function runMvuMegaAgent(input: MegaAgentInput, opts: RunOpts): Promise<MegaAgentResult> {
  try {
    const resp = await callDsSubagent({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      model: opts.model,
      signal: opts.signal,
      temperature: 1,
      maxTokens: 32768,
      rpmLane: 'mvu',
      label: 'MVU 大综合',
      jsonObject: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_A },
        { role: 'user', content: formatUserPayload(input) },
      ],
    });

    if (!resp.parsed) {
      return await fallbackToExtractor(input, opts);
    }

    return parseMegaAgentResponse(resp.parsed, resp.usage, input);
  } catch (err) {
    // 区分用户主动取消 vs 真实错误: AbortError 直接 rethrow, 不走 fallback (fallback 又会跑一次 LLM)
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      (opts.signal?.aborted ?? false);
    if (isAbort) throw err;
    return await fallbackToExtractor(input, opts);
  }
}

/** 综合 A 整体失败时:回落到 mvu-extractor 旧路径,只拿 variables;其他字段空。 */
async function fallbackToExtractor(input: MegaAgentInput, opts: RunOpts): Promise<MegaAgentResult> {
  try {
    const r = await extractVariablesWithLLM(input.narrative, opts.apiBaseUrl, opts.apiKey, opts.model, 1, 1, 32768, opts.signal);
    return {
      ...EMPTY_RESULT,
      variables: r.variables ?? {},
      usage: r.usage,
      fallback: true,
    };
  } catch {
    return { ...EMPTY_RESULT, fallback: true };
  }
}

// ────────── 解析(字段级降级) ──────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parseMegaAgentResponse(parsed: Record<string, unknown>, usage?: TokenUsage, input?: MegaAgentInput): MegaAgentResult {
  // variables:接受 [{name,value}] 数组 或 {name:value} 字典
  const variables: Record<string, string> = {};
  const rawVars = parsed.variables;
  if (Array.isArray(rawVars)) {
    for (const v of rawVars as Record<string, unknown>[]) {
      const name = asString(v?.name);
      const value = asString(v?.value);
      if (name) variables[name] = value;
    }
  } else if (asObject(rawVars)) {
    for (const [name, value] of Object.entries(rawVars as Record<string, unknown>)) {
      if (typeof name === 'string' && name) variables[name] = asString(value);
    }
  }

  // darkThread:整体可空
  let darkThread: MegaAgentResult['darkThread'] = null;
  const dtRaw = asObject(parsed.darkThread);
  if (dtRaw) {
    // progress 单调防御 — SYSTEM_PROMPT_A 第 111 行明令「单调不减且不得低于 currentProgress」,
    // 但 LLM 偶发会误写更小值 (例如 30 写成 3), 这里强制 floor 到 currentDarkThreadProgress.
    const llmProgress = Math.max(0, Math.min(100, Math.floor(asNumber(dtRaw.progress))));
    const floorProgress = input?.darkThreadProgress ?? 0;
    darkThread = {
      development: asString(dtRaw.development),
      progress: Math.max(llmProgress, floorProgress),
      threatLevel: asString(dtRaw.threatLevel, '潜伏'),
      foreshadowing: asString(dtRaw.foreshadowing),
    };
  }

  // keywordMeanings:键值字典
  const keywordMeanings: Record<string, string> = {};
  const kmRaw = asObject(parsed.keywordMeanings);
  if (kmRaw) {
    for (const [k, v] of Object.entries(kmRaw)) {
      if (k && typeof v === 'string' && v.trim()) keywordMeanings[k] = v.trim();
    }
  }

  let evaluateKeyClues: MegaAgentResult['evaluateKeyClues'] = null;
  const kcRaw = asObject(parsed.evaluateKeyClues);
  if (kcRaw && Array.isArray(kcRaw.matches)) {
    const matches = (kcRaw.matches as Record<string, unknown>[])
      .map((m) => ({ pillarId: asString(m?.pillarId), clueName: asString(m?.clueName) }))
      .filter((m) => m.pillarId && m.clueName);
    evaluateKeyClues = { matches };
  }

  let locationElements: MegaAgentResult['locationElements'] = null;
  const leRaw = asObject(parsed.locationElements);
  if (leRaw && asString(leRaw.locationName)) {
    const elements = asArray<Record<string, unknown>>(leRaw.elements)
      .map((e) => ({
        name: asString(e?.name),
        category: asString(e?.category),
        description: asString(e?.description),
      }))
      .filter((e) => e.name);
    locationElements = { locationName: asString(leRaw.locationName), elements };
  }

  let clueIntegration: MegaAgentResult['clueIntegration'] = null;
  const ciRaw = asObject(parsed.clueIntegration);
  if (ciRaw) {
    const synthesized = asArray<Record<string, unknown>>(ciRaw.synthesized)
      .map((s) => ({
        name: asString(s?.name),
        summary: asString(s?.summary),
        discoveryNarrative: asString(s?.discoveryNarrative),
        relatedTo: asArray<string>(s?.relatedTo).filter((x) => typeof x === 'string'),
        tags: asArray<string>(s?.tags).filter((x) => typeof x === 'string'),
      }))
      .filter((s) => s.name);
    const originalClueIds = asArray<string>(ciRaw.originalClueIds).filter((x) => typeof x === 'string');
    clueIntegration = { synthesized, originalClueIds };
  }

  let locationIntegration: MegaAgentResult['locationIntegration'] = null;
  const liRaw = asObject(parsed.locationIntegration);
  if (liRaw && asString(liRaw.locationName)) {
    const mergedElements = asArray<Record<string, unknown>>(liRaw.mergedElements)
      .map((e) => ({
        name: asString(e?.name),
        category: asString(e?.category),
        description: asString(e?.description),
      }))
      .filter((e) => e.name);
    locationIntegration = { locationName: asString(liRaw.locationName), mergedElements };
  }

  let mapReconcile: MegaAgentResult['mapReconcile'] = null;
  const mrRaw = asObject(parsed.mapReconcile);
  if (mrRaw) {
    const addEdges = asArray<Record<string, unknown>>(mrRaw.addEdges)
      .map((e) => ({ from: asString(e?.from), to: asString(e?.to), description: asString(e?.description) }))
      .filter((e) => e.from && e.to);
    const removeEdges = asArray<Record<string, unknown>>(mrRaw.removeEdges)
      .map((e) => ({ from: asString(e?.from), to: asString(e?.to) }))
      .filter((e) => e.from && e.to);
    const merges = asArray<Record<string, unknown>>(mrRaw.merges)
      .map((m) => ({ keep: asString(m?.keep), drop: asString(m?.drop) }))
      .filter((m) => m.keep && m.drop);
    mapReconcile = { addEdges, removeEdges, merges };
  }

  let partyRelations: MegaAgentResult['partyRelations'] = null;
  const prRaw = asObject(parsed.partyRelations);
  if (prRaw) {
    const deltas = asArray<Record<string, unknown>>(prRaw.deltas)
      .map((d) => ({
        sourceId: asString(d?.sourceId),
        targetId: asString(d?.targetId),
        newType: asString(d?.newType) as PartyRelationDelta['newType'],
        reason: typeof d?.reason === 'string' ? d.reason : undefined,
      }))
      .filter((d) => d.sourceId && d.targetId && d.newType);
    partyRelations = { deltas };
  }

  // timeDelta
  let timeDelta: MegaAgentResult['timeDelta'] = null;
  const tdRaw = asObject(parsed.timeDelta);
  if (tdRaw) {
    const days = Math.max(0, asNumber(tdRaw.days));
    const hours = Math.max(0, asNumber(tdRaw.hours));
    const minutes = Math.max(0, asNumber(tdRaw.minutes));
    if (days > 0 || hours > 0 || minutes > 0) {
      timeDelta = { days, hours, minutes };
    }
  }

  // npcMemoryUpdates(2026-06-10):agentMemoryEnabled=false 时 LLM 输出 null,这里直接返 null。
  let npcMemoryUpdates: MegaAgentResult['npcMemoryUpdates'] = null;
  if (Array.isArray(parsed.npcMemoryUpdates)) {
    const arr = (parsed.npcMemoryUpdates as Record<string, unknown>[])
      .map((u): NpcMemoryUpdate | null => {
        const name = asString(u?.name).trim();
        if (!name) return null;
        const out: NpcMemoryUpdate = { name };
        if (typeof u?.goal === 'string' && u.goal.trim()) out.goal = u.goal.trim();
        if (typeof u?.nextMove === 'string' && u.nextMove.trim()) out.nextMove = u.nextMove.trim();
        if (typeof u?.trustOnPC === 'number' && Number.isFinite(u.trustOnPC)) out.trustOnPC = u.trustOnPC;
        if (u?.emotionToPC !== undefined) out.emotionToPC = normalizeEmotion(u.emotionToPC);
        if (Array.isArray(u?.secretsAdd)) {
          const sa = (u.secretsAdd as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
          if (sa.length > 0) out.secretsAdd = sa;
        }
        if (Array.isArray(u?.relationshipsUpsert)) {
          const rs = (u.relationshipsUpsert as Record<string, unknown>[])
            .map((r) => ({
              target: asString(r?.target).trim(),
              emotion: normalizeEmotion(r?.emotion),
              note: typeof r?.note === 'string' ? r.note : '',
            }))
            .filter((r) => r.target);
          if (rs.length > 0) out.relationshipsUpsert = rs;
        }
        if (typeof u?.prose === 'string' && u.prose.trim()) out.prose = u.prose.trim();
        return out;
      })
      .filter((x): x is NpcMemoryUpdate => x !== null);
    npcMemoryUpdates = arr;
  }

  return {
    variables,
    darkThread,
    keywordMeanings,
    evaluateKeyClues,
    locationElements,
    clueIntegration,
    locationIntegration,
    mapReconcile,
    partyRelations,
    timeDelta,
    npcMemoryUpdates,
    usage,
  };
}

// ────────── 结果分发到 store ──────────

/**
 * 把综合 A 解析后的字段分发到对应 store。
 * 每个字段独立 dispatch,缺失/null 跳过(不影响其他字段)。
 *
 * 返回信息列表:用于 useChatPipeline 写日志/统计/写回页面。
 */
export interface DispatchSummary {
  variablesApplied: number;
  darkThreadApplied: boolean;
  keywordsAdded: number;
  evaluateKeyCluesMatches: number;
  locationElementsAdded: number;
  clueIntegrationCount: number;
  locationIntegrationCount: number;
  mapReconcileActions: number;
  partyRelationDeltasApplied: number;
  partyConflictsResolved: number;
  npcMemoryUpdatesApplied: number;
  timeAdvancedMinutes: number;
}

export interface DispatchOpts {
  /** 剧本 id;为应用 partyRelations 必需。自由会话或无剧本时传 null,该字段无效。 */
  scenarioId: string | null;
  /** Agent Memory 开关 effective 值(2026-06-10);false 时即使 LLM 输出 npcMemoryUpdates 也跳过。 */
  agentMemoryEnabled?: boolean;
  /** 当前回合索引(pages.length),写入 NpcMemory.updatedAt。 */
  turn?: number;
  storyDurationMinutes?: number;
}

export function dispatchMegaAgentResult(result: MegaAgentResult, opts: DispatchOpts = { scenarioId: null }): DispatchSummary {
  const summary: DispatchSummary = {
    variablesApplied: 0,
    darkThreadApplied: false,
    keywordsAdded: 0,
    evaluateKeyCluesMatches: 0,
    locationElementsAdded: 0,
    clueIntegrationCount: 0,
    locationIntegrationCount: 0,
    mapReconcileActions: 0,
    partyRelationDeltasApplied: 0,
    partyConflictsResolved: 0,
    npcMemoryUpdatesApplied: 0,
    timeAdvancedMinutes: 0,
  };

  // variables → useVariableStore
  for (const [name, value] of Object.entries(result.variables)) {
    useVariableStore.getState().setVariable(name, value, 'llm');
    summary.variablesApplied += 1;
  }

  // timeDelta → statData.世界.時間
  if (result.timeDelta) {
    const deltaMinutes = result.timeDelta.days * 1440 + result.timeDelta.hours * 60 + result.timeDelta.minutes;
    if (deltaMinutes > 0) {
      const varStore = useVariableStore.getState();
      const sd: Record<string, unknown> = structuredClone(varStore.statData) ?? {};
      const prevEpoch = Number(getTreePath(sd, '世界.时间.epoch')) || 0;
      const newEpoch = prevEpoch + deltaMinutes;
      setTreePath(sd, '世界.时间.epoch', newEpoch);
      const startDate = String(getTreePath(sd, '世界.时间.startDate') || '');
      if (startDate) {
        setTreePath(sd, '世界.时间.display', formatEpochDisplay(startDate, newEpoch));
      }
      varStore.setStatData(sd);
      summary.timeAdvancedMinutes = deltaMinutes;
    }
  }

  // darkThread → useDarkThreadStore + useBookStore.setPageDarkThread(由 useChatPipeline 处理)
  //               + statData 树同步(让 CurrentScenarioBadge / 世界书 EJS 等读 statData 的位点立刻
  //                 跟上;否则后端 store 已有 progress=7,UI 仍读 statData 的 '剧情.暗线.进度' 初值 0)。
  if (result.darkThread && result.darkThread.development) {
    // 暗线节奏钳位(2026-06-10 时间管理):有剧本推荐时长时,用 clampDarkThreadProgress 限制
    // progress 偏离期望值的幅度。必须在 store 写入之前完成,否则钳位结果不会落盘。
    const storyDur = opts.storyDurationMinutes ?? 0;
    if (storyDur > 0) {
      const varStore0 = useVariableStore.getState();
      const curEpoch = Number(getTreePath(varStore0.statData, '世界.时间.epoch')) || 0;
      const expected = computeExpectedProgress(curEpoch, storyDur);
      // 取上一回合的 progress 作为单调不减基线(而非 LLM 本回合输出)
      const dtStore = useDarkThreadStore.getState();
      const prevProgress = dtStore.entries[dtStore.entries.length - 1]?.progress ?? 0;
      result.darkThread.progress = clampDarkThreadProgress(prevProgress, expected, result.darkThread.progress);
    }

    useDarkThreadStore.getState().addEntry({
      progress: result.darkThread.progress,
      threatLevel: result.darkThread.threatLevel as never,
      details: result.darkThread.development,
      foreshadowing: result.darkThread.foreshadowing,
    });
    const varStore = useVariableStore.getState();
    const next: Record<string, unknown> = structuredClone(varStore.statData) ?? {};
    setTreePath(next, '剧情.暗线.进度', result.darkThread.progress);
    setTreePath(next, '剧情.暗线.威胁等级', result.darkThread.threatLevel);
    setTreePath(next, '剧情.暗线.描述', result.darkThread.development);
    varStore.setStatData(next);
    summary.darkThreadApplied = true;
  }

  // keywordMeanings → useKeywordStore
  if (Object.keys(result.keywordMeanings).length > 0) {
    useKeywordStore.getState().addKeywords(result.keywordMeanings);
    summary.keywordsAdded = Object.keys(result.keywordMeanings).length;
  }

  // evaluateKeyClues → useKeyClueStore + useClueStore
  if (result.evaluateKeyClues && result.evaluateKeyClues.matches.length > 0) {
    for (const m of result.evaluateKeyClues.matches) {
      useKeyClueStore.getState().markPillarUncovered(m.pillarId, m.clueName);
      useClueStore.getState().markClueKey(m.clueName, m.pillarId);
    }
    summary.evaluateKeyCluesMatches = result.evaluateKeyClues.matches.length;
  }

  // locationElements → useLocationElementStore
  if (result.locationElements && result.locationElements.elements.length > 0) {
    useLocationElementStore.getState().applyExtracted(
      result.locationElements.elements.map((e) => ({
        locationName: result.locationElements!.locationName,
        name: e.name,
        category: e.category,
        description: e.description,
      })) as never,
    );
    summary.locationElementsAdded = result.locationElements.elements.length;
  }

  // clueIntegration → useClueStore.consolidateClues
  if (result.clueIntegration && result.clueIntegration.synthesized.length > 0) {
    useClueStore.getState().consolidateClues(
      result.clueIntegration.synthesized as never,
      result.clueIntegration.originalClueIds,
    );
    summary.clueIntegrationCount = result.clueIntegration.synthesized.length;
  }

  // locationIntegration → useLocationElementStore.consolidateLocation
  if (result.locationIntegration && result.locationIntegration.mergedElements.length > 0) {
    useLocationElementStore.getState().consolidateLocation(
      result.locationIntegration.locationName,
      result.locationIntegration.mergedElements as never,
    );
    summary.locationIntegrationCount = result.locationIntegration.mergedElements.length;
  }

  // mapReconcile → useMapStore + 同步 useLocationElementStore.renameLocation + useNpcStore.renameLocation
  if (result.mapReconcile) {
    const map = useMapStore.getState();
    for (const m of result.mapReconcile.merges) {
      map.mergeLocations(m.keep, [m.drop]);
      useLocationElementStore.getState().renameLocation(m.drop, m.keep);
      useNpcStore.getState().renameLocation(m.drop, m.keep);
    }
    if (result.mapReconcile.removeEdges.length > 0) {
      map.removeEdgesByName(result.mapReconcile.removeEdges);
    }
    if (result.mapReconcile.addEdges.length > 0) {
      map.applyUpdates({ newEdges: result.mapReconcile.addEdges });
    }
    summary.mapReconcileActions =
      result.mapReconcile.merges.length +
      result.mapReconcile.removeEdges.length +
      result.mapReconcile.addEdges.length;
  }

  // partyRelations → useScenarioStore.applyRelationDelta + detectPartyConflicts + 脱队旁白
  // (原 party-relation-evaluator 独立子调用已并入综合 A,不再走主桶 RPM)
  if (result.partyRelations && result.partyRelations.deltas.length > 0 && opts.scenarioId) {
    const validDeltas = result.partyRelations.deltas.filter(
      (d) => d.sourceId && d.targetId && d.newType,
    );
    if (validDeltas.length > 0) {
      useScenarioStore.getState().applyRelationDelta(opts.scenarioId, validDeltas);
      summary.partyRelationDeltasApplied = validDeltas.length;

      const freshDoc = useScenarioStore.getState().getById(opts.scenarioId);
      if (freshDoc) {
        const party = useNpcStore.getState().getParty();
        const partyIds = party.map((p) => p.id);
        const conflicts = detectPartyConflicts(freshDoc, partyIds);
        for (const { kickedId, hostileWithId } of conflicts) {
          const kicked = party.find((p) => p.id === kickedId);
          const hostile = party.find((p) => p.id === hostileWithId) ?? { name: hostileWithId };
          useNpcStore.getState().leaveParty(kickedId);
          useNarrationStore.getState().append(
            `${kicked?.name ?? kickedId} 因与 ${hostile.name} 反目，离队而去。`,
          );
          summary.partyConflictsResolved += 1;
        }
      }
    }
  }

  // 拯救路径快照水合(管线末端):从 LLM 已写入的 statData 反向回灌 useRescueStore,
  // 让 RescueBar / buildContextInjection 读到最新一致快照。
  // 即便本回合无 variables/darkThread,也调一次——LLM 可能只改了 剧情.救援.* 字段。
  useRescueStore.getState().hydrateFromStatData(useVariableStore.getState().statData);

  // npcMemoryUpdates → useNpcMemoryStore(2026-06-10)。开关关闭时即使 LLM 输出也跳过,保持空 store。
  if (opts.agentMemoryEnabled && result.npcMemoryUpdates && result.npcMemoryUpdates.length > 0) {
    const npcStore = useNpcStore.getState();
    const turn = typeof opts.turn === 'number' ? opts.turn : 0;
    // 兜底匹配 — 严格 trim 后逐字相等优先(npcStore.findIdByName);找不到时尝试唯一前缀/包含
    // (LLM 偶发会写「霍尔姆斯先生」而 profile 名是「霍尔姆斯」)。仅当只有一个候选时使用 fuzzy,
    // 防止退化回老 bug:多 NPC 时模糊归并会误并。多义/0义都回退到丢失,而非误写。
    const looseFindIdByName = (name: string): string | null => {
      const strict = npcStore.findIdByName(name);
      if (strict) return strict;
      const trimmed = name.trim();
      if (!trimmed) return null;
      const candidates: string[] = [];
      for (const [id, p] of Object.entries(npcStore.profiles)) {
        const pn = p.name.trim();
        if (!pn) continue;
        if (pn === trimmed) continue; // 已经被 strict 找到了或不可能命中
        if (pn.includes(trimmed) || trimmed.includes(pn)) candidates.push(id);
      }
      return candidates.length === 1 ? candidates[0] : null;
    };
    useNpcMemoryStore.getState().applyUpdates(result.npcMemoryUpdates, turn, {
      findIdByName: looseFindIdByName,
      isScenarioPreset: (id) => npcStore.profiles[id]?.isScenarioPreset === true,
    });
    summary.npcMemoryUpdatesApplied = result.npcMemoryUpdates.length;
  }

  return summary;
}

// ────────── 工具函数 ──────────

/**
 * 从叙事文本中扫出所有 `<kw>X</kw>` 标签里的关键词(去重、保持首见顺序)。
 * 原 keyword-meaning-extractor.ts 内的工具函数,v1.14.x 合并到此(megaagent 体系内自给自足)。
 * 不识别孤立 `<kw>` 或 `</kw>` — 那些由 stripOrphanKwTags 兜底清理。
 */
export function extractKwTaggedKeywords(narrative: string): string[] {
  if (!narrative) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<kw>([^<]+)<\/kw>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative)) !== null) {
    const k = m[1].trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
