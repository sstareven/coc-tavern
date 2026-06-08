/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StreamingJsonWalker } from '../streaming-json-walker';
import { StreamingTagMask } from '../streaming-tag-mask';
import { useStreamingPrinter } from '../../hooks/useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('streaming pipeline 集成', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('JSON chunk → walker → mask → printer 端到端,kw 段正常分割', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    const chunk = '{"leftContent":"调查员看见<kw>密信</kw>。"}';

    act(() => {
      const walkerEvents = walker.feed(chunk);
      const maskEvents = [];
      for (const ev of walkerEvents) {
        if (ev.kind === 'narrativeChar') {
          maskEvents.push(...mask.feed(ev.ch));
        }
      }
      result.current.push(maskEvents);
    });

    // 推进足够时间让所有字 emit
    act(() => { vi.advanceTimersByTime(40 * 20); });

    const segs = useStreamingPrintStore.getState().segments;
    // 期望:[text("调查员看见"), kw("密信"), text("。")]
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ kind: 'text', content: '调查员看见' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '密信' });
    expect(segs[2]).toEqual({ kind: 'text', content: '。' });
  });

  it('<thinking> 块完全隐藏不进 segments', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    act(() => {
      const walkerEvents = walker.feed('{"leftContent":"<thinking>推演</thinking>正文"}');
      const maskEvents = [];
      for (const ev of walkerEvents) {
        if (ev.kind === 'narrativeChar') maskEvents.push(...mask.feed(ev.ch));
      }
      result.current.push(maskEvents);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const text = useStreamingPrintStore.getState().segments
      .filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
    expect(text).toBe('正文');
  });

  it('断 chunk 边界:同一 kw 跨 chunk 不破裂', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    act(() => {
      const ev1 = walker.feed('{"leftContent":"前<k');
      const ev2 = walker.feed('w>词</kw>后"}');
      const mevs1 = ev1.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      const mevs2 = ev2.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      result.current.push([...mevs1, ...mevs2]);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: '前' },
      { kind: 'kw', content: '词' },
      { kind: 'text', content: '后' },
    ]);
  });

  it('JSON 转义序列跨 chunk 不破裂', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    // 反斜杠在第一 chunk 末尾,n 在第二 chunk 开头 → \n 应被解码为换行
    act(() => {
      const ev1 = walker.feed('{"leftContent":"行1\\');
      const ev2 = walker.feed('n行2"}');
      const mevs1 = ev1.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      const mevs2 = ev2.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      result.current.push([...mevs1, ...mevs2]);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const text = useStreamingPrintStore.getState().segments
      .filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
    expect(text).toBe('行1\n行2');
  });
});
