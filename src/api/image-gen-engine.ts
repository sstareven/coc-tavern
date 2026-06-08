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
export type ImagePayloadMode = 'auto' | 'openai-strict' | 'sd-compat' | 'gpt-image-1' | 'pollinations' | 'chat-completions';

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
  /** 重试前的等待+节流钩子。callImageApiWithRetry 在【收到失败反馈】+ retryDelayMs 等待之后,
   *  再调一次本钩子让 trigger 层重新 rpmAcquire('image')。
   *  钩子抛错(如 RpmQueueExhaustedError)→ 放弃重试,把原错往上抛。 */
  onBeforeRetry?: (attempt: number, reason: 'http-4xx' | 'http-5xx' | 'network') => Promise<void>;
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

/** 拼接 OpenAI 兼容端点路径。suffix = 'images/generations' 或 'chat/completions' 等。
 *
 *  适配 4 种 baseUrl 输入:
 *  - https://xxx                          → https://xxx/v1/{suffix}
 *  - https://xxx/v1                       → https://xxx/v1/{suffix}      ← 用户最常踩,自动适配
 *  - https://xxx/v1/                      → https://xxx/v1/{suffix}      ← 尾斜杠去掉
 *  - https://xxx/v1/{suffix} 或带尾斜杠   → 原样返回(已是完整路径) */
function buildEndpoint(baseUrl: string, suffix = 'images/generations'): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  // 已是完整路径(含具体 suffix)
  const fullPathRegex = new RegExp(`/${suffix.replace(/\//g, '\\/')}/?$`);
  if (fullPathRegex.test(trimmed)) return trimmed;
  // 以 /v\d+ 结尾(用户填了 https://xxx/v1)
  if (/\/v\d+\/?$/.test(trimmed)) return `${trimmed}/${suffix}`;
  // 啥都没有,默认补 /v1/{suffix}
  return `${trimmed}/v1/${suffix}`;
}

/** 自动探测 PayloadMode。优先级:chat-completions 特征 → gpt-image-1 → openai-strict → pollinations → sd-compat。
 *
 *  chat-completions 特征(国内"假流式"中转把图像 API 包装成 /v1/chat/completions):
 *  - model 含 'gemini' 且含 'image' / 'pro-image'(如「假流式-gemini-3-pro-image」)
 *  - model 名含 'nano-banana'
 *  - model 名含 '假流式'(中文前缀的中转标记)
 *  - URL 路径已带 /chat/completions(用户明确填了 chat 端点) */
