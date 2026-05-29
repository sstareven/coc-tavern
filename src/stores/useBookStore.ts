import { create } from 'zustand';
import type { BookPage, DiceRecord } from '../types';
import { sfxPageFlip } from '../audio/sfx';
import { useLorebookStore } from './useLorebookStore';

const defaultPages: BookPage[] = [
  // ▸▸▸ 序章：降生之梦 + 命运歧路 ◂◂◂
  {
    leftHeader: '序章',
    leftContent:
      '你做了一个{{梦}}。\n\n'
      + '在梦里，你站在无边无际的{{黑暗}}之中，脚下是镜面般幽深的湖水。水面倒映着无数个你——每一个你都在走向截然不同的道路：有的踏上远行的列车，有的在深夜推开一扇陌生的门，有的接过一封泛黄的信函，有的在雾中追逐一个若隐若现的身影。\n\n'
      + '一道{{低语}}自湖底传来，像是千万个声音的叠合：\n'
      + '"你已降生于这个时代，{{调查员}}。你的{{命运}}——尚未书写。"\n\n'
      + '你猛然睁开双眼。\n\n'
      + '窗外，是属于你的天空。\n'
      + '而你，即将做出选择。',
    leftPage: pageNum(0),
    rightPage: rightPageNum(0),
    rightHeader: '命运的歧路',
    rightContent:
      '在那{{梦}}境消散之际，你感到一股奇异的牵引——仿佛冥冥之中，某种力量已经为你铺设了若干条不同的道路。\n\n'
      + '每一条路，都将引你走向截然不同的{{命运}}。\n'
      + '你只需伸出手，触碰那根纺线——故事，便从那里开始。\n\n'
      + '以下是命运为你呈现的几种可能：',
    rightChoices: [
      {
        num: 'Ⅰ',
        text: '一封来自远方的信',
        action:
          '前几日，我收到了一封寄自{{阿卡姆}}的挂号信。信是我大学时代的导师寄来的——潦草的字迹透露出一种罕见的急迫，没有寒暄，没有署名日期，只有寥寥数行："立即前来，切勿延误。此事关乎你去年调查的那件案子。"信纸的边缘有几处褐色的斑点，像是干涸的咖啡——或者别的什么。\n\n'
          + '我今天一早就登上了前往{{阿卡姆}}的火车。车窗外的田野在薄雾中一掠而过，车厢里只有寥寥数人。到达时已是黄昏。阿卡姆的街道笼罩在一种不自然的寂静中，路灯还未亮起，湿冷的秋风裹挟着远方隐约的霉味。我紧了紧大衣，朝{{密斯卡塔尼克大学}}的方向走去。',
      },
      {
        num: 'Ⅱ',
        text: '深夜的敲门声',
        action:
          '昨晚，大约十一点钟的时候，门外响起了急促的敲门声。不是寻常的叩门——那是用拳头在砸，一声比一声急迫，像是有人在躲避什么东西。我打开门，门外站着一个浑身湿透的年轻人，面色惨白，嘴唇发青，雨水顺着他的头发淌下来。他的手里紧紧攥着一个油布包裹，指节因为用力而发白。\n\n'
          + '"求你了，"他喘着气说，"把这个藏起来。别让任何人知道——「他们」在追我。"他把包裹塞进我手里，转身就跑进了雨夜中。我还没来得及叫住他，他已经消失在巷口的阴影里。\n\n'
          + '我低头看着手里的包裹。它很轻，里面像是几页纸。回到屋内，我锁好了门。今天早晨，我在报纸的第三版上看到一则简短的新闻——一具身份不明的男尸在今晨被发现漂浮在{{密斯卡托尼河}}上。',
      },
      {
        num: 'Ⅲ',
        text: '失踪的故人',
        action:
          '三天前，我的老朋友弗朗西斯在没有任何预兆的情况下失踪了。他是{{波士顿}}一家古董书店的店主，也是我在大学时期最亲密的友人。他的妻子找到我时双眼红肿，说他最后一次被人看见是在快打烊的时候——他正在翻阅一本刚从私人收藏家手中收来的旧书，那本书的封面是一种说不清颜色的皮革，扉页上没有任何标题，只有一行手写的希腊字母。\n\n'
          + '"他盯着那行字看了很久，"她哽咽着说，"然后一言不发地站起身，穿上外套就走了。\n\n'
          + '我去了他的书店。那本书还摊开在柜台上，翻到的那一页上画着一种我从未见过的几何图形——线条以一种违反直觉的方式交错、重叠，仿佛在平面上制造了深度。我合上书时，指尖感到一股轻微的静电，像是触碰了某台老旧的收音机。书店的后巷传来一阵若有若无的{{低语}}。',
      },
      {
        num: 'Ⅳ',
        text: '意外的遗产',
        action:
          '上个月，我收到了一封律师函。函件的内容简短得近乎荒谬：我与阿比盖尔姨婆多年不曾联系——事实上，我一直以为她在我出生前就已经去世了。然而这封信通知我，她是三天前在她的乡间宅邸中过世的，享年八十七岁。而我，是她唯一的继承人。\n\n'
          + '今天早晨，我抵达了她在{{马萨诸塞州}}北部的老宅。那是一座建于独立战争时期的石砌宅邸，常春藤覆盖了北面整面墙。律师在门口等我，一位干瘦、戴金丝眼镜的老人，他把钥匙交给我时手微微发抖。\n\n'
          + '"二楼最里面的房间，"他说，声音压得很低，"你姨婆特意在遗嘱中提及——那个房间里的东西，只有你能处理。她还说了一句话：「别在月圆之夜打开窗。」"\n\n'
          + '我站在门厅里，手里攥着那把锈迹斑斑的钥匙。老宅深处，有什么东西在轻轻刮着地板。',
      },
      {
        num: 'Ⅴ',
        text: '旅途的疑云',
        action:
          '这趟旅程从一开始就透着不对劲。\n\n'
          + '事情要从上星期二说起。我在当地报纸的夹缝里看到一则不起眼的广告——"诚征旅伴，前往{{佛蒙特}}州山区考察，报酬优渥。有意者请联系布面街47号。"我本来没太在意，但那几天夜里，我连续做了三个相同的{{梦}}：梦中我站在一座没有名字的山脚下，山体上刻满了螺旋状的符号。\n\n'
          + '我去赴约了。地址是一家昏暗的律师事务所，接待我的人自称威尔考克斯先生——一个脸色苍白、手指修长的中年男人。他没有问我任何关于资历的问题，只是不断重复着"很好，很好，你正是我们需要的人选"。他付了一笔比广告上更多的钱，要我第二天就出发。\n\n'
          + '现在，我坐在一辆摇摇晃晃的公共汽车上，往北驶向佛蒙特。同行的只有三个人：一个沉默寡言的瑞典裔摄影师，一个不停地摆弄怀表的地质学家，以及一个总是戴着厚围巾、看不清面容的女人。窗外，山势越来越陡，公路两旁的树木以一种不自然的姿态扭曲着。',
      },
    ],
    sceneInfo: {
      date: '1925年',
      weekday: '',
      time: '未知',
      weather: '未知',
      location: '命运的交汇处',
    },
  },
];

/** Page number from floor index: 0→1, 1→3, 2→5... */
function pageNum(index: number): string {
  return `— ${index * 2 + 1} —`;
}

/** Right page number from floor index: 0→2, 1→4, 2→6... */
function rightPageNum(index: number): string {
  return `— ${index * 2 + 2} —`;
}

const FLIP_DURATION = 1500;

interface BookStore {
  pages: BookPage[];
  pageIndex: number;
  isFlipping: boolean;
  flipProgress: number;
  flipDirection: 'forward' | 'backward';
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (index: number) => void;
  setFlipping: (v: boolean) => void;
  updateLeftPage: (index: number, header: string, content: string) => void;
  appendPage: (page: BookPage) => void;
  deletePage: (index: number) => void;
  replacePage: (index: number, page: BookPage) => void;
  /** Animated flip to the freshly appended page */
  autoFlipForward: () => void;
  /** Visual-only flip animation (no page change), calls onComplete when done */
  decorativeFlip: (direction: 'forward' | 'backward', duration: number, onComplete?: () => void) => void;
  /** Trim old pages to stay within limit (0 = no limit) */
  trimPages: (limit: number) => void;
  setPages: (pages: BookPage[]) => void;
  addDiceToCurrentPage: (record: DiceRecord) => void;
}

let flipRaf = 0;

