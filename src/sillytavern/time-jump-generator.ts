/**
 * A2.6 — timeJumpGenerator (full impl): 替换 A2.5 占位,改走 callDsSubagent 真发起子调用。
 *
 * 设计要点:
 *  - 静态前缀按 reason 分桶,前置 system 消息,便于跨调用的 prompt cache 命中(DS 隐式/Anthropic ephemeral
 *    等均受益)——同一 reason 多次调用首条 system 字节完全相同。
 *  - 动态后置(用户消息)放场景快照 + tableEntry + durationHint —— 这些每次不同的内容不污染前缀。
 *  - max_tokens 至少 20000 (项目硬下限,防 思考型模型 JSON 截断)。
 *  - rpmLane='main' (走主 API 限流桶,与坏结局/起始物品等子调用共用)。
 *  - parsed===null(畸形/截断/空响应)时返回空 narration + 空 sceneInfoUpdate,不抛错——
 *    上层(bout-dispatch.ts summary 分支)是 fire-and-forget 调用,要求该函数自身永不 throw。
 *
 * 4 个 reason:
 *  - bout_summary: Table VIII 总结型疯狂发作。M1 主用。
 *  - travel: 跨场景旅途(B1.6 用)。
 *  - recovery: 休整恢复(C1 用)。
 *  - scene_break: 一般场景过渡(后续灵活复用)。
 */

import { callDsSubagent } from './subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';

export type TimeJumpReason = 'bout_summary' | 'travel' | 'recovery' | 'scene_break';

export interface TimeJumpRequest {
  reason: TimeJumpReason;
  /** 时间跨度提示:"数小时" / "一日" / "约三十分钟" 等自然语言。空字符串表示由 LLM 自定。 */
  durationHint: string;
  /** 当前场景快照(date/time/weekday/weather/location 等任意子集)——LLM 据此推进。 */
  sceneSnapshot: Record<string, unknown>;
  /** Table VII/VIII 的具体词条(失忆/远离原地/暴力倾向 等)。bout_summary 必填,其他 reason 可空。 */
  tableEntry?: string;
}

export interface TimeJumpResult {
  /** 玩家可见的过渡叙事(80~200字,失败时为空字符串)。 */
  narration: string;
  /** SceneInfo 增量(date/time/weekday 任一子集,失败时为 {})。 */
  sceneInfoUpdate: { date?: string; time?: string; weekday?: string };
  /** 追加效果(预留:HP-X/物品丢失等,JSON Patch ops),A2.6 透传 LLM 输出,上层暂不消费。 */
  additionalEffects: unknown[];
}

// Static per-reason prefix — 字节级稳定,放 system 首条让 prompt cache 命中。
// 各 reason 独立成键确保前缀切换不混淆;同一 reason 多次调用前缀完全一致。
const STATIC_PREFIX: Record<TimeJumpReason, string> = {
  bout_summary:
    '[reason=bout_summary]\n你是 COC7e 守秘人。玩家角色刚陷入临时性疯狂(Table VIII,疯狂总结模式)。\n基于给定的 Table VIII 词条 + 当前场景快照,生成一段简短回归叙述(80~200字)——交代调查员失去意识/失忆的间歇里发生了什么,以及醒来时的状态——并推进 sceneInfoUpdate(date/time/weekday)。\n严格返回 JSON: {"narration":string, "sceneInfoUpdate":{"date"?:string,"time"?:string,"weekday"?:string}, "additionalEffects"?:unknown[]}\n不得输出 JSON 之外的任何文本。',
  travel:
    '[reason=travel]\n你是 COC7e 守秘人。基于场景快照 + 时间跨度提示,生成旅途简述(80~200字)与 sceneInfoUpdate(推进 date/time/weekday)。\n严格返回 JSON: {"narration":string, "sceneInfoUpdate":{"date"?:string,"time"?:string,"weekday"?:string}, "additionalEffects"?:unknown[]}\n不得输出 JSON 之外的任何文本。',
  recovery:
    '[reason=recovery]\n你是 COC7e 守秘人。生成调查员休整段落(80~200字)——通常推进数小时至一日——与 sceneInfoUpdate。\n严格返回 JSON: {"narration":string, "sceneInfoUpdate":{"date"?:string,"time"?:string,"weekday"?:string}, "additionalEffects"?:unknown[]}\n不得输出 JSON 之外的任何文本。',
  scene_break:
    '[reason=scene_break]\n你是 COC7e 守秘人。给一段场景过渡叙述(60~150字)与 sceneInfoUpdate。\n严格返回 JSON: {"narration":string, "sceneInfoUpdate":{"date"?:string,"time"?:string,"weekday"?:string}, "additionalEffects"?:unknown[]}\n不得输出 JSON 之外的任何文本。',
};

/**
 * 调用 LLM 生成时间跳跃叙事。永不 throw —— 调用方(bout-dispatch summary 分支)走 fire-and-forget,
 * 上层不愿处理异常。网络/解析失败一律退到空结果。
 */
export async function generateTimeJump(req: TimeJumpRequest): Promise<TimeJumpResult> {
  const s = useSettingsStore.getState().getEffectiveMainApi();
  const dynamic = [
    req.tableEntry ? `tableEntry: ${req.tableEntry}` : '',
    req.durationHint ? `durationHint: ${req.durationHint}` : '',
    'sceneSnapshot:',
    JSON.stringify(req.sceneSnapshot ?? {}, null, 2),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const resp = await callDsSubagent({
      apiBaseUrl: s.baseUrl,
      apiKey: s.apiKey,
      model: s.model,
      label: `time-jump/${req.reason}`,
      maxTokens: 20000,
      temperature: 0.8,
      rpmLane: 'main',
      messages: [
        { role: 'system', content: STATIC_PREFIX[req.reason] },
        { role: 'user', content: dynamic },
      ],
    });
    const parsed = resp.parsed as
      | { narration?: string; sceneInfoUpdate?: TimeJumpResult['sceneInfoUpdate']; additionalEffects?: unknown[] }
      | null;
    if (!parsed) return { narration: '', sceneInfoUpdate: {}, additionalEffects: [] };
    return {
      narration: typeof parsed.narration === 'string' ? parsed.narration : '',
      sceneInfoUpdate: parsed.sceneInfoUpdate ?? {},
      additionalEffects: Array.isArray(parsed.additionalEffects) ? parsed.additionalEffects : [],
    };
  } catch {
    // 网络错误/HTTP 非 2xx 等一律退到空结果,与 parsed===null 同等处理。
    return { narration: '', sceneInfoUpdate: {}, additionalEffects: [] };
  }
}
