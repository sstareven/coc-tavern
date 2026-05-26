import { create } from 'zustand';
import type { LoreBook, LoreEntry } from '../types';

const e = (overrides: Partial<LoreEntry>): LoreEntry => ({
  name: '', keys: '', content: '', logic: 'AND', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  ...overrides,
});

const defaultBooks: Record<string, LoreBook> = {
  mvu_rules: { name: 'MVU规则系统', enabled: true, entries: {
    mvu_core: e({ name: 'MVU变量规范', keys: 'MVU, var', logic: 'OR', priority: 1,
      content: '【输出变量】leftContent嵌入<var name=\'hp\' value=\'值\'/> <var name=\'san\' value=\'值\'/> <var name=\'location\' value=\'地点\'/> <var name=\'threat\' value=\'1-10\'/>。选项action含<var name=\'lastAction\' value=\'简述\'/>；检定项额外<var name=\'lastCheck\' value=\'技能名\'/>。使用单引号！' }),
    skill_check: e({ name: 'CoC检定规则', keys: '检定, d100, 大成功', logic: 'OR', priority: 20,
      content: '【CoC 7th检定】成功=d100≤技能，困难≤半值，极难≤1/5，大成功=01，大失败=96-100。有利→奖励骰(双十面取优)，不利→惩罚骰(取差)。何时检定：说服→信用评级/话术，搜索→侦查，翻阅→图书馆使用，躲藏→潜行，认符文→神秘学，修理→机械维修。日常无需检定。' }),
    combat: e({ name: '战斗规则', keys: '战斗, 格斗, 闪避', logic: 'OR', priority: 30,
      content: '【CoC战斗】先攻=DEX检定。每轮攻击/闪避/移动。近战→目标可闪避或反击。火器→近距正常、中距困难、远距极难。伤害=武器+DB。HP≤0→昏迷。选项：I攻击 II防御 III撤退 IV特殊，标注检定。' }),
    sanity: e({ name: '理智系统', keys: 'SAN, 理智, 疯狂', logic: 'OR', priority: 40,
      content: '【SAN规则】SAN=POW。损失：尸体0/1D2，怪物0/1D6，大恐怖1D10/1D100。单次≥5→智力检定，失败短期疯狂。SAN≤0→永久疯狂。恢复：完成调查+1D6，精神分析+1D3，休息一月+1D3。' }),
  }},
  coc_lore: { name: '克苏鲁深渊档案馆', enabled: true, entries: {
    arkham: e({ name: '阿卡姆镇', keys: '阿卡姆, Arkham, 城镇', logic: 'OR', priority: 10,
      content: '阿卡姆是马萨诸塞州北部的古老城镇，始建于17世纪晚期。镇上最著名的建筑是密斯卡塔尼克大学，其图书馆收藏了大量禁忌古籍。近年来发生一系列无法解释的事件：墓地尸体被盗、密斯卡塔尼克河中奇异的发光现象、大学实验室深夜传出的非人尖叫。镇上居民对外来者警惕，关于女巫集会、神秘失踪和森林中怪异仪式的传说世代流传。' }),
    miskatonic: e({ name: '密斯卡塔尼克大学', keys: '密斯卡塔尼克, Miskatonic, 大学, 图书馆', logic: 'OR', priority: 20,
      content: '密斯卡塔尼克大学始建于1690年，以神秘学和古文物研究闻名。图书馆"特殊馆藏室"需院长特批才能进入，收藏《死灵之书》《无名祭祀书》《伊波恩之书》等禁忌古籍。校园地下隧道传说连接着图书馆、教堂和阿卡姆河畔码头。中世纪形而上学系的教授们对克苏鲁神话的研究远超常人想象。' }),
    necronomicon: e({ name: '死灵之书', keys: '死灵之书, Necronomicon, 禁忌古籍', logic: 'OR', priority: 30,
      content: '《死灵之书》(Kitab al-Azif)是阿拉伯疯子阿卜杜·阿尔哈兹莱德于公元730年所著的禁忌之书。密斯卡塔尼克大学图书馆藏有一本拉丁文译本残卷。该书详细记载了旧日支配者的历史、宇宙的真实构造、召唤外神的仪式。阅读此书的人常常会逐渐失去理智。' }),
    cthulhu: e({ name: '克苏鲁', keys: '克苏鲁, Cthulhu, 旧日支配者, 拉莱耶', logic: 'OR', priority: 40,
      content: '克苏鲁是旧日支配者中最著名的一位：巨大的人形、头部布满触手、背后生有蝙蝠般的膜翼、身躯覆盖鳞片。它目前沉睡在南太平洋沉没的城市拉莱耶中，等待星辰归位时复苏。它的梦境能影响敏感的人类——艺术家和通灵者会在梦中接收到精神投射，这种"呼唤"驱使他们疯狂。克苏鲁教团在世界各地秘密活动，等待主人回归。' }),
    deepones: e({ name: '深潜者', keys: '深潜者, Deep One, 鱼人, 印斯茅斯, 大衮', logic: 'OR', priority: 50,
      content: '深潜者是侍奉大衮与海德拉的两栖类人生物，皮肤呈灰绿色覆盖鳞片，手脚生有蹼，头部像鱼。主要栖息于海洋深处，在印斯茅斯镇附近尤其活跃。它们与人类订立邪恶契约——以黄金和渔获换取祭祀品与混血繁衍。混血后裔中年后会逐渐转变为深潜者形态。深潜者几乎永生不死。' }),
    innsmouth: e({ name: '印斯茅斯', keys: '印斯茅斯, Innsmouth', logic: 'OR', priority: 60,
      content: '印斯茅斯是马萨诸塞州海岸的没落渔港，距阿卡姆东南约20英里。镇上居民面容奇特——眼睛突出、皮肤粗糙、走路怪异——被称为"印斯茅斯面容"。1840年代船长奥巴德·马什与海中存在订立契约后，渔业丰收黄金流入，但后裔出现可怕变异。1928年联邦政府曾对该镇进行秘密军事行动。' }),
  }},
};

