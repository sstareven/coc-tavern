import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatSession } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

interface ChatStore {
  sessions: ChatSession[];
  activeId: string | null;
  createSession: (name: string) => string;
  deleteSession: (id: string) => void;
  setActive: (id: string) => void;
  setPreset: (presetId: string) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      sessions: [],
      activeId: null,
      createSession: (name) => {
        const id = crypto.randomUUID();
        const newSession: ChatSession = {
          id,
          name,
          messages: [],
          presetId: null,
          lorebookIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          sessions: [...s.sessions, newSession],
          activeId: id,
        }));
        return id;
      },
      deleteSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
      setActive: (id) => set({ activeId: id }),
      setPreset: (presetId) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === s.activeId
              ? { ...c, presetId, updatedAt: Date.now() }
              : c
          ),
        })),
    }),
    {
      name: 'coc_chat_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
    }
  )
);
