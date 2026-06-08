// 节拍化刻印队列:把 streaming-tag-mask 的 MaskEvent 流按 40ms / visibleChar 节奏推到 segments。
// 其他事件(openKw/closeKw/sanBubble/enter/exitHiddenBlock)不占节拍,在同帧顺序消费直到撞下一个 visibleChar。
// 状态写到 useStreamingPrintStore(全局),Storybook → LeftPage 直接订阅。

import { useCallback, useEffect, useRef } from 'react';
import type { MaskEvent } from '../sillytavern/streaming-tag-mask';
import { useStreamingPrintStore, type PrintSegment } from '../stores/useStreamingPrintStore';

// 用 setInterval 而非 requestAnimationFrame 是有意选择:vitest fake-timer 对 setInterval 的
// vi.advanceTimersByTime() 支持稳定,RAF 在 jsdom 下 polyfill 行为偶发漂移会影响单测断言。
// 真实视觉上 40ms tick 与 60fps(16.6ms) 不同步,但每帧只渲染一字符也无肉眼可察的跳帧。
const TICK_MS = 40;

export function useStreamingPrinter(): {
  push: (events: MaskEvent[]) => void;
  reset: () => void;
} {
  const queueRef = useRef<MaskEvent[]>([]);
  const inKwRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentsRef = useRef<PrintSegment[]>([]);

  const ensureTextSegment = useCallback(() => {
    const segs = segmentsRef.current;
    const last = segs[segs.length - 1];
    if (!last || last.kind !== 'text') {
      segs.push({ kind: 'text', content: '' });
    }
  }, []);

  const tick = useCallback(() => {
    const q = queueRef.current;

    // 消费所有 leading 非 visibleChar(如 openKw 接着 visibleChar 的情形)
    while (q.length > 0 && q[0].kind !== 'visibleChar') {
      const ev = q.shift()!;
      if (ev.kind === 'openKw') {
        segmentsRef.current.push({ kind: 'kw', content: '' });
        inKwRef.current = true;
      } else if (ev.kind === 'closeKw') {
        inKwRef.current = false;
      } else if (ev.kind === 'sanBubble') {
        segmentsRef.current.push({ kind: 'sanBubble', sanId: ev.id });
      }
      // enter/exitHiddenBlock 不入 segments(已经在 mask 层过滤掉了字符)
    }

    // 消费一个 visibleChar
    if (q.length > 0 && q[0].kind === 'visibleChar') {
      const ev = q.shift()! as { kind: 'visibleChar'; ch: string };
      if (inKwRef.current) {
        const last = segmentsRef.current[segmentsRef.current.length - 1];
        if (last && last.kind === 'kw') {
          last.content = (last.content ?? '') + ev.ch;
        } else {
          // fallback:理论不会进这里(openKw 必然先 push kw segment),保守起见仍 push 到 text 防字符丢失
          ensureTextSegment();
          const fallback = segmentsRef.current[segmentsRef.current.length - 1];
          fallback.content = (fallback.content ?? '') + ev.ch;
        }
      } else {
        ensureTextSegment();
        const last = segmentsRef.current[segmentsRef.current.length - 1];
        last.content = (last.content ?? '') + ev.ch;
      }
    }

    // 消费 trailing 非 visibleChar(让 sanBubble/closeKw 紧贴上一个 visibleChar 同帧呈现)
    while (q.length > 0 && q[0].kind !== 'visibleChar') {
      const ev = q.shift()!;
      if (ev.kind === 'openKw') {
        segmentsRef.current.push({ kind: 'kw', content: '' });
        inKwRef.current = true;
      } else if (ev.kind === 'closeKw') {
        inKwRef.current = false;
      } else if (ev.kind === 'sanBubble') {
        segmentsRef.current.push({ kind: 'sanBubble', sanId: ev.id });
      }
    }

    // 同步到 store
    useStreamingPrintStore.getState()._setSegments([...segmentsRef.current]);

    // 队列空了停 interval(下次 push 会重启)
    if (q.length === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [ensureTextSegment]);

  const push = useCallback(
    (events: MaskEvent[]) => {
      queueRef.current.push(...events);
      if (!intervalRef.current && queueRef.current.length > 0) {
        intervalRef.current = setInterval(tick, TICK_MS);
      }
    },
    [tick],
  );

  const reset = useCallback(() => {
    queueRef.current = [];
    segmentsRef.current = [];
    inKwRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    useStreamingPrintStore.getState().reset();
  }, []);

  // 卸载时清 interval
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { push, reset };
}
