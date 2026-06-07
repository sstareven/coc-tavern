// D5 — scenario-llm: 7 命令 callJson 路径 + injectEjsUnlock 本地包装 vs LLM 决策
//
// mock 掉 callDsSubagent + useSettingsStore,验证:
//   - parsed=null + parseError 时 throw 带 label + parseError 的 Error
//   - parsed=正常对象时直接 return
//   - injectEjsUnlock(显式 unlockKeys) 走本地包装,不调 LLM
//   - injectEjsUnlock(无 unlockKeys) 走 LLM 决策路径
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScenarioEntry } from '../../types/scenario';

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

import {
  generateEntries,
  autoCategorize,
  rewriteEntry,
  injectEjsUnlock,
  generateDarkTimeline,
  generateBadEndings,
} from '../scenario-llm';

const baseEntry = (over: Partial<ScenarioEntry> = {}): ScenarioEntry => ({
  id: 'e1',
  category: '地点',
  comment: '灯塔',
  keys: '灯塔',
  content: '灯塔耸立海角。',
  constant: false,
  position: 0,
  priority: 20,
  cachePolicy: 'auto',
  ...over,
});

beforeEach(() => callMock.mockReset());

describe('callJson 路径', () => {
  it('parsed=null + parseError 给出 → throw 含 label + parseError', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: '语法错误 X', content: '原始 LLM 文本片段' });
    await expect(generateEntries('地点', '大纲', 3)).rejects.toThrow(/generateEntries.*语法错误 X/);
  });

  it('parsed=正常对象 + 无 parseError → 直接返回 parsed', async () => {
    const upserts: ScenarioEntry[] = [];
    callMock.mockResolvedValue({ parsed: { upsertEntries: upserts }, parseError: undefined, content: '{}' });
    const out = await generateEntries('地点', '大纲', 3);
    expect(out).toEqual({ upsertEntries: upserts });
  });

  it('autoCategorize: parsed 透传', async () => {
    callMock.mockResolvedValue({ parsed: { recategorize: [{ id: 'e1', category: '人物' }] }, content: '{}' });
    const out = await autoCategorize([baseEntry()]);
    expect(out).toEqual({ recategorize: [{ id: 'e1', category: '人物' }] });
  });

  it('rewriteEntry: parsed 透传', async () => {
    const r: ScenarioEntry[] = [baseEntry({ content: '新正文' })];
    callMock.mockResolvedValue({ parsed: { upsertEntries: r }, content: '{}' });
    const out = await rewriteEntry(baseEntry(), '改正文');
    expect(out).toEqual({ upsertEntries: r });
  });

  it('generateDarkTimeline: parsed=null → throw 含 label', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: 'bad', content: '' });
    await expect(
      generateDarkTimeline(
        { name: 'X', type: '调查', durationHint: '3-5h', difficulty: 2, headcountHint: '1人', sanLossHint: '中', blurb: '' },
        [],
      ),
    ).rejects.toThrow(/generateDarkTimeline.*bad/);
  });

  it('generateBadEndings: parsed=null → throw 含 label', async () => {
    callMock.mockResolvedValue({ parsed: null, parseError: 'oops', content: '' });
    await expect(generateBadEndings([], [])).rejects.toThrow(/generateBadEndings.*oops/);
  });
});

describe('injectEjsUnlock', () => {
  it('显式 unlockKeys=["钥匙"] → 本地包装,callDsSubagent 0 次, content 含 getvar 表达式', async () => {
    const out = await injectEjsUnlock(baseEntry({ content: '神秘条目正文' }), ['钥匙']);
    expect(callMock).toHaveBeenCalledTimes(0);
    expect(out.upsertEntries).toHaveLength(1);
    const c = out.upsertEntries[0].content;
    expect(c).toContain("getvar('剧情.已解锁.钥匙')==='true'");
    expect(c).toContain('神秘条目正文');
    expect(c).toMatch(/<% if \(.+\) \{ %>/);
    expect(c).toMatch(/<% \} %>/);
  });

  it('显式 unlockKeys=["k1","k2"] → content 用 " || " 连接两个 getvar', async () => {
    const out = await injectEjsUnlock(baseEntry({ content: 'X' }), ['k1', 'k2']);
    expect(callMock).toHaveBeenCalledTimes(0);
    const c = out.upsertEntries[0].content;
    expect(c).toContain("getvar('剧情.已解锁.k1')==='true' || getvar('剧情.已解锁.k2')==='true'");
  });

  it('不传 unlockKeys → 走 LLM 决策路径,调 callDsSubagent 1 次', async () => {
    const llmReturn: ScenarioEntry[] = [baseEntry({ content: '<% if (...) %>...<% } %>' })];
    callMock.mockResolvedValue({ parsed: { upsertEntries: llmReturn }, content: '{}' });
    const out = await injectEjsUnlock(baseEntry());
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ upsertEntries: llmReturn });
  });

  it('显式 unlockKeys=[] (空数组) → 仍走 LLM 路径(条件 length>0 不成立)', async () => {
    callMock.mockResolvedValue({ parsed: { upsertEntries: [] }, content: '{}' });
    await injectEjsUnlock(baseEntry(), []);
    expect(callMock).toHaveBeenCalledTimes(1);
  });
});
