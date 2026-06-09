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

/** 短指纹:数组长度 + 末尾段 content 长度。tick 间只有 ensureTextSeg 追加字符,这两个数变化才表示真有新可见输出。 */
type TrackSnapshot = { len: number; tailContentLen: number };

function snapshot(segments: PrintSegment[]): TrackSnapshot {
  const last = segments[segments.length - 1];
  const tailContentLen = last && typeof last.content === 'string' ? last.content.length : 0;
  return { len: segments.length, tailContentLen };
}

function didTracksChange(segments: PrintSegment[], prev: TrackSnapshot): boolean {
  if (segments.length !== prev.len) return true;
  const last = segments[segments.length - 1];
  const tailLen = last && typeof last.content === 'string' ? last.content.length : 0;
  return tailLen !== prev.tailContentLen;
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

  // syncStore 短路用的上次快照
  const lastSyncedRef = useRef<{
    left: TrackSnapshot;
    right: TrackSnapshot;
    summary: TrackSnapshot;
    choiceCount: number;
    choices: Map<number, TrackSnapshot>;
    choiceNums: Map<number, string>;
  }>({
    left: { len: 0, tailContentLen: 0 },
    right: { len: 0, tailContentLen: 0 },
    summary: { len: 0, tailContentLen: 0 },
    choiceCount: 0,
    choices: new Map(),
    choiceNums: new Map(),
  });

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
    // syncStore 每 tick 都会创建 4 个新数组引用 → Storybook 6 个 selector 浅比对失败 → RightPage/LeftPage
    // 全量 re-render。tick 间若 segments 长度与末尾内容都没变(纯 enter/exit/hiddenBlock 之类 non-visible 事件),
    // 直接短路不写 store,免一轮 React diff(弱机受益更大)。
    const left = leftRef.current.segments;
    const right = rightRef.current.segments;
    const summary = summaryRef.current.segments;
    if (didTracksChange(left, lastSyncedRef.current.left)) store._setLeftSegments([...left]);
    if (didTracksChange(right, lastSyncedRef.current.right)) store._setRightSegments([...right]);
    if (didTracksChange(summary, lastSyncedRef.current.summary)) store._setSummarySegments([...summary]);
    // choices:按 idx 升序
    const idxs = [...choiceTracksRef.current.keys()].sort((a, b) => a - b);
    let choicesChanged = idxs.length !== lastSyncedRef.current.choiceCount;
    const choices: StreamingChoice[] = idxs.map((i) => {
      const e = choiceTracksRef.current.get(i)!;
      const prev = lastSyncedRef.current.choices.get(i);
      if (!prev || didTracksChange(e.track.segments, prev) || lastSyncedRef.current.choiceNums.get(i) !== e.num) {
        choicesChanged = true;
      }
      return { num: e.num, textSegments: [...e.track.segments] };
    });
    if (choicesChanged) store._setChoices(choices);

    // 记录本次同步的快照(用 segments 数组的 length + 末尾 content 长度做指纹,O(1))
    lastSyncedRef.current.left = snapshot(left);
    lastSyncedRef.current.right = snapshot(right);
    lastSyncedRef.current.summary = snapshot(summary);
    lastSyncedRef.current.choiceCount = idxs.length;
    lastSyncedRef.current.choices = new Map(idxs.map((i) => [i, snapshot(choiceTracksRef.current.get(i)!.track.segments)]));
    lastSyncedRef.current.choiceNums = new Map(idxs.map((i) => [i, choiceTracksRef.current.get(i)!.num]));
  }, []);

  const tick = useCallback(() => {
    // 后台标签下浏览器 setInterval 节流到 1Hz,events 会积压;返回前台一波放出导致字幕"先卡再吐"。
    // visibilityState 不可见时直接跳过本 tick(events 仍留在 queue,可见后恢复继续按节拍消费)。
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

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
    lastSyncedRef.current = {
      left: { len: 0, tailContentLen: 0 },
      right: { len: 0, tailContentLen: 0 },
      summary: { len: 0, tailContentLen: 0 },
      choiceCount: 0,
      choices: new Map(),
      choiceNums: new Map(),
    };
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
