/**
 * NPC 立卡子调用：为一位 NPC 生成第一份 NpcMemory 心智档案。
 *
 * 触发时机：路人/undefined → 重要(或核心) 升级时由 dispatch 层调度一次。
 * 失败策略：fail-open。任何 HTTP / 解析 / 超时异常都返 null，由调用方决定是否
 * fallback 到 buildImportantNpcMemoryTemplate(updatedAt) 的占位模板。
 *
 * RPM 桶选择：'rewrite'。NPC 立卡属于「立卡型补写」——不阻塞主回合叙事流，
 * 与 rewriteLite/补写补写 等同走 rewrite 通路，避免挤占 main 桶 RPM 额度。
 */

import {
  EMPTY_NPC_MEMORY,
  normalizeEmotion,
  type EmotionEnum,
  type NpcMemory,
  type NpcMemoryCardInput,
  type NpcMemoryCardResult,
  type NpcRelationship,
} from '../types/npc-world-memory';
import { useSettingsStore } from '../stores/useSettingsStore';
import { callDsSubagent, type DsSubagentRequest } from './subagent-call';
import { wrapSubagentMessages } from './subagent-shared';

const SYSTEM_PROMPT = [
  '你是 Call of Cthulhu 7e 跑团中某位 NPC 的「内心独白生成器」。',
  '调用方会给你这位 NPC 的真名、身份摘要与当前剧情上下文，请你站在该 NPC 第一人称视角思考',
  '（思考过程不要输出），最终以**严格 JSON**形式输出他/她当下的第一份心智档案。',
  '',
  '【输出 schema（顶层 JSON object，所有字段必填）】',
  '{',
  '  "goal": string,            // 当前主要目标（一句话，如「找回失踪的弟弟」）',
  '  "nextMove": string,        // 下回合打算做的具体事（一句话，如「把调查员引到码头」）',
  '  "trustOnPC": number,       // 对调查员的信任度，范围 -1 ~ 1，0 代表中立',
  '  "emotionToPC": string,     // 对调查员的情绪倾向，必须是六选一：敌意 / 警惕 / 中立 / 友好 / 暧昧 / 恐惧',
  '  "secrets": string[],       // 这位 NPC 没告诉调查员的秘密；0~5 条，每条一句话',
  '  "relationships": [         // 与其他 NPC 的关系（单向，可空数组）',
  '    {',
  '      "target": string,      // 关系对象 NPC 的真名（必须是 NPC 真名，不要写「我」「他」等代词）',
  '      "emotion": string,     // 与上面同一套六选一枚举',
  '      "note": string         // 一句话描述关系内容（如「暗恋多年但没敢说」）',
  '    }',
  '  ],',
  '  "prose": string            // 自由散文心思，第一人称，200~500 字',
  '}',
  '',
  '【硬性约束】',
  '1. 仅输出该 JSON 对象本身，禁止任何前后缀文字、markdown 代码围栏、思考过程或解释。',
  '2. emotionToPC 与 relationships[].emotion 严格落在六选一枚举内，超出范围请回落到「中立」。',
  '3. trustOnPC 必须在 -1 与 1 之间（含端点），保留两位小数即可。',
  '4. relationships 数组中的 target 一律写 NPC 真名，不要用「神秘人」「那个女人」等指代。',
  '5. prose 字数 200~500 字，第一人称、有内心矛盾与动机张力，避免空话套话。',
  '6. JSON 字符串值内如需引用，统一用「」或『』，严禁未转义双引号。',
].join('\n');

function buildUserPayload(input: NpcMemoryCardInput): string {
  // 用 JSON.stringify 既稳又便于 LLM 解析；字段名与 schema 对应
  return JSON.stringify(
    {
      npcId: input.npcId,
      npcName: input.npcName,
      npcDigest: input.npcDigest,
      scenarioCtx: input.scenarioCtx,
    },
    null,
    2,
  );
}

/** trustOnPC 钳到 [-1, 1]；非有限值回落 0。 */
function clampTrust(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return EMPTY_NPC_MEMORY.trustOnPC;
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** secrets：要求 string[]；过滤非字符串与空串。 */
function parseSecrets(v: unknown): string[] {
  if (!Array.isArray(v)) return [...EMPTY_NPC_MEMORY.secrets];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim());
  }
  return out;
}

/** relationships：每项要求 {target,emotion,note}；缺字段或类型不对则丢弃。 */
function parseRelationships(v: unknown): NpcRelationship[] {
  if (!Array.isArray(v)) return [...EMPTY_NPC_MEMORY.relationships];
  const out: NpcRelationship[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const target = typeof rec.target === 'string' ? rec.target.trim() : '';
    if (!target) continue;
    const emotion: EmotionEnum = normalizeEmotion(rec.emotion);
    const note = typeof rec.note === 'string' ? rec.note.trim() : '';
    out.push({ target, emotion, note });
  }
  return out;
}

/**
 * 跑一次 NPC 立卡子调用。
 *
 * - apiConfig: useSettingsStore.getEffectiveRewriteApi()（立卡型补写走 rewrite 桶）
 * - rpmLane: 'rewrite'
 * - jsonObject: true（response_format 强制 JSON object，配合 strictJsonParse）
 * - maxTokens: 32768（≥ 项目硬下限 20000）
 * - updatedAt: 留 0，由 dispatch 层在写入 store 时填上当前 pages.length
 *
 * 任何异常（缺配 / HTTP / 解析失败）→ 返 null，fail-open。
 */
export async function runNpcMemoryCard(input: NpcMemoryCardInput): Promise<NpcMemoryCardResult> {
  const apiConfig = useSettingsStore.getState().getEffectiveRewriteApi();
  if (!apiConfig.baseUrl || !apiConfig.apiKey || !apiConfig.model) return null;
  if (!input.npcId || !input.npcName) return null;

  const userPayload = buildUserPayload(input);

  const req: DsSubagentRequest = {
    apiBaseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    extraParams: apiConfig.extraParams,
    label: 'npc-memory-card',
    temperature: 1,
    maxTokens: 32768,
    rpmLane: 'rewrite',
    jsonObject: true,
    messages: wrapSubagentMessages(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
      'npc-memory-card',
    ),
  };

  let parsed: Record<string, unknown> | null;
  try {
    const resp = await callDsSubagent(req);
    parsed = resp.parsed;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  // 字段级降级解析：每个字段缺失/类型不对都回落到 EMPTY_NPC_MEMORY 对应字段
  const goal = typeof parsed.goal === 'string' ? parsed.goal.trim() : EMPTY_NPC_MEMORY.goal;
  const nextMove =
    typeof parsed.nextMove === 'string' ? parsed.nextMove.trim() : EMPTY_NPC_MEMORY.nextMove;
  const trustOnPC = clampTrust(parsed.trustOnPC);
  const emotionToPC: EmotionEnum = normalizeEmotion(parsed.emotionToPC);
  const secrets = parseSecrets(parsed.secrets);
  const relationships = parseRelationships(parsed.relationships);
  const prose = typeof parsed.prose === 'string' ? parsed.prose.trim() : EMPTY_NPC_MEMORY.prose;

  const memory: NpcMemory = {
    goal,
    nextMove,
    trustOnPC,
    emotionToPC,
    secrets,
    relationships,
    prose,
    updatedAt: 0, // dispatch 层写入 store 时填 pages.length
  };
  return memory;
}
