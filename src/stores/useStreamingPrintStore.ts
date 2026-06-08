// 全局流式刻印状态 v2 — 支持多字段区段:
//   leftHeader/leftSegments + rightHeader/rightSegments + summarySegments + 4 个 choice 区。
// useStreamingPrinter hook 写,LeftPage/RightPage/Storybook 读。
// 不持久化(每回合独立),会话切换/回合开始时 reset。

import { create } from 'zustand';

export interface PrintSegment {
  /** text: 普通可见字符;kw: 关键词(高亮);sanBubble: SAN 检定气泡 */
  kind: 'text' | 'kw' | 'sanBubble';
  content?: string;
  sanId?: string;
}

export interface StreamingChoice {
  /** 选项编号(I/II/III/IV),按出现顺序累积字符串 */
  num: string;
  /** 选项 text 字段的流式刻印 segments(走 mask,可能含 kw 等) */
  textSegments: PrintSegment[];
}

interface StreamingPrintState {
  isStreamingPrint: boolean;

  // ── 左页 ──
  leftHeaderText: string;
  leftSegments: PrintSegment[];

  // ── 右页 ──
  rightHeaderText: string;
  rightSegments: PrintSegment[];

  // ── 小总结(放在左页 header 下方,流式时第一个出现) ──
  summarySegments: PrintSegment[];

  // ── 4 个选项 ──
  choices: StreamingChoice[];

  // 切换器
  startStreamingPrint: () => void;
  endStreamingPrint: () => void;
  reset: () => void;

  // 内部 setter — useStreamingPrinter 写
  _setLeftSegments: (s: PrintSegment[]) => void;
  _setRightSegments: (s: PrintSegment[]) => void;
  _setSummarySegments: (s: PrintSegment[]) => void;
  _setLeftHeader: (t: string) => void;
  _setRightHeader: (t: string) => void;
  _setChoices: (c: StreamingChoice[]) => void;
}

const EMPTY: Pick<StreamingPrintState,
  'leftHeaderText' | 'leftSegments' |
  'rightHeaderText' | 'rightSegments' |
  'summarySegments' | 'choices'
> = {
  leftHeaderText: '',
  leftSegments: [],
  rightHeaderText: '',
  rightSegments: [],
  summarySegments: [],
  choices: [],
};

export const useStreamingPrintStore = create<StreamingPrintState>((set) => ({
  isStreamingPrint: false,
  ...EMPTY,

  startStreamingPrint: () => set({ isStreamingPrint: true, ...EMPTY }),
  endStreamingPrint: () => set({ isStreamingPrint: false }),
  reset: () => set({ isStreamingPrint: false, ...EMPTY }),

  _setLeftSegments: (leftSegments) => set({ leftSegments }),
  _setRightSegments: (rightSegments) => set({ rightSegments }),
  _setSummarySegments: (summarySegments) => set({ summarySegments }),
  _setLeftHeader: (leftHeaderText) => set({ leftHeaderText }),
  _setRightHeader: (rightHeaderText) => set({ rightHeaderText }),
  _setChoices: (choices) => set({ choices }),
}));
