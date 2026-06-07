// api-models-engine 单测:覆盖搜索/分类/掩码 纯函数核心路径
import { describe, it, expect } from 'vitest';
import {
  collectAllProfileModels,
  filterModelsBySearch,
  categorizeModels,
  maskApiKey,
  displayHostFromUrl,
  type ProfileModel,
} from './api-models-engine';
import type { ApiProfile } from './api-profiles-engine';

const profiles: ApiProfile[] = [
  { id: 'p1', label: 'DeepSeek', apiBaseUrl: 'https://api.deepseek.com', apiKey: 'k1',
    availableModels: ['deepseek-v4-pro', 'deepseek-chat'], createdAt: 0, updatedAt: 0, extraParams: '' },
  { id: 'p2', label: 'OpenRouter', apiBaseUrl: 'https://openrouter.ai', apiKey: 'k2',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet'], createdAt: 0, updatedAt: 0, extraParams: '' },
];

describe('collectAllProfileModels', () => {
  it('扁平所有 profile 的 availableModels', () => {
    const out = collectAllProfileModels(profiles);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ profileId: 'p1', profileLabel: 'DeepSeek', modelName: 'deepseek-v4-pro' });
    expect(out[4]).toEqual({ profileId: 'p2', profileLabel: 'OpenRouter', modelName: 'claude-3-5-sonnet' });
  });
  it('空 profiles → 空数组', () => {
    expect(collectAllProfileModels([])).toEqual([]);
  });
});

describe('filterModelsBySearch', () => {
  const items = collectAllProfileModels(profiles);
  it('空 q → 原列表', () => {
    expect(filterModelsBySearch(items, '')).toEqual(items);
    expect(filterModelsBySearch(items, '   ')).toEqual(items);
  });
  it('按 modelName 不区分大小写过滤', () => {
    const out = filterModelsBySearch(items, 'GPT');
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.modelName.startsWith('gpt'))).toBe(true);
  });
  it('按 profileLabel 过滤', () => {
    const out = filterModelsBySearch(items, 'deepseek');
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.profileLabel === 'DeepSeek')).toBe(true);
  });
  it('无命中 → 空数组', () => {
    expect(filterModelsBySearch(items, 'nonexistent-model-xyz')).toEqual([]);
  });
});

describe('categorizeModels', () => {
  const items = collectAllProfileModels(profiles);
  it('按 modelName 拆 `-` 头段分类', () => {
    const groups = categorizeModels(items);
    expect(Object.keys(groups).sort()).toEqual(['claude', 'deepseek', 'gpt'].sort());
    expect(groups['deepseek']).toHaveLength(2);
    expect(groups['gpt']).toHaveLength(2);
    expect(groups['claude']).toHaveLength(1);
  });
  it('无 `-` 时整串作分类', () => {
    const items: ProfileModel[] = [
      { profileId: 'p', profileLabel: 'X', modelName: 'gemini' },
    ];
    expect(Object.keys(categorizeModels(items))).toEqual(['gemini']);
  });
  it('空 items → 空对象', () => {
    expect(categorizeModels([])).toEqual({});
  });
  it('搜索后空命中 → 空分组(UI 显「(空)」)', () => {
    const filtered = filterModelsBySearch(items, 'nope');
    expect(Object.keys(categorizeModels(filtered)).length).toBe(0);
  });
});

describe('maskApiKey', () => {
  it('保留尾 4 位', () => {
    expect(maskApiKey('sk-abcdef1234')).toBe('****1234');
    expect(maskApiKey('1234567')).toBe('****4567');
  });
  it('短于等于 4 位 → 全 ****', () => {
    expect(maskApiKey('1234')).toBe('****');
    expect(maskApiKey('a')).toBe('****');
  });
  it('空串 → 空串', () => {
    expect(maskApiKey('')).toBe('');
  });
});

describe('displayHostFromUrl', () => {
  it('合法 URL → host', () => {
    expect(displayHostFromUrl('https://api.deepseek.com/v1')).toBe('api.deepseek.com');
    expect(displayHostFromUrl('http://localhost:8080')).toBe('localhost');
  });
  it('无效 URL → 原串', () => {
    expect(displayHostFromUrl('not-a-url')).toBe('not-a-url');
  });
});
