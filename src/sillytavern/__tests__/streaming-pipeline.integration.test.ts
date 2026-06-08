/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StreamingJsonWalker } from '../streaming-json-walker';
import { StreamingTagMask } from '../streaming-tag-mask';
import { useStreamingPrinter } from '../../hooks/useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('streaming pipeline v2 集成', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leftContent JSON 流 → walker → mask → printer 端到端,kw 段分割', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    const chunk = '{"leftContent":"调查员看见<kw>密信</kw>。"}';

    act(() => {
      const walkerEvents = walker.feed(chunk);
      const maskEvents = walkerEvents.flatMap((ev) =>
        ev.kind === 'narrativeChar' ? mask.feed(ev.ch) : []
      );
      result.current.push({ kind: 'leftSegments' }, maskEvents);
    });
    act(() => { vi.advanceTimersByTime(40 * 20); });

    const segs = useStreamingPrintStore.getState().leftSegments;
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ kind: 'text', content: '调查员看见' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '密信' });
    expect(segs[2]).toEqual({ kind: 'text', content: '。' });
  });

  it('summary 字段第一个出现(LLM JSON 顺序:summary → leftHeader → leftContent)', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const summaryMask = new StreamingTagMask();
    const leftMask = new StreamingTagMask();

    act(() => {
      const events = walker.feed('{"summary":"总结","leftHeader":"H","leftContent":"正文"}');
      for (const ev of events) {
        if (ev.kind === 'enterField' && ev.field === 'summary') continue;
        if (ev.kind === 'narrativeChar') {
          // 用 walker 给的 activeField — 但这里简化:直接看顺序
        }
      }
      // 顺序处理:summary 字符先 push,然后 left
      let active: string | null = null;
      for (const ev of events) {
        if (ev.kind === 'enterField') active = ev.field;
        else if (ev.kind === 'exitField') active = null;
        else if (ev.kind === 'narrativeChar') {
          if (active === 'summary') {
            result.current.push({ kind: 'summarySegments' }, summaryMask.feed(ev.ch));
          } else if (active === 'leftContent') {
            result.current.push({ kind: 'leftSegments' }, leftMask.feed(ev.ch));
          } else if (active === 'leftHeader') {
            useStreamingPrintStore.getState()._setLeftHeader(
              useStreamingPrintStore.getState().leftHeaderText + ev.ch
            );
          }
        }
      }
    });
    act(() => { vi.advanceTimersByTime(40 * 20); });

    const s = useStreamingPrintStore.getState();
    expect(textOf(s.summarySegments)).toBe('总结');
    expect(s.leftHeaderText).toBe('H');
    expect(textOf(s.leftSegments)).toBe('正文');
  });

  it('choices 流:每个 choice 独立 textSegments,num 累积', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const masks = new Map<number, StreamingTagMask>();
    const nums = new Map<number, string>();

    act(() => {
      const events = walker.feed('{"choices":[{"num":"I","text":"看书","action":"x"},{"num":"II","text":"离开","action":"y"}]}');
      let active: string | null = null;
      let idx = -1;
      for (const ev of events) {
        if (ev.kind === 'enterField') {
          active = ev.field;
          idx = ev.choiceIdx ?? -1;
        } else if (ev.kind === 'exitField') {
          active = null;
        } else if (ev.kind === 'narrativeChar') {
          if (active === 'choiceNum' && idx >= 0) {
            const cur = (nums.get(idx) ?? '') + ev.ch;
            nums.set(idx, cur);
            result.current.push({ kind: 'choiceText', idx, num: cur }, []);
          } else if (active === 'choiceText' && idx >= 0) {
            let m = masks.get(idx);
            if (!m) { m = new StreamingTagMask(); masks.set(idx, m); }
            const num = nums.get(idx) ?? '';
            result.current.push({ kind: 'choiceText', idx, num }, m.feed(ev.ch));
          }
        }
      }
    });
    act(() => { vi.advanceTimersByTime(40 * 20); });

    const choices = useStreamingPrintStore.getState().choices;
    expect(choices.length).toBe(2);
    expect(choices[0].num).toBe('I');
    expect(textOf(choices[0].textSegments)).toBe('看书');
    expect(choices[1].num).toBe('II');
    expect(textOf(choices[1].textSegments)).toBe('离开');
  });

  it('<thinking> 块完全隐藏不进 segments', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    act(() => {
      const events = walker.feed('{"leftContent":"<thinking>推演</thinking>正文"}');
      const maskEvents = events.flatMap((ev) =>
        ev.kind === 'narrativeChar' ? mask.feed(ev.ch) : []
      );
      result.current.push({ kind: 'leftSegments' }, maskEvents);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const text = textOf(useStreamingPrintStore.getState().leftSegments);
    expect(text).toBe('正文');
  });
});

function textOf(segments: { kind: string; content?: string }[]): string {
  return segments.filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
}
