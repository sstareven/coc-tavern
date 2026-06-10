export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** DeepSeek 上下文缓存：命中/未命中的 prompt token 数（prompt_tokens = 命中 + 未命中）。 */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface StreamToken {
  content?: string;
  done: boolean;
  usage?: TokenUsage;
}

export function parseStreamChunk(line: string): StreamToken[] {
  const tokens: StreamToken[] = [];

  if (!line.startsWith('data:')) {
    return tokens;
  }

  const data = line.slice(line.startsWith('data: ') ? 6 : 5).trim();

  if (data === '[DONE]') {
    tokens.push({ done: true });
    return tokens;
  }

  try {
    const parsed = JSON.parse(data);
    const content: string | undefined = parsed.choices?.[0]?.delta?.content;
    if (content) {
      tokens.push({ content, done: false });
    }
    // include_usage 模式下，末尾有一个 choices 为空、仅含 usage 的块
    if (parsed.usage) {
      tokens.push({ done: false, usage: parsed.usage });
    }
  } catch (err) {
    // Skip malformed JSON lines
    console.warn('[stream-parser] 跳过畸形 SSE 行:', err, '原文:', data.slice(0, 200));
  }

  return tokens;
}
