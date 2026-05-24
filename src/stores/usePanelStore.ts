import { create } from 'zustand';

export type Panel =
  | 'settings'
  | 'worldbook'
  | 'lorebookEditor'
  | 'preset'
  | 'presetEditor'
  | 'chatlist'
  | 'extManager'
  | 'diceHistory'
  | null;

interface PanelStore {
  openPanel: Panel;
  lorebookEditorBookId: string | null;
  presetEditorPresetId: string | null;
  open: (p: Panel) => void;
  openLorebookEditor: (bookId: string) => void;
  openPresetEditor: (presetId: string) => void;
  closeAll: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  openPanel: null,
  lorebookEditorBookId: null,
  presetEditorPresetId: null,

  open: (p) =>
    set({
      openPanel: p,
      lorebookEditorBookId: null,
      presetEditorPresetId: null,
    }),

  openLorebookEditor: (bookId) =>
    set({ openPanel: 'lorebookEditor', lorebookEditorBookId: bookId }),

  openPresetEditor: (presetId) =>
    set({ openPanel: 'presetEditor', presetEditorPresetId: presetId }),

  closeAll: () =>
    set({
      openPanel: null,
      lorebookEditorBookId: null,
      presetEditorPresetId: null,
    }),
}));
