import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { _resetRpm } from './rpm-limiter';
import { generateStartingItems } from './starting-items-generator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 30 } }),
  } as unknown as Response);
}

describe('generateStartingItems', () => {
  beforeEach(_resetRpm);
  afterEach(() => vi.restoreAllMocks());

  it('解析 {"items":[...]} 为 add 变更', async () => {
    const spy = mockFetchOnce(JSON.stringify({
      items: [
        { name: '怀表', category: 'misc', description: '祖传银质怀表', quantity: 1 },
        { name: '左轮手枪', category: 'weapon', description: '点38口径转轮手枪', quantity: 1 },
      ],
    }));
    const r = await generateStartingItems('记者，调查阿卡姆失踪案', 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.changes).toHaveLength(2);
    expect(r.changes[0]).toMatchObject({ action: 'add', name: '怀表', category: 'misc', quantity: 1 });
    expect(r.changes[1].category).toBe('weapon');
  });

  it('剥离思考块/代码围栏后仍能解析顶层数组', async () => {
    mockFetchOnce('<think>盘算</think>\n```json\n[{"name":"煤油灯","category":"tool","description":"黄铜煤油灯"}]\n```');
    const r = await generateStartingItems('x', 'u', 'k', 'm');
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ action: 'add', name: '煤油灯', category: 'tool', quantity: 1 });
  });

  it('非法 category 回落 misc；缺省 quantity 取 1', async () => {
    mockFetchOnce(JSON.stringify({ items: [{ name: '神秘符咒', category: 'spell', description: '看不懂的符咒' }] }));
    const r = await generateStartingItems('x', 'u', 'k', 'm');
    expect(r.changes[0].category).toBe('misc');
    expect(r.changes[0].quantity).toBe(1);
  });

  it('无名物品被过滤', async () => {
    mockFetchOnce(JSON.stringify({ items: [{ category: 'tool', description: '无名' }, { name: '  ', description: '空白名' }] }));
    const r = await generateStartingItems('x', 'u', 'k', 'm');
    expect(r.changes).toHaveLength(0);
  });

  it('空/截断响应触发重试，下一次成功', async () => {
    mockFetchOnce('');                          // 第 1 次：空响应 → Unexpected end of JSON input → 重试
    mockFetchOnce('{"items":[{"name":"钢笔",');  // 第 2 次：截断 JSON → 仍重试
    mockFetchOnce(JSON.stringify({ items: [{ name: '黄铜钢笔', category: 'tool', description: '一支旧钢笔' }] }));
    const r = await generateStartingItems('x', 'u', 'k', 'm'); // retries 默认 3
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].name).toBe('黄铜钢笔');
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(generateStartingItems('x', 'u', 'k', 'm')).rejects.toThrow();
  });
});
