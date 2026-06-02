import { create } from 'zustand';
import type { ChatPreset } from '../types';

export type Panel =
  | 'settings'
  | 'worldbook'
  | 'lorebookEditor'
  | 'preset'
  | 'presetSwitch'
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
  presetEditorOnSave: ((preset: ChatPreset) => void) | null;
  open: (p: Panel) => void;
  openLorebookEditor: (bookId: string) => void;
  openPresetEditor: (preset: ChatPreset, onSave: (preset: ChatPreset) => void) => void;
  closeAll: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  openPanel: null,
  lorebookEditorBookId: null,
  presetEditorPreset: null,
  presetEditorOnSave: null,

  open: (p) =>
    set({
      openPanel: p,
      lorebookEditorBookId: null,
      presetEditorPreset: null,
      presetEditorOnSave: null,
    }),

  openLorebookEditor: (bookId) =>
    set({ openPanel: 'lorebookEditor', lorebookEditorBookId: bookId }),

  openPresetEditor: (preset, onSave) =>
    set({ openPanel: 'presetEditor', presetEditorPreset: preset, presetEditorOnSave: onSave }),

  closeAll: () =>
    set({
      openPanel: null,
      lorebookEditorBookId: null,
      presetEditorPreset: null,
      presetEditorOnSave: null,
    }),
}));
