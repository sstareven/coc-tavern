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
import type { LoreBook, LoreEntry, ChatPreset } from '../types';

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

export function exportPresetToST(preset: ChatPreset): string {
  const data: any = {
    name: preset.name, temperature: preset.temperature,
    top_p: preset.topP, top_k: preset.topK, max_tokens: preset.maxTokens,
    frequency_penalty: preset.frequencyPenalty, presence_penalty: preset.presencePenalty,
    system_prompt: preset.systemPrompt, user_prefix: preset.userPrefix, assistant_prefix: preset.assistantPrefix,
    unlock_context: preset.unlockContext, context_length: preset.contextLength,
    max_response_length: preset.maxResponseTokens, alternative_replies: preset.alternativeReplies,
    prompt_order: preset.promptItems.map((p: any) => ({
      identifier: p.id, name: p.name, enabled: p.enabled, content: p.content, role: p.role,
    })),
  };
  return JSON.stringify(data, null, 2);
}

export function importPresetFromST(json: string): ChatPreset | null {
  try {
    const data: any = JSON.parse(json);
    // Support nested extensions.prompt_order
    const extPromptOrder = data.extensions?.prompt_order || [];
    const rootPromptOrder = data.prompt_order || [];
    const promptOrder = rootPromptOrder.length > 0 ? rootPromptOrder : extPromptOrder;
    const name = data.name || '';
    const promptItems: any[] = promptOrder.map((p: any) => ({
      id: p.identifier || 'pi_' + Math.random().toString(36).slice(2),
      name: p.name || p.identifier || '', role: p.role || 'system', trigger: 'normal' as const,
      position: 'relative' as const, depth: 4, order: 100,
      content: p.content || '', enabled: p.enabled !== false, kind: 'prompt' as const, _library: false,
    }));
    return {
      id: `preset-imported-${Date.now()}`, name,
      temperature: data.temperature ?? 1.00, topP: data.top_p ?? 1.00, topK: data.top_k ?? 40,
      maxTokens: data.max_tokens ?? 2048,
      frequencyPenalty: data.frequency_penalty ?? data.repetition_penalty ?? 0.00,
      presencePenalty: data.presence_penalty ?? 0.00,
      systemPrompt: data.system_prompt ?? '', userPrefix: data.user_prefix ?? '玩家: ', assistantPrefix: data.assistant_prefix ?? '守秘人: ',
      unlockContext: data.unlock_context ?? false, contextLength: data.context_length ?? 65536,
      maxResponseTokens: data.max_response_length ?? data.max_tokens ?? 2048, alternativeReplies: 1,
      mainPrompt: '', auxiliaryPrompt: '', postHistoryPrompt: '',
      aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动', worldBookTemplate: '[世界书: {0}]',
      scenarioTemplate: '场景: {{scenario}}', personalityTemplate: '性格: {{personality}}',
      groupChatPrompt: '请以{{char}}的身份回复。', newChatPrompt: '[新的聊天即将开始]',
      newGroupChatPrompt: '[新的群聊即将开始]', newExampleChatPrompt: '[新的示例聊天即将开始]',
      continuePrompt: '[继续推进]', emptyMessagePrompt: '', promptItems,
    };
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
    max_tokens: p.maxTokens, frequency_penalty: p.frequencyPenalty, presence_penalty: p.presencePenalty,
    system_prompt: p.systemPrompt, user_prefix: p.userPrefix, assistant_prefix: p.assistantPrefix,
    unlock_context: p.unlockContext, context_length: p.contextLength, max_response_length: p.maxResponseTokens,
    prompt_order: p.promptItems.map((pi: any) => ({ identifier: pi.id, name: pi.name, enabled: pi.enabled, content: pi.content, role: pi.role })),
  })), null, 2);
}
