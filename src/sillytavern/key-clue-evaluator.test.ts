import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { _resetRpm } from './rpm-limiter';
import { evaluateKeyClues } from './key-clue-evaluator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 30 } }),
  } as unknown as Response);
}

// 复用同一组未揭示支柱与本回合线索。
const PILLARS = [
  { id: 'p1', title: '镇长的真面目', secret: '镇长其实是邪教首领' },
  { id: 'p2', title: '失踪者去向', secret: '失踪者被献祭于地窖' },
  { id: 'p3', title: '古井的秘密', secret: '古井通向地下神殿' },
];
const CLUES = [
  { name: '带血的祭袍', summary: '镇长卧室搜出沾血祭袍', discoveryNarrative: '抽屉夹层里翻出' },
  { name: '名册', summary: '记录历年失踪者' },
];

describe('evaluateKeyClues', () => {
  beforeEach(_resetRpm);
  afterEach(() => vi.restoreAllMocks());

  it('解析 {"matches":[...]}：过滤越界 pillarId、同 pillarId 去重', async () => {
    const spy = mockFetchOnce(JSON.stringify({
      matches: [
        { pillarId: 'p1', clueName: '带血的祭袍' },
        { pillarId: 'p1', clueName: '名册' },   // 同 p1 重复 → 去重保留第一条
        { pillarId: 'p9', clueName: '名册' },   // p9 不在传入支柱 → 过滤
        { pillarId: 'p2', clueName: '名册' },
      ],
    }));
    const r = await evaluateKeyClues(PILLARS, CLUES, 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.matches).toEqual([
      { pillarId: 'p1', clueName: '带血的祭袍' },
      { pillarId: 'p2', clueName: '名册' },
    ]);
  });

  it('剥离思考块/代码围栏后仍能解析顶层数组', async () => {
    mockFetchOnce('<think>盘算</think>\n```json\n[{"pillarId":"p3","clueName":"带血的祭袍"}]\n```');
    const r = await evaluateKeyClues(PILLARS, CLUES, 'u', 'k', 'm');
    expect(r.matches).toEqual([{ pillarId: 'p3', clueName: '带血的祭袍' }]);
  });

  it('缺 pillarId 或 clueName 的条目被过滤', async () => {
    mockFetchOnce(JSON.stringify({
      matches: [
        { clueName: '名册' },              // 缺 pillarId
        { pillarId: 'p1' },                // 缺 clueName
        { pillarId: '  ', clueName: '名册' }, // 空白 pillarId
        { pillarId: 'p2', clueName: '名册' },
      ],
    }));
    const r = await evaluateKeyClues(PILLARS, CLUES, 'u', 'k', 'm');
    expect(r.matches).toEqual([{ pillarId: 'p2', clueName: '名册' }]);
  });

  it('无匹配 {"matches":[]} 不重试，直接返回空数组', async () => {
    const spy = mockFetchOnce(JSON.stringify({ matches: [] }));
    const r = await evaluateKeyClues(PILLARS, CLUES, 'u', 'k', 'm');
    expect(spy).toHaveBeenCalledOnce(); // 未触发重试
    expect(r.matches).toHaveLength(0);
  });

  it('空/截断响应触发重试，下一次成功', async () => {
    mockFetchOnce('');                                       // 第 1 次：空响应 → 重试
    mockFetchOnce('{"matches":[{"pillarId":"p1",');          // 第 2 次：截断 JSON → 仍重试
    mockFetchOnce(JSON.stringify({ matches: [{ pillarId: 'p1', clueName: '带血的祭袍' }] }));
    const r = await evaluateKeyClues(PILLARS, CLUES, 'u', 'k', 'm'); // retries 默认 3
    expect(r.matches).toEqual([{ pillarId: 'p1', clueName: '带血的祭袍' }]);
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(evaluateKeyClues(PILLARS, CLUES, 'u', 'k', 'm')).rejects.toThrow();
  });

  it('无未揭示支柱或无新线索时跳过 LLM 调用，直接返回空', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r1 = await evaluateKeyClues([], CLUES, 'u', 'k', 'm');
    const r2 = await evaluateKeyClues(PILLARS, [], 'u', 'k', 'm');
    expect(spy).not.toHaveBeenCalled();
    expect(r1.matches).toHaveLength(0);
    expect(r2.matches).toHaveLength(0);
  });
});