const STORAGE_KEY = 'coc_lorebooks_v1';

function loadExtraBooks(): Record<string, LoreBook> {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function saveExtraBooks(books: Record<string, LoreBook>) {
  const extra: Record<string, LoreBook> = {};
  for (const [k, v] of Object.entries(books)) { if (!defaultBooks[k]) extra[k] = v; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(extra)); } catch { /* quota */ }
}

let entryCounter = 10;
interface LorebookStore {
  books: Record<string, LoreBook>;
  activeBook: string | null;
  setActiveBook: (id: string|null) => void;
  updateEntry: (b:string, e:string, entry: LoreEntry) => void;
  deleteEntry: (b:string, e:string) => void;
  addEntry: (b:string) => void;
  addBook: (name:string) => string;
  importBook: (book: LoreBook) => string;
  deleteBook: (id: string) => void;
  toggleBook: (id: string) => void;
}

const extraBooks = loadExtraBooks();

export const useLorebookStore = create<LorebookStore>((set) => ({
  books: { ...defaultBooks, ...extraBooks },
  activeBook: null,
  setActiveBook: (id) => set({ activeBook: id }),
  updateEntry: (b, e, entry) => set((s) => { const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [e]:entry}}; saveExtraBooks(books); return {books}; }),
  deleteEntry: (b, e) => set((s) => { const books={...s.books}; const entries={...books[b].entries}; delete entries[e]; books[b]={...books[b], entries}; saveExtraBooks(books); return {books}; }),
  addEntry: (b) => set((s) => { const id='e'+(++entryCounter); const books={...s.books}; books[b]={...books[b], entries:{...books[b].entries, [id]:e({name:'新条目'})}}; saveExtraBooks(books); return {books}; }),
  addBook: (name) => { const id = 'wb-' + Date.now(); set((s) => { const books = { ...s.books, [id]: { name, entries: {}, enabled: true } }; saveExtraBooks(books); return { books }; }); return id; },
  importBook: (book) => { const id = 'wb-' + Date.now(); set((s) => { const books = { ...s.books, [id]: book }; saveExtraBooks(books); return { books }; }); return id; },
  deleteBook: (id) => set((s) => { if (defaultBooks[id]) return s; const books={...s.books}; delete books[id]; saveExtraBooks(books); return {books}; }),
  toggleBook: (id) => set((s) => { const books = { ...s.books, [id]: { ...s.books[id], enabled: !s.books[id]?.enabled } }; saveExtraBooks(books); return { books }; }),
}));
