import type { ChatPreset, ChatMessage, LoreEntry } from '../types';

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function resolvePlaceholders(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function assemblePrompt(
  input: string,
  history: ChatMessage[],
  preset: ChatPreset,
  loreEntries: LoreEntry[],
  variables: Record<string, string>,
): AssembledMessage[] {
  const messages: AssembledMessage[] = [];

  // System prompt from preset
  messages.push({
    role: 'system',
    content: resolvePlaceholders(preset.systemPrompt, variables),
  });

  // Lore entries inserted as system messages, sorted by priority descending
  const sorted = [...loreEntries].sort((a, b) => b.priority - a.priority);
  for (const entry of sorted) {
    messages.push({
      role: 'system',
      content: resolvePlaceholders(entry.content, variables),
    });
  }

  // Chat history
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: resolvePlaceholders(msg.content, variables),
    });
  }

  // Current user input
  messages.push({
    role: 'user',
    content: resolvePlaceholders(input, variables),
  });

  return messages;
}