export function detectPayloadMode(baseUrl: string, model: string): Exclude<ImagePayloadMode, 'auto'> {
  const url = (baseUrl ?? '').toLowerCase();
  const m = (model ?? '').toLowerCase();
  // chat-completions 包装的图像中转 — 必须先判,model 名典型含 image 但实际走 chat 端点
  if (
    url.includes('/chat/completions')
    || m.includes('nano-banana')
    || m.includes('假流式')
    || (m.includes('gemini') && m.includes('image'))
    || (m.includes('-image') && (m.includes('flash') || m.includes('pro') || m.includes('preview')))
  ) return 'chat-completions';
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

  if (mode === 'chat-completions') {
    // /v1/chat/completions 风格中转("假流式"等):messages 包 prompt,响应 content 含图链接
    return {
      model,
      messages: [
        { role: 'user', content: prompt },
      ],
      // 部分中转支持 stream,但我们走非流式简化解析
      stream: false,
      // 部分中转读 temperature/max_tokens,留默认值不破坏
      temperature: 0.7,
    };
  }

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

/** 从 chat-completions 响应的 content 字段提取图片。支持:
 *  - markdown ![alt](URL 或 data:image/...;base64,...)
 *  - 裸 data:image/...;base64,... 串
 *  - 裸 https?:// URL
 *  - multimodal content 数组 [{type:'image_url',image_url:{url}},...]
 *  返回 {b64Data} 或 {url};都没找到返回 null。 */
export function parseChatCompletionsImage(content: unknown): { b64Data?: string; url?: string } | null {
  // multimodal 数组形态
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      const t = p.type;
      if (t === 'image_url' || t === 'image') {
        const imgUrl = p.image_url;
        const urlStr = typeof imgUrl === 'string'
          ? imgUrl
          : (imgUrl && typeof imgUrl === 'object'
              ? ((imgUrl as Record<string, unknown>).url as string | undefined)
              : undefined);
        if (typeof urlStr === 'string') {
          if (urlStr.startsWith('data:')) return { b64Data: urlStr.replace(/^data:[^;]+;base64,/, '') };
          if (/^https?:\/\//.test(urlStr)) return { url: urlStr };
        }
        if (typeof p.b64_json === 'string') return { b64Data: p.b64_json };
      }
    }
    return null;
  }
  if (typeof content !== 'string') return null;
  // markdown ![alt](xxx) — 取第一个出现的
  const md = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(content);
  if (md && md[1]) {
    const target = md[1];
    if (target.startsWith('data:')) return { b64Data: target.replace(/^data:[^;]+;base64,/, '') };
    if (/^https?:\/\//.test(target)) return { url: target };
  }
  // 裸 data URL
  const dataMatch = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/.exec(content);
  if (dataMatch && dataMatch[1]) {
    return { b64Data: dataMatch[1].replace(/^data:[^;]+;base64,/, '') };
  }
  // 裸 URL
  const urlMatch = /(https?:\/\/[^\s"'<>)\]]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)\]]*)?)/i.exec(content);
  if (urlMatch && urlMatch[1]) {
    return { url: urlMatch[1] };
  }
  return null;
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

  const resolvedMode: Exclude<ImagePayloadMode, 'auto'> = payloadMode === 'auto'
    ? detectPayloadMode(apiBaseUrl, req.model)
    : payloadMode;

  // 不同 mode 走不同端点 suffix
  const endpointSuffix = resolvedMode === 'chat-completions' ? 'chat/completions' : 'images/generations';
  const endpoint = buildEndpoint(apiBaseUrl, endpointSuffix);

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

  const durationMs = Date.now() - t0;

  // chat-completions 风格响应:choices[0].message.content 含 markdown / dataURL / 裸 URL
  if (resolvedMode === 'chat-completions') {
    const choices = (json as { choices?: unknown[] })?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ImageGenError('chat-completions 响应缺 choices 字段', { endpoint, bodyKeys });
    }
    const first = choices[0] as { message?: { content?: unknown } };
    const content = first?.message?.content;
    const extracted = parseChatCompletionsImage(content);
    if (!extracted) {
      const previewRaw = typeof content === 'string' ? content : JSON.stringify(content);
      const preview = (previewRaw ?? '').slice(0, 300);
      throw new ImageGenError(
        `chat-completions content 中提不出图(无 markdown 图链接 / dataURL / 裸 URL):${preview}`,
        { endpoint, bodyKeys },
      );
    }
    if (extracted.b64Data) {
      return { b64Data: extracted.b64Data, durationMs, resolvedMode };
    }
    return { url: extracted.url, durationMs, resolvedMode };
  }

  // images/generations 风格响应:data[0].b64_json / url
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new ImageGenError('响应缺 data 字段', { endpoint, bodyKeys });
  }
  const first = data[0] as { b64_json?: string; url?: string; revised_prompt?: string };

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
 * - 5xx / 网络错:【等 retryDelayMs】+【onBeforeRetry 节流(rpmAcquire)】+ 重试 1 次。
 * - 4xx 且 payloadMode==='auto':同样【等 retryDelayMs】+【onBeforeRetry 节流】后,以 openai-strict 重试 1 次;
 *   仍 4xx 才真抛错。给玩家"auto 探测命中 400 已自动降级"提示。
 * - 4xx 且 payloadMode 显式非 auto:不重试,玩家自己改设置。
 * - onBeforeRetry 抛(如 RpmQueueExhaustedError)→ 放弃重试,把首次错原样抛出。
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
    const is4xx = err instanceof ImageGenError && err.status && err.status >= 400 && err.status < 500;
    const is5xx = err instanceof ImageGenError && err.status && err.status >= 500;

    // 4xx 且非 auto 模式:不重试(玩家显式选模式就尊重)
    if (is4xx && declaredMode !== 'auto') throw err;
    // 其他 4xx(auto)/ 5xx / 网络错:统一【等待 + onBeforeRetry 节流】后重试一次
    const reason: 'http-4xx' | 'http-5xx' | 'network' = is4xx ? 'http-4xx' : is5xx ? 'http-5xx' : 'network';

    // 1) 等对方明确反馈失败后再 sleep 一段(避免立刻试错刷 RPM 配额);若已中止则放弃
    await new Promise((r) => setTimeout(r, retryDelayMs));
    if (req.signal?.aborted) throw err;

    // 2) onBeforeRetry 节流(trigger 层注入 rpmAcquire,让重试也占 RPM 桶);若 RPM 满 → 放弃重试
    if (req.onBeforeRetry) {
      try {
        await req.onBeforeRetry(1, reason);
      } catch (queueErr) {
        // RPM 已满 / abort 等 — 不再重试,把首次错往上抛(附 hint)
        const baseMsg = err instanceof Error ? err.message : String(err);
        const queueMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
        throw new ImageGenError(
          `${baseMsg} · 重试前 RPM 节流失败,放弃:${queueMsg}`,
          {
            status: err instanceof ImageGenError ? err.status : undefined,
            endpoint: err instanceof ImageGenError ? err.endpoint : undefined,
            bodyKeys: err instanceof ImageGenError ? err.bodyKeys : undefined,
          },
        );
      }
    }
    if (req.signal?.aborted) throw err;

    // 3) 重试:4xx+auto 自动降级 openai-strict 最小集;5xx/网络错走原 req
    if (is4xx) {
      try {
        return await callImageApi({ ...req, payloadMode: 'openai-strict' });
      } catch (err2) {
        const firstMsg = err.message;
        const secondMsg = err2 instanceof Error ? err2.message : String(err2);
        throw new ImageGenError(
          `首次(mode=auto→detected): ${firstMsg}  /  降级(mode=openai-strict): ${secondMsg}`,
          {
            status: err2 instanceof ImageGenError ? err2.status : (err instanceof ImageGenError ? err.status : undefined),
            endpoint: err instanceof ImageGenError ? err.endpoint : undefined,
            bodyKeys: err instanceof ImageGenError ? err.bodyKeys : undefined,
            recoveryHint: '建议在 API 管理 → 图像 API 显式选择适合你网关的协议模式(openai-strict / sd-compat / gpt-image-1 / chat-completions)',
          },
        );
      }
    }
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
