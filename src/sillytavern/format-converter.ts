/**
 * SillyTavern format import/export for world books and presets.
 *
 * World Book (lorebook) format:
 *   { name: string, entries: { [uid]: { uid, key, keysecondary, comment, content,
 *     constant, selective, order, position, disable, excludeRecursion,
 *     secondaryKeys, logic, extensions } } }
 *
 * Preset format:
 *   { name, temperature, top_p, top_k, max_tokens, repetition_penalty,
 *     system_prompt, user_prefix, assistant_prefix, ... }
 */
import type { LoreBook, LoreEntry, ChatPreset, RegexScript, THScriptTree } from '../types';

// ── ST module identifier → label map ──
const MODULE_ID_MAP: Record<string, string> = {
  main: 'Main Prompt',
  worldInfoBefore: 'World Info (before)',
  worldInfoAfter: 'World Info (after)',
  personaDescription: 'Persona Description',
  charDescription: 'Char Description',
  charPersonality: 'Char Personality',
  scenario: 'Scenario',
  enhanceDefinitions: 'Enhance Definitions',
  dialogueExamples: 'Chat Examples',
  chatHistory: 'Chat History',
  postHistoryInstructions: 'Post-History Instructions',
  auxiliary: 'Auxiliary Prompt',
  jailbreak: 'Enhance Definitions',
  nsfw: 'Enhance Definitions',
};

// ── World Book ──

interface STWorldEntry {
  uid: number;
  key: string | string[];
  keysecondary?: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  order: number;
  position: string;
  disable: boolean;
  excludeRecursion: boolean;
  secondaryKeys?: string[];
  logic?: string;
  extensions?: Record<string, unknown>;
}

interface STWorldBook {
  name?: string;
  entries?: Record<string, STWorldEntry>;
}

export function exportWorldBookToST(book: LoreBook): string {
  const entries: Record<string, STWorldEntry> = {};
  Object.entries(book.entries).forEach(([id, entry], idx) => {
    const keys = entry.keys.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
    entries[id] = {
      uid: idx,
      key: keys.length === 1 ? keys[0] : keys,
      keysecondary: [],
      comment: entry.name,
      content: entry.content,
      constant: false,
      selective: false,
      order: entry.priority,
      position: 0,
      disable: false,
      excludeRecursion: false,
      logic: entry.logic === 'AND' ? 'AND_ALL' : 'OR_ANY',
      extensions: {},
    };
  });
  return JSON.stringify({ name: book.name, entries }, null, 2);
}

export function importWorldBookFromST(json: string): LoreBook | null {
  try {
    const data: STWorldBook = JSON.parse(json);
    const name = data.name ?? '导入的世界书';
    const entries: Record<string, LoreEntry> = {};
    if (data.entries) {
      for (const [key, val] of Object.entries(data.entries)) {
        const keysArr = Array.isArray(val.key) ? val.key : (val.key ? [val.key] : []);
        const logic = val.logic?.startsWith('AND') ? 'AND' : 'OR';
        entries[key] = {
          name: val.comment || '条目',
          keys: keysArr.join(', '),
          content: val.content || '',
          logic,
          priority: val.order ?? 10,
        };
      }
    }
    return { name, entries };
  } catch {
    return null;
  }
}

// ── Preset ──

interface STPreset {
  name?: string; temperature?: number; top_p?: number; top_k?: number;
  max_tokens?: number; frequency_penalty?: number; presence_penalty?: number; repetition_penalty?: number;
  system_prompt?: string; user_prefix?: string; assistant_prefix?: string;
  unlock_context?: boolean; context_length?: number; max_response_length?: number;
  reasoning_effort?: string; response_length?: string; seed?: number;
  prompt_order?: Array<{ identifier: string; enabled: boolean; name?: string; content?: string; role?: string }>;
}

