/**
 * 子调用统一往返 helper —— 收口 11 个 generator 的样板:
 *   `${apiBase}/chat/completions` URL 拼接 / rpmAcquire(lane) / appIdHeaders + Bearer /
 *   wrapSubagentMessages 包前缀 / response.ok 检查 / 抽 content / JSON 解析。
 * 不抽 retry/业务决策 —— 各 generator 自己保留循环和 retryable 判断,helper 只负责一次往返。
 *
 * JSON 解析双通路:
 *   - jsonObject=true (默认从 useSettingsStore.forceJsonObject 取,默认 true) → 请求附加
 *     `response_format: { type: 'json_object' }`,解析走 strictJsonParse(直接 JSON.parse)。
 *   - jsonObject=false → 请求不附加 response_format,解析走 coerceJsonObject(启发式兜底修复)。
 */

import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { strictJsonParse } from './strict-json-parser';
import { wrapSubagentMessages, type SubagentMessage } from './subagent-shared';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { TokenUsage } from './stream-parser';

export interface DsSubagentRequest {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  /** 业务 messages(不含 SUBAGENT_SHARED_SYSTEM 前缀,helper 内部 wrap) */
  messages: SubagentMessage[];
  /** 任务标签,放入 [子任务: xxx] 块,也用于错误信息 */
  label: string;
  temperature?: number;
  maxTokens?: number;
  /** RPM 节流桶:'main' 主输出 / 'mvu' 独立 mvu API / 'rewrite' 重写。默认 'main' */
  rpmLane?: 'main' | 'mvu' | 'rewrite';
  /** AbortSignal 透传 fetch */
  signal?: AbortSignal;
  /**
   * 是否启用 response_format: { type: 'json_object' } 严格 JSON 模式。
   * 默认从 useSettingsStore.forceJsonObject 取(默认 true)。
   * 显式传 false 可单调用 opt-out(罕见,仅当某子调用确实需要非 JSON 输出时)。
   */
  jsonObject?: boolean;
}

export interface DsSubagentResponse {
  /** assistant 消息 raw content(空字符串当 LLM 没产出时) */
  content: string;
  /** coerceJsonObject 解析的 JSON 对象;无法解析为 null */
  parsed: Record<string, unknown> | null;
  /** coerceJsonObject 失败时的 error 字符串(用于 retryable 判断) */
  parseError?: string;
  /** json.usage 透传,需要 token 统计的 generator 用 */
  usage?: TokenUsage;
}

/** HTTP 非 2xx 时抛出,带原 status code 与 label。各 generator 可 catch 后写日志/重试。 */
export class DsSubagentHttpError extends Error {
  readonly label: string;
  readonly status: number;
  constructor(label: string, status: number) {
    super(`${label} API 错误 ${status}`);
    this.name = 'DsSubagentHttpError';
    this.label = label;
    this.status = status;
  }
}

/**
 * 判断 HTTP 错误是否是「模型/端点不支持 response_format: json_object」。
 * 命中则上游 fallback 重发不带 response_format 的请求,并把该 model 标为不支持。
 *
 * 规则：HTTP 400 / 422 + 错误文本含 response_format / json_object / unsupported /
 * does not support 等关键字。500 / 401 / 429 等不视为 response_format 问题。
 */
