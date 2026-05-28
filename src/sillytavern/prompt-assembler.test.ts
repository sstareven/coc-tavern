import { describe, it, expect } from 'vitest';
import { assemblePrompt } from './prompt-assembler';
import type { ChatPreset, LoreEntry } from '../types';

const minimalPreset: ChatPreset = {
  id: 'test',
  name: 'Test Preset',
  temperature: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  topP: 1,
  topK: 0,
  minP: 0,
  topA: 0,
  maxTokens: 1000,
  unlockContext: false,
  contextLength: 4096,
  maxResponseTokens: 1000,
  alternativeReplies: 1,
  streamEnabled: true,
  reasoningEffort: 'auto',
  showThoughts: false,
  responseLength: 'auto',
  seed: -1,
  charNameBehavior: 'none',
  continueSuffix: 'none',
  continuePrefill: false,
  assistantPrefill: '',
  systemPrompt: 'You are a GM.',
  userPrefix: '',
  assistantPrefix: '',
  mainPrompt: '',
  auxiliaryPrompt: '',
  postHistoryPrompt: '',
  aiAssistPrompt: '',
  worldBookTemplate: '',
  scenarioTemplate: '',
  personalityTemplate: '',
  groupChatPrompt: '',
  newChatPrompt: '',
  newGroupChatPrompt: '',
  newExampleChatPrompt: '',
  continuePrompt: '',
  emptyMessagePrompt: '',
  promptItems: [],
};

describe('assemblePrompt — format instruction placeholder resolution', () => {
  it('resolves {{key}} placeholders in formatInstruction', () => {
    const variables = { '调查员.技能.侦查': '40' };
    const formatInstruction = '进行侦查检定(目标值:{{调查员.技能.侦查}})';

    const messages = assemblePrompt('test input', [], minimalPreset, [], variables, formatInstruction);

    const formatMsg = messages.find((m) => m.content.includes('目标值:'));
    expect(formatMsg?.content).toContain('目标值:40');
    expect(formatMsg?.content).not.toContain('{{调查员.技能.侦查}}');
  });

  it('preserves unresolved placeholders when key not in variables', () => {
    const variables = {};
    const formatInstruction = '进行侦查检定(目标值:{{调查员.技能.侦查}})';

    const messages = assemblePrompt('test input', [], minimalPreset, [], variables, formatInstruction);

    const formatMsg = messages.find((m) => m.content.includes('目标值:'));
    expect(formatMsg?.content).toContain('{{调查员.技能.侦查}}');
  });

  it('resolves multiple skill placeholders in format instruction', () => {
    const variables = {
      '调查员.技能.侦查': '40',
      '调查员.技能.图书馆使用': '60',
    };
    const formatInstruction = '侦查={{调查员.技能.侦查}}, 图书馆={{调查员.技能.图书馆使用}}';

    const messages = assemblePrompt('test input', [], minimalPreset, [], variables, formatInstruction);

    const formatMsg = messages.find((m) => m.content.includes('侦查='));
    expect(formatMsg?.content).toContain('侦查=40');
    expect(formatMsg?.content).toContain('图书馆=60');
  });
});

describe('assemblePrompt — lore entry placeholder resolution', () => {
  it('resolves {{key}} placeholders in lore entries', () => {
    const loreEntries: LoreEntry[] = [
      {
        name: 'test',
        keys: 'test',
        logic: 'OR',
        priority: 0,
        depth: 0,
        content: '技能值: {{调查员.技能.侦查}}',
        disabled: false,
        constant: false,
        position: 0,
        probability: 100,
      },
    ];
    const variables = { '调查员.技能.侦查': '40' };

    const messages = assemblePrompt('test input', [], minimalPreset, loreEntries, variables, '');

    const loreMsg = messages.find((m) => m.content.includes('技能值:'));
    expect(loreMsg?.content).toContain('技能值: 40');
    expect(loreMsg?.content).not.toContain('{{调查员.技能.侦查}}');
  });
});