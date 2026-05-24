import { create } from 'zustand';
import type { BookPage } from '../types';

const defaultPages: BookPage[] = [
  {
    leftHeader: '第三章', leftContent: '你推开沉重的橡木门，一股霉味扑面而来。房间里散落着发黄的报纸和手稿，书桌上放着一盏早已熄灭的油灯。', leftPage: '— 3 —',
    rightHeader: '调查', rightContent: '角落里，一个上了锁的铁柜引起了你的注意。柜门上刻着奇怪的符号——那是一种你从未在任何典籍中见过的图案。',
    rightChoices: [
      { num: 'I', text: '调查铁柜', action: '调查铁柜' },
      { num: 'II', text: '检查手稿', action: '检查桌上的手稿' },
      { num: 'III', text: '观察符号', action: '仔细观察墙上的符号' },
      { num: 'IV', text: '离开房间', action: '离开这个房间' },
    ],
    sceneInfo: {
      date: '1925年3月21日', weekday: '星期五', time: '深夜',
      weather: '雷雨交加', location: '阿卡姆·温迪尔街13号',
    },
  },
  {
    leftHeader: '侦查结果', leftContent: '你用力撬开了锈蚀的铁柜。柜内躺着一叠泛黄的信件和一本皮质封面的日记。信件的纸张已经脆弱发黄，日期停留在 1923 年。', leftPage: '— 5 —',
    rightHeader: '行动', rightContent: '你翻看着这些令人不安的文书，心中涌起一股不祥的预感。接下来该怎么办？',
    rightChoices: [
      { num: 'I', text: '仔细阅读信件', action: '仔细阅读每一封信件' },
      { num: 'II', text: '翻阅日记', action: '翻阅亨利·阿米蒂奇的日记' },
      { num: 'III', text: '搜索房间', action: '彻底搜索房间的每个角落' },
      { num: 'IV', text: '带着证据离开', action: '带着信件和日记离开这里' },
    ],
    sceneInfo: {
      date: '1925年3月21日', weekday: '星期五', time: '午夜过后',
      weather: '雷雨渐歇', location: '阿卡姆·温迪尔街13号',
    },
  },
];

interface BookStore {
  pages: BookPage[];
  pageIndex: number;
  isFlipping: boolean;
  nextPage: () => void;
  prevPage: () => void;
  setFlipping: (v: boolean) => void;
  updateLeftPage: (index: number, header: string, content: string) => void;
  appendPage: (page: BookPage) => void;
}

export const useBookStore = create<BookStore>((set, get) => ({
  pages: defaultPages,
  pageIndex: 0,
  isFlipping: false,
  nextPage: () => { const { pageIndex, pages } = get(); if (pageIndex < pages.length - 1) set({ pageIndex: pageIndex + 1 }); },
  prevPage: () => { const { pageIndex } = get(); if (pageIndex > 0) set({ pageIndex: pageIndex - 1 }); },
  setFlipping: (v) => set({ isFlipping: v }),
  updateLeftPage: (index, header, content) => set((s) => {
    const pages = [...s.pages];
    pages[index] = { ...pages[index], leftHeader: header, leftContent: content };
    return { pages };
  }),
  appendPage: (page) => set((s) => {
    const pages = [...s.pages, page];
    return { pages, pageIndex: pages.length - 1 };
  }),
}));
