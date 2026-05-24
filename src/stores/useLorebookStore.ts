import { create } from 'zustand';
import type { LoreBook, LoreEntry } from '../types';

const defaultBooks: Record<string, LoreBook> = {
  arkham: { name:'阿卡姆设定集', entries: {
    e1:{ name:'阿卡姆简介', keys:'阿卡姆, 城镇', content:'阿卡姆是马萨诸塞州的一座古老城镇，始建于17世纪。', logic:'AND', priority:10 },
    e2:{ name:'密斯卡塔尼克大学', keys:'密斯卡塔尼克, 大学', content:'密斯卡塔尼克大学位于阿卡姆市中心，始建于1690年。', logic:'AND', priority:20 },
  }},
};

let entryCounter = 10;
interface LorebookStore { books: Record<string, LoreBook>; activeBook: string | null; setActiveBook: (id: string|null) => void; updateEntry: (b:string, e:string, entry: LoreEntry) => void; deleteEntry: (b:string, e:string) => void; addEntry: (b:string) => void; addBook: (name:string) => string; }
export const useLorebookStore = create<LorebookStore>((set) => ({
  books: defaultBooks, activeBook: null,
  setActiveBook: (id) => set({ activeBook: id }),
  updateEntry: (b, e, entry) => set((s) => { const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [e]:entry}}; return {books}; }),
  deleteEntry: (b, e) => set((s) => { const books={...s.books}; const entries={...books[b].entries}; delete entries[e]; books[b]={...books[b], entries}; return {books}; }),
  addEntry: (b) => set((s) => { const id='e'+(++entryCounter); const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [id]:{name:'新条目',keys:'',content:'',logic:'AND',priority:10}}}; return {books}; }),
  addBook: (name) => { const id = 'wb-' + Date.now(); set((s) => ({ books: { ...s.books, [id]: { name, entries: {} } } })); return id; },
}));
