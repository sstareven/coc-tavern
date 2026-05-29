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
export interface MatchContext {
  caseSensitive: boolean;
  matchWholeWord: boolean;
  messageCount: number;
  stickyState: Map<string, number>;
  cooldownState: Map<string, number>;
}

function keyMatch(ctx: string, key: string, caseSensitive: boolean, wholeWord: boolean): boolean {
  if (!key) return false;
  const haystack = caseSensitive ? ctx : ctx.toLowerCase();
  const needle = caseSensitive ? key : key.toLowerCase();
  if (wholeWord) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\b|[\\s,，.。!！?？])${escaped}(?:$|\\b|[\\s,，.。!！?？])`, caseSensitive ? '' : 'i').test(haystack);
  }
  return haystack.includes(needle);
}

export function matchLoreEntries(
  contextText: string,
  entries: (LoreEntry & { _id?: string })[],
  matchCtx?: MatchContext,
): LoreEntry[] {
  const globalCS = matchCtx?.caseSensitive ?? false;
  const globalWW = matchCtx?.matchWholeWord ?? false;
  const msgCount = matchCtx?.messageCount ?? 999;
  const sticky = matchCtx?.stickyState;
  const cooldown = matchCtx?.cooldownState;

  const activated: (LoreEntry & { _id?: string; _score?: number })[] = [];

  for (const entry of entries) {
    const id = (entry as { _id?: string })._id || entry.name;
    const cs = entry.caseSensitive === 1 ? true : entry.caseSensitive === 2 ? false : globalCS;
    const ww = entry.matchWholeWord === 1 ? true : entry.matchWholeWord === 2 ? false : globalWW;

    if (entry.delay > 0 && msgCount < entry.delay) continue;
    if (cooldown && (cooldown.get(id) ?? 0) > 0) continue;

    if (sticky && (sticky.get(id) ?? 0) > 0) {
      activated.push({ ...entry, _id: id });
      continue;
    }

    const keys = entry.keys.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) continue;
    const matches = keys.map((k) => keyMatch(contextText, k, cs, ww));

    let primaryPass = false;
    let score = 0;
    switch (entry.logic) {
      case 'AND_ANY': primaryPass = matches.some(Boolean); break;
      case 'AND_ALL': primaryPass = matches.every(Boolean); break;
      case 'NOT_ANY': primaryPass = !matches.some(Boolean); break;
      case 'NOT_ALL': primaryPass = !matches.every(Boolean); break;
      default: primaryPass = matches.some(Boolean);
    }
    if (!primaryPass) continue;
    score = matches.filter(Boolean).length;

    if (entry.secondaryKeys) {
      const secKeys = entry.secondaryKeys.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
      if (secKeys.length > 0 && !secKeys.every((k) => keyMatch(contextText, k, cs, ww))) continue;
    }

    activated.push({ ...entry, _id: id, _score: score });
  }

  // Inclusion group resolution
  const groups = new Map<string, typeof activated>();
  const ungrouped: typeof activated = [];
  for (const e of activated) {
    if (e.inclusionGroup) {
      const labels = e.inclusionGroup.split(/[,，]/).map((g) => g.trim()).filter(Boolean);
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(e);
      }
    } else {
      ungrouped.push(e);
    }
  }

  const resolved: LoreEntry[] = [...ungrouped];
  const suppressedIds = new Set<string>();

  for (const [, members] of groups) {
    let candidates = members.filter((m) => !suppressedIds.has(m._id!));
    if (candidates.length === 0) continue;

    const useScoring = candidates.some((m) => m.groupScoring === 1);
    if (useScoring) {
      const maxScore = Math.max(...candidates.map((m) => m._score ?? 0));
      candidates = candidates.filter((m) => (m._score ?? 0) === maxScore);
    }

    let winner: (typeof candidates)[0];
    const hasPrioritize = candidates.some((m) => m.prioritizeInclusion);
    if (hasPrioritize) {
      const prioritized = candidates.filter((m) => m.prioritizeInclusion);
      winner = prioritized.reduce((a, b) => (a.priority > b.priority ? a : b));
    } else {
      const totalWeight = candidates.reduce((s, m) => s + (m.groupWeight || 100), 0);
      let roll = Math.random() * totalWeight;
      winner = candidates[0];
      for (const c of candidates) {
        roll -= (c.groupWeight || 100);
        if (roll <= 0) { winner = c; break; }
      }
    }

    resolved.push(winner);
    for (const m of members) {
      if (m._id !== winner._id) suppressedIds.add(m._id!);
    }
  }

  // Update sticky/cooldown state
  if (sticky && cooldown) {
    for (const e of resolved) {
      const id = (e as { _id?: string })._id || e.name;
      if (e.sticky > 0) sticky.set(id, e.sticky);
      if (e.cooldown > 0) cooldown.set(id, e.cooldown);
    }
  }

  return resolved;
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
      messages.push({ role: 'system', content: resolvePlaceholders(formatInstruction, variables) });
    }
  } else {
    // promptItems exist — lore and format are handled by worldInfo markers + enhanceDefinitions
    // Add format instruction if it hasn't been covered by a marker
    if (formatInstruction) {
      messages.push({ role: 'system', content: resolvePlaceholders(formatInstruction, variables) });
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
