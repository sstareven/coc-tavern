import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

export interface BlessingDamagePending {
  expr: string;
  label: string;
  inputText: string;
  resolve: (value: number) => void;
  cancel: () => void;
}

interface BlessingStore {
  pending: BlessingDamagePending | null;
  setPending: (data: BlessingDamagePending) => void;
  clearPending: () => void;
}

export const useBlessingStore = create<BlessingStore>()((set, get) => {
  // Auto-clear the blessing modal when the player toggles cheating off mid-dialog
  useSettingsStore.subscribe((state) => {
    if (!state.cheatingEnabled && get().pending !== null) {
      get().clearPending();
    }
  });

  return {
    pending: null,
    setPending: (data) => set({ pending: data }),
    clearPending: () => set({ pending: null }),
  };
});
