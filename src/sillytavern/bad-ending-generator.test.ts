import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateBadEnding } from './bad-ending-generator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 30 } }),
  } as unknown as Response);
}

const OK = JSON.stringify({
  badEnding: '调查员被献祭，唤醒沉睡于海沟的旧日支配者。',
  pillars: [
    { title: '凶手身份', secret: '镇长是深潜者混血' },
    { title: '作恶手段', secret: '借满月仪式打开海渊之门' },
    { title: '阻止之法', secret: '在仪式前摧毁那枚金徽' },
  ],
});

describe('generateBadEnding', () => {
  afterEach(() => vi.restoreAllMocks());

  it('解析坏结局 + 3 真相支柱', async () => {
    const spy = mockFetchOnce(OK);
    const r = await generateBadEnding('印斯茅斯', 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.description).toContain('旧日支配者');
    expect(r.pillars).toHaveLength(3);
    expect(r.pillars[0]).toMatchObject({ title: '凶手身份', secret: '镇长是深潜者混血' });
  });

  it('剥离思考块/代码围栏后仍能解析', async () => {
    mockFetchOnce('<think>盘算</think>\n```json\n' + OK + '\n```');
    const r = await generateBadEnding('x', 'u', 'k', 'm');
    expect(r.description).toContain('旧日支配者');
    expect(r.pillars).toHaveLength(3);
  });

  it('支柱超 3 条被截断为 3', async () => {
    const five = JSON.stringify({
      badEnding: '城镇沉入海底。',
      pillars: [1, 2, 3, 4, 5].map((n) => ({ title: `支柱${n}`, secret: `s${n}` })),
    });
    mockFetchOnce(five);
    const r = await generateBadEnding('x', 'u', 'k', 'm');
    expect(r.pillars).toHaveLength(3);
  });

  it('空/截断响应触发重试，下一次成功', async () => {
    mockFetchOnce('');                 // 空 → parsed null → 重试
    mockFetchOnce('{"badEnding":');     // 截断 → 重试
    mockFetchOnce(OK);
    const r = await generateBadEnding('x', 'u', 'k', 'm');
    expect(r.description).toContain('旧日支配者');
    expect(r.pillars).toHaveLength(3);
  });

  it('多次解析失败后返回空结果（不抛错）', async () => {
    mockFetchOnce(''); mockFetchOnce(''); mockFetchOnce('');
    const r = await generateBadEnding('x', 'u', 'k', 'm');
    expect(r.description).toBe('');
    expect(r.pillars).toHaveLength(0);
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(generateBadEnding('x', 'u', 'k', 'm')).rejects.toThrow();
  });
});
