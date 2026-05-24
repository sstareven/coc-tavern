export interface StreamToken {
  content?: string;
  done: boolean;
}

export function parseStreamChunk(line: string): StreamToken[] {
  const tokens: StreamToken[] = [];

  if (!line.startsWith('data: ')) {
    return tokens;
  }

  const data = line.slice(6).trim();

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
  } catch {
    // Skip malformed JSON lines
  }

  return tokens;
}
