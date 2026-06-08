import { describe, it, expect } from 'vitest';
import { StreamingJsonWalker } from '../streaming-json-walker';

describe('StreamingJsonWalker', () => {
  it('丢弃非 leftHeader/leftContent 字段的字符', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"sceneInfo":{"time":"深夜"},"leftHeader":"序章"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('序章');
  });

  it('支持 leftContent 字段字符 emit', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"a","leftContent":"调查员推门进入"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('a调查员推门进入');
  });

  it('正确处理 chunk 边界:同一字段跨 chunk', () => {
    const w = new StreamingJsonWalker();
    const e1 = w.feed('{"leftContent":"调查');
    const e2 = w.feed('员推门"');
    const chars = [...e1, ...e2].filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('调查员推门');
  });

  it('JSON 转义反斜杠不被当字符:\\" 与 \\\\ 与 \\n', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftContent":"他说「\\"快走\\"」\\n然后"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('他说「"快走"」\n然后');
  });

  it('emit enterField / exitField 事件', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"标题","leftContent":"正文"}');
    const enters = events.filter((e) => e.kind === 'enterField').map((e) => (e as { field: string }).field);
    const exits = events.filter((e) => e.kind === 'exitField').length;
    expect(enters).toEqual(['leftHeader', 'leftContent']);
    expect(exits).toBe(2);
  });

  it('end() emit streamDone', () => {
    const w = new StreamingJsonWalker();
    w.feed('{"leftContent":"正文"}');
    const events = w.end();
    expect(events.some((e) => e.kind === 'streamDone')).toBe(true);
  });

  it('其他字段(rightContent / choices / sceneInfo)字符全丢', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"rightContent":"应该看不见","choices":[{"text":"A"}]}');
    const chars = events.filter((e) => e.kind === 'narrativeChar');
    expect(chars).toEqual([]);
  });
});
