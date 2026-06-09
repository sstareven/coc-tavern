import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractOutfitDiff } from '../outfit-extractor';
import * as subagentCall from '../subagent-call';

const baseReq = {
  leftContent: '调查员脱下沾血的大衣,埃伦娜递来一件干净的羊毛衫。',
  investigatorOutfitSnapshot: '黑大衣(沾血)',
  npcSnapshots: [{ name: '埃伦娜', outfit: '白衬衫' }],
  apiBaseUrl: 'http://x', apiKey: 'k', model: 'm',
};

describe('extractOutfitDiff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path:返回两侧 diff', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: {
        investigatorOutfit: '羊毛衫',
        npcs: { 埃伦娜: { outfit: '白衬衫,袖口微脏' } },
      },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBe('羊毛衫');
    expect(r.npcs).toEqual({ 埃伦娜: '白衬衫,袖口微脏' });
  });

  it('未知 NPC name(快照里没有的)被丢弃', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: {
        npcs: { 埃伦娜: { outfit: 'A' }, 不存在: { outfit: 'B' } },
      },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.npcs).toEqual({ 埃伦娜: 'A' });
  });

  it('parsed === null 时空结果', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: null,
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBeUndefined();
    expect(r.npcs).toEqual({});
  });

  it('网络/HTTP 错误时返回空结果,永不 throw', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockRejectedValue(new Error('boom'));
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBeUndefined();
    expect(r.npcs).toEqual({});
  });

  it('signal 已 aborted 时早退,不发请求', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const ac = new AbortController(); ac.abort();
    const r = await extractOutfitDiff({ ...baseReq, signal: ac.signal });
    expect(r.npcs).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('leftContent 空时早退', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent');
    const r = await extractOutfitDiff({ ...baseReq, leftContent: '  ' });
    expect(r.npcs).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('仅产 investigatorOutfit 也合法', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '',
      parsed: { investigatorOutfit: '羊毛衫' },
    } as any);
    const r = await extractOutfitDiff(baseReq);
    expect(r.investigatorOutfit).toBe('羊毛衫');
    expect(r.npcs).toEqual({});
  });
});
