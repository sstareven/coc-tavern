import { describe, it, expect, vi } from 'vitest';
import { runMvuSelfCorrect, buildCorrectiveMvuMessages, type SelfCorrectDeps } from './mvu-self-correct';
import type { MvuOpError } from './mvu-jsonpatch';

const err = (path: string): MvuOpError => ({ op: 'replace', path, value: 'x', reason: 'range', rawOp: {} });

// 一个总能解析出 1 个 op 的回复（让 applyOps 决定残余失败，从而隔离循环逻辑）。
const REPLY = '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/hp","value":1}]</JSONPatch></UpdateVariable>';
const reply = (content = REPLY, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) =>
  async () => ({ content, usage });

describe('buildCorrectiveMvuMessages', () => {
  it('精简自包含：默认只一条列出失败项的纠正用户消息（不再重发整份主 prompt）', () => {
    const msgs = buildCorrectiveMvuMessages([err('世界.天气')]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toContain('世界.天气');
    expect(msgs[0].content).toContain('JSONPatch');
  });

  it('给定 ctx 时附一条 system 上下文（叙事 + 状态快照）', () => {
    const msgs = buildCorrectiveMvuMessages([err('世界.天气')], { narrative: '雨更大了', statSnapshotYaml: '世界:\n  天气: 阴' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('雨更大了');
    expect(msgs[0].content).toContain('天气: 阴');
    expect(msgs[1].role).toBe('user');
  });
});

describe('runMvuSelfCorrect — RPM 预算死线', () => {
  it('永远修不好时，send 调用次数不超过预算上限', async () => {
    const send = vi.fn(reply());
    let n = 100;
    const deps: SelfCorrectDeps = { send, applyOps: () => [err('a' + n--)] };
    const { remaining } = await runMvuSelfCorrect([err('a'), err('b')], 2, deps);
    expect(send.mock.calls.length).toBeLessThanOrEqual(2);
    expect(remaining.length).toBeGreaterThan(0); // fail-open，返回残余
  });

  it('预算=0 时不发起任何请求（等价关闭）', async () => {
    const send = vi.fn(reply());
    const { remaining } = await runMvuSelfCorrect([err('a')], 0, { send, applyOps: () => [] });
    expect(send).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('预算被夹到上限 3（传入 99 也最多发 3 次）', async () => {
    const send = vi.fn(reply());
    let count = 10;
    const deps: SelfCorrectDeps = { send, applyOps: () => Array.from({ length: --count }, (_, i) => err('p' + i)) };
    await runMvuSelfCorrect(Array.from({ length: 10 }, (_, i) => err('p' + i)), 99, deps);
    expect(send.mock.calls.length).toBe(3); // MVU_SELF_CORRECT_MAX_BUDGET
  });

  it('全部修好后立即停止', async () => {
    const send = vi.fn(reply());
    const { remaining } = await runMvuSelfCorrect([err('a')], 3, { send, applyOps: () => [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(remaining).toHaveLength(0);
  });

  it('失败数不下降即停止（防原地打转），不耗满预算', async () => {
    const send = vi.fn(reply());
    const deps: SelfCorrectDeps = { send, applyOps: () => [err('a'), err('b')] };
    await runMvuSelfCorrect([err('a'), err('b')], 3, deps);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('isAborted 为真时不发起请求', async () => {
    const send = vi.fn(reply());
    const { remaining } = await runMvuSelfCorrect([err('a')], 3, {
      send,
      applyOps: () => [],
      isAborted: () => true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('AI 回复无有效 JSONPatch 时停止（不再重试）', async () => {
    const send = vi.fn(reply('只有叙事，没有补丁。'));
    const applyOps = vi.fn(() => [] as MvuOpError[]);
    const { remaining } = await runMvuSelfCorrect([err('a')], 3, { send, applyOps });
    expect(send).toHaveBeenCalledTimes(1);
    expect(applyOps).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('send 抛错时 fail-open 返回残余，不抛出', async () => {
    const send = vi.fn(async () => { throw new Error('network'); });
    const { remaining } = await runMvuSelfCorrect([err('a')], 3, { send, applyOps: () => [] });
    expect(remaining).toHaveLength(1);
  });

  it('累计每次往返的 token 用量并返回（计入 genStats）', async () => {
    // 两轮：第一轮降到 1（继续），第二轮修好（停）。每轮用量累加。
    const u = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    let round = 0;
    const send = vi.fn(async () => ({ content: REPLY, usage: u }));
    const deps: SelfCorrectDeps = { send, applyOps: () => (++round === 1 ? [err('b')] : []) };
    const { usage } = await runMvuSelfCorrect([err('a'), err('b')], 3, deps);
    expect(send).toHaveBeenCalledTimes(2);
    expect(usage).toEqual({ prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
  });

  it('无 usage 的回复不影响累计（保持 0）', async () => {
    const send = vi.fn(async () => ({ content: REPLY }));
    const { usage } = await runMvuSelfCorrect([err('a')], 3, { send, applyOps: () => [] });
    expect(usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  });
});
