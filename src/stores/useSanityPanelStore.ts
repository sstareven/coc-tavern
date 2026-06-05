/**
 * A2 重设 — useSanityPanelStore: SanityCheckPanel 当前 active prompt(单 prompt 单 panel)。
 *
 * 流程:
 *   SanityBubble.onClick(prompt) → open(prompt)
 *   SanityCheckPanel 读 activePrompt 渲染面板
 *   面板关闭 → close() + useSanityBubbleStore.markResolved(id)
 */

import { create } from 'zustand';
import type { SanityCheckPrompt } from '../types';

interface SanityPanelStore {
  activePrompt: SanityCheckPrompt | null;
  open: (prompt: SanityCheckPrompt) => void;
  close: () => void;
}

export const useSanityPanelStore = create<SanityPanelStore>()((set) => ({
  activePrompt: null,
  open: (prompt) => set({ activePrompt: prompt }),
  close: () => set({ activePrompt: null }),
}));
