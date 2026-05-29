import { describe, it, expect } from 'vitest';
import { assemblePrompt, matchLoreEntries } from './prompt-assembler';
import type { MatchContext } from './prompt-assembler';
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
        logic: 'AND_ANY',
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

// ── 会话2：Character Filter + Triggers + Additional Matching Sources ──

const BASE_ENTRY: LoreEntry = {
  name: 'e', keys: 'foo', content: 'c', logic: 'AND_ANY', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
  groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
  groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
  preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
  ignoreReplyLimit: false,
};
const makeEntry = (o: Partial<LoreEntry>): LoreEntry => ({ ...BASE_ENTRY, ...o });

const makeCtx = (o: Partial<MatchContext> = {}): MatchContext => ({
  caseSensitive: false, matchWholeWord: false, messageCount: 999,
  stickyState: new Map(), cooldownState: new Map(),
  maxRecursionSteps: 1, includeNames: true, tokenBudget: 0,
  charName: '', generationType: 'normal', charTags: [],
  ...o,
});

const emptySources = {
  personaDescription: '', characterDescription: '', characterPersonality: '',
  characterDepthPrompt: '', scenario: '', creatorNotes: '',
};

describe('matchLoreEntries — character filter', () => {
  it('whitelist passes only the listed character name (case-insensitive)', () => {
    const entry = makeEntry({ keys: 'foo', characterFilter: { isExclude: false, names: ['Alice'], tags: [] } });
    expect(matchLoreEntries('foo', [entry], makeCtx({ charName: 'alice' }))).toHaveLength(1);
    expect(matchLoreEntries('foo', [entry], makeCtx({ charName: 'Bob' }))).toHaveLength(0);
  });

  it('blacklist excludes the listed character name', () => {
    const entry = makeEntry({ keys: 'foo', characterFilter: { isExclude: true, names: ['Bob'], tags: [] } });
    expect(matchLoreEntries('foo', [entry], makeCtx({ charName: 'Bob' }))).toHaveLength(0);
    expect(matchLoreEntries('foo', [entry], makeCtx({ charName: 'Alice' }))).toHaveLength(1);
  });

  it('matches by tag intersection', () => {
    const entry = makeEntry({ keys: 'foo', characterFilter: { isExclude: false, names: [], tags: ['ghost'] } });
    expect(matchLoreEntries('foo', [entry], makeCtx({ charTags: ['ghost'] }))).toHaveLength(1);
    expect(matchLoreEntries('foo', [entry], makeCtx({ charTags: ['human'] }))).toHaveLength(0);
  });

  it('empty filter does not restrict', () => {
    const entry = makeEntry({ keys: 'foo', characterFilter: { isExclude: false, names: [], tags: [] } });
    expect(matchLoreEntries('foo', [entry], makeCtx({ charName: 'anyone' }))).toHaveLength(1);
  });
});

describe('matchLoreEntries — triggers', () => {
  it('passes when generation type is listed', () => {
    const entry = makeEntry({ keys: 'foo', triggers: ['normal'] });
    expect(matchLoreEntries('foo', [entry], makeCtx({ generationType: 'normal' }))).toHaveLength(1);
  });

  it('filters out when generation type not listed', () => {
    const entry = makeEntry({ keys: 'foo', triggers: ['continue'] });
    expect(matchLoreEntries('foo', [entry], makeCtx({ generationType: 'normal' }))).toHaveLength(0);
  });

  it('empty triggers array does not restrict', () => {
    const entry = makeEntry({ keys: 'foo', triggers: [] });
    expect(matchLoreEntries('foo', [entry], makeCtx({ generationType: 'normal' }))).toHaveLength(1);
  });
});

describe('matchLoreEntries — additional matching sources', () => {
  it('matches a key found only in an enabled extra source', () => {
    const entry = makeEntry({ keys: '密室', matchScenario: true });
    const ctx = makeCtx({ matchSources: { ...emptySources, scenario: '一个密室杀人案' } });
    expect(matchLoreEntries('无关上下文', [entry], ctx)).toHaveLength(1);
  });

  it('does not match when the extra source toggle is off', () => {
    const entry = makeEntry({ keys: '密室', matchScenario: false });
    const ctx = makeCtx({ matchSources: { ...emptySources, scenario: '一个密室杀人案' } });
    expect(matchLoreEntries('无关上下文', [entry], ctx)).toHaveLength(0);
  });

  it('does not leak one source into another toggle', () => {
    const entry = makeEntry({ keys: '密室', matchPersonaDescription: true });
    const ctx = makeCtx({ matchSources: { ...emptySources, scenario: '一个密室杀人案' } });
    expect(matchLoreEntries('无关上下文', [entry], ctx)).toHaveLength(0);
  });
});
