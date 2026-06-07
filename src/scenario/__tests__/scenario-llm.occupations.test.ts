// scenario-llm.generateCustomOccupations — Section 5 §6.1
//
// mock callDsSubagent + useSettingsStore,验证:
//   1) happy path: JSON 正常解析 → 返回 upsertOccupations + suggestedNewSkills 透传
//   2) parsed=null / parseError → 返回空 patch 不抛错(spec §6.4)
//   3) suggestedNewSkills 副产品正确解析
//   4) cacheStats label 前缀为 'scenario:occ-gen'(callDsSubagent 收到的 label)
//   5) max_tokens 不低于 20000
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Occupation } from '../../sillytavern/coc-data';
import type { ScenarioMeta } from '../../types/scenario';

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

import { generateCustomOccupations } from '../scenario-llm';

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

describe('generateCustomOccupations', () => {
  it('happy path: JSON 正常解析 → 透传 upsertOccupations + suggestedNewSkills', async () => {
    const ups: Occupation[] = [
      { name: '罗马军团百夫长', crMin: 30, crMax: 60, skills: ['战斗(剑)', '聆听', '侦查', '说服', '急救', '攀爬', '跳跃', '心理学'] },
    ];
    callMock.mockResolvedValue({
      parsed: { upsertOccupations: ups, suggestedNewSkills: ['战车驾驶', '古文献抄写'] },
      parseError: undefined,
      content: '{}',
    });
    const out = await generateCustomOccupations(meta(), [], 10);
    expect(out.upsertOccupations).toEqual(ups);
    expect(out.suggestedNewSkills).toEqual(['战车驾驶', '古文献抄写']);
  });

  it('parsed=null + parseError → 返回空 patch,不抛错', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: '语法错误 X', content: '坏 JSON' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await generateCustomOccupations(meta(), [], 10);
    expect(out).toEqual({ upsertOccupations: [], suggestedNewSkills: [] });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('suggestedNewSkills 缺省时上游不应崩,upsertOccupations 仍透传', async () => {
    const ups: Occupation[] = [
      { name: '元老', crMin: 70, crMax: 90, skills: ['说服', '历史', '法律', '聆听', '心理学', '话术', '语言(其他)', '取悦'] },
    ];
    callMock.mockResolvedValue({ parsed: { upsertOccupations: ups }, content: '{}' });
    const out = await generateCustomOccupations(meta(), [], 5);
    expect(out.upsertOccupations).toEqual(ups);
    expect(out.suggestedNewSkills).toBeUndefined();
  });

  it('label 前缀为 scenario:occ-gen, maxTokens >= 20000', async () => {
    callMock.mockResolvedValue({ parsed: { upsertOccupations: [] }, content: '{}' });
    await generateCustomOccupations(meta(), [], 3);
    expect(callMock).toHaveBeenCalledTimes(1);
    const args = callMock.mock.calls[0][0];
    expect(args.label).toBe('scenario:occ-gen');
    expect(args.maxTokens).toBeGreaterThanOrEqual(20000);
    expect(args.rpmLane).toBe('rewrite');
  });

  it('user message 含已有职业名作为去重提示', async () => {
    callMock.mockResolvedValue({ parsed: { upsertOccupations: [] }, content: '{}' });
    const existing: Occupation[] = [
      { name: '罗马军团百夫长', crMin: 30, crMax: 60, skills: ['战斗(剑)', '聆听', '侦查', '说服', '急救', '攀爬', '跳跃', '心理学'] },
    ];
    await generateCustomOccupations(meta(), existing, 5);
    const args = callMock.mock.calls[0][0];
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toContain('罗马军团百夫长');
  });

  it('user message 包含 ALL_SKILLS 白名单提示', async () => {
    callMock.mockResolvedValue({ parsed: { upsertOccupations: [] }, content: '{}' });
    await generateCustomOccupations(meta(), [], 3);
    const args = callMock.mock.calls[0][0];
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user');
    // ALL_SKILLS 里一定有 "聆听"/"侦查"/"心理学" 这种基础项
    expect(userMsg.content).toContain('聆听');
    expect(userMsg.content).toContain('侦查');
  });
});
