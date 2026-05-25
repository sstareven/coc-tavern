import { create } from 'zustand';
import type { LoreBook, LoreEntry } from '../types';

const defaultBooks: Record<string, LoreBook> = {
  arkham: { name:'阿卡姆设定集', enabled: true, entries: {
    e1:{ name:'阿卡姆简介', keys:'阿卡姆, 城镇', content:'阿卡姆是马萨诸塞州的一座古老城镇，始建于17世纪。', logic:'AND', priority:10 },
    e2:{ name:'密斯卡塔尼克大学', keys:'密斯卡塔尼克, 大学', content:'密斯卡塔尼克大学位于阿卡姆市中心，始建于1690年。', logic:'AND', priority:20 },
  }},
  mvu_system: { name:'MVU变量系统', enabled: true, entries: {
    e1:{ name:'变量设置格式', keys:'变量, var, 设置变量, 状态变化', content:'设置变量格式：<var name="变量名" value="变量值" /> 或 {{set:变量名=变量值}}。常用变量：hpChange(生命值变化,负数=受伤), sanChange(理智变化), luckChange(幸运变化), mpChange(魔法变化), clue(线索), threat(威胁等级), npcMood(NPC情绪), investigationProgress(调查进度)。', logic:'OR', priority:85 },
    e2:{ name:'COC属性变化规范', keys:'HP, SAN, 生命值, 理智值, 伤害, 受伤, 疯狂, 属性检定', content:'当调查员受到伤害时，请使用 <var name="hpChange" value="-N" /> 记录生命值变化。理智损失使用 <var name="sanChange" value="-N" />。例如：被怪物抓伤失去3点HP，应输出 <var name="hpChange" value="-3" />。', logic:'OR', priority:80 },
    e3:{ name:'场景状态追踪', keys:'场景, 地点, 天气, 时间, 日期, 环境', content:'请使用变量追踪场景状态变化：<var name="location" value="地点名" /> 更新地点，<var name="weather" value="天气" /> 更新天气，<var name="time" value="时间段" /> 更新时间。sceneInfo中的信息变化时务必同步更新变量。', logic:'OR', priority:75 },
    e4:{ name:'MVU推理标记', keys:'推理, 调查, 发现, 线索, 关键信息', content:'重要发现和推理进展请用变量记录：<var name="clue" value="发现的线索内容" />、<var name="investigationProgress" value="进度描述" />。这有助于追踪调查进度和保持叙事连贯性。', logic:'OR', priority:70 },
  }},
};

let entryCounter = 10;
interface LorebookStore {
  books: Record<string, LoreBook>;
  activeBook: string | null;
  setActiveBook: (id: string|null) => void;
  updateEntry: (b:string, e:string, entry: LoreEntry) => void;
  deleteEntry: (b:string, e:string) => void;
  addEntry: (b:string) => void;
  addBook: (name:string) => string;
  toggleBook: (id: string) => void;
}

export const useLorebookStore = create<LorebookStore>((set) => ({
  books: defaultBooks,
  activeBook: null,
  setActiveBook: (id) => set({ activeBook: id }),
  updateEntry: (b, e, entry) => set((s) => { const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [e]:entry}}; return {books}; }),
  deleteEntry: (b, e) => set((s) => { const books={...s.books}; const entries={...books[b].entries}; delete entries[e]; books[b]={...books[b], entries}; return {books}; }),
  addEntry: (b) => set((s) => { const id='e'+(++entryCounter); const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [id]:{name:'新条目',keys:'',content:'',logic:'AND',priority:10,disabled:false,constant:false,position:0,depth:0,probability:100}}}; return {books}; }),
  addBook: (name) => { const id = 'wb-' + Date.now(); set((s) => ({ books: { ...s.books, [id]: { name, entries: {}, enabled: true } } })); return id; },
  toggleBook: (id) => set((s) => ({ books: { ...s.books, [id]: { ...s.books[id], enabled: !s.books[id]?.enabled } } })),
}));
