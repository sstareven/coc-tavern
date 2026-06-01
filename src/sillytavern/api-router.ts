import { parseStreamChunk, type TokenUsage } from './stream-parser';
import { rpmAcquire, type RpmKind } from './rpm-limiter';
import type { ChatPreset } from '../types';

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
): Promise<ChatCompletionResponse> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  // RPM 限流：达到上限则排队等待（按 kind 分桶）
  await rpmAcquire(rpmKind);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...appIdHeaders(),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: preset.temperature,
        top_p: preset.topP,
        frequency_penalty: preset.frequencyPenalty,
        presence_penalty: preset.presencePenalty,
        // seed = -1 表随机：按 OpenAI 语义不下发该键，仅在 >= 0 时附带固定种子
        ...(preset.seed >= 0 ? { seed: preset.seed } : {}),
        max_tokens: preset.maxTokens,
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      signal,
    });
  } catch (err) {
    throw new Error(describeFetchError(err, baseUrl), { cause: err });
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message ?? JSON.stringify(errorBody);
    } catch {
      try {
        detail = await response.text();
      } catch {
        // ignore
      }
    }
    throw new Error(
      `API错误 ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }

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
    return { content: fullContent, usage: streamUsage };
  }

  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  console.log('[api-router] Non-stream — content length:', content.length, 'model:', json.model);
  return { content, model: json.model, usage: json.usage };
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
