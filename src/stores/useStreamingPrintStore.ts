// 全局流式刻印状态 — useStreamingPrinter hook 写,Storybook/LeftPage 读。
// 不持久化(每回合独立),会话切换时 reset。

import { create } from 'zustand';

export interface PrintSegment {
  /** text: 普通可见字符;kw: 关键词(高亮);sanBubble: SAN 检定气泡 */
  kind: 'text' | 'kw' | 'sanBubble';
  content?: string;
  sanId?: string;
}

interface StreamingPrintState {
  /** 已刻印的 segment 列表 — visible 顺序 */
  segments: PrintSegment[];
  /** 已刻印的 leftHeader */
  headerText: string;
  /** true = 正在流式刻印中(LeftPage 走 streaming 渲染分支) */
  isStreamingPrint: boolean;

  startStreamingPrint: () => void;
  endStreamingPrint: () => void;
  reset: () => void;
  /** 内部用 — useStreamingPrinter hook 每帧 setState */
  _setSegments: (segments: PrintSegment[]) => void;
  _setHeaderText: (text: string) => void;
}

export const useStreamingPrintStore = create<StreamingPrintState>((set) => ({
  segments: [],
  headerText: '',
  isStreamingPrint: false,

  startStreamingPrint: () => set({ isStreamingPrint: true, segments: [], headerText: '' }),
  endStreamingPrint: () => set({ isStreamingPrint: false }),
  reset: () => set({ segments: [], headerText: '', isStreamingPrint: false }),
  _setSegments: (segments) => set({ segments }),
  _setHeaderText: (headerText) => set({ headerText }),
}));
