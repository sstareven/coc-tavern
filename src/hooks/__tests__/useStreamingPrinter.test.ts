/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingPrinter } from '../useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('useStreamingPrinter v2 (多区段)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leftSegments:40ms 一个 visibleChar', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push({ kind: 'leftSegments' }, [
        { kind: 'visibleChar', ch: '调' },
        { kind: 'visibleChar', ch: '查' },
      ]);
    });
    expect(useStreamingPrintStore.getState().leftSegments).toEqual([]);
    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().leftSegments)).toBe('调');
    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().leftSegments)).toBe('调查');
  });

  it('rightSegments / summarySegments / choices 各自独立累积', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push({ kind: 'summarySegments' }, [{ kind: 'visibleChar', ch: '总' }]);
      result.current.push({ kind: 'leftSegments' }, [{ kind: 'visibleChar', ch: '左' }]);
      result.current.push({ kind: 'rightSegments' }, [{ kind: 'visibleChar', ch: '右' }]);
      result.current.push({ kind: 'choiceText', idx: 0, num: 'I' }, [{ kind: 'visibleChar', ch: 'A' }]);
    });
    act(() => { vi.advanceTimersByTime(40 * 4); });
    const s = useStreamingPrintStore.getState();
    expect(textOf(s.summarySegments)).toBe('总');
    expect(textOf(s.leftSegments)).toBe('左');
    expect(textOf(s.rightSegments)).toBe('右');
    expect(s.choices.length).toBe(1);
    expect(s.choices[0].num).toBe('I');
    expect(textOf(s.choices[0].textSegments)).toBe('A');
  });

  it('多个 choice 按 idx 升序排列', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push({ kind: 'choiceText', idx: 2, num: 'III' }, [{ kind: 'visibleChar', ch: 'c' }]);
      result.current.push({ kind: 'choiceText', idx: 0, num: 'I' }, [{ kind: 'visibleChar', ch: 'a' }]);
      result.current.push({ kind: 'choiceText', idx: 1, num: 'II' }, [{ kind: 'visibleChar', ch: 'b' }]);
    });
    act(() => { vi.advanceTimersByTime(40 * 3); });
    const choices = useStreamingPrintStore.getState().choices;
    expect(choices.map((c) => c.num)).toEqual(['I', 'II', 'III']);
    expect(choices.map((c) => textOf(c.textSegments)).join('')).toBe('abc');
  });

  it('leftSegments openKw → 内部字符 → closeKw 形成独立 kw segment', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push({ kind: 'leftSegments' }, [
        { kind: 'visibleChar', ch: 'a' },
        { kind: 'openKw' },
        { kind: 'visibleChar', ch: '词' },
        { kind: 'closeKw' },
        { kind: 'visibleChar', ch: 'b' },
      ]);
    });
    act(() => { vi.advanceTimersByTime(40 * 3); });
    const segs = useStreamingPrintStore.getState().leftSegments;
    expect(segs[0]).toEqual({ kind: 'text', content: 'a' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '词' });
    expect(segs[2]).toEqual({ kind: 'text', content: 'b' });
  });

  it('reset 清空所有区段', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push({ kind: 'leftSegments' }, [{ kind: 'visibleChar', ch: 'a' }]);
      vi.advanceTimersByTime(40);
    });
    expect(useStreamingPrintStore.getState().leftSegments.length).toBe(1);
    act(() => { result.current.reset(); });
    expect(useStreamingPrintStore.getState().leftSegments).toEqual([]);
    expect(useStreamingPrintStore.getState().choices).toEqual([]);
  });
});

function textOf(segments: { kind: string; content?: string }[]): string {
  return segments.filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
}
