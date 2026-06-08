// 图像生成 API 调用层(OpenAI 兼容 /v1/images/generations 协议)。
// 纯逻辑,不依赖 React。失败用 RpmQueueExhaustedError(透传)/ ImageGenError(自定义) 表达,
// 调用方负责 catch fail-open。
//
// 协议:POST `${apiBaseUrl}/v1/images/generations`
// 标准字段:{model, prompt, size, n, response_format}
// 扩展字段(中转站普遍透传):{negative_prompt, steps, cfg_scale, sampler, seed}
//
// 响应:{ created, data: [{ b64_json | url, revised_prompt? }] }

import { applyExtraParamsRules } from './api-extra-params-engine';

const DEFAULT_TIMEOUT_MS = 90_000;

export interface CallImageApiRequest {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  n?: number;
  responseFormat?: 'b64_json' | 'url';
  /** AbortSignal 透传 fetch,翻页/中止时取消。 */
  signal?: AbortSignal;
  /** 用户在 ApiProfile.extraParams 自定义的额外字段(每行 key=value 格式)。 */
  extraParams?: string;
  /** 超时毫秒;默认 90s。 */
  timeoutMs?: number;
}

export interface CallImageApiResponse {
  /** response_format='b64_json' 时返回 base64 字符串(已剥 data: 前缀)。 */
  b64Data?: string;
  /** response_format='url' 时返回远程 URL。 */
  url?: string;
  /** 部分后端(DALL-E 3)会回吐改写后的 prompt;UI 可显示给玩家看。 */
  revisedPrompt?: string;
  durationMs: number;
}

export class ImageGenError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ImageGenError';
    this.status = status;
  }
}

/** 把 baseUrl 末尾 / 去掉,拼 /v1/images/generations。 */
function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  // 若用户已填带 /v1 或完整路径,尊重不重复拼
  if (/\/v\d+\/images\/generations\/?$/.test(trimmed)) return trimmed;
  if (/\/v\d+\/?$/.test(trimmed)) return `${trimmed.replace(/\/$/, '')}/images/generations`;
  return `${trimmed}/v1/images/generations`;
}

/** 单次调用图像 API。AbortController 90s 超时;失败抛 ImageGenError(不重试,重试逻辑在调用方)。 */
export async function callImageApi(req: CallImageApiRequest): Promise<CallImageApiResponse> {
  const {
    apiBaseUrl, apiKey, model, prompt, negativePrompt,
    width, height, steps, cfgScale, sampler,
    n = 1, responseFormat = 'b64_json', signal, extraParams = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = req;

  if (!apiBaseUrl) throw new ImageGenError('图像 API baseUrl 未配');
  if (!model) throw new ImageGenError('图像 API model 未选');

  const endpoint = buildEndpoint(apiBaseUrl);

  // 构造 body:标准 OpenAI 字段在前,SD 扩展字段在后(中转站普遍透传)
  let body: Record<string, unknown> = {
    model,
    prompt,
    size: `${width}x${height}`,
    n,
    response_format: responseFormat,
    negative_prompt: negativePrompt,
    steps,
    cfg_scale: cfgScale,
    sampler,
    seed: -1,
  };
  // extraParams 自定义字段覆盖(对齐 chat body 同款 key=value 规则)
  if (extraParams.trim()) {
    body = applyExtraParamsRules(body, extraParams);
  }

  // 组合调用方 signal 与本地 timeout 信号
  const localCtrl = new AbortController();
  const timeoutId = setTimeout(() => localCtrl.abort(new Error('image-gen timeout')), timeoutMs);
  let aborted = false;
  const onCallerAbort = () => { aborted = true; localCtrl.abort(signal?.reason); };
  if (signal) {
    if (signal.aborted) { clearTimeout(timeoutId); throw new ImageGenError('已被中止'); }
    signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: localCtrl.signal,
    });
  } catch (err) {
    if (signal) signal.removeEventListener('abort', onCallerAbort);
    clearTimeout(timeoutId);
    if (aborted) throw new ImageGenError('已被中止');
    throw new ImageGenError(`网络错误: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (signal) signal.removeEventListener('abort', onCallerAbort);
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch { /* ignore */ }
    throw new ImageGenError(`HTTP ${resp.status}: ${errText.slice(0, 300)}`, resp.status);
  }

  let json: unknown;
  try {
    json = await resp.json();
  } catch (err) {
    throw new ImageGenError(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new ImageGenError('响应缺 data 字段');
  }
  const first = data[0] as { b64_json?: string; url?: string; revised_prompt?: string };
  const durationMs = Date.now() - t0;

  if (responseFormat === 'b64_json') {
    if (!first.b64_json) throw new ImageGenError('响应缺 b64_json 字段');
    return { b64Data: first.b64_json, revisedPrompt: first.revised_prompt, durationMs };
  } else {
    if (!first.url) throw new ImageGenError('响应缺 url 字段');
    return { url: first.url, revisedPrompt: first.revised_prompt, durationMs };
  }
}

/** 单次重试包装:首次失败后等待 retryDelayMs 重试一次;两次都失败抛最后一次的错。 */
export async function callImageApiWithRetry(
  req: CallImageApiRequest,
  retryDelayMs = 2000,
): Promise<CallImageApiResponse> {
  try {
    return await callImageApi(req);
  } catch (err) {
    // ImageGenError 含 'HTTP 4xx' 等客户端错误时,不重试(参数问题重试也没用)
    if (err instanceof ImageGenError && err.status && err.status >= 400 && err.status < 500) {
      throw err;
    }
    // 已中止不重试
    if (req.signal?.aborted) throw err;
    await new Promise((r) => setTimeout(r, retryDelayMs));
    if (req.signal?.aborted) throw err;
    return await callImageApi(req);
  }
}

/** base64 字符串 → Blob(用于 IndexedDB 存储)。 */
export function b64ToBlob(b64: string, mimeType = 'image/jpeg'): Blob {
  // 兼容带 data: 前缀
  const cleaned = b64.replace(/^data:[^;]+;base64,/, '');
  const byteString = atob(cleaned);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
