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
  name?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  repetition_penalty?: number;
  system_prompt?: string;
  user_prefix?: string;
  assistant_prefix?: string;
}

export function exportPresetToST(preset: ChatPreset): string {
  const data: STPreset = {
    name: preset.name,
    temperature: preset.temperature,
    top_p: preset.topP,
    top_k: preset.topK,
    max_tokens: preset.maxTokens,
    repetition_penalty: preset.frequencyPenalty,
    system_prompt: preset.systemPrompt,
    user_prefix: preset.userPrefix,
    assistant_prefix: preset.assistantPrefix,
  };
  return JSON.stringify(data, null, 2);
}

export function importPresetFromST(json: string): ChatPreset | null {
  try {
    const data: STPreset = JSON.parse(json);
    const name = data.name ?? '导入的预设';
    return {
      id: `preset-imported-${Date.now()}`,
      name,
      temperature: data.temperature ?? 0.8,
      topP: data.top_p ?? 0.9,
      topK: data.top_k ?? 40,
      maxTokens: data.max_tokens ?? 2048,
      frequencyPenalty: 0.00,
    presencePenalty: 0.00,
      systemPrompt: data.system_prompt ?? '',
      userPrefix: data.user_prefix ?? '玩家: ',
      assistantPrefix: data.assistant_prefix ?? '守秘人: ',
      unlockContext: false,
      contextLength: 65536,
      maxResponseTokens: data.max_tokens ?? 2048,
      alternativeReplies: 1,
    };
  } catch {
    return null;
  }
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
    name: p.name,
    temperature: p.temperature,
    top_p: p.topP,
    top_k: p.topK,
    max_tokens: p.maxTokens,
    repetition_penalty: p.frequencyPenalty,
    system_prompt: p.systemPrompt,
    user_prefix: p.userPrefix,
    assistant_prefix: p.assistantPrefix,
  })), null, 2);
}
