import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { _resetRpm } from './rpm-limiter';
import { rectifyMissingNpcs } from './npc-rectifier';

function mockFetchOnce(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 50 } }),
  } as unknown as Response);
}

const SAMPLE_OK = JSON.stringify({
  npcUpdates: [
    { name: '霍尔姆斯先生', identity: '邻居', isPresent: true, addMemory: '在火炉旁与调查员搭话' },
    { name: '管家亚伯', identity: '宅邸管家', appearance: '佝偻消瘦', isPresent: true },
  ],
});

describe('rectifyMissingNpcs — BUG2 Part 2 补写 API 重纠', () => {
  beforeEach(_resetRpm);
  afterEach(() => vi.restoreAllMocks());

  it('解析返回的 npcUpdates 数组（含字符串字段、isPresent）', async () => {
    mockFetchOnce(SAMPLE_OK);
    const r = await rectifyMissingNpcs('叙事内容…', '玛丽', 'https://api.example.com', 'k', 'm');
    expect(r).not.toBeNull();
    expect(r!.npcUpdates).toHaveLength(2);
    expect(r!.npcUpdates[0]).toMatchObject({ name: '霍尔姆斯先生', identity: '邻居', isPresent: true, addMemory: '在火炉旁与调查员搭话' });
    expect(r!.npcUpdates[1].appearance).toBe('佝偻消瘦');
  });

  it('调查员名【绝不】出现在补写结果里（防止把玩家自己列进 NPC 名册）', async () => {
    const withInvestigator = JSON.stringify({
      npcUpdates: [
        { name: '玛丽', identity: '调查员', isPresent: true }, // 应被剔除
        { name: '霍尔姆斯先生', identity: '侦探', isPresent: true },
      ],
    });
    mockFetchOnce(withInvestigator);
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm');
    expect(r!.npcUpdates.map((n) => n.name)).toEqual(['霍尔姆斯先生']);
  });

  it('isPresent 缺省 → 补写出来的默认在场（true）', async () => {
    mockFetchOnce(JSON.stringify({ npcUpdates: [{ name: '陌生人' }] }));
    const r = await rectifyMissingNpcs('叙事…', '', 'u', 'k', 'm');
    expect(r!.npcUpdates[0].isPresent).toBe(true);
  });

  it('剥离思考块/代码围栏后仍能解析（复用 coerceJsonObject 容错）', async () => {
    mockFetchOnce('<think>查找叙事人物</think>\n```json\n' + SAMPLE_OK + '\n```');
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm');
    expect(r!.npcUpdates).toHaveLength(2);
  });

  it('空响应触发重试，下一次成功', async () => {
    mockFetchOnce(''); // parsed null → 重试
    mockFetchOnce(SAMPLE_OK);
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm');
    expect(r!.npcUpdates).toHaveLength(2);
  });

  it('穷尽重试仍无效 → 返回 null（fail-open，调用方可放弃）', async () => {
    mockFetchOnce('');
    mockFetchOnce('');
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm', undefined, undefined, undefined, 2);
    expect(r).toBeNull();
  });

  it('AbortSignal 已 abort → 立即返回 null，不发请求', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm', ctrl.signal);
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('无效项（缺 name / 非对象）被静默丢弃，其余正常返回', async () => {
    const mixed = JSON.stringify({
      npcUpdates: [
        { identity: '没名字' },               // 丢
        null,                                  // 丢
        '字符串',                             // 丢
        { name: '   ', identity: '空白名' }, // 丢
        { name: '老者' },                      // 留
      ],
    });
    mockFetchOnce(mixed);
    const r = await rectifyMissingNpcs('叙事…', '玛丽', 'u', 'k', 'm');
    expect(r!.npcUpdates).toHaveLength(1);
    expect(r!.npcUpdates[0].name).toBe('老者');
  });
});
