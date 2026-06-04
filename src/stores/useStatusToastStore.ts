import { create } from 'zustand';

export type StatusKind = 'processing' | 'done' | 'error';

export interface StatusToast {
  /** Monotonic id so re-firing the same kind/message still retriggers the toast animation. */
  id: number;
  kind: StatusKind;
  message: string;
}

interface StatusToastStore {
  toast: StatusToast | null;
  /** Show a persistent "processing" toast (stays until markDone/showError/hide). */
  showProcessing: (message: string) => void;
  /** 更新当前 processing 提示的文案，但【保持同一 id】（顶部实时计时器不重置）；当前非 processing 时回退为新建 processing。 */
  updateProcessing: (message: string) => void;
  /** Replace with a "done" toast that auto-fades after a short delay. */
  markDone: (message: string) => void;
  /** Replace with an "error" toast (red) that auto-fades after a longer delay. */
  showError: (message: string) => void;
  /** Immediately clear. */
  hide: () => void;
}

const DONE_FADE_MS = 1600;
const ERROR_FADE_MS = 4000;

let nextId = 1;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function clearFadeTimer() {
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

export const useStatusToastStore = create<StatusToastStore>((set, get) => ({
  toast: null,

  showProcessing: (message) => {
    clearFadeTimer();
    set({ toast: { id: nextId++, kind: 'processing', message } });
  },

  updateProcessing: (message) => {
    const cur = get().toast;
    // 已在 processing：只换文案、保留同一 id（实时计时器按 id 走表，不重置）。
    if (cur?.kind === 'processing') {
      set({ toast: { ...cur, message } });
    } else {
      // 当前无 processing 提示（已 done/清空）→ 起一个新的（新 id，计时归零）。
      clearFadeTimer();
      set({ toast: { id: nextId++, kind: 'processing', message } });
    }
  },

  markDone: (message) => {
    clearFadeTimer();
    const id = nextId++;
    set({ toast: { id, kind: 'done', message } });
    fadeTimer = setTimeout(() => {
      // Only clear if this exact toast is still showing (avoid clobbering a newer one).
      if (get().toast?.id === id) set({ toast: null });
    }, DONE_FADE_MS);
  },

  showError: (message) => {
    clearFadeTimer();
    const id = nextId++;
    set({ toast: { id, kind: 'error', message } });
    fadeTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, ERROR_FADE_MS);
  },

  hide: () => {
    clearFadeTimer();
    set({ toast: null });
  },
}));
