import { parseStreamChunk, type TokenUsage } from './stream-parser';
import { rpmAcquire, RpmQueueExhaustedError, type RpmKind } from './rpm-limiter';
import type { ChatPreset } from '../types';
import { applyExtraParamsRules } from '../api/api-extra-params-engine';

/**
 * 应用署名 header：让中转站/服务端在日志与面板里能识别请求来源（署名 coc-tavern）。
 * 仅一个自定义头，尽量减小 CORS 预检负担；来源域名另由浏览器自动附带的 Origin/Referer 提供。
 * 注意：极少数 CORS 严格、未放行 X-Title 的中转站可能因此预检失败——若某站连不上可移除本头。
 */
export const APP_TITLE = 'coc-tavern';
export const appIdHeaders = (): Record<string, string> => ({ 'X-Title': APP_TITLE });

export interface ChatCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  preset: ChatPreset;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
  model?: string;
  usage?: TokenUsage;
}

/**
 * 把 fetch 在网络层抛出的错误翻译成对用户有意义的中文说明。
 *
 * 浏览器出于安全考虑，对地址不可达、跨域(CORS)被拦、断网、混合内容、DNS 失败等
 * 一律只抛出 `TypeError: Failed to fetch`，不暴露真实原因。这里据此给出排查方向，
 * 而不是把这句无信息量的英文直接甩给用户。
 */
function describeFetchError(err: unknown, baseUrl: string): string {
  // 用户主动取消（点了停止 / 切走）——不是错误，不该报「网络失败」
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '生成已取消。';
  }

  const raw = err instanceof Error ? err.message : String(err);

  // fetch 的通用网络层失败：Failed to fetch / NetworkError / Load failed（各浏览器措辞不同）
  const isGenericNetworkError =
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(raw);

  if (isGenericNetworkError) {
    return [
      '无法连接到 API 服务器，请逐项排查：',
      `· API 地址是否正确、可访问（当前：${baseUrl || '未填写'}）`,
      '· 网络是否正常、是否需要代理 / 梯子才能访问该接口',
      '· 该接口是否允许跨域(CORS)——部分中转站需在其后台开启浏览器跨域',
      '· 若本站为 https，API 地址也须为 https（浏览器会拦截 https 页面里的 http 请求）',
      `（底层报错：${raw}）`,
    ].join('\n');
  }

  return `网络请求失败：${raw}`;
}

