import { create } from 'zustand';
import type { AssembledMessage } from '../sillytavern/prompt-assembler';

interface PromptViewerState {
  messages: AssembledMessage[];
  model: string;
  presetName: string;
  updatedAt: number;
  setPrompt: (messages: AssembledMessage[], model: string, presetName: string) => void;
}

export const usePromptViewerStore = create<PromptViewerState>((set) => ({
  messages: [],
  model: '',
  presetName: '',
  updatedAt: 0,
  setPrompt: (messages, model, presetName) => set({ messages, model, presetName, updatedAt: Date.now() }),
}));
