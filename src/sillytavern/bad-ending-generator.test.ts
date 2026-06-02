import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateBadEnding } from './bad-ending-generator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 20 } }),
  } as unknown as Response);
}

describe('generateBadEnding', () => {
  afterEach(() => vi.restoreAllMocks());

  it('返回去除围栏/思考块后的纯文本坏结局', async () => {
    const spy = mockFetchOnce('<think>盘算一下</think>\n调查员被献祭，唤醒沉睡于海沟的旧日支配者。');
    const r = await generateBadEnding('阿卡姆图书馆调查', 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.description).toBe('调查员被献祭，唤醒沉睡于海沟的旧日支配者。');
    expect(r.description).not.toContain('think');
  });

  it('剥离 ```代码围栏```', async () => {
    mockFetchOnce('```\n小镇尽数化为深潜者。\n```');
    const r = await generateBadEnding('海港小镇', 'u', 'k', 'm');
    expect(r.description).toBe('小镇尽数化为深潜者。');
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(generateBadEnding('x', 'u', 'k', 'm')).rejects.toThrow();
  });
});
