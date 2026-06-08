// src/sillytavern/mvu-megaagent.ts —— 每回合综合调用 A
//
// 设计目标(per memory mvu-api-owns-all-variables-2rpm-target):
//   把原先 9-11 个 fire-and-forget 子调用合并成 1 次 MVU API 综合调用,让单回合稳态 2 RPM。
//   主 API 出正文 + MVU 综合 A 出所有变量(包括暗线/关键词/线索整合/地点元素/地图自检/线索评估等)。
//
// 不并入综合 A(独立保留):
//   - combat-detector(时序敏感,要立刻进战触发面板渲染)
//   - npc-rectifier(走 rewrite 桶,与 MVU 不抢额度)
//   - 行动补写 / 人物背景补写(用户主动触发,不在主回合循环)
//
// 字段顺序按 inline-llm-fields-truncate-trailing 警告:核心字段在前(variables/cleanedText/darkThread),
// 中量字段在中(keywordMeanings/evaluateKeyClues/locationElements),大体量整合在后(clueIntegration/
// locationIntegration/mapReconcile),诊断字段最末(_meta)。即使 LLM 输出尾端截断,损失的也是最次要项。
//
// 触发矩阵在代码侧严格判定(由 buildMegaAgentInput 计算 trigger 对象),不让 LLM 自决。

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
import { extractVariablesWithLLM } from './mvu-extractor';
import type { TokenUsage } from './stream-parser';
import { setTreePath } from './mvu-var-access';

// ────────── 阈值常量(代码侧判定触发) ──────────

/** 活跃线索池超过此值触发 clueIntegration 合并。 */
export const CLUE_ACTIVE_CAP = 12;

/** 当前地点元素超过此值触发 locationIntegration 收敛。 */
export const LOCATION_ELEMENT_CAP = 8;

/** 综合 A 输出 JSON Schema(在 system prompt 内嵌)。字段顺序经过抗截尾排列。 */
const OUTPUT_SCHEMA_DESC = `{
  "variables": [ { "name": "string", "value": "string" } ],
  "cleanedText": "string",
  "darkThread": null | {
    "development": "string",
    "progress": 0-100,
    "threatLevel": "潜伏"|"浮现"|"紧迫"|"爆发",
    "foreshadowing": "string"
  },
  "keywordMeanings": { "<关键词>": "string" },
  "evaluateKeyClues": null | { "matches": [ { "pillarId": "string", "clueName": "string" } ] },
  "locationElements": null | {
    "locationName": "string",
    "elements": [ { "name": "string", "category": "string", "description": "string" } ]
  },
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
  },
  "_meta": { "skippedTasks": ["string"], "notes": "string" }
}`;

const SYSTEM_PROMPT_A = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人兼 MVU 解析引擎。我会给你本回合主回合产出的完整叙事文本,以及当前游戏状态快照(线索表/NPC表/地点元素表/地图/暗线进度/真相支柱/已知关键词集/阈值)。请一次性产出所有结构化结果,严格按下方 JSON Schema 输出。

输出原则:
1. 严格输出单一 JSON 对象,禁止 Markdown / 代码围栏 / 解释文字。
2. 字段顺序按 Schema 给定(核心高价值字段在前,可选大体量字段在后),防止思考模型尾部截断。
3. 任何子任务在本回合不适用(触发条件未命中),把对应字段置为 null 或空数组/空对象,但字段必须存在不可省略。
4. 守秘人最高机密(坏结局、真相支柱机密、暗线幕后动作)不得反过来注入到 cleanedText 或 foreshadowing 露给玩家。
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
}

export interface MegaAgentInput {
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
  trigger: MegaAgentTrigger;
}

export interface MegaAgentResult {
  variables: Record<string, string>;
  cleanedText: string;
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

  // 触发矩阵 — 代码侧严格判定
  const trigger: MegaAgentTrigger = {
    darkThread: !opts.isEpilogue,
    keywordMeanings: opts.unknownKeywords.length > 0,
    evaluateKeyClues: opts.newClues.length > 0 && livePillars.length > 0,
    locationElementExtract: !!currentLocationName,
    clueIntegrate: activeCluesDigest.length > CLUE_ACTIVE_CAP,
    locationIntegrate: locElementCount > LOCATION_ELEMENT_CAP,
    mapReconcile: opts.newLocations.length > 0 || opts.newEdges.length > 0,
  };

  return {
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
    trigger,
  };
}

