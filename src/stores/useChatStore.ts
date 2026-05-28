import { create } from 'zustand';
import type { ChatSession } from '../types';

const STORAGE_KEY = 'coc_chat_v1';

function load(): { sessions: ChatSession[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { sessions: [], activeId: null };
  } catch {
    return { sessions: [], activeId: null };
  }
}

function save(state: { sessions: ChatSession[]; activeId: string | null }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: state.sessions, activeId: state.activeId }));
  } catch { /* quota exceeded, ignore */ }
}

interface ChatStore { sessions: ChatSession[]; activeId: string|null; createSession: (name:string) => string; deleteSession: (id:string) => void; setActive: (id:string) => void; setPreset: (presetId:string) => void; }

const persisted = load();

export const useChatStore = create<ChatStore>((set) => ({
  ...persisted,
  createSession: (name) => { const id=crypto.randomUUID(); const newSession: ChatSession={id,name,messages:[],presetId:null,lorebookIds:[],createdAt:Date.now(),updatedAt:Date.now()}; set((s)=>{ const next={sessions:[...s.sessions,newSession],activeId:id}; save(next); return next; }); return id; },
  deleteSession: (id) => set((s)=>{ const next={sessions:s.sessions.filter(c=>c.id!==id),activeId:s.activeId===id?null:s.activeId}; save(next); return next; }),
  setActive: (id) => set((s) => { save({ sessions: s.sessions, activeId: id }); return { activeId: id }; }),
  setPreset: (presetId) => set((s) => { const next={sessions:s.sessions.map((c) => c.id === s.activeId ? { ...c, presetId, updatedAt: Date.now() } : c),activeId:s.activeId}; save(next); return next; }),
}));