export const useBookStore = create<BookStore>((set, get) => ({
  pages: defaultPages,
  pageIndex: 0,
  isFlipping: false,
  flipProgress: 0,
  flipDirection: 'forward',

  nextPage: () => {
    const { pageIndex, pages } = get();
    if (pageIndex < pages.length - 1) set({ pageIndex: pageIndex + 1 });
  },
  prevPage: () => {
    const { pageIndex } = get();
    if (pageIndex > 0) set({ pageIndex: pageIndex - 1 });
  },
  goToPage: (index) => {
    const { pages } = get();
    if (index >= 0 && index < pages.length) set({ pageIndex: index });
  },
  setFlipping: (v) => set({ isFlipping: v }),

  updateLeftPage: (index, header, content) => set((s) => {
    const pages = [...s.pages];
    pages[index] = { ...pages[index], leftHeader: header, leftContent: content, leftPage: pageNum(index), rightPage: rightPageNum(index) };
    return { pages };
  }),

  appendPage: (page) => set((s) => {
    const newIdx = s.pages.length;
    const pages = [...s.pages, { ...page, leftPage: pageNum(newIdx), rightPage: rightPageNum(newIdx) }];
    return { pages };
  }),

  replacePage: (index, page) => set((s) => {
    const pages = [...s.pages];
    pages[index] = { ...page, leftPage: pageNum(index), rightPage: rightPageNum(index) };
    return { pages };
  }),

  deletePage: (index) => set((s) => {
    if (s.pages.length <= 1) return s;
    const deleted = s.pages[index];
    const pages = s.pages.filter((_, i) => i !== index);
    const fixed = pages.map((p, i) => ({ ...p, leftPage: pageNum(i), rightPage: rightPageNum(i) }));
    let pageIndex = s.pageIndex;
    if (pageIndex >= fixed.length) pageIndex = fixed.length - 1;
    if (index < s.pageIndex) pageIndex = s.pageIndex - 1;
    if (deleted?.id) {
      setTimeout(() => useLorebookStore.getState().removeSummaryEntry(deleted.id!), 0);
    }
    return { pages: fixed, pageIndex };
  }),

  autoFlipForward: () => {
    const { isFlipping, pages, pageIndex } = get();
    if (isFlipping || pageIndex >= pages.length - 1) return;
    if (flipRaf) cancelAnimationFrame(flipRaf);

    // Play flip sound
    try { sfxPageFlip(); } catch { /* audio not available */ }

    set({ isFlipping: true, flipProgress: 0, flipDirection: 'forward' });
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const raw = Math.min(1, elapsed / FLIP_DURATION);
      set({ flipProgress: raw });
      if (raw < 1) {
        flipRaf = requestAnimationFrame(tick);
      } else {
        set({ flipProgress: 1 });
        get().nextPage();
        set({ isFlipping: false, flipProgress: 0 });
      }
    };
    flipRaf = requestAnimationFrame(tick);
  },

  decorativeFlip: (direction, duration, onComplete) => {
    if (get().isFlipping) return;
    if (flipRaf) cancelAnimationFrame(flipRaf);
    try { sfxPageFlip(); } catch { /* audio not available */ }
    set({ isFlipping: true, flipProgress: 0, flipDirection: direction });
    const start = performance.now();
    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / duration);
      set({ flipProgress: raw });
      if (raw < 1) {
        flipRaf = requestAnimationFrame(tick);
      } else {
        set({ isFlipping: false, flipProgress: 0 });
        onComplete?.();
      }
    };
    flipRaf = requestAnimationFrame(tick);
  },

  trimPages: (limit) => {
    if (limit <= 0) return;
    const { pages, pageIndex } = get();
    if (pages.length <= limit) return;
    const removed = pages.length - limit;
    const trimmed = pages.slice(removed);
    const removedPages = pages.slice(0, removed);
    const newPageIndex = Math.max(0, pageIndex - removed);
    setTimeout(() => {
      const lore = useLorebookStore.getState();
      for (const p of removedPages) {
        if (p.id) lore.removeSummaryEntry(p.id);
      }
    }, 0);
    set({ pages: trimmed, pageIndex: newPageIndex });
  },
  setPages: (pages) => {
    const withIds = pages.map(p => p.id ? p : { ...p, id: crypto.randomUUID() });
    set({ pages: withIds, pageIndex: Math.max(0, withIds.length - 1) });
  },
  addDiceToCurrentPage: (record) => {
    const { pages, pageIndex } = get();
    const page = pages[pageIndex];
    if (!page) return;
    const updated = [...pages];
    updated[pageIndex] = { ...page, diceResults: [...(page.diceResults || []), record] };
    set({ pages: updated });
  },
}));
