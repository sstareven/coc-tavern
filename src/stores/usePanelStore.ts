import { create } from 'zustand';
import type { ChatPreset } from '../types';

export type Panel =
  | 'settings'
  | 'worldbook'
  | 'lorebookEditor'
  | 'preset'
  | 'presetEditor'
  | 'chatlist'
  | 'extManager'
  | 'diceHistory'
  | 'variable'
  | null;

interface PanelStore {
  openPanel: Panel;
  lorebookEditorBookId: string | null;
  presetEditorPreset: ChatPreset | null;
  open: (p: Panel) => void;
  openLorebookEditor: (bookId: string) => void;
  openPresetEditor: (preset: ChatPreset) => void;
  closeAll: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  openPanel: null,
  lorebookEditorBookId: null,
  presetEditorPreset: null,

  open: (p) =>
    set({
      openPanel: p,
      lorebookEditorBookId: null,
      presetEditorPreset: null,
    }),

  openLorebookEditor: (bookId) =>
    set({ openPanel: 'lorebookEditor', lorebookEditorBookId: bookId }),

  openPresetEditor: (preset) =>
    set({ openPanel: 'presetEditor', presetEditorPreset: preset }),

  closeAll: () =>
    set({
      openPanel: null,
      lorebookEditorBookId: null,
      presetEditorPreset: null,
    }),
}));