export function exportPresetToST(preset: ChatPreset, regexScripts?: RegexScript[]): string {
  const data: any = {
    name: preset.name, temperature: preset.temperature,
    top_p: preset.topP, top_k: preset.topK, min_p: preset.minP, top_a: preset.topA,
    max_tokens: preset.maxTokens,
    frequency_penalty: preset.frequencyPenalty, presence_penalty: preset.presencePenalty,
    repetition_penalty: preset.repetitionPenalty,
    system_prompt: preset.systemPrompt, user_prefix: preset.userPrefix, assistant_prefix: preset.assistantPrefix,
    max_context_unlocked: preset.unlockContext, openai_max_context: preset.contextLength,
    max_response_length: preset.maxResponseTokens, alternative_replies: preset.alternativeReplies,
    reasoning_effort: preset.reasoningEffort, show_thoughts: preset.showThoughts,
    response_length: preset.responseLength,
    seed: preset.seed, char_name_behavior: preset.charNameBehavior,
    continue_postfix: preset.continueSuffix === 'space' ? ' ' : preset.continueSuffix === 'newline' ? '\n' : preset.continueSuffix === 'doublenewline' ? '\n\n' : '',
    continue_prefill: preset.continuePrefill,
    assistant_prefill: preset.assistantPrefill,
    prompt_order: preset.promptItems.map((p: any) => ({
      identifier: p.id, name: p.name, enabled: p.enabled, content: p.content, role: p.role,
    })),
  };
  if (regexScripts && regexScripts.length > 0) {
    data.extensions = data.extensions || {};
    data.extensions.regex_scripts = regexScripts.map((s) => ({
      scriptName: s.scriptName,
      findRegex: s.findRegex,
      replaceString: s.replaceString,
      trimStrings: s.trimStrings,
      placement: s.placement,
      disabled: s.disabled,
      markdownOnly: s.markdownOnly,
      promptOnly: s.promptOnly,
      runOnEdit: s.runOnEdit,
      substituteRegex: s.substituteRegex,
      minDepth: s.minDepth,
      maxDepth: s.maxDepth,
    }));
  }
  // Include tavern_helper scripts if present
  if (preset.tavernHelperScripts && preset.tavernHelperScripts.length > 0) {
    data.extensions = data.extensions || {};
    data.extensions.tavern_helper = data.extensions.tavern_helper || {};
    data.extensions.tavern_helper.scripts = preset.tavernHelperScripts;
  }
  // Include tavern_helper preset variables if present
  if (preset.tavernHelperVars && Object.keys(preset.tavernHelperVars).length > 0) {
    data.extensions = data.extensions || {};
    data.extensions.tavern_helper = data.extensions.tavern_helper || {};
    data.extensions.tavern_helper.variables = preset.tavernHelperVars;
  }
  return JSON.stringify(data, null, 2);
}

export interface ImportedPreset {
  preset: ChatPreset;
  regexScripts: RegexScript[];
}

function parseRegexScripts(data: any): RegexScript[] {
  const rawScripts = data.extensions?.regex_scripts;
  if (!Array.isArray(rawScripts)) return [];
  return rawScripts
    .filter((r: any) => r.scriptName && r.findRegex)
    .map((r: any) => ({
      id: '', // caller assigns
      scriptName: String(r.scriptName ?? ''),
      findRegex: String(r.findRegex ?? ''),
      replaceString: String(r.replaceString ?? ''),
      trimStrings: Array.isArray(r.trimStrings) ? r.trimStrings : [],
      placement: (Array.isArray(r.placement) ? r.placement : [r.placement])
        .map((p: number) => p as 1 | 2 | 3 | 5 | 6)
        .filter((p: number) => [1, 2, 3, 5, 6].includes(p)),
      disabled: r.disabled === true,
      markdownOnly: r.markdownOnly === true,
      promptOnly: r.promptOnly === true,
      runOnEdit: r.runOnEdit !== false,
      substituteRegex: (r.substituteRegex ?? 0) as 0 | 1 | 2,
      minDepth: typeof r.minDepth === 'number' ? r.minDepth : null,
      maxDepth: typeof r.maxDepth === 'number' ? r.maxDepth : null,
    }));
}

function parseTavernHelperData(data: any): { scripts?: THScriptTree[]; vars?: Record<string, any> } {
  const raw = data.extensions?.tavern_helper;
  if (!raw || typeof raw !== 'object') return {};
  const scripts = raw.scripts;
  const vars = raw.variables;
  return {
    scripts: Array.isArray(scripts) && scripts.length > 0 ? scripts : undefined,
    vars: vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : undefined,
  };
}

