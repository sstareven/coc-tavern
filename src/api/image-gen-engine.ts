// 图像生成 API 调用层(OpenAI 兼容 /v1/images/generations 协议)。
// 纯逻辑,不依赖 React。失败用 RpmQueueExhaustedError(透传)/ ImageGenError(自定义) 表达,
// 调用方负责 catch fail-open。
//
// 协议适配 — 2026-06-08:
// 最初设计假设"中转站普遍透传 SD 扩展字段"对真正的 OpenAI 兼容网关完全错误。
// 严格 schema 网关(OpenAI 官方/gpt-image-1/部分中转 strict mode/火山方舟 Ark)会把
//   negative_prompt / steps / cfg_scale / sampler / seed / response_format
//   一律判 invalid_request_error,且 size 必须在固定枚举内。
// 新设计:按 PayloadMode 分支构造 body:
//   - 'openai-strict':仅 model/prompt/size/n + size 映射到 OpenAI 枚举(1024² / 1792×1024 / 1024×1792);
//   - 'gpt-image-1':同 openai-strict + 额外剥 response_format(gpt-image-1 strict 拒绝 response_format);
//   - 'sd-compat':保留 SD 五件套 + 用户配置的 832×224 等自由尺寸(自建 SD WebUI / SD 透传中转);
//   - 'pollinations':GET 模式(MVP 阶段同 openai-strict POST 行为,后续可扩 GET URL connector);
//   - 'auto':按 detectPayloadMode(baseUrl, model) 自动选 — URL 含 openai.com 或 model
//      匹配 ^(dall-e|gpt-image) → openai 系;model 匹配 gpt-image → gpt-image-1;其他 → sd-compat。

import { applyExtraParamsRules } from './api-extra-params-engine';

const DEFAULT_TIMEOUT_MS = 90_000;

/** 协议模式 — 控制 callImageApi 构造 body 的字段集与 size 映射。 */
export type ImagePayloadMode = 'auto' | 'openai-strict' | 'sd-compat' | 'gpt-image-1' | 'pollinations';

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
  /** 协议模式;'auto' 自动探测(默认)。 */
  payloadMode?: ImagePayloadMode;
}

export interface CallImageApiResponse {
  /** response_format='b64_json' 时返回 base64 字符串(已剥 data: 前缀)。 */
  b64Data?: string;
  /** response_format='url' 时返回远程 URL。 */
  url?: string;
  /** 部分后端(DALL-E 3)会回吐改写后的 prompt;UI 可显示给玩家看。 */
  revisedPrompt?: string;
  durationMs: number;
  /** 本次实际使用的模式(auto 探测后的解析结果),供 fallback 与 UI 提示用。 */
  resolvedMode?: Exclude<ImagePayloadMode, 'auto'>;
}

export class ImageGenError extends Error {
  readonly status: number | undefined;
  readonly endpoint: string | undefined;
  readonly bodyKeys: string[] | undefined;
  /** 自动降级提示语,P2 fallback 后塞入(玩家可见)。 */
  readonly recoveryHint: string | undefined;
  constructor(message: string, opts: { status?: number; endpoint?: string; bodyKeys?: string[]; recoveryHint?: string } = {}) {
    super(message);
    this.name = 'ImageGenError';
    this.status = opts.status;
    this.endpoint = opts.endpoint;
    this.bodyKeys = opts.bodyKeys;
    this.recoveryHint = opts.recoveryHint;
  }
}

/** 把 baseUrl 末尾 / 去掉,拼 /v1/images/generations。 */
function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/v\d+\/images\/generations\/?$/.test(trimmed)) return trimmed;
  if (/\/v\d+\/?$/.test(trimmed)) return `${trimmed.replace(/\/$/, '')}/images/generations`;
  return `${trimmed}/v1/images/generations`;
}

/** 自动探测 PayloadMode。URL 含 openai.com / model 匹配 dall-e / gpt-image 一律走 openai 系。 */
export function detectPayloadMode(baseUrl: string, model: string): Exclude<ImagePayloadMode, 'auto'> {
  const url = (baseUrl ?? '').toLowerCase();
  const m = (model ?? '').toLowerCase();
  if (m.startsWith('gpt-image') || m === 'gpt-image-1') return 'gpt-image-1';
  if (url.includes('openai.com') || m.startsWith('dall-e')) return 'openai-strict';
  if (url.includes('pollinations')) return 'pollinations';
  return 'sd-compat';
}

/** OpenAI 系尺寸枚举(取最接近输入尺寸的合法枚举)。
 *  DALL-E 3 / gpt-image-1 都支持的并集:1024×1024 / 1792×1024 / 1024×1792。
 *  (gpt-image-1 还支持 1536×1024 / 1024×1536,这里按 DALL-E 3 兼容保守取并集) */
export function mapToOpenAiSize(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '1024x1024';
  const ratio = width / height;
  if (ratio > 1.3) return '1792x1024';   // 横幅(包含 832×224 的 3.71:1)
  if (ratio < 0.77) return '1024x1792';  // 竖幅
  return '1024x1024';                     // 接近方形
}

