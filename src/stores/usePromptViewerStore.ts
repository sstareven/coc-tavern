import { create } from 'zustand';
import type { AssembledMessage } from '../sillytavern/prompt-assembler';

interface PromptViewerState {
  messages: AssembledMessage[];
  model: string;
  presetName: string;
  updatedAt: number;
  setPrompt: (messages: AssembledMessage[], model: string, presetName: string) => void;
  /** Tokens saved by the last lightweight (轻量) action-rewrite vs the full build. Runtime only. */
  lastRewriteSaving: number;
  setLastRewriteSaving: (n: number) => void;
}

export const usePromptViewerStore = create<PromptViewerState>((set) => ({
  messages: [],
  model: '',
  presetName: '',
  updatedAt: 0,
  setPrompt: (messages, model, presetName) => set({ messages, model, presetName, updatedAt: Date.now() }),
  lastRewriteSaving: 0,
  setLastRewriteSaving: (n) => set({ lastRewriteSaving: n }),
}));