export async function sendChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  preset: ChatPreset,
  baseUrl: string,
  apiKey: string,
  model: string,
  stream = false,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
  rpmKind: RpmKind = 'main',
  /** v1.14.x:ApiProfile 级 extraParams 规则文本(- 禁用 / + 添加),最后 apply 到 body 解决 DS 等模型字段冲突。 */
  extraParams: string = '',
): Promise<ChatCompletionResponse> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  // 构造 body 字面量 → 应用 extraParams 规则 → JSON.stringify
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: preset.temperature,
    top_p: preset.topP,
    frequency_penalty: preset.frequencyPenalty,
    presence_penalty: preset.presencePenalty,
    // seed = -1 表随机：按 OpenAI 语义不下发该键，仅在 >= 0 时附带固定种子
    ...(preset.seed >= 0 ? { seed: preset.seed } : {}),
    max_tokens: Math.max(20000, preset.maxTokens),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
  const finalBody = applyExtraParamsRules(body, extraParams);

  // 中转站可能把上游 429 改装成 HTTP 200 + 短限流文本,或直接返 HTTP 429/502/503。
  // 都视为"等等再试"的暂态错误,在此层透明 backoff 重试,直到拿到真 LLM 输出或 abort。
  // 用户偏好:不兜底假装成功,等也没关系——所以无 retry 上限,wait 封顶 300s。
  const backoffSchedule = [15, 30, 60, 120, 240];
  let busyRetries = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new Error('请求已中止');

    // RPM 限流：达到上限则排队等待（按 kind 分桶）。每次 retry 都过桶,保证不超 RPM。
    // RpmQueueExhaustedError(本地排队轮次用尽)视为 transient,跟 HTTP 429 同等待遇 backoff,
    // 跟 commit 0571ade 「等也要拿到真 LLM 输出」承诺对齐。
    try {
      await rpmAcquire(rpmKind);
    } catch (err) {
      if (err instanceof RpmQueueExhaustedError) {
        const wait = busyRetries < backoffSchedule.length ? backoffSchedule[busyRetries] : 300;
        console.warn(`[api-router] 本地 RPM 桶满 (${err.message}),${wait}s 后重试 (#${busyRetries + 1})`);
        busyRetries++;
        await sleepWithAbort(wait * 1000, signal);
        continue;
      }
      throw err;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...appIdHeaders(),
        },
        body: JSON.stringify(finalBody),
        signal,
      });
    } catch (err) {
      throw new Error(describeFetchError(err, baseUrl), { cause: err });
    }

    if (!response.ok) {
      const transient = response.status === 429 || response.status === 502 || response.status === 503;
      let detail = '';
      try {
        const errorBody = await response.json();
        detail = errorBody?.error?.message ?? JSON.stringify(errorBody);
      } catch {
        try { detail = await response.text(); } catch { /* ignore */ }
      }
      if (transient) {
        const wait = busyRetries < backoffSchedule.length ? backoffSchedule[busyRetries] : 300;
        console.warn(`[api-router] HTTP ${response.status},${wait}s 后重试 (#${busyRetries + 1}): ${detail.slice(0, 120)}`);
        busyRetries++;
        await sleepWithAbort(wait * 1000, signal);
        continue;
      }
      throw new Error(`API错误 ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    let result: ChatCompletionResponse;
    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      let streamDone = false;
      let streamUsage: TokenUsage | undefined;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (streamDone) break;
          const tokens = parseStreamChunk(line);
          for (const token of tokens) {
            if (token.content) {
              fullContent += token.content;
              if (onToken) onToken(token.content);
            }
            if (token.usage) streamUsage = token.usage;
            if (token.done) { streamDone = true; break; }
          }
        }
      }

      console.log('[api-router] Stream ended — fullContent length:', fullContent.length);
      result = { content: fullContent, usage: streamUsage };
    } else {
      const json = await response.json();
      const content: string = json.choices?.[0]?.message?.content ?? '';
      console.log('[api-router] Non-stream — content length:', content.length, 'model:', json.model);
      result = { content, model: json.model, usage: json.usage };
    }

    // 嗅探中转站假装包(HTTP 200 + 短限流文本):透明退避重试,不兜底也不抛错
    if (isRelayBusyPayload(result.content)) {
      const wait = busyRetries < backoffSchedule.length ? backoffSchedule[busyRetries] : 300;
      console.warn(`[api-router] 中转站假装包 "${result.content.trim().slice(0, 80)}",${wait}s 后重试 (#${busyRetries + 1})`);
      busyRetries++;
      await sleepWithAbort(wait * 1000, signal);
      continue;
    }

    return result;
  }
}

/**
 * 嗅探中转站把上游 429/限流伪装成 HTTP 200 + 短文本 body 的情形。
 * 严格规则避免误伤合法 LLM 输出:
 * - 空串视为 busy
 * - 长度 >= 200 字符或含 `{` 直接放行(真叙事/JSON 候选)
 * - 否则匹配限流/服务故障关键词才视为 busy
 */
function isRelayBusyPayload(content: string): boolean {
  const text = content.trim();
  if (text.length === 0) return true;
  if (text.length >= 200) return false;
  if (text.includes('{')) return false;
  return /(429|503|502|繁忙|too\s*many|rate.?limit|busy|gateway|网关|服务不可用|service\s+unavailable)/i.test(text);
}

/** 支持 abort 的 sleep:abort 时立即抛错并清理 timer/listener,无泄漏 */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('请求已中止'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('请求已中止'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 拉取 OpenAI 兼容端点的可用模型列表（GET {base}/models）。
 * 纯网络助手——不读/写 store，由调用方编排加载/错误状态。
 * 供设置面板各 API 通道（main/mvu/rewrite）的「测试连接 → 获取模型」复用。
 * @throws 当响应非 2xx 时抛出，调用方据此置失败态。
 */
export async function fetchModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Accept': 'application/json', ...appIdHeaders() };
  if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  let res: Response;
  try {
    res = await fetch(`${base}/models`, { method: 'GET', headers });
  } catch (err) {
    throw new Error(describeFetchError(err, base), { cause: err });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.data)
    ? data.data.map((m: Record<string, string>) => m.id ?? m.name ?? m.model ?? '').filter(Boolean)
    : [];
}
