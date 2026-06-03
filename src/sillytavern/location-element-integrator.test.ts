import { describe, it, expect, vi, afterEach } from 'vitest';
import { integrateLocationElements } from './location-element-integrator';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 30 } }),
  } as unknown as Response);
}

describe('integrateLocationElements', () => {
  afterEach(() => vi.restoreAllMocks());

  it('把多条元素归纳为 ≤5 条，填入传入的 locationName，超 5 条被 slice', async () => {
    // 模型超额吐回 6 条，应被 slice(0,5) 截断为 5 条。
    const spy = mockFetchOnce(JSON.stringify({
      elements: [
        { name: '陈设群', category: '陈设', description: '客厅里成套的旧家具与摆设，蒙着薄尘' },
        { name: '机关一', category: '机关', description: '壁炉旁可按下的隐藏砖块' },
        { name: '痕迹一', category: '痕迹', description: '地板上一道拖行的暗红血迹' },
        { name: '通道一', category: '通道', description: '书架后疑似可推开的暗门' },
        { name: '容器一', category: '容器', description: '墙内嵌着的旧保险箱' },
        { name: '异常一', category: '异常', description: '空气中挥之不去的腐臭与低语' },
      ],
    }));
    const r = await integrateLocationElements('旧宅客厅', [
      { name: '旧沙发', category: '陈设', description: 'a' },
      { name: '茶几', category: '陈设', description: 'b' },
    ], 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.elements).toHaveLength(5); // 6 → slice(0,5)
    expect(r.elements.every((e) => e.locationName === '旧宅客厅')).toBe(true);
    expect(r.elements[0]).toMatchObject({ locationName: '旧宅客厅', name: '陈设群', category: '陈设' });
  });

  it('剥离思考块/代码围栏后仍能解析顶层数组', async () => {
    mockFetchOnce('<think>归纳中</think>\n```json\n[{"name":"血迹与拖痕","category":"痕迹","description":"走廊地板上一道延伸的暗红血迹"}]\n```');
    const r = await integrateLocationElements('走廊', [
      { name: '血迹', category: '痕迹', description: 'x' },
    ], 'u', 'k', 'm');
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0]).toMatchObject({ locationName: '走廊', name: '血迹与拖痕', category: '痕迹' });
  });

  it('非法 category 回落「其他」', async () => {
    mockFetchOnce(JSON.stringify({ elements: [{ name: '怪异雕像', category: 'statue', description: '形状难以描述的石雕' }] }));
    const r = await integrateLocationElements('地窖', [
      { name: '雕像', category: '陈设', description: 'x' },
    ], 'u', 'k', 'm');
    expect(r.elements[0].category).toBe('其他');
  });

  it('无名元素被过滤', async () => {
    mockFetchOnce(JSON.stringify({ elements: [{ category: '陈设', description: '无名' }, { name: '  ', description: '空白名' }] }));
    const r = await integrateLocationElements('客厅', [
      { name: '旧沙发', category: '陈设', description: 'x' },
    ], 'u', 'k', 'm');
    expect(r.elements).toHaveLength(0);
  });

  it('空/截断响应触发重试，下一次成功', async () => {
    mockFetchOnce('');                                  // 第 1 次：空响应 → Unexpected end of JSON input → 重试
    mockFetchOnce('{"elements":[{"name":"壁炉群",');      // 第 2 次：截断 JSON → 仍重试
    mockFetchOnce(JSON.stringify({ elements: [{ name: '壁炉群', category: '陈设', description: '熄灭已久的石砌壁炉及其周边陈设' }] }));
    const r = await integrateLocationElements('客厅', [
      { name: '壁炉', category: '陈设', description: 'x' },
    ], 'u', 'k', 'm'); // retries 默认 3
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0].name).toBe('壁炉群');
  });

  it('JSON 解析成功但 elements 为空（归纳为空）不重试，直接返回空数组', async () => {
    const spy = mockFetchOnce(JSON.stringify({ elements: [] }));
    const r = await integrateLocationElements('空房间', [
      { name: '某物', category: '陈设', description: 'x' },
    ], 'u', 'k', 'm');
    expect(spy).toHaveBeenCalledOnce(); // 未触发重试
    expect(r.elements).toHaveLength(0);
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(integrateLocationElements('x', [{ name: 'a', category: '陈设', description: 'b' }], 'u', 'k', 'm')).rejects.toThrow();
  });
});
