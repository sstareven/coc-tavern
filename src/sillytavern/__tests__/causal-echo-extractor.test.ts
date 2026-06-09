import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractCausalEcho } from '../causal-echo-extractor';
import * as subagentCall from '../subagent-call';

describe('extractCausalEcho', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path:LLM 返回 { echo: "..." } 时透传', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: { echo: '上回合翻箱 → 本回合发现遗骸' },
    } as any);
    const r = await extractCausalEcho({
      lastSummary: '调查员翻了队长的箱子',
      nextNodeTitle: '发现遗骸',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('上回合翻箱 → 本回合发现遗骸');
  });

  it('parsed === null 时返回空串', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: null,
    } as any);
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
  });

  it('网络/HTTP 错误时返回空串(永不 throw)', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockRejectedValue(new Error('boom'));
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
  });

  it('signal 已 aborted 时早退,不发请求', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const ac = new AbortController(); ac.abort();
    const r = await extractCausalEcho({
      lastSummary: 'x', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
      signal: ac.signal,
    });
    expect(r.echo).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('lastSummary 空字符串时早退', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const r = await extractCausalEcho({
      lastSummary: '   ', nextNodeTitle: 'y',
      apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
    });
    expect(r.echo).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});
