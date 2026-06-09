import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractImagePromptHint } from '../image-prompt-extractor';
import * as subagentCall from '../../sillytavern/subagent-call';

describe('extractImagePromptHint — outfit 翻译', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('charactersOutfit 中文串被附进 user payload', async () => {
    const spy = vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: { prompt: 'tag1, tag2', charactersOutfitEn: 'a man in gray coat' },
    } as any);
    const out = await extractImagePromptHint(
      { leftContent: '正文', isNovelAi: true, isV4: true, charactersOutfit: '张三(灰大衣)' } as any,
      { apiBaseUrl: 'x', apiKey: 'k', model: 'm' },
    );
    expect(out?.prompt).toBe('tag1, tag2');
    expect(out?.charactersOutfitEn).toBe('a man in gray coat');
    const args = spy.mock.calls[0][0];
    const userMsg = (args.messages as any[]).find((m) => m.role === 'user').content;
    expect(userMsg).toContain('张三(灰大衣)');
  });

  it('charactersOutfit 为空时不附,返回 hint 仍正常', async () => {
    vi.spyOn(subagentCall, 'callDsSubagent').mockResolvedValue({
      content: '', parsed: { prompt: 'tag1' },
    } as any);
    const out = await extractImagePromptHint(
      { leftContent: '正文', isNovelAi: true, isV4: true } as any,
      { apiBaseUrl: 'x', apiKey: 'k', model: 'm' },
    );
    expect(out?.prompt).toBe('tag1');
    expect(out?.charactersOutfitEn).toBeUndefined();
  });
});
