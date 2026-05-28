import { parseStreamChunk } from './stream-parser';
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
): Promise<ChatCompletionResponse> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const tokens = parseStreamChunk(line);
        for (const token of tokens) {
          if (token.content) {
            fullContent += token.content;
            if (onToken) onToken(token.content);
          }
          if (token.done) break;
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
