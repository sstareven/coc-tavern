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

/**
 * Match lorebook entries against the current context.
 * Returns entries whose keys match the context text according to the entry's logic rule.
 */
export function matchLoreEntries(
  contextText: string,
  entries: LoreEntry[],
): LoreEntry[] {
  const ctx = contextText.toLowerCase();
  return entries.filter((entry) => {
    const keys = entry.keys.split(/[,，]/).map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keys.length === 0) return false;

    const matches = keys.map((k) => ctx.includes(k));

    switch (entry.logic) {
      case 'AND':
        return matches.every(Boolean);
      case 'OR':
        return matches.some(Boolean);
      case 'NOT':
        return !matches.some(Boolean);
      default:
        return matches.some(Boolean);
    }
  });
}

export function assemblePrompt(
  input: string,
  history: ChatMessage[],
  preset: ChatPreset,
  loreEntries: LoreEntry[],
  variables: Record<string, string>,
  formatInstruction?: string,
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

  // Format instruction for structured output
  if (formatInstruction) {
    messages.push({
      role: 'system',
      content: formatInstruction,
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