export function isResponseFormatUnsupported(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const txt = body.toLowerCase();
  // 必须明确提到 response_format 或 json_object —— 避免误判其他 400 错误
  if (!txt.includes('response_format') && !txt.includes('json_object')) return false;
  // 同时包含「不支持」类语义（is not supported / does not support / unsupported / invalid parameter）
  return (
    txt.includes('not supported') ||
    txt.includes('does not support') ||
    txt.includes('unsupported') ||
    txt.includes('invalid parameter') ||
    // 一些端点仅返回简短「Unsupported response format type: json_object」即上面 unsupported 命中
    // 也兜底接受裸 response_format / json_object 出现在 400/422 错误体里（极保守的命中）
    /response_format.*(not|cannot|can't|unable)/.test(txt)
  );
}

/**
 * 进程级缓存：已知不支持 response_format 的 model 名。
 * fallback 触发后写入；后续同 model 调用直接跳过 response_format 探测，节省一次 RTT。
 * 刷新页面/重启进程后自动清空（合理：用户切了模型 / 服务端升级后应重试）。
 */
const unsupportedJsonObjectModels = new Set<string>();

/** 测试用：清掉缓存。 */
export function _resetUnsupportedJsonObjectCache(): void {
  unsupportedJsonObjectModels.clear();
}

/**
 * 一次子调用往返:发请求 → 拿到 content → 解析 JSON → 返回结构化结果。
 * 不重试 / 不退避——retry 留给调用方循环。
 * abort:rpmAcquire 之前与之后各检查一次,abort 后直接抛 fetch 的 AbortError。
 *
 * json_object 模式 fallback：
 *   1) 入口决定是否带 response_format: { type: 'json_object' }
 *      —— 由 req.jsonObject ?? useSettingsStore.forceJsonObject 决定
 *      —— 且该 model 不在 unsupportedJsonObjectModels 缓存里。
 *   2) 若服务端 400/422 + 错误文本含 response_format 不支持的特征 → 写入缓存 +
 *      warn 日志 + 用同样的 messages/temperature 重发(不带 response_format),
 *      解析切回 coerceJsonObject(启发式兜底)。
 *   3) 其他 HTTP 错误原样抛 DsSubagentHttpError(限流/鉴权等不该 fallback)。
 */
export async function callDsSubagent(req: DsSubagentRequest): Promise<DsSubagentResponse> {
  const {
    apiBaseUrl, apiKey, model, messages, label,
    temperature = 1, maxTokens = 20000, rpmLane = 'main', signal,
  } = req;
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;

  // 决定本次请求要不要带 response_format —— 显式参数优先,否则跟 settings;
  // 但已知不支持的 model 一律跳过(避免每次都浪费一次 RTT 探测)。
  // v1.11.8: ULTRA active 时强制 forceJsonObject: true
  const settingsForceJsonObject = useSettingsStore.getState().dsUltraActive
    ? true
    : useSettingsStore.getState().forceJsonObject;
  const wantJsonObject =
    (req.jsonObject ?? settingsForceJsonObject) &&
    !unsupportedJsonObjectModels.has(model);

  const baseBody: Record<string, unknown> = {
    model,
    messages: wrapSubagentMessages(messages, label),
    temperature,
    max_tokens: maxTokens,
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...appIdHeaders(),
  };

  await rpmAcquire(rpmLane);

  const doFetch = (withJsonObject: boolean): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        withJsonObject ? { ...baseBody, response_format: { type: 'json_object' } } : baseBody,
      ),
      signal,
    });

  // A5 — AbortError 必须原样透传,不能被 fallback 探测或 JSON 解析误吞为 parseError。
  //      fetch 抛 AbortError 时 err.name === 'AbortError'(浏览器/node 18+);
  //      或 signal.aborted 为 true 也视作中止。
  const rethrowIfAborted = (err: unknown): never => {
    const e = err as { name?: string } | null | undefined;
    if (signal?.aborted || e?.name === 'AbortError') throw err;
    throw err; // 非 abort 也透传,但 catch 链外抓不到 — 这里仅用作类型 never
  };

  let response: Response;
  let usedJsonObject = wantJsonObject;
  try {
    response = await doFetch(wantJsonObject);
  } catch (err) {
    rethrowIfAborted(err);
    throw err;
  }

  if (!response.ok && wantJsonObject) {
    // 探测是不是 response_format 不被支持 —— 是则缓存 model + fallback 重发
    // clone 可能在 mock 环境不可用,用 try/catch 兜底(失败视作"不是 response_format 问题")
    let errBody = '';
    try { errBody = await response.clone().text(); } catch { /* mock / clone 不可用,fallback false */ }
    if (isResponseFormatUnsupported(response.status, errBody)) {
      unsupportedJsonObjectModels.add(model);
      // 动态 import 避免循环依赖
      const { pushLog } = await import('../stores/useLogStore');
      pushLog(
        'warn',
        `[子调用 ${label}] 模型「${model}」不支持 response_format=json_object,已自动切回常规模式（本会话剩余子调用同样跳过）`,
        'api',
      );
      try {
        response = await doFetch(false);
      } catch (err) {
        rethrowIfAborted(err);
        throw err;
      }
      usedJsonObject = false;
    }
  }

  if (!response.ok) throw new DsSubagentHttpError(label, response.status);

  // A5 — abort 也可能在 response.json() 期间触发,提前透传
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  // 解析按实际请求模式分流：json_object 模式走 strictJsonParse，否则走 coerceJsonObject。
  const { parsed, error } = usedJsonObject ? strictJsonParse(content) : coerceJsonObject(content);
  return {
    content,
    parsed: parsed as Record<string, unknown> | null,
    parseError: error,
    usage: json.usage as TokenUsage | undefined,
  };
}
