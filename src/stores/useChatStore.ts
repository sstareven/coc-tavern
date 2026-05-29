import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatSession, ChatMessage, BookPage, SessionGameState } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

interface ChatStore {
  sessions: ChatSession[];
  activeId: string | null;
  createSession: (name: string) => string;
  deleteSession: (id: string) => void;
  setActive: (id: string) => void;
  setPreset: (presetId: string) => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  savePages: (pages: BookPage[]) => void;
  saveGameState: (pages: BookPage[], gameState: SessionGameState) => void;
  getActivePages: () => BookPage[];
  getActiveGameState: () => SessionGameState | undefined;
  getAllSessionIds: () => string[];
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,
      createSession: (name) => {
        const id = crypto.randomUUID();
        const newSession: ChatSession = {
          id,
          name,
          messages: [],
          pages: [],
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
      addMessage: (role, content) =>
        set((s) => {
          if (!s.activeId) return s;
          const msg: ChatMessage = { id: crypto.randomUUID(), role, content, timestamp: Date.now() };
          return {
            sessions: s.sessions.map((c) =>
              c.id === s.activeId
                ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() }
                : c
            ),
          };
        }),
      savePages: (pages) =>
        set((s) => {
          if (!s.activeId) return s;
          return {
            sessions: s.sessions.map((c) =>
              c.id === s.activeId
                ? { ...c, pages, updatedAt: Date.now() }
                : c
            ),
          };
        }),
      saveGameState: (pages, gameState) =>
        set((s) => {
          if (!s.activeId) return s;
          return {
            sessions: s.sessions.map((c) =>
              c.id === s.activeId
                ? { ...c, pages, gameState, updatedAt: Date.now() }
                : c
            ),
          };
        }),
      getActivePages: () => {
        const { sessions, activeId } = get();
        const session = sessions.find((s) => s.id === activeId);
        return session?.pages ?? [];
      },
      getActiveGameState: () => {
        const { sessions, activeId } = get();
        const session = sessions.find((s) => s.id === activeId);
        return session?.gameState;
      },
      getAllSessionIds: () => get().sessions.map((s) => s.id),
    }),
    {
      name: 'coc_chat_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state),
    }
  )
);
