import { create } from 'zustand';
import type { ChatSession } from '../types';
interface ChatStore { sessions: ChatSession[]; activeId: string|null; createSession: (name:string) => string; deleteSession: (id:string) => void; setActive: (id:string) => void; }
export const useChatStore = create<ChatStore>((set) => ({
  sessions: [], activeId: null,
  createSession: (name) => { const id=crypto.randomUUID(); set((s)=>({sessions:[...s.sessions,{id,name,messages:[],presetId:null,lorebookIds:[],createdAt:Date.now(),updatedAt:Date.now()}],activeId:id})); return id; },
  deleteSession: (id) => set((s)=>({sessions:s.sessions.filter(c=>c.id!==id),activeId:s.activeId===id?null:s.activeId})),
  setActive: (id) => set({activeId:id}),
}));
