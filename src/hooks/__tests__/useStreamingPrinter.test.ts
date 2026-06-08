/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingPrinter } from '../useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('useStreamingPrinter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('40ms 一个 visibleChar 入 segments', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: '调' },
        { kind: 'visibleChar', ch: '查' },
        { kind: 'visibleChar', ch: '员' },
      ]);
    });

    // t=0:还没 tick
    expect(useStreamingPrintStore.getState().segments).toEqual([]);

    // 第 1 个字 40ms 后
    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调');

    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调查');

    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调查员');
  });

  it('openKw → 内部字符 → closeKw 形成独立 kw segment', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: 'a' },
        { kind: 'openKw' },
        { kind: 'visibleChar', ch: '词' },
        { kind: 'closeKw' },
        { kind: 'visibleChar', ch: 'b' },
      ]);
    });

    act(() => { vi.advanceTimersByTime(40 * 3); }); // a 词 b 全部出完

    const segs = useStreamingPrintStore.getState().segments;
    // 期望:[text("a"), kw("词"), text("b")]
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ kind: 'text', content: 'a' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '词' });
    expect(segs[2]).toEqual({ kind: 'text', content: 'b' });
  });

  it('sanBubble 事件入 segments 不占节拍', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: 'a' },
        { kind: 'sanBubble', id: 'p1' },
        { kind: 'visibleChar', ch: 'b' },
      ]);
    });

    // 1 tick 后:a 出 + sanBubble 同帧出
    act(() => { vi.advanceTimersByTime(40); });
    let segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: 'a' },
      { kind: 'sanBubble', sanId: 'p1' },
    ]);

    // 又 40ms:b 接着出
    act(() => { vi.advanceTimersByTime(40); });
    segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: 'a' },
      { kind: 'sanBubble', sanId: 'p1' },
      { kind: 'text', content: 'b' },
    ]);
  });

  it('reset 清空 store 与队列', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([{ kind: 'visibleChar', ch: 'a' }]);
      vi.advanceTimersByTime(40);
    });
    expect(useStreamingPrintStore.getState().segments.length).toBe(1);

    act(() => {
      result.current.reset();
    });
    expect(useStreamingPrintStore.getState().segments).toEqual([]);
  });
});

function textOf(segments: { kind: string; content?: string }[]): string {
  return segments.filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
}
