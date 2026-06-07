// scenario-llm.proposeSkillBlacklist — Section 5 §6.3
//
// mock callDsSubagent + useSettingsStore,验证:
//   1) happy path: 双向 addToBlacklist + removeFromBlacklist + reasonMap 透传
//   2) parsed=null / parseError → 返回空 patch 不抛错
//   3) reasonMap 是 Record<string,string> 副产品正确解析
//   4) cacheStats label 前缀为 'scenario:blacklist'
//   5) max_tokens 不低于 20000
//   6) user message 含完整 ALL_SKILLS 列表(白名单源)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScenarioMeta } from '../../types/scenario';

vi.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      getEffectiveMainApi: () => ({ baseUrl: 'https://api.example.com', apiKey: 'k', model: 'deepseek-chat' }),
      getEffectiveMvuApi: () => ({ baseUrl: 'https://api.example.com', apiKey: 'k', model: 'deepseek-chat' }),
      getEffectiveRewriteApi: () => ({ baseUrl: 'https://api.example.com', apiKey: 'k', model: 'deepseek-chat' }),
    }),
  },
}));

const callMock = vi.fn();
vi.mock('../../sillytavern/subagent-call', () => ({
  callDsSubagent: (...args: unknown[]) => callMock(...args),
  DsSubagentHttpError: class extends Error {},
}));

vi.mock('../../sillytavern/dynamic-markers', () => ({
  hasDynamicMarker: (content: string) => content.includes('<%'),
}));

import { proposeSkillBlacklist } from '../scenario-llm';

const meta = (over: Partial<ScenarioMeta> = {}): ScenarioMeta => ({
  name: '罗马夜行',
  type: '调查',
  durationHint: '3-5h',
  difficulty: 3,
  headcountHint: '3-4 人',
  sanLossHint: '中',
  blurb: '罗马帝国晚期黄昏下的奥秘',
  ...over,
});

beforeEach(() => callMock.mockReset());

describe('proposeSkillBlacklist', () => {
  it('happy path: 双向判定 + reasonMap 透传', async () => {
    callMock.mockResolvedValue({
      parsed: {
        addToBlacklist: ['汽车驾驶', '电气维修', '计算机使用'],
        removeFromBlacklist: ['游泳'],
        reasonMap: {
          汽车驾驶: '罗马时代无汽车',
          电气维修: '罗马时代无电力',
          计算机使用: '罗马时代无计算机',
          游泳: '罗马时代仍有渔民,不应禁',
        },
      },
      parseError: undefined,
      content: '{}',
    });
    const out = await proposeSkillBlacklist(meta(), []);
    expect(out.addToBlacklist).toEqual(['汽车驾驶', '电气维修', '计算机使用']);
    expect(out.removeFromBlacklist).toEqual(['游泳']);
    expect(out.reasonMap).toEqual({
      汽车驾驶: '罗马时代无汽车',
      电气维修: '罗马时代无电力',
      计算机使用: '罗马时代无计算机',
      游泳: '罗马时代仍有渔民,不应禁',
    });
  });

  it('parsed=null + parseError → 返回空 patch 不抛错', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: '截断', content: '...' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await proposeSkillBlacklist(meta(), []);
    expect(out).toEqual({ addToBlacklist: [], removeFromBlacklist: [], reasonMap: {} });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('removeFromBlacklist 与 reasonMap 缺省 → 上游不应崩, addToBlacklist 仍透传', async () => {
    callMock.mockResolvedValue({
      parsed: { addToBlacklist: ['汽车驾驶'] },
      content: '{}',
    });
    const out = await proposeSkillBlacklist(meta(), []);
    expect(out.addToBlacklist).toEqual(['汽车驾驶']);
    expect(out.removeFromBlacklist).toBeUndefined();
    expect(out.reasonMap).toBeUndefined();
  });

  it('reasonMap 仅含部分键也透传(允许稀疏)', async () => {
    callMock.mockResolvedValue({
      parsed: {
        addToBlacklist: ['汽车驾驶', '电气维修'],
        reasonMap: { 汽车驾驶: '无汽车' },
      },
      content: '{}',
    });
    const out = await proposeSkillBlacklist(meta(), []);
    expect(out.reasonMap).toEqual({ 汽车驾驶: '无汽车' });
  });

  it('label 前缀为 scenario:blacklist, maxTokens >= 20000', async () => {
    callMock.mockResolvedValue({ parsed: { addToBlacklist: [] }, content: '{}' });
    await proposeSkillBlacklist(meta(), []);
    const args = callMock.mock.calls[0][0];
    expect(args.label).toBe('scenario:blacklist');
    expect(args.maxTokens).toBeGreaterThanOrEqual(20000);
    expect(args.rpmLane).toBe('rewrite');
  });

  it('user message 含完整 ALL_SKILLS 列表(白名单源)与当前已勾选黑名单', async () => {
    callMock.mockResolvedValue({ parsed: { addToBlacklist: [] }, content: '{}' });
    await proposeSkillBlacklist(meta(), ['潜行']);
    const args = callMock.mock.calls[0][0];
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user');
    // ALL_SKILLS 必含的基础项
    expect(userMsg.content).toContain('聆听');
    expect(userMsg.content).toContain('侦查');
    expect(userMsg.content).toContain('心理学');
    // 当前已勾选项也要出现
    expect(userMsg.content).toContain('潜行');
  });
});