export function importPresetFromST(json: string, fileName?: string): ImportedPreset | null {
  try {
    const data: any = JSON.parse(json);
    const regexScripts = parseRegexScripts(data);
    const thData = parseTavernHelperData(data);
    // Get prompt_order (root or nested in extensions)
    const extPromptOrder = data.extensions?.prompt_order || [];
    const rootPromptOrder = data.prompt_order || [];
    const promptOrder = rootPromptOrder.length > 0 ? rootPromptOrder : extPromptOrder;

    // Build lookup: identifier → prompt data from the library
    const promptsMap: Record<string, any> = data.prompts || {};
    const identifierMap: Record<string, any> = {};
    // If prompts have an 'identifier' field, use that; otherwise use the key
    for (const [key, p] of Object.entries(promptsMap)) {
      if (p && typeof p === 'object') {
        const ident = (p as any).identifier || key;
        identifierMap[String(ident)] = p;
      }
    }

    // Collect ordered (identifier, enabled) pairs from prompt_order.
    // When multiple character_id entries exist, prefer the one with actual
    // user prompts (UUID identifiers) — that's the real order. Entries that
    // contain only system markers are just marker-definition stubs.
    const orderedItems: Array<{ id: string; enabled: boolean }> = [];
    if (Array.isArray(promptOrder)) {
      let bestEntry: { order: any[] } | null = null;
      let bestNonMarkerCount = -1;
      for (const item of promptOrder) {
        if (Array.isArray(item.order)) {
          const nonMarkerCount = item.order.filter((o: any) => !(String(o.identifier) in MODULE_ID_MAP)).length;
          if (nonMarkerCount > bestNonMarkerCount) {
            bestNonMarkerCount = nonMarkerCount;
            bestEntry = item;
          }
        }
      }
      // Fallback: use the first entry if none had non-marker identifiers
      if (!bestEntry && promptOrder.length > 0 && Array.isArray(promptOrder[0].order)) {
        bestEntry = promptOrder[0];
      }
      if (bestEntry?.order) {
        for (const o of bestEntry.order) {
          orderedItems.push({ id: String(o.identifier), enabled: o.enabled !== false });
        }
      }
    }

    const name = fileName || data.name || '';
    const promptItems: any[] = [];
    const usedIds = new Set<string>();

    // Process prompt_order entries in order, respecting enabled state
    for (const { id, enabled } of orderedItems) {
      // Standard module markers — always treated as markers, even if prompt data exists
      const isKnownModule = id in MODULE_ID_MAP;
      if (isKnownModule) {
        const label = MODULE_ID_MAP[id];
        // Look up custom name/content from the prompts map
        const promptData = identifierMap[id];
        const markerName = (promptData && (promptData as any).name) || label;
        const markerContent = (promptData && (promptData as any).content) || '';
        promptItems.push({
          id, name: markerName, role: 'system', trigger: [] as string[],
          position: 'relative' as const, depth: 0, order: promptItems.length,
          content: markerContent, enabled, kind: 'marker' as const,
          readOnly: id === 'dialogueExamples' || id === 'chatHistory',
          _library: false,
        });
        usedIds.add(id);
      } else {
        // User-created prompt — look up in prompts map
        const p = identifierMap[id];
        if (p && (p as any).name) {
          promptItems.push({
            id: 'pi_' + id, name: (p as any).name, role: (p as any).role || 'system',
            trigger: [] as string[], position: 'relative' as const, depth: 4, order: promptItems.length,
            content: (p as any).content || '', enabled, kind: 'prompt' as const,
            _library: false, _originalName: (p as any).name,
          });
          usedIds.add(id);
        }
        // Unknown and not in prompts — skip (orphan ID)
      }
    }

    // Add remaining library prompts NOT in prompt_order as cache items
    for (const [key, p] of Object.entries(promptsMap)) {
      const ident = String((p as any).identifier || key);
      if (!usedIds.has(ident) && p && typeof p === 'object' && (p as any).name) {
        promptItems.push({
          id: 'lib_' + key, name: (p as any).name, role: (p as any).role || 'system',
          trigger: [] as string[], position: 'relative' as const, depth: 4, order: 100,
          content: (p as any).content || '', enabled: true, kind: 'prompt' as const,
          _library: true, _originalName: (p as any).name,
        });
      }
    }
    // Extract quick prompt contents from the prompts map by looking up marker identifiers
    const mainPrompt = (identifierMap['main'] as any)?.content || '';
    const auxiliaryPrompt = (identifierMap['enhanceDefinitions'] as any)?.content
      || (identifierMap['auxiliary'] as any)?.content || '';
    const postHistoryPrompt = (identifierMap['postHistoryInstructions'] as any)?.content
      || (identifierMap['jailbreak'] as any)?.content || '';

    const preset: ChatPreset = {
      id: `preset-imported-${Date.now()}`, name,
      temperature: data.temperature ?? 1.00, topP: data.top_p ?? 1.00, topK: data.top_k ?? 40,
      minP: data.min_p ?? 0, topA: data.top_a ?? 0,
      maxTokens: data.max_tokens ?? 2048,
      frequencyPenalty: data.frequency_penalty ?? 0.00,
      presencePenalty: data.presence_penalty ?? 0.00,
      repetitionPenalty: data.repetition_penalty ?? data.frequency_penalty ?? 1.00,
      systemPrompt: data.system_prompt ?? '', userPrefix: data.user_prefix ?? '玩家: ', assistantPrefix: data.assistant_prefix ?? '守秘人: ',
      unlockContext: data.max_context_unlocked ?? data.unlock_context ?? false,
      contextLength: data.openai_max_context ?? data.context_length ?? 65536,
      maxResponseTokens: data.max_response_length ?? data.max_tokens ?? 2048, alternativeReplies: 1,
      streamEnabled: data.stream_enabled ?? false,
      reasoningEffort: data.reasoning_effort ?? 'auto',
      showThoughts: data.show_thoughts ?? false,
      responseLength: data.response_length ?? 'auto',
      seed: data.seed ?? -1,
      charNameBehavior: typeof data.names_behavior === 'number'
        ? (['none', 'completion', 'content'] as const)[data.names_behavior] ?? 'none'
        : (data.char_name_behavior ?? 'none'),
      continueSuffix: (() => {
        const postfix = data.continue_postfix ?? data.continue_suffix;
        if (postfix === '' || postfix === undefined || postfix === null) return 'none' as const;
        if (postfix === ' ') return 'space' as const;
        if (postfix === '\n') return 'newline' as const;
        if (postfix === '\n\n') return 'doublenewline' as const;
        return 'none' as const;
      })(),
      continuePrefill: data.continue_prefill ?? false,
      assistantPrefill: data.assistant_prefill ?? '',
      mainPrompt, auxiliaryPrompt, postHistoryPrompt,
      aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动', worldBookTemplate: '[世界书: {0}]',
      scenarioTemplate: '场景: {{scenario}}', personalityTemplate: '性格: {{personality}}',
      groupChatPrompt: '请以{{char}}的身份回复。', newChatPrompt: '[新的聊天即将开始]',
      newGroupChatPrompt: '[新的群聊即将开始]', newExampleChatPrompt: '[新的示例聊天即将开始]',
      continuePrompt: '[继续推进]', emptyMessagePrompt: '', promptItems,
      tavernHelperScripts: thData.scripts,
      tavernHelperVars: thData.vars,
    };
    return { preset, regexScripts };
  } catch { return null; }
}

