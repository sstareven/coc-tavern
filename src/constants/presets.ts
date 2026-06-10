import type { ChatPreset, PromptItem } from '../types';

export const DEFAULT_INPUT_PRESET: ChatPreset = {
  id: 'default',
  name: '默认',
  temperature: 1.00,
  frequencyPenalty: 0.00,
  presencePenalty: 0.00,
  repetitionPenalty: 1.00,
  topP: 1.00,
  topK: 40,
  minP: 0,
  topA: 0,
  maxTokens: 32768,
  systemPrompt: '',
  userPrefix: '玩家: ',
  assistantPrefix: '守秘人: ',
  unlockContext: false,
  contextLength: 65536,
  maxResponseTokens: 32768,
  alternativeReplies: 1,
  streamEnabled: false,
  reasoningEffort: 'auto' as const,
  showThoughts: false,
  responseLength: 'auto' as const,
  seed: -1,
  charNameBehavior: 'none' as const,
  continueSuffix: 'none' as const,
  continuePrefill: false,
  assistantPrefill: '',
  mainPrompt: '',
  auxiliaryPrompt: '',
  postHistoryPrompt: '',
  aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动',
  worldBookTemplate: '[世界书: {0}]',
  scenarioTemplate: '场景: {{scenario}}',
  personalityTemplate: '性格: {{personality}}',
  groupChatPrompt: '请以{{char}}的身份回复。',
  newChatPrompt: '[新的聊天即将开始]',
  newGroupChatPrompt: '[新的群聊即将开始]',
  newExampleChatPrompt: '[新的示例聊天即将开始]',
  continuePrompt: '[继续推进]',
  emptyMessagePrompt: '',
  promptItems: [],
};

export const DEFAULT_EDITOR_PRESET: ChatPreset = {
  id: 'p1',
  name: '空白预设',
  temperature: 1.00,
  frequencyPenalty: 0.00,
  presencePenalty: 0.00,
  repetitionPenalty: 1.00,
  topP: 1.00,
  topK: 40,
  minP: 0,
  topA: 0,
  maxTokens: 4096,
  systemPrompt: '',
  userPrefix: '',
  assistantPrefix: '',
  unlockContext: false,
  contextLength: 65536,
  maxResponseTokens: 4096,
  alternativeReplies: 1,
  streamEnabled: false,
  reasoningEffort: 'auto',
  showThoughts: false,
  responseLength: 'auto',
  seed: -1,
  charNameBehavior: 'none',
  continueSuffix: 'none',
  continuePrefill: false,
  assistantPrefill: '',
  mainPrompt: '',
  auxiliaryPrompt: '',
  postHistoryPrompt: '',
  aiAssistPrompt: '',
  worldBookTemplate: '[世界书: {0}]',
  scenarioTemplate: '场景: {{scenario}}',
  personalityTemplate: '性格: {{personality}}',
  groupChatPrompt: '',
  newChatPrompt: '',
  newGroupChatPrompt: '',
  newExampleChatPrompt: '',
  continuePrompt: '',
  emptyMessagePrompt: '',
  promptItems: [],
  tavernHelperScripts: [],
  regexScripts: [],
};