function formatUserPayload(input: MegaAgentInput): string {
  const livePillarsText = input.livePillars.length > 0
    ? input.livePillars.map((p, i) => `${i + 1}. id=${p.id} title=${p.title} secret=${p.secret}`).join('\n')
    : '(无)';

  return `本回合叙事(左+右内容拼接):
<narrative>
${input.narrative}
</narrative>

当前游戏状态快照:
- 调查员:${input.investigatorName}(职业:${input.occupation})
- 当前地点:${input.currentLocationName ?? '(未定位)'}
- isEpilogue:${input.isEpilogue}
- 暗线当前进度:${input.darkThreadProgress},威胁等级:${input.darkThreadThreatLevel}
- 注定坏结局(机密):${input.badEndingDesc || '(未生成)'}
- 未揭示真相支柱(机密,仅未揭示):
${livePillarsText}
- 本回合主 API 已解析的新线索 newClues:${JSON.stringify(input.newClues)}
- 活跃线索池快照(最多 30 条):${JSON.stringify(input.activeCluesDigest)}
- 当前地点已有元素名清单:${JSON.stringify(input.locExistingNames)}
- 当前地点元素总数/阈值:${input.locElementCount} / ${LOCATION_ELEMENT_CAP}
- 地图地点表:${JSON.stringify(input.mapLocationsDigest)}
- 地图边表:${JSON.stringify(input.mapEdgesDigest)}
- 本回合主 API 报告的 newLocations/newEdges:${JSON.stringify(input.newMapDigest)}
- 叙事中出现且未知的关键词 unknownKeywords:${JSON.stringify(input.unknownKeywords)}
- 触发标志:${JSON.stringify(input.trigger)}

请按 Schema 一次性输出全部字段。`;
}

// ────────── 主入口 ──────────

const EMPTY_RESULT: Omit<MegaAgentResult, 'usage' | 'fallback'> = {
  variables: {},
  cleanedText: '',
  darkThread: null,
  keywordMeanings: {},
  evaluateKeyClues: null,
  locationElements: null,
  clueIntegration: null,
  locationIntegration: null,
  mapReconcile: null,
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

    return parseMegaAgentResponse(resp.parsed, resp.usage);
  } catch {
    return await fallbackToExtractor(input, opts);
  }
}

/** 综合 A 整体失败时:回落到 mvu-extractor 旧路径,只拿 variables;其他字段空。 */
async function fallbackToExtractor(input: MegaAgentInput, opts: RunOpts): Promise<MegaAgentResult> {
  try {
    const r = await extractVariablesWithLLM(input.narrative, opts.apiBaseUrl, opts.apiKey, opts.model);
    return {
      ...EMPTY_RESULT,
      variables: r.variables ?? {},
      cleanedText: r.cleanedText ?? input.narrative,
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

function parseMegaAgentResponse(parsed: Record<string, unknown>, usage?: TokenUsage): MegaAgentResult {
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

  const cleanedText = asString(parsed.cleanedText);

  // darkThread:整体可空
  let darkThread: MegaAgentResult['darkThread'] = null;
  const dtRaw = asObject(parsed.darkThread);
  if (dtRaw) {
    darkThread = {
      development: asString(dtRaw.development),
      progress: Math.max(0, Math.min(100, Math.floor(asNumber(dtRaw.progress)))),
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

  return {
    variables,
    cleanedText,
    darkThread,
    keywordMeanings,
    evaluateKeyClues,
    locationElements,
    clueIntegration,
    locationIntegration,
    mapReconcile,
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
}

export function dispatchMegaAgentResult(result: MegaAgentResult): DispatchSummary {
  const summary: DispatchSummary = {
    variablesApplied: 0,
    darkThreadApplied: false,
    keywordsAdded: 0,
    evaluateKeyCluesMatches: 0,
    locationElementsAdded: 0,
    clueIntegrationCount: 0,
    locationIntegrationCount: 0,
    mapReconcileActions: 0,
  };

  // variables → useVariableStore
  for (const [name, value] of Object.entries(result.variables)) {
    useVariableStore.getState().setVariable(name, value, 'llm');
    summary.variablesApplied += 1;
  }

  // darkThread → useDarkThreadStore + useBookStore.setPageDarkThread(由 useChatPipeline 处理)
  //               + statData 树同步(让 CurrentScenarioBadge / 世界书 EJS 等读 statData 的位点立刻
  //                 跟上;否则后端 store 已有 progress=7,UI 仍读 statData 的 '剧情.暗线.进度' 初值 0)。
  if (result.darkThread && result.darkThread.development) {
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

  // mapReconcile → useMapStore + 同步 useLocationElementStore.renameLocation
  if (result.mapReconcile) {
    const map = useMapStore.getState();
    for (const m of result.mapReconcile.merges) {
      map.mergeLocations(m.keep, [m.drop]);
      useLocationElementStore.getState().renameLocation(m.drop, m.keep);
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

  return summary;
}
// useNpcStore import 保留是为了未来 megaagent 扩展(目前未用,加 void 防 TS 未使用警告)
void useNpcStore;

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
