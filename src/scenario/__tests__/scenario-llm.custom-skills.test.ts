// scenario-llm.generateCustomSkills — Section 5 §6.2
//
// mock callDsSubagent + useSettingsStore,验证:
//   1) happy path: JSON 正常解析 → 返回 upsertCustomSkills + suggestedBlacklist 透传
//   2) parsed=null / parseError → 返回空 patch 不抛错
//   3) base 可以是数字 / "DEX_HALF" / "EDU";cat 是 6 类之一(由 schema 提示约束,本测试只覆盖透传)
//   4) cacheStats label 前缀为 'scenario:skill-gen'
//   5) max_tokens 不低于 20000
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScenarioCustomSkill, ScenarioMeta } from '../../types/scenario';

vi.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      apiBaseUrl: 'https://api.example.com',
      apiKey: 'k',
      apiModel: 'deepseek-chat',
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

import { generateCustomSkills } from '../scenario-llm';

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

describe('generateCustomSkills', () => {
  it('happy path: JSON 正常解析 → 透传 upsertCustomSkills + suggestedBlacklist', async () => {
    const ups: ScenarioCustomSkill[] = [
      { name: '骑马', base: 5, cat: '运动系', desc: '罗马时代骑乘马匹的技巧。' },
      { name: '古文献抄写', base: 10, cat: '侦查系' },
    ];
    callMock.mockResolvedValue({
      parsed: { upsertCustomSkills: ups, suggestedBlacklist: ['汽车驾驶', '计算机使用'] },
      parseError: undefined,
      content: '{}',
    });
    const out = await generateCustomSkills(meta(), [], 6);
    expect(out.upsertCustomSkills).toEqual(ups);
    expect(out.suggestedBlacklist).toEqual(['汽车驾驶', '计算机使用']);
  });

  it('parsed=null + parseError → 返回空 patch,不抛错', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: '不是合法 JSON', content: 'oops' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await generateCustomSkills(meta(), [], 6);
    expect(out).toEqual({ upsertCustomSkills: [], suggestedBlacklist: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('base 可为字符串 DEX_HALF / EDU,正常透传', async () => {
    const ups: ScenarioCustomSkill[] = [
      { name: '战车驾驶', base: 'DEX_HALF', cat: '运动系' },
      { name: '希腊哲学', base: 'EDU', cat: '生活系' },
    ];
    callMock.mockResolvedValue({ parsed: { upsertCustomSkills: ups }, content: '{}' });
    const out = await generateCustomSkills(meta(), [], 4);
    expect(out.upsertCustomSkills).toEqual(ups);
  });

  it('suggestedBlacklist 缺省时上游不应崩,upsertCustomSkills 仍透传', async () => {
    const ups: ScenarioCustomSkill[] = [
      { name: '短剑投掷', base: 20, cat: '战斗系' },
    ];
    callMock.mockResolvedValue({ parsed: { upsertCustomSkills: ups }, content: '{}' });
    const out = await generateCustomSkills(meta(), [], 3);
    expect(out.upsertCustomSkills).toEqual(ups);
    expect(out.suggestedBlacklist).toBeUndefined();
  });

  it('label 前缀为 scenario:skill-gen, maxTokens >= 20000', async () => {
    callMock.mockResolvedValue({ parsed: { upsertCustomSkills: [] }, content: '{}' });
    await generateCustomSkills(meta(), [], 3);
    const args = callMock.mock.calls[0][0];
    expect(args.label).toBe('scenario:skill-gen');
    expect(args.maxTokens).toBeGreaterThanOrEqual(20000);
    expect(args.rpmLane).toBe('rewrite');
  });

  it('user message 含 6 类 SkillCat 约束', async () => {
    callMock.mockResolvedValue({ parsed: { upsertCustomSkills: [] }, content: '{}' });
    await generateCustomSkills(meta(), [], 3);
    const args = callMock.mock.calls[0][0];
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user');
    // 6 类必须在 prompt 中提示
    expect(userMsg.content).toContain('侦查系');
    expect(userMsg.content).toContain('护理系');
    expect(userMsg.content).toContain('运动系');
    expect(userMsg.content).toContain('战斗系');
    expect(userMsg.content).toContain('交涉系');
    expect(userMsg.content).toContain('生活系');
  });

  it('user message 含已有自定义技能名作为去重提示', async () => {
    callMock.mockResolvedValue({ parsed: { upsertCustomSkills: [] }, content: '{}' });
    const existing: ScenarioCustomSkill[] = [{ name: '骑马', base: 5, cat: '运动系' }];
    await generateCustomSkills(meta(), existing, 5);
    const args = callMock.mock.calls[0][0];
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toContain('骑马');
  });
});
