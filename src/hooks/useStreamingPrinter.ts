// 节拍化刻印队列 v2 — 多区段路由:
//   leftSegments / rightSegments / summarySegments / choices[i].textSegments / leftHeaderText / rightHeaderText
// onToken 端用 multi-field feeder 把 walker events 分发到各区段;printer 用统一 40ms 节拍出字符,
// 每个区段按 visibleChar 共享同一节拍(队列里相邻不同 target 的 visibleChar 也各占 40ms)。
// 这样 summary→leftContent→rightContent→choices 整体按顺序逐字出现,节奏稳定。

import { useCallback, useEffect, useRef } from 'react';
import type { MaskEvent } from '../sillytavern/streaming-tag-mask';
import { useStreamingPrintStore, type PrintSegment, type StreamingChoice } from '../stores/useStreamingPrintStore';

const TICK_MS = 40;

/** target = 哪一区段。choiceText 带 num 用于排序与 store 写入。 */
export type PrintTarget =
  | { kind: 'leftSegments' }
  | { kind: 'rightSegments' }
  | { kind: 'summarySegments' }
  | { kind: 'choiceText'; idx: number; num: string };

interface QueuedItem {
  target: PrintTarget;
  event: MaskEvent;
}

interface TrackState {
  segments: PrintSegment[];
  inKw: boolean;
}

function newTrack(): TrackState {
  return { segments: [], inKw: false };
}

function applyEvent(track: TrackState, ev: MaskEvent): void {
  if (ev.kind === 'openKw') {
    track.segments.push({ kind: 'kw', content: '' });
    track.inKw = true;
    return;
  }
  if (ev.kind === 'closeKw') {
    track.inKw = false;
    return;
  }
  if (ev.kind === 'sanBubble') {
    track.segments.push({ kind: 'sanBubble', sanId: ev.id });
    return;
  }
  if (ev.kind === 'visibleChar') {
    if (track.inKw) {
      const last = track.segments[track.segments.length - 1];
      if (last && last.kind === 'kw') {
        last.content = (last.content ?? '') + ev.ch;
      } else {
        // fallback:不应到这里
        ensureTextSeg(track);
        const t = track.segments[track.segments.length - 1];
        t.content = (t.content ?? '') + ev.ch;
      }
    } else {
      ensureTextSeg(track);
      const t = track.segments[track.segments.length - 1];
      t.content = (t.content ?? '') + ev.ch;
    }
  }
  // enter/exitHiddenBlock 不入 segments
}

function ensureTextSeg(track: TrackState): void {
  const last = track.segments[track.segments.length - 1];
  if (!last || last.kind !== 'text') {
    track.segments.push({ kind: 'text', content: '' });
  }
}

export function useStreamingPrinter(): {
  push: (target: PrintTarget, events: MaskEvent[]) => void;
  reset: () => void;
} {
  const queueRef = useRef<QueuedItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 每个区段的 track 独立
  const leftRef = useRef<TrackState>(newTrack());
  const rightRef = useRef<TrackState>(newTrack());
  const summaryRef = useRef<TrackState>(newTrack());
  const choiceTracksRef = useRef<Map<number, { num: string; track: TrackState }>>(new Map());

  const trackOf = useCallback((target: PrintTarget): TrackState => {
    if (target.kind === 'leftSegments') return leftRef.current;
    if (target.kind === 'rightSegments') return rightRef.current;
    if (target.kind === 'summarySegments') return summaryRef.current;
    // choiceText
    let entry = choiceTracksRef.current.get(target.idx);
    if (!entry) {
      entry = { num: target.num, track: newTrack() };
      choiceTracksRef.current.set(target.idx, entry);
    } else if (target.num) {
      entry.num = target.num; // num 可能后填(walker 先 num 后 text)
    }
    return entry.track;
  }, []);

  const syncStore = useCallback(() => {
    const store = useStreamingPrintStore.getState();
    store._setLeftSegments([...leftRef.current.segments]);
    store._setRightSegments([...rightRef.current.segments]);
    store._setSummarySegments([...summaryRef.current.segments]);
    // choices:按 idx 升序
    const idxs = [...choiceTracksRef.current.keys()].sort((a, b) => a - b);
    const choices: StreamingChoice[] = idxs.map((i) => {
      const e = choiceTracksRef.current.get(i)!;
      return { num: e.num, textSegments: [...e.track.segments] };
    });
    store._setChoices(choices);
  }, []);

  const tick = useCallback(() => {
    const q = queueRef.current;

    // 消费 leading 非 visibleChar
    while (q.length > 0 && q[0].event.kind !== 'visibleChar') {
      const item = q.shift()!;
      applyEvent(trackOf(item.target), item.event);
    }

    // 消费一个 visibleChar
    if (q.length > 0 && q[0].event.kind === 'visibleChar') {
      const item = q.shift()!;
      applyEvent(trackOf(item.target), item.event);
    }

    // 消费 trailing 非 visibleChar
    while (q.length > 0 && q[0].event.kind !== 'visibleChar') {
      const item = q.shift()!;
      applyEvent(trackOf(item.target), item.event);
    }

    syncStore();

    if (q.length === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [trackOf, syncStore]);

  const push = useCallback(
    (target: PrintTarget, events: MaskEvent[]) => {
      for (const ev of events) queueRef.current.push({ target, event: ev });
      if (!intervalRef.current && queueRef.current.length > 0) {
        intervalRef.current = setInterval(tick, TICK_MS);
      }
    },
    [tick],
  );

  const reset = useCallback(() => {
    queueRef.current = [];
    leftRef.current = newTrack();
    rightRef.current = newTrack();
    summaryRef.current = newTrack();
    choiceTracksRef.current = new Map();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    useStreamingPrintStore.getState().reset();
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { push, reset };
}
