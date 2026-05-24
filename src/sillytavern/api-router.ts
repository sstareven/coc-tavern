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
  stream = false,
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: preset.temperature,
      top_p: preset.topP,
      max_tokens: preset.maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
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
          if (token.content) fullContent += token.content;
        }
      }
    }

    return { content: fullContent };
  }

  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  return { content, model: json.model };
}
