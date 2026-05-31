import { parseStreamChunk } from './stream-parser';
import { rpmAcquire, type RpmKind } from './rpm-limiter';
import type { ChatPreset } from '../types';

export interface ChatCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  preset: ChatPreset;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
  model?: string;
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
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: preset.temperature,
        top_p: preset.topP,
        max_tokens: preset.maxTokens,
        stream,
      }),
      signal,
    });
  } catch (err) {
    throw new Error(`网络请求失败: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
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
          if (token.done) { streamDone = true; break; }
        }
      }
    }

    console.log('[api-router] Stream ended — fullContent length:', fullContent.length);
    return { content: fullContent };
  }

  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  console.log('[api-router] Non-stream — content length:', content.length, 'model:', json.model);
  return { content, model: json.model };
}

/**
 * 拉取 OpenAI 兼容端点的可用模型列表（GET {base}/models）。
 * 纯网络助手——不读/写 store，由调用方编排加载/错误状态。
 * 供设置面板各 API 通道（main/mvu/rewrite）的「测试连接 → 获取模型」复用。
 * @throws 当响应非 2xx 时抛出，调用方据此置失败态。
 */
export async function fetchModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  const res = await fetch(`${base}/models`, { method: 'GET', headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.data)
    ? data.data.map((m: Record<string, string>) => m.id ?? m.name ?? m.model ?? '').filter(Boolean)
    : [];
}