// ── Bulk ──

export function exportAllWorldBooksToST(books: Record<string, LoreBook>): string {
  const arr = Object.values(books).map((b) => ({
    name: b.name,
    entries: Object.fromEntries(
      Object.entries(b.entries).map(([k, v], i) => [k, {
        uid: i,
        key: v.keys.split(/[,，]/).map((s) => s.trim()),
        keysecondary: [],
        comment: v.name,
        content: v.content,
        constant: false,
        selective: false,
        order: v.priority,
        position: 'before_char' as const,
        disable: false,
        excludeRecursion: false,
        logic: v.logic === 'AND' ? 'AND_ALL' as const : 'OR_ANY' as const,
        extensions: {},
      }]),
    ),
  }));
  return JSON.stringify(arr, null, 2);
}

export function exportAllPresetsToST(presets: ChatPreset[]): string {
  return JSON.stringify(presets.map((p) => ({
    name: p.name, temperature: p.temperature, top_p: p.topP, top_k: p.topK,
    min_p: p.minP, top_a: p.topA,
    max_tokens: p.maxTokens, frequency_penalty: p.frequencyPenalty, presence_penalty: p.presencePenalty,
    repetition_penalty: p.repetitionPenalty,
    system_prompt: p.systemPrompt, user_prefix: p.userPrefix, assistant_prefix: p.assistantPrefix,
    max_context_unlocked: p.unlockContext, openai_max_context: p.contextLength, max_response_length: p.maxResponseTokens,
    reasoning_effort: p.reasoningEffort, response_length: p.responseLength, seed: p.seed,
    char_name_behavior: p.charNameBehavior, continue_suffix: p.continueSuffix,
    prompt_order: p.promptItems.map((pi: any) => ({ identifier: pi.id, name: pi.name, enabled: pi.enabled, content: pi.content, role: pi.role })),
  })), null, 2);
}