export const COC_KP_PRESET: ChatPreset = {
  id: 'p2',
  name: '深渊守秘人 - COC 7th',
  temperature: 1.00,
  frequencyPenalty: 0.00,
  presencePenalty: 0.00,
  repetitionPenalty: 1.00,
  topP: 1.00,
  topK: 40,
  minP: 0,
  topA: 0,
  maxTokens: 32768,
  systemPrompt: '你是 COC 第七版（克苏鲁的呼唤）的守秘人（KP），以叙事者身份推进剧情、裁决检定、营造洛夫克拉夫特式的宇宙恐怖氛围，并为玩家提供合理的行动选项。游戏状态变量的更新与回复的输出格式，一律遵循随后注入的格式指令与世界书规则。',
  userPrefix: '玩家: ',
  assistantPrefix: '守秘人: ',
  unlockContext: false,
  contextLength: 65536,
  maxResponseTokens: 32768,
  alternativeReplies: 1,
  streamEnabled: false,
  reasoningEffort: 'auto',
  showThoughts: false,
  responseLength: 'auto',
  seed: -1,
  charNameBehavior: 'none',
  continueSuffix: 'none',
  continuePrefill: false,
  assistantPrefill: '',
  mainPrompt: '',
  auxiliaryPrompt: '',
  postHistoryPrompt: '',
  aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动',
  worldBookTemplate: '[世界书: {0}]',
  scenarioTemplate: '场景: {{scenario}}',
  personalityTemplate: '性格: {{personality}}',
  groupChatPrompt: '请以{{char}}的身份回复。',
  newChatPrompt: '[新的聊天即将开始]',
  newGroupChatPrompt: '[新的群聊即将开始]',
  newExampleChatPrompt: '[新的示例聊天即将开始]',
  continuePrompt: '[继续推进]',
  emptyMessagePrompt: '',
  promptItems: [
    { id: 'main', name: 'Main Prompt', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 0, content: '', enabled: true },
    { id: 'formatInstruction', name: 'Format Instruction', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 0.5, content: '', enabled: true },
    { id: 'worldInfoBefore', name: 'World Info (before)', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 1, content: '', enabled: true },
    { id: 'personaDescription', name: 'Persona Description', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 20, content: '', enabled: true },
    { id: 'charDescription', name: 'Char Description', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 21, content: '', enabled: true },
    { id: 'charPersonality', name: 'Char Personality', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 22, content: '', enabled: true },
    { id: 'scenario', name: 'Scenario', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 23, content: '', enabled: true },
    { id: 'enhanceDefinitions', name: 'Enhance Definitions', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 55, content: '', enabled: true },
    { id: 'auxiliary', name: 'Auxiliary Prompt', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 56, content: '', enabled: true },
    { id: 'worldInfoAfter', name: 'World Info (after)', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 60, content: '', enabled: true },
    { id: 'dialogueExamples', name: 'Chat Examples', kind: 'marker', readOnly: true, role: 'system', trigger: [], position: 'relative', depth: 0, order: 90, content: '', enabled: true },
    { id: 'chatHistory', name: 'Chat History', kind: 'marker', readOnly: true, role: 'system', trigger: [], position: 'relative', depth: 0, order: 100, content: '', enabled: true },
    { id: 'postHistoryInstructions', name: 'Post-History Instructions', kind: 'marker', role: 'system', trigger: [], position: 'relative', depth: 0, order: 110, content: '[最终提醒] 你必须严格以JSON格式回复，不要输出任何JSON以外的内容。回复必须包含leftHeader、leftContent、rightHeader、rightContent、choices(恰好4个)、sceneInfo、darkThread字段。使用中文直角引号「」，禁止使用英文标点。', enabled: true },
  ],
  tavernHelperScripts: [],
  regexScripts: [],
};

export const DEFAULT_PRESETS: Record<string, ChatPreset> = {
  p1: DEFAULT_EDITOR_PRESET,
  p2: COC_KP_PRESET,
};

export const BUILTIN_PRESET_IDS = new Set(['p1', 'p2']);

/**
 * Idempotently ensure a preset's promptItems contain a `formatInstruction` marker.
 *
 * P3b: the FORMAT_INSTRUCTION (~1700 static tokens) used to be appended dead-last, after
 * the per-turn-varying worldbook, breaking deepseek's prefix cache. The marker (default
 * order 0.5, right after `main`) lets FORMAT emit early so the static `[main + FORMAT]`
 * prefix is contiguous and cacheable. Built-in presets already ship the marker; this
 * migration retrofits persisted presets whose users edited promptItems before P3b.
 *
 * No-op when the marker already exists (returns the same array reference for stability).
 */
export function ensureFormatInstructionMarker(items: PromptItem[]): PromptItem[] {
  if (!items || items.length === 0) return items;
  if (items.some((p) => p.kind === 'marker' && p.id === 'formatInstruction')) return items;
  const marker: PromptItem = {
    id: 'formatInstruction', name: 'Format Instruction', kind: 'marker', role: 'system',
    trigger: [], position: 'relative', depth: 0, order: 0.5, content: '', enabled: true,
  };
  return [...items, marker];
}
