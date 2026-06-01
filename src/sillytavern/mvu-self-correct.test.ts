import { describe, it, expect, vi } from 'vitest';
import { runMvuSelfCorrect, buildCorrectiveMvuMessages, type SelfCorrectDeps } from './mvu-self-correct';
import type { MvuOpError } from './mvu-jsonpatch';
import type { AssembledMessage } from './prompt-assembler';

const baseMessages: AssembledMessage[] = [{ role: 'system', content: 'sys' }];
const err = (path: string): MvuOpError => ({ op: 'replace', path, value: 'x', reason: 'range', rawOp: {} });

// 一个总能解析出 1 个 op 的回复（让 applyOps 决定残余失败，从而隔离循环逻辑）。
const REPLY = '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/hp","value":1}]</JSONPatch></UpdateVariable>';

describe('buildCorrectiveMvuMessages', () => {
  it('在基础消息后追加一条列出失败项的纠正用户消息', () => {
    const msgs = buildCorrectiveMvuMessages(baseMessages, [err('世界.天气')]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBe(baseMessages[0]);
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('世界.天气');
    expect(msgs[1].content).toContain('JSONPatch');
  });
});

describe('runMvuSelfCorrect — RPM 预算死线', () => {
  it('永远修不好时，send 调用次数恰好等于预算上限', async () => {
    const send = vi.fn(async () => REPLY);
    // applyOps 永远返回同样多的失败 → 不下降，但用「同等数量、内容不同」绕过"不下降即停"以测纯预算封顶
    let n = 100;
    const deps: SelfCorrectDeps = { send, applyOps: () => [err('a' + n--)] }; // 始终 1 个，但 1>=1 触发停
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a'), err('b')], 2, deps);
    // 初始 2 项 → 第一次降到 1（继续）→ 第二次 1>=1 不降 → 停。send 调用 2 次（未超预算）。
    expect(send.mock.calls.length).toBeLessThanOrEqual(2);
    expect(remaining.length).toBeGreaterThan(0); // fail-open，返回残余
  });

  it('预算=0 时不发起任何请求（等价关闭）', async () => {
    const send = vi.fn(async () => REPLY);
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a')], 0, { send, applyOps: () => [] });
    expect(send).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('预算被夹到上限 3（传入 99 也最多发 3 次）', async () => {
    const send = vi.fn(async () => REPLY);
    // applyOps 每次去掉一项但仍剩余 → 持续下降，逼近预算上限
    let count = 10;
    const deps: SelfCorrectDeps = { send, applyOps: () => Array.from({ length: --count }, (_, i) => err('p' + i)) };
    await runMvuSelfCorrect(baseMessages, Array.from({ length: 10 }, (_, i) => err('p' + i)), 99, deps);
    expect(send.mock.calls.length).toBe(3); // MVU_SELF_CORRECT_MAX_BUDGET
  });

  it('全部修好后立即停止', async () => {
    const send = vi.fn(async () => REPLY);
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a')], 3, { send, applyOps: () => [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(remaining).toHaveLength(0);
  });

  it('失败数不下降即停止（防原地打转），不耗满预算', async () => {
    const send = vi.fn(async () => REPLY);
    // 始终返回同样的 2 项失败 → 第一次后 2>=2 立即停
    const deps: SelfCorrectDeps = { send, applyOps: () => [err('a'), err('b')] };
    await runMvuSelfCorrect(baseMessages, [err('a'), err('b')], 3, deps);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('isAborted 为真时不发起请求', async () => {
    const send = vi.fn(async () => REPLY);
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a')], 3, {
      send,
      applyOps: () => [],
      isAborted: () => true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('AI 回复无有效 JSONPatch 时停止（不再重试）', async () => {
    const send = vi.fn(async () => '只有叙事，没有补丁。');
    const applyOps = vi.fn(() => [] as MvuOpError[]);
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a')], 3, { send, applyOps });
    expect(send).toHaveBeenCalledTimes(1);
    expect(applyOps).not.toHaveBeenCalled();
    expect(remaining).toHaveLength(1);
  });

  it('send 抛错时 fail-open 返回残余，不抛出', async () => {
    const send = vi.fn(async () => { throw new Error('network'); });
    const remaining = await runMvuSelfCorrect(baseMessages, [err('a')], 3, { send, applyOps: () => [] });
    expect(remaining).toHaveLength(1);
  });
});
