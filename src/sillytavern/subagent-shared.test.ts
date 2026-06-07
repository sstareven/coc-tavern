import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUBAGENT_SHARED_SYSTEM, wrapSubagentMessages } from './subagent-shared';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useApiProfilesStore } from '../stores/useApiProfilesStore';
import { DEFAULT_DS_CACHE_CONFIG } from './deepseek-cache';

const DS_ON_CONFIG = {
  ...DEFAULT_DS_CACHE_CONFIG,
  experimentalSubagentSharedSystem: true,
  targetSources: 'deepseek,custom',
};

/** v1.14.0 起 model 改由 useApiProfilesStore 承载 — 测试用 helper 模拟主线 profile+model。 */
function setMockMainModel(model: string): void {
  useApiProfilesStore.setState({
    apiProfiles: [{
      id: 'test', label: 'test', apiBaseUrl: 'https://test',
      apiKey: 'test', availableModels: [model],
      createdAt: 0, updatedAt: 0,
    }],
    selectedMainApiProfileId: 'test',
    selectedMainModel: model,
  });
}

beforeEach(() => {
  useSettingsStore.setState({ dsCache: { ...DEFAULT_DS_CACHE_CONFIG } });
  setMockMainModel('deepseek-v4-pro');
});

afterEach(() => {
  useSettingsStore.setState({ dsCache: { ...DEFAULT_DS_CACHE_CONFIG } });
  useApiProfilesStore.setState({
    apiProfiles: [],
    selectedMainApiProfileId: null,
    selectedMainModel: '',
  });
});

describe('wrapSubagentMessages', () => {
  it('开关关闭 → 原样返回(数组拷贝, 不修改入参)', () => {
    useSettingsStore.setState({ dsCache: { ...DEFAULT_DS_CACHE_CONFIG, experimentalSubagentSharedSystem: false } });
    const input = [
      { role: 'system' as const, content: 'ORIG_SYS' },
      { role: 'user' as const, content: 'ORIG_USER' },
    ];
    const out = wrapSubagentMessages(input, '坏结局生成');
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('开关 undefined(老存档) → 默认开启(experimentalSubagentSharedSystem !== false)', () => {
    useSettingsStore.setState({
      dsCache: { ...DEFAULT_DS_CACHE_CONFIG, experimentalSubagentSharedSystem: undefined as unknown as boolean },
    });
    const input = [
      { role: 'system' as const, content: 'S' },
      { role: 'user' as const, content: 'U' },
    ];
    const out = wrapSubagentMessages(input, 't');
    expect(out[0].content).toBe(SUBAGENT_SHARED_SYSTEM);
  });

  it('非 DS 模型也会包装(跨 API 通用)：targetSources 不再起限制作用', () => {
    useSettingsStore.setState({
      dsCache: { ...DS_ON_CONFIG, targetSources: 'openai' }, // 任何 sources 都不影响
    });
    setMockMainModel('gpt-4o');
    const input = [
      { role: 'system' as const, content: 'ORIG_SYS' },
      { role: 'user' as const, content: 'ORIG_USER' },
    ];
    const out = wrapSubagentMessages(input, '坏结局生成');
    expect(out[0].content).toBe(SUBAGENT_SHARED_SYSTEM);
    expect(out[1].content).toContain('ORIG_SYS');
  });

  it('开关开启 + DS 模型 → 包装：system 换为 SHARED；原 system 下沉到 user 头部', () => {
    useSettingsStore.setState({ dsCache: DS_ON_CONFIG });
    setMockMainModel('deepseek-v4-pro');
    const input = [
      { role: 'system' as const, content: 'ORIG_SYS_CONTENT' },
      { role: 'user' as const, content: 'ORIG_USER_CONTENT' },
    ];
    const out = wrapSubagentMessages(input, '坏结局生成');
    expect(out.length).toBe(2);
    expect(out[0].role).toBe('system');
    expect(out[0].content).toBe(SUBAGENT_SHARED_SYSTEM);
    expect(out[1].role).toBe('user');
    expect(out[1].content).toContain('[子任务: 坏结局生成]');
    expect(out[1].content).toContain('ORIG_SYS_CONTENT');
    expect(out[1].content).toContain('--- 任务输入 ---');
    expect(out[1].content).toContain('ORIG_USER_CONTENT');
    // 顺序：tag → 原 system → 任务输入 → 原 user
    const idxTag = out[1].content.indexOf('[子任务: 坏结局生成]');
    const idxSys = out[1].content.indexOf('ORIG_SYS_CONTENT');
    const idxSep = out[1].content.indexOf('--- 任务输入 ---');
    const idxUser = out[1].content.indexOf('ORIG_USER_CONTENT');
    expect(idxTag).toBeLessThan(idxSys);
    expect(idxSys).toBeLessThan(idxSep);
    expect(idxSep).toBeLessThan(idxUser);
  });

  it('多次包装相同输入 → messages[0].content 字节级稳定（缓存友好性核心保证）', () => {
    useSettingsStore.setState({ dsCache: DS_ON_CONFIG });
    setMockMainModel('deepseek-v4-pro');
    const a = wrapSubagentMessages(
      [
        { role: 'system' as const, content: 'A_SYS' },
        { role: 'user' as const, content: 'A_USER' },
      ],
      '任务A',
    );
    const b = wrapSubagentMessages(
      [
        { role: 'system' as const, content: 'B_SYS' },
        { role: 'user' as const, content: 'B_USER' },
      ],
      '任务B',
    );
    expect(a[0].content).toBe(b[0].content);
    // user 部分不同（任务不同），但 system 完全相同 → 跨子调用前缀命中点至少在 system 末尾
    expect(a[1].content).not.toBe(b[1].content);
  });

  it('无 system 或无 user → 边界保守原样返回', () => {
    useSettingsStore.setState({ dsCache: DS_ON_CONFIG });
    setMockMainModel('deepseek-v4-pro');
    expect(wrapSubagentMessages([{ role: 'user', content: 'U' }], 't')[0].content).toBe('U');
    expect(wrapSubagentMessages([{ role: 'system', content: 'S' }], 't')[0].content).toBe('S');
    expect(wrapSubagentMessages([], 't')).toEqual([]);
  });

  it('多条 messages(含 assistant prefill) → 保留 assistant 在末尾', () => {
    useSettingsStore.setState({ dsCache: DS_ON_CONFIG });
    setMockMainModel('deepseek-v4-pro');
    const input = [
      { role: 'system' as const, content: 'S' },
      { role: 'user' as const, content: 'U' },
      { role: 'assistant' as const, content: 'A_PREFILL' },
    ];
    const out = wrapSubagentMessages(input, 't');
    expect(out.length).toBe(3);
    expect(out[0].role).toBe('system');
    expect(out[1].role).toBe('user');
    expect(out[2]).toEqual({ role: 'assistant', content: 'A_PREFILL' });
  });
});

describe('SUBAGENT_SHARED_SYSTEM 内容稳定性', () => {
  it('包含通用 KP 助手身份与 JSON 输出规范', () => {
    expect(SUBAGENT_SHARED_SYSTEM).toContain('Call of Cthulhu 7e');
    expect(SUBAGENT_SHARED_SYSTEM).toContain('守秘人(KP)助手');
    expect(SUBAGENT_SHARED_SYSTEM).toContain('JSON');
    expect(SUBAGENT_SHARED_SYSTEM).toContain('子任务');
  });
});
