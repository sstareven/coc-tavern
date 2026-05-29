import { create } from 'zustand';

interface ErrorModalStore {
  error: { title: string; message: string } | null;
  showError: (title: string, message: string) => void;
  dismiss: () => void;
}

export const useErrorModalStore = create<ErrorModalStore>((set) => ({
  error: null,
  showError: (title, message) => set({ error: { title, message } }),
  dismiss: () => set({ error: null }),
}));