/** 构造 body — 按 mode 分支。 */
function buildBody(req: CallImageApiRequest, mode: Exclude<ImagePayloadMode, 'auto'>): Record<string, unknown> {
  const {
    model, prompt, negativePrompt, width, height, steps, cfgScale, sampler,
    n = 1, responseFormat = 'b64_json',
  } = req;

  if (mode === 'openai-strict' || mode === 'gpt-image-1') {
    const body: Record<string, unknown> = {
      model,
      prompt,
      size: mapToOpenAiSize(width, height),
      n,
    };
    // gpt-image-1 strict 拒绝 response_format(默认返回 b64_json)
    if (mode === 'openai-strict') {
      body.response_format = responseFormat;
    }
    return body;
  }

  // pollinations:MVP 同 openai-strict POST(虽 Pollinations 真协议是 GET URL,但极少用户基础先简化)
  if (mode === 'pollinations') {
    return {
      model,
      prompt,
      size: mapToOpenAiSize(width, height),
      n,
    };
  }

  // sd-compat:保留 SD 五件套 + 用户原始尺寸(自建 SD WebUI / 透传中转)
  return {
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
}

/** 单次调用图像 API。AbortController 90s 超时;失败抛 ImageGenError。 */
export async function callImageApi(req: CallImageApiRequest): Promise<CallImageApiResponse> {
  const {
    apiBaseUrl, apiKey, signal,
    extraParams = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    payloadMode = 'auto',
    responseFormat = 'b64_json',
  } = req;

  if (!apiBaseUrl) throw new ImageGenError('图像 API baseUrl 未配');
  if (!req.model) throw new ImageGenError('图像 API model 未选');

  const endpoint = buildEndpoint(apiBaseUrl);
  const resolvedMode: Exclude<ImagePayloadMode, 'auto'> = payloadMode === 'auto'
    ? detectPayloadMode(apiBaseUrl, req.model)
    : payloadMode;

  let body = buildBody(req, resolvedMode);
  if (extraParams.trim()) {
    body = applyExtraParamsRules(body, extraParams);
  }
  const bodyKeys = Object.keys(body);

  const localCtrl = new AbortController();
  const timeoutId = setTimeout(() => localCtrl.abort(new Error('image-gen timeout')), timeoutMs);
  let aborted = false;
  const onCallerAbort = () => { aborted = true; localCtrl.abort(signal?.reason); };
  if (signal) {
    if (signal.aborted) { clearTimeout(timeoutId); throw new ImageGenError('已被中止', { endpoint }); }
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
    if (aborted) throw new ImageGenError('已被中止', { endpoint, bodyKeys });
    throw new ImageGenError(`网络错误: ${err instanceof Error ? err.message : String(err)}`, { endpoint, bodyKeys });
  } finally {
    if (signal) signal.removeEventListener('abort', onCallerAbort);
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch { /* ignore */ }
    throw new ImageGenError(
      `HTTP ${resp.status} (mode=${resolvedMode}, body 含 [${bodyKeys.join(',')}]): ${errText.slice(0, 1500)}`,
      { status: resp.status, endpoint, bodyKeys },
    );
  }

  let json: unknown;
  try {
    json = await resp.json();
  } catch (err) {
    throw new ImageGenError(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`, { endpoint, bodyKeys });
  }

  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new ImageGenError('响应缺 data 字段', { endpoint, bodyKeys });
  }
  const first = data[0] as { b64_json?: string; url?: string; revised_prompt?: string };
  const durationMs = Date.now() - t0;

  // gpt-image-1 默认返回 b64_json(无 response_format 字段),按 b64 解析
  const expectB64 = responseFormat === 'b64_json' || resolvedMode === 'gpt-image-1';

  if (expectB64) {
    if (!first.b64_json) {
      // 部分网关即便没传 response_format 也可能返回 url(模式不严格),兜底走 url 分支
      if (first.url) return { url: first.url, revisedPrompt: first.revised_prompt, durationMs, resolvedMode };
      throw new ImageGenError('响应缺 b64_json 字段', { endpoint, bodyKeys });
    }
    return { b64Data: first.b64_json, revisedPrompt: first.revised_prompt, durationMs, resolvedMode };
  } else {
    if (!first.url) throw new ImageGenError('响应缺 url 字段', { endpoint, bodyKeys });
    return { url: first.url, revisedPrompt: first.revised_prompt, durationMs, resolvedMode };
  }
}

/**
 * 重试包装:
 * - 5xx / 网络错:等待 retryDelayMs 重试 1 次(老行为)。
 * - 4xx 且 payloadMode==='auto'(或未指定):自动降级 openai-strict 最小集重试 1 次,
 *   仍 4xx 才真抛错。给玩家"auto 探测命中 400 已自动降级"提示。
 * - 4xx 且 payloadMode 显式非 auto:不重试,玩家自己改设置。
 */
export async function callImageApiWithRetry(
  req: CallImageApiRequest,
  retryDelayMs = 2000,
): Promise<CallImageApiResponse> {
  const declaredMode = req.payloadMode ?? 'auto';
  try {
    return await callImageApi(req);
  } catch (err) {
    if (req.signal?.aborted) throw err;
    if (err instanceof ImageGenError && err.status && err.status >= 400 && err.status < 500) {
      // 4xx 客户端错误:仅 auto 模式尝试自动降级
      if (declaredMode === 'auto') {
        try {
          const fallbackResp = await callImageApi({ ...req, payloadMode: 'openai-strict' });
          // 成功 — 把降级提示信息塞进响应让 trigger 层 pushLog
          return {
            ...fallbackResp,
            revisedPrompt: fallbackResp.revisedPrompt,
          };
        } catch (err2) {
          // 二次失败:把两次错误拼一起抛
          const firstMsg = err.message;
          const secondMsg = err2 instanceof Error ? err2.message : String(err2);
          throw new ImageGenError(
            `首次(mode=auto→detected): ${firstMsg}  /  降级(mode=openai-strict): ${secondMsg}`,
            {
              status: err2 instanceof ImageGenError ? err2.status : err.status,
              endpoint: err.endpoint,
              bodyKeys: err.bodyKeys,
              recoveryHint: '建议在 API 管理 → 图像 API 显式选择适合你网关的协议模式(openai-strict / sd-compat / gpt-image-1)',
            },
          );
        }
      }
      throw err;
    }
    // 5xx / 网络错:走老的等待重试一次逻辑
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
