/**
 * A2.6 — timeJumpGenerator (full LLM impl): 静态 reason 前缀 + 动态场景快照后置,
 * 走 callDsSubagent (max_tokens=20000), 解析 {narration, sceneInfoUpdate, additionalEffects}.
 *
 * 这里把 useSettingsStore 与 subagent-call 都 mock 掉,确保不真发起网络请求;
 * 只校验 helper 入参 (前缀分桶 / max_tokens 下限 / 动态后置内容) 与解析结果。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('../subagent-call', () => ({
  callDsSubagent: (...args: unknown[]) => callMock(...args),
  DsSubagentHttpError: class extends Error {},
}));

import { generateTimeJump } from '../time-jump-generator';

beforeEach(() => callMock.mockReset());

describe('generateTimeJump', () => {
  it('按 reason 走静态前缀 + 把场景快照/durationHint/tableEntry 放进动态后置, max_tokens >= 20000', async () => {
    callMock.mockResolvedValue({
      content: '{}',
      parsed: { narration: 'n', sceneInfoUpdate: { date: '1925-03-04', time: '15:00' } },
    });
    await generateTimeJump({
      reason: 'bout_summary',
      durationHint: '数小时',
      sceneSnapshot: { date: '1925-03-04', time: '12:00', location: '阁楼' },
      tableEntry: '失忆',
    });
    expect(callMock).toHaveBeenCalledTimes(1);
    const req = callMock.mock.calls[0][0];
    expect(req.maxTokens).toBeGreaterThanOrEqual(20000);
    expect(req.label).toMatch(/time-jump|bout_summary/i);
    expect(req.apiBaseUrl).toBe('https://api.example.com');
    expect(req.apiKey).toBe('k');
    expect(req.model).toBe('deepseek-chat');
    // 静态前缀(cache 友好):system 内容随 reason 切换且包含 reason 标识
    const sys = req.messages.find((m: { role: string }) => m.role === 'system');
    expect(sys.content).toContain('bout_summary');
    // 动态后置:用户消息内有场景快照与表条目
    const user = req.messages.find((m: { role: string }) => m.role === 'user');
    expect(user.content).toContain('失忆');
    expect(user.content).toContain('阁楼');
    expect(user.content).toContain('数小时');
  });

  it('成功解析返回 {narration, sceneInfoUpdate}', async () => {
    callMock.mockResolvedValue({
      content: '',
      parsed: { narration: '醒来', sceneInfoUpdate: { date: '1925-03-05', time: '08:00', weekday: '周四' } },
    });
    const r = await generateTimeJump({
      reason: 'bout_summary',
      durationHint: '',
      sceneSnapshot: {},
      tableEntry: '失忆',
    });
    expect(r.narration).toBe('醒来');
    expect(r.sceneInfoUpdate.date).toBe('1925-03-05');
    expect(r.sceneInfoUpdate.time).toBe('08:00');
    expect(r.sceneInfoUpdate.weekday).toBe('周四');
  });

  it('parsed===null(畸形/截断)时退到空 narration + 空 sceneInfoUpdate, 不抛错', async () => {
    callMock.mockResolvedValue({ content: 'garbage', parsed: null, parseError: 'no json' });
    const r = await generateTimeJump({
      reason: 'bout_summary',
      durationHint: '',
      sceneSnapshot: {},
      tableEntry: '失忆',
    });
    expect(r.sceneInfoUpdate).toEqual({});
    expect(r.narration).toBe('');
    expect(r.additionalEffects).toEqual([]);
  });

  it('travel/recovery/scene_break 都有各自的静态前缀且都通过 max_tokens 下限', async () => {
    callMock.mockResolvedValue({ content: '{}', parsed: { narration: 'x', sceneInfoUpdate: {} } });
    for (const reason of ['travel', 'recovery', 'scene_break'] as const) {
      await generateTimeJump({ reason, durationHint: '一日', sceneSnapshot: { location: '阿卡姆' } });
    }
    expect(callMock).toHaveBeenCalledTimes(3);
    const prefixes = callMock.mock.calls.map((c) => c[0].messages[0].content as string);
    expect(prefixes[0]).toContain('travel');
    expect(prefixes[1]).toContain('recovery');
    expect(prefixes[2]).toContain('scene_break');
    // 不要互相混淆
    expect(prefixes[0]).not.toContain('scene_break');
    expect(prefixes[2]).not.toContain('recovery');
    for (const c of callMock.mock.calls) expect(c[0].maxTokens).toBeGreaterThanOrEqual(20000);
  });
});
