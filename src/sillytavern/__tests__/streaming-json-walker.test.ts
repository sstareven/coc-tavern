import { describe, it, expect } from 'vitest';
import { StreamingJsonWalker } from '../streaming-json-walker';

describe('StreamingJsonWalker v2 (顶层多字段 + choices 嵌套)', () => {
  it('丢弃非 target 字段字符', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"sceneInfo":{"time":"深夜"},"leftHeader":"序章"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('序章');
  });

  it('支持顶层 5 个 target: leftHeader/leftContent/rightHeader/rightContent/summary', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"summary":"S","leftHeader":"LH","leftContent":"LC","rightHeader":"RH","rightContent":"RC"}');
    const fields = events.filter((e) => e.kind === 'enterField').map((e) => (e as { field: string }).field);
    expect(fields).toEqual(['summary', 'leftHeader', 'leftContent', 'rightHeader', 'rightContent']);
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('SLHLCRHRC');
  });

  it('chunk 边界:同一字段跨 chunk', () => {
    const w = new StreamingJsonWalker();
    const e1 = w.feed('{"leftContent":"调查');
    const e2 = w.feed('员推门"');
    const chars = [...e1, ...e2].filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('调查员推门');
  });

  it('JSON 转义:\\" 与 \\\\ 与 \\n', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftContent":"他说\\"快走\\"\\n然后"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('他说"快走"\n然后');
  });

  it('emit exitField 事件配对', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"标题","leftContent":"正文"}');
    const exits = events.filter((e) => e.kind === 'exitField').length;
    expect(exits).toBe(2);
  });

  it('end() emit streamDone', () => {
    const w = new StreamingJsonWalker();
    w.feed('{"leftContent":"正文"}');
    const events = w.end();
    expect(events.some((e) => e.kind === 'streamDone')).toBe(true);
  });

  it('choices 数组:每个 choice.text 与 choice.num emit enterField 带 choiceIdx', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"choices":[{"num":"I","text":"看书","action":"a1"},{"num":"II","text":"离开","action":"a2"}]}');
    const enters = events.filter((e) => e.kind === 'enterField').map((e) => {
      const ev = e as { field: string; choiceIdx?: number };
      return { field: ev.field, choiceIdx: ev.choiceIdx };
    });
    // 期望:choice0.num, choice0.text, choice1.num, choice1.text
    expect(enters).toEqual([
      { field: 'choiceNum', choiceIdx: 0 },
      { field: 'choiceText', choiceIdx: 0 },
      { field: 'choiceNum', choiceIdx: 1 },
      { field: 'choiceText', choiceIdx: 1 },
    ]);
    // action 不在 target 里,字符不应 emit
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('I看书II离开');
  });

  it('choices 数组 chunk 边界:跨 chunk 进 choice 不破裂', () => {
    const w = new StreamingJsonWalker();
    const e1 = w.feed('{"choices":[{"num":"I","te');
    const e2 = w.feed('xt":"行动","action":"x"}]}');
    const enters = [...e1, ...e2].filter((e) => e.kind === 'enterField').map((e) => (e as { field: string; choiceIdx?: number }));
    expect(enters).toContainEqual({ kind: 'enterField', field: 'choiceText', choiceIdx: 0 });
    const chars = [...e1, ...e2].filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('I行动');
  });

  it('keywords 这种 object 顶层字段:整段跳过不污染', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"a","keywords":{"key":"val"},"leftContent":"b"}');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('ab');
  });

  it('choices 后接其他顶层字段:正确退出回顶层状态', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"choices":[{"num":"I","text":"a","action":"x"}],"summary":"总"}');
    const fields = events.filter((e) => e.kind === 'enterField').map((e) => (e as { field: string }).field);
    expect(fields).toEqual(['choiceNum', 'choiceText', 'summary']);
  });
});
