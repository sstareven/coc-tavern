import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { _resetRpm } from './rpm-limiter';
import { integrateClues } from './clue-integrator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }),
  } as unknown as Response);
}

describe('integrateClues', () => {
  beforeEach(_resetRpm);
  afterEach(() => vi.restoreAllMocks());

  it('解析模型返回为合成推理线索（强制带「推理」标签 + synthesized）', async () => {
    const spy = mockFetchOnce('{"insights":[{"name":"推理：献祭","summary":"线索都指向献祭仪式","discoveryNarrative":"由密信与地窖血迹推断。","relatedTo":["地窖"],"tags":["事件"]}]}');
    const r = await integrateClues(
      [{ name: '密信', summary: 's1' }, { name: '地窖血迹', summary: 's2' }],
      'https://api.example.com', 'key', 'model',
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(r.clues).toHaveLength(1);
    expect(r.clues[0].synthesized).toBe(true);
    expect(r.clues[0].name).toBe('推理：献祭');
    expect(r.clues[0].tags).toContain('推理'); // 自动补「推理」
    expect(r.clues[0].tags).toContain('事件');
  });

  it('集合外标签被过滤，但「推理」始终保留', async () => {
    mockFetchOnce('{"insights":[{"name":"推理：X","summary":"s","tags":["乱七八糟"]}]}');
    const r = await integrateClues([{ name: 'a' }, { name: 'b' }], 'u', 'k', 'm');
    expect(r.clues[0].tags).toEqual(['推理']);
  });

  it('空 insights → 空数组', async () => {
    mockFetchOnce('{"insights":[]}');
    const r = await integrateClues([{ name: 'a' }], 'u', 'k', 'm');
    expect(r.clues).toHaveLength(0);
  });

  it('兼容模型直接返回顶层数组', async () => {
    mockFetchOnce('[{"name":"推理：X","summary":"s","tags":["人物"]}]');
    const r = await integrateClues([{ name: 'a' }, { name: 'b' }], 'u', 'k', 'm');
    expect(r.clues).toHaveLength(1);
    expect(r.clues[0].synthesized).toBe(true);
    expect(r.clues[0].tags).toContain('推理');
  });

  it('兼容 {clues:[...]} 键名包裹', async () => {
    mockFetchOnce('{"clues":[{"name":"推理：Y","summary":"s"}]}');
    const r = await integrateClues([{ name: 'a' }], 'u', 'k', 'm');
    expect(r.clues).toHaveLength(1);
    expect(r.clues[0].name).toBe('推理：Y');
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(integrateClues([{ name: 'a' }], 'u', 'k', 'm')).rejects.toThrow();
  });
});
