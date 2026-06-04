/**
 * 子调用统一往返 helper —— 收口 11 个 generator 的样板:
 *   `${apiBase}/chat/completions` URL 拼接 / rpmAcquire(lane) / appIdHeaders + Bearer /
 *   wrapSubagentMessages 包前缀 / response.ok 检查 / 抽 content / coerceJsonObject 解析。
 * 不抽 retry/业务决策 —— 各 generator 自己保留循环和 retryable 判断,helper 只负责一次往返。
 */

import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { wrapSubagentMessages, type SubagentMessage } from './subagent-shared';
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
 * 一次子调用往返:发请求 → 拿到 content → 解析 JSON → 返回结构化结果。
 * 不重试 / 不退避——retry 留给调用方循环。
 * abort:rpmAcquire 之前与之后各检查一次,abort 后直接抛 fetch 的 AbortError。
 */
export async function callDsSubagent(req: DsSubagentRequest): Promise<DsSubagentResponse> {
  const {
    apiBaseUrl, apiKey, model, messages, label,
    temperature = 1, maxTokens = 20000, rpmLane = 'main', signal,
  } = req;
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  await rpmAcquire(rpmLane);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...appIdHeaders(),
    },
    body: JSON.stringify({
      model,
      messages: wrapSubagentMessages(messages, label),
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  });
  if (!response.ok) throw new DsSubagentHttpError(label, response.status);
  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  const { parsed, error } = coerceJsonObject(content);
  return {
    content,
    parsed: parsed as Record<string, unknown> | null,
    parseError: error,
    usage: json.usage as TokenUsage | undefined,
  };
}
