import { describe, it, expect, vi } from 'vitest';
import { parseStreamChunk } from './stream-parser';

describe('parseStreamChunk', () => {
  it('非 data: 行返回空', () => {
    expect(parseStreamChunk('event: ping')).toEqual([]);
  });

  it('[DONE] 标记返回 done token', () => {
    expect(parseStreamChunk('data: [DONE]')).toEqual([{ done: true }]);
  });

  it('正常 delta 抽取 content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hi"}}]}';
    expect(parseStreamChunk(line)).toEqual([{ content: 'hi', done: false }]);
  });

  it('无 content 的 delta 不产 token', () => {
    const line = 'data: {"choices":[{"delta":{}}]}';
    expect(parseStreamChunk(line)).toEqual([]);
  });

  it('畸形 SSE 行 console.warn 且返回空（不静默吞错）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStreamChunk('data: {not valid json')).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
