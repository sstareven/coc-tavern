// api-profiles-engine 单测:覆盖 CRUD/校验/脱敏 纯函数核心路径
import { describe, it, expect } from 'vitest';
import {
  createApiProfile,
  updateApiProfile,
  deleteApiProfileById,
  resolveProfileById,
  validateApiProfileForm,
  stripApiKeysForExport,
  validateImportNoSecrets,
  type ApiProfile,
} from './api-profiles-engine';

function makeProfile(over: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'p1', label: 'DeepSeek', apiBaseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-abcd1234', availableModels: ['deepseek-v4-pro'],
    createdAt: 100, updatedAt: 100, ...over,
  };
}

describe('createApiProfile', () => {
  it('生成 ID/timestamp + trim label/apiBaseUrl + availableModels 默认空', () => {
    const p = createApiProfile({ label: '  DeepSeek  ', apiBaseUrl: ' https://api.deepseek.com ', apiKey: 'sk-x' });
    expect(p.id).toBeTruthy();
    expect(p.label).toBe('DeepSeek');
    expect(p.apiBaseUrl).toBe('https://api.deepseek.com');
    expect(p.apiKey).toBe('sk-x');
    expect(p.availableModels).toEqual([]);
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.updatedAt).toBe(p.createdAt);
  });
});

describe('updateApiProfile', () => {
  it('部分更新保留未传字段', () => {
    const orig = makeProfile();
    const next = updateApiProfile(orig, { label: 'New' });
    expect(next.label).toBe('New');
    expect(next.apiBaseUrl).toBe(orig.apiBaseUrl);
    expect(next.apiKey).toBe(orig.apiKey);
    expect(next.updatedAt).toBeGreaterThanOrEqual(orig.updatedAt);
  });
  it('patch.apiKey 缺省 = 不覆盖(防误清空)', () => {
    const orig = makeProfile({ apiKey: 'original-key' });
    const next = updateApiProfile(orig, { label: 'New' });
    expect(next.apiKey).toBe('original-key');
  });
  it('patch.apiKey="" = 显式清空', () => {
    const orig = makeProfile({ apiKey: 'original-key' });
    const next = updateApiProfile(orig, { apiKey: '' });
    expect(next.apiKey).toBe('');
  });
  it('trim label/apiBaseUrl', () => {
    const orig = makeProfile();
    const next = updateApiProfile(orig, { label: '  Trim Me  ', apiBaseUrl: '  https://x  ' });
    expect(next.label).toBe('Trim Me');
    expect(next.apiBaseUrl).toBe('https://x');
  });
});

describe('deleteApiProfileById', () => {
  it('返回不含目标 ID 的新数组', () => {
    const list = [makeProfile({ id: 'a' }), makeProfile({ id: 'b' }), makeProfile({ id: 'c' })];
    const next = deleteApiProfileById(list, 'b');
    expect(next.map((p) => p.id)).toEqual(['a', 'c']);
    expect(list.length).toBe(3); // 原数组不被改
  });
  it('ID 不存在时不报错且返回原顺序', () => {
    const list = [makeProfile({ id: 'a' })];
    const next = deleteApiProfileById(list, 'z');
    expect(next.map((p) => p.id)).toEqual(['a']);
  });
});

describe('resolveProfileById', () => {
  it('null/undefined/未匹配 → null', () => {
    const list = [makeProfile({ id: 'a' })];
    expect(resolveProfileById(list, null)).toBeNull();
    expect(resolveProfileById(list, undefined)).toBeNull();
    expect(resolveProfileById(list, 'z')).toBeNull();
  });
  it('匹配命中 → profile 对象引用', () => {
    const p = makeProfile({ id: 'a' });
    expect(resolveProfileById([p], 'a')).toBe(p);
  });
});

describe('validateApiProfileForm', () => {
  it('label 空 → 失败', () => {
    expect(validateApiProfileForm({ label: '', apiBaseUrl: 'https://x', apiKey: '' }).ok).toBe(false);
    expect(validateApiProfileForm({ label: '   ', apiBaseUrl: 'https://x', apiKey: '' }).ok).toBe(false);
  });
  it('apiBaseUrl 空 → 失败', () => {
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: '', apiKey: '' }).ok).toBe(false);
  });
  it('非 http(s) → 失败', () => {
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: 'ftp://x', apiKey: '' }).ok).toBe(false);
  });
  it('apiBaseUrl 无效 → 失败', () => {
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: 'not-a-url', apiKey: '' }).ok).toBe(false);
  });
  it('合法 → ok=true', () => {
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: 'https://api.x', apiKey: '' }).ok).toBe(true);
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: 'http://localhost:8080', apiKey: 'k' }).ok).toBe(true);
  });
  it('apiKey 允许为空(本地无鉴权代理)', () => {
    expect(validateApiProfileForm({ label: 'x', apiBaseUrl: 'https://x', apiKey: '' }).ok).toBe(true);
  });
});

describe('stripApiKeysForExport', () => {
  it('剔除所有 apiKey(置空) + 其余字段保留', () => {
    const list = [makeProfile({ id: 'a', apiKey: 'k1' }), makeProfile({ id: 'b', apiKey: 'k2' })];
    const stripped = stripApiKeysForExport(list);
    expect(stripped[0].apiKey).toBe('');
    expect(stripped[1].apiKey).toBe('');
    expect(stripped[0].label).toBe(list[0].label);
    expect(stripped[0].apiBaseUrl).toBe(list[0].apiBaseUrl);
  });
});

describe('validateImportNoSecrets', () => {
  it('非数组 → 失败', () => {
    expect(validateImportNoSecrets({ a: 1 }).ok).toBe(false);
    expect(validateImportNoSecrets('string').ok).toBe(false);
  });
  it('空 apiKey 全部 → ok', () => {
    expect(validateImportNoSecrets([{ apiKey: '' }, { apiKey: '' }]).ok).toBe(true);
  });
  it('任一含明文 apiKey → 失败', () => {
    expect(validateImportNoSecrets([{ apiKey: '' }, { apiKey: 'sk-x' }]).ok).toBe(false);
  });
});
