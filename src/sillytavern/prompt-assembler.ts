import type { ChatPreset, ChatMessage, LoreEntry } from '../types';

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function resolvePlaceholders(text: string, variables: Record<string, string>): string {
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
  );
}

/**
 * Match lorebook entries against the current context.
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
      case 'AND': return matches.every(Boolean);
      case 'OR': return matches.some(Boolean);
      case 'NOT': return !matches.some(Boolean);
      default: return matches.some(Boolean);
    }
  });
}

/** Resolve content for a system marker from its source */
function resolveMarkerContent(
  markerId: string,
  preset: ChatPreset,
  charVars: Record<string, string>,
  worldInfoBefore: string,
  worldInfoAfter: string,
): string {
  switch (markerId) {
    case 'main':
      return preset.mainPrompt || '';
    case 'worldInfoBefore':
      return worldInfoBefore;
    case 'worldInfoAfter':
      return worldInfoAfter;
    case 'personaDescription':
      return charVars.personaDescription || '';
    case 'charDescription':
      return charVars.description || '';
    case 'charPersonality':
      return charVars.personality || '';
    case 'scenario':
      return charVars.scenario || '';
    case 'enhanceDefinitions':
    case 'auxiliary':
      return preset.auxiliaryPrompt || '';
    case 'postHistoryInstructions':
      return preset.postHistoryPrompt || '';
    case 'dialogueExamples':
      // Chat examples — from character greeting, skip if none
      return charVars.greeting || '';
    default:
      return '';
  }
}

export function assemblePrompt(
  input: string,
  history: ChatMessage[],
  preset: ChatPreset,
  loreEntries: LoreEntry[],
  variables: Record<string, string>,
  formatInstruction?: string,
  loreContent?: { before: string; after: string },
): AssembledMessage[] {
  const messages: AssembledMessage[] = [];
  const promptItems = preset.promptItems || [];
  const sorted = [...promptItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const enabledItems = sorted.filter((p) => p.enabled !== false);

  const wbBefore = loreContent?.before || '';
  const wbAfter = loreContent?.after || '';

  // Build messages from promptItems in order
  for (const item of enabledItems) {
    let content: string;

    if (item.kind === 'marker') {
      // Marker — resolve content from source
      content = resolveMarkerContent(item.id, preset, variables, wbBefore, wbAfter);
      // If the marker has its own content set (user edited it), use that instead
      if (item.content) content = item.content;
    } else {
      // User prompt — use its content directly
      content = item.content || '';
    }

    if (!content.trim()) continue;

    const resolved = resolvePlaceholders(content, variables);
    messages.push({ role: item.role || 'system', content: resolved });
  }

  // If no promptItems, fall back to system prompt from preset
  if (promptItems.length === 0) {
    messages.push({
      role: 'system',
      content: resolvePlaceholders(preset.systemPrompt, variables),
    });

    // Lore entries
    const loreSorted = [...loreEntries].sort((a, b) => b.priority - a.priority);
    for (const entry of loreSorted) {
      messages.push({
        role: 'system',
        content: resolvePlaceholders(entry.content, variables),
      });
    }

    // Format instruction
    if (formatInstruction) {
      messages.push({ role: 'system', content: formatInstruction });
    }
  } else {
    // promptItems exist — lore and format are handled by worldInfo markers + enhanceDefinitions
    // Add format instruction if it hasn't been covered by a marker
    if (formatInstruction) {
      messages.push({ role: 'system', content: formatInstruction });
    }
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
