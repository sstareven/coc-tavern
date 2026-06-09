import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatSession, ChatMessage, BookPage } from '../types';
import { createDexieStorage } from '../db/storage';

interface ChatStore {
  sessions: ChatSession[];
  activeId: string | null;
  createSession: (name: string) => string;
  deleteSession: (id: string) => void;
  setActive: (id: string) => void;
  setPreset: (presetId: string) => void;
  /** 剧本系统：把 scenarioId 写到当前活跃会话；activateScenario / unloadScenario 调用 */
  setSessionScenario: (scenarioId: string | null) => void;
  toggleSessionLorebook: (bookId: string) => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  /** Update the active session's in-memory pages + denormalized pageCount.
   *  Page CONTENT persists via sessionLifecycle.saveConversation (pages table). */
  savePages: (pages: BookPage[]) => void;
  getActivePages: () => BookPage[];
}

/** Lightweight projection persisted into the `coc_chat_v1` blob.
 *  Excludes pages + gameState (Dexie v2: those live in relational child tables).
 *  Keeping the blob small kills the per-turn write-amplification. */
function projectSession(c: ChatSession): ChatSession {
  return {
    id: c.id,
    name: c.name,
    messages: c.messages,
    pages: [],
    presetId: c.presetId,
    lorebookIds: c.lorebookIds,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    pageCount: c.pageCount ?? c.pages.length,
    scenarioId: c.scenarioId,
  };
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
          pageCount: 0,
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
      setSessionScenario: (scenarioId) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === s.activeId
              ? { ...c, scenarioId: scenarioId ?? undefined, updatedAt: Date.now() }
              : c
          ),
        })),
      toggleSessionLorebook: (bookId) =>
        set((s) => ({
          sessions: s.sessions.map((c) => {
            if (c.id !== s.activeId) return c;
            const ids = c.lorebookIds ?? [];
            const next = ids.includes(bookId) ? ids.filter((b) => b !== bookId) : [...ids, bookId];
            return { ...c, lorebookIds: next, updatedAt: Date.now() };
          }),
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
      // pages/gameState 仅存活跃会话内存态（不入持久化 blob）；pageCount 反规范化供会话列表展示。
      // 关系表写入由 sessionLifecycle.saveConversation 负责。
      savePages: (pages) =>
        set((s) => {
          if (!s.activeId) return s;
          return {
            sessions: s.sessions.map((c) =>
              c.id === s.activeId
                ? { ...c, pages, pageCount: pages.length, updatedAt: Date.now() }
                : c
            ),
          };
        }),
      getActivePages: () => {
        const { sessions, activeId } = get();
        const session = sessions.find((s) => s.id === activeId);
        return session?.pages ?? [];
      },
    }),
    {
      name: 'coc_chat_v1',
      storage: createJSONStorage(createDexieStorage),
      // 轻量持久化：仅会话元数据。pages / gameState 不入 blob（关系表 + 内存态托管），
      // 仅保留 pageCount 反规范化字段供读档/会话列表展示。
      partialize: (state) => ({
        sessions: state.sessions.map(projectSession),
        activeId: state.activeId,
      }),
    }
  )
);
