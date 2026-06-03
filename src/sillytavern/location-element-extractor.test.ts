import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractLocationElements } from './location-element-extractor';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 30 } }),
  } as unknown as Response);
}

describe('extractLocationElements', () => {
  afterEach(() => vi.restoreAllMocks());

  it('解析 {"elements":[...]} 为 LocationElementInput[]，并填入传入的 locationName', async () => {
    const spy = mockFetchOnce(JSON.stringify({
      elements: [
        { name: '落地长钟', category: '陈设', description: '墙角一座停摆的胡桃木落地钟' },
        { name: '暗门', category: '通道', description: '书架后疑似可推开的暗门' },
      ],
    }));
    const r = await extractLocationElements('旧宅书房', [], '回合叙事正文', 'https://api.example.com', 'key', 'model');
    expect(spy).toHaveBeenCalledOnce();
    expect(r.elements).toHaveLength(2);
    expect(r.elements[0]).toMatchObject({ locationName: '旧宅书房', name: '落地长钟', category: '陈设' });
    expect(r.elements[1]).toMatchObject({ locationName: '旧宅书房', name: '暗门', category: '通道' });
  });

  it('剥离思考块/代码围栏后仍能解析顶层数组', async () => {
    mockFetchOnce('<think>盘算</think>\n```json\n[{"name":"血迹","category":"痕迹","description":"地板上一道拖行的暗红血迹"}]\n```');
    const r = await extractLocationElements('走廊', [], 'x', 'u', 'k', 'm');
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0]).toMatchObject({ locationName: '走廊', name: '血迹', category: '痕迹' });
  });

  it('非法 category 回落「其他」', async () => {
    mockFetchOnce(JSON.stringify({ elements: [{ name: '怪异雕像', category: 'statue', description: '形状难以描述的石雕' }] }));
    const r = await extractLocationElements('地窖', [], 'x', 'u', 'k', 'm');
    expect(r.elements[0].category).toBe('其他');
  });

  it('existingNames 去重：已知名被过滤（trim 比较）', async () => {
    mockFetchOnce(JSON.stringify({
      elements: [
        { name: '落地长钟', category: '陈设', description: '已经记录过的钟' },
        { name: '  落地长钟  ', category: '陈设', description: '带空白的重复名' },
        { name: '保险箱', category: '容器', description: '墙内嵌着的旧保险箱' },
      ],
    }));
    const r = await extractLocationElements('旧宅书房', ['落地长钟'], 'x', 'u', 'k', 'm');
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0].name).toBe('保险箱');
  });

  it('无名元素被过滤', async () => {
    mockFetchOnce(JSON.stringify({ elements: [{ category: '陈设', description: '无名' }, { name: '  ', description: '空白名' }] }));
    const r = await extractLocationElements('客厅', [], 'x', 'u', 'k', 'm');
    expect(r.elements).toHaveLength(0);
  });

  it('空/截断响应触发重试，下一次成功', async () => {
    mockFetchOnce('');                                  // 第 1 次：空响应 → Unexpected end of JSON input → 重试
    mockFetchOnce('{"elements":[{"name":"壁炉",');       // 第 2 次：截断 JSON → 仍重试
    mockFetchOnce(JSON.stringify({ elements: [{ name: '壁炉', category: '陈设', description: '熄灭已久的石砌壁炉' }] }));
    const r = await extractLocationElements('客厅', [], 'x', 'u', 'k', 'm'); // retries 默认 3
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0].name).toBe('壁炉');
  });

  it('JSON 解析成功但 elements 为空（本回合无新元素）不重试，直接返回空数组', async () => {
    const spy = mockFetchOnce(JSON.stringify({ elements: [] }));
    const r = await extractLocationElements('空房间', [], 'x', 'u', 'k', 'm');
    expect(spy).toHaveBeenCalledOnce(); // 未触发重试
    expect(r.elements).toHaveLength(0);
  });

  it('API 非 2xx 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await expect(extractLocationElements('x', [], 'n', 'u', 'k', 'm')).rejects.toThrow();
  });
});
