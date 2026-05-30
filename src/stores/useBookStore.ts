import { create } from 'zustand';
import type { BookPage, DiceRecord, RewriteBlock } from '../types';
import { sfxPageFlip } from '../audio/sfx';
import { useLorebookStore } from './useLorebookStore';

const defaultPages: BookPage[] = [
  // ▸▸▸ 序章：降生之梦 + 命运歧路 ◂◂◂
  {
    leftHeader: '序章',
    leftContent:
      '你做了一个{{梦}}。\n\n'
      + '在梦里，你立于一片无边的{{黑暗}}之上，脚下是镜面般幽深、不起一丝波澜的湖水。水面倒映的却不是你——而是几处你从未亲眼见过、却莫名熟悉的去处，它们一一浮现，又彼此重叠，仿佛某只看不见的手，正将散落的{{命运}}摊开在你面前。\n\n'
      + '你看见一座倾颓的海港在涨潮中缓缓没入水面，码头上湿淋淋的石雕缠满了触须般的纹路，而那些聚在岸边、垂着头的身影，眼睛似乎从不曾闭合；你看见一座孤独的圆丘，顶端环立着一圈古老的巨石，无星的夜空在石环之上发出沉闷的、仿佛自地底滚来的隆隆声；你看见一道惨白如骨的山脉横亘于极南的冰原，山体上那些过于规则、过于对称的棱角，绝非任何风霜之力所能雕琢。\n\n'
      + '最后，水面浮现出一座灰扑扑的小镇——尖顶的教堂、爬满常春藤的学院、一条静静穿城而过的河——一本摊开的羊皮残卷悬在镇子上空，纸页上的古老文字，竟如活物般缓缓蠕动着。\n\n'
      + '一道{{低语}}自湖底升起，像是千万个声音的叠合，又像根本不曾有声音响起：\n'
      + '「你已降生于这个时代，{{调查员}}。这些门，都曾有人推开过——也都将再次被推开。你的{{命运}}，尚未书写。」\n\n'
      + '你猛然睁开双眼。\n\n'
      + '窗外，是一九二五年某个寻常的清晨，属于你的天空一如往日般灰白。\n'
      + '然而那湖底的低语仍黏在耳膜上，挥之不去——你隐隐知道，自己即将做出的选择，将决定那扇门通向何方。',
    leftPage: pageNum(0),
    rightPage: rightPageNum(0),
    rightHeader: '命运的歧路',
    rightContent:
      '那{{梦}}境消散之际，一股奇异的牵引仍萦绕不去——仿佛冥冥之中，某种力量早已为你铺下了数条岔路，每一条都通向截然不同的{{命运}}，也通向梦中那些似曾相识的去处之一。\n\n'
      + '你只需伸出手，触碰其中一根纺线——故事，便从那里开始。\n\n'
      + '以下是命运为你呈现的几种可能：',
    rightChoices: [
      {
        num: 'Ⅰ',
        text: '导师的急信',
        action:
          '前几日，我收到了一封自{{阿卡姆}}寄来的挂号信。寄信人是我大学时代的导师——如今在{{密斯卡塔尼克大学}}任教。潦草而急促的字迹里没有寒暄，也没有落款日期，只有寥寥数行：「即刻前来，万勿延误。馆中新到一卷残籍，其上的文字唯有你能替我辨读。此事……不便形诸笔墨。」信纸边缘沾着几点褐色的污渍，像是干涸的咖啡——或是别的什么。\n\n'
          + '我当天一早便登上了北去的火车。车窗外的田野在薄雾中一掠而过，车厢里乘客寥寥。抵达时已近黄昏，{{阿卡姆}}的街道笼在一种不合时宜的死寂里，路灯尚未亮起，湿冷的秋风裹着河面飘来的、若有若无的霉味。我紧了紧大衣，朝{{密斯卡塔尼克大学}}图书馆那几扇仍亮着灯的窗户走去。',
      },
      {
        num: 'Ⅱ',
        text: '海风中的遗产',
        action:
          '上个月，一封措辞干涩的律师函辗转送到了我手中：一位我几乎不曾听闻的远房亲戚故去了，而我，据说是他在世上仅存的继承人。遗产是滨海小镇{{印斯茅斯}}的一处旧宅——以及随函附来的一枚样式古怪的金饰，触手冰凉，纹路繁复得近乎扭曲，绝非新英格兰任何匠人的手艺。\n\n'
          + '通往{{印斯茅斯}}的班车一日仅有一趟，破旧的车厢里只有我一名外乡客。越是靠近海岸，空气里那股咸腥的、混着鱼腥与腐败的气息便越是浓重。司机自始至终阴沉着脸，临下车时才压低声音丢下一句：「天黑前办完事，赶最后一班车走。」镇子在暮色里铺展开来——倾颓的屋脊、荒废的码头，以及街角那几个垂着头、迟迟不肯抬眼看我的居民。',
      },
      {
        num: 'Ⅲ',
        text: '山丘的委托',
        action:
          '事情起于一桩看似平常的委托。一位素未谋面的委托人辗转找到我，请我前往{{敦威治}}——那是马萨诸塞州中北部群山褶皱里一处几乎被地图遗忘的没落村落——去核实一桩与当地一个古老家族有关的旧事。报酬丰厚得有些不合常理，而委托人对此事的来龙去脉却讳莫如深。\n\n'
          + '载我进山的马车在黄昏时分驶入了峡谷。两侧的山丘圆得出奇，坡上的树木生得格外茂密、格外扭曲，空气里弥漫着冷泉与腐叶混杂的、说不清的不祥气味。车夫在村口便勒住了缰绳，无论如何不肯再往里走，只抬手指了指远处半山腰一座孤零零的农舍——{{沃特雷}}家的宅子，据说就在那附近。入夜后，我第一次听见了那种声音：自群山深处滚来的、沉闷的隆隆声，仿佛大地本身在低声呻吟。',
      },
      {
        num: 'Ⅳ',
        text: '极地的邀约',
        action:
          '这趟差事的开端，是{{密斯卡塔尼克大学}}一间堆满标本的地下室。校方正在筹备一支远赴南极的考察队，而我，因着某项不甚起眼的专长，被延揽为随队的一员。在正式启程之前，他们要我先替几箱由先遣商船带回的样本归档——那些封在冰里、又被小心解冻的化石。\n\n'
          + '我至今记得初次见到它们时的情形。那并非任何我所熟知的生物遗骸：桶状的躯干、星形的头部、沿身侧排列的奇异脊状物——它们太过完整、太过古老，古老到不该在任何已知的地质年代里留下痕迹。带队的教授站在我身后，声音里压着一种近乎狂热的兴奋：「你明白这意味着什么吗？在生命……本不该存在的年代之前。」窗外，初冬的{{阿卡姆}}正飘着今年的第一场雪。',
      },
      {
        num: 'Ⅴ',
        text: '镇上的异变',
        action:
          '我本就客居在{{阿卡姆}}——这座古老、保守、对外乡人总怀着几分警惕的小镇，密斯卡塔尼克河从它中间静静流过。原本，日子与这镇子一样波澜不惊，直到近来接二连三的怪事打破了那层平静。\n\n'
          + '先是镇北的旧墓地接连失窃——被掘走的不是财物，而是新葬的遗体；接着，有夜归的渔人信誓旦旦地说，看见河水深处泛起过一阵不属于月光的幽幽光亮；而每当夜深，疯人院那一侧的高墙后，偶尔会传来一两声不似人类喉咙所能发出的尖叫。镇上的人对此噤若寒蝉，只在街头巷尾压低嗓音，提起些关于女巫与古老集会的、世代相传的只言片语。今夜，我决定不再坐视——我披上外套，走进了{{阿卡姆}}湿冷的夜色里。',
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

/** Page number from floor index: 0→3, 1→5, 2→7... (pages 1-2 are TOC) */
function pageNum(index: number): string {
  return `— ${index * 2 + 3} —`;
}

/** Right page number from floor index: 0→4, 1→6, 2→8... (pages 1-2 are TOC) */
function rightPageNum(index: number): string {
  return `— ${index * 2 + 4} —`;
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
  setPageRewrite: (index: number, block: RewriteBlock | undefined) => void;
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
    // 开场白随版本刷新：老存档里固化的序章页用最新模板替换，保留后续进度与原 id
    const refreshed = pages.length > 0 && pages[0]?.leftHeader === '序章'
      ? [{ ...defaultPages[0], id: pages[0].id }, ...pages.slice(1)]
      : pages;
    const withIds = refreshed.map(p => p.id ? p : { ...p, id: crypto.randomUUID() });
    set({ pages: withIds, pageIndex: Math.max(0, withIds.length - 1) });
  },
  setPageRewrite: (index, block) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], rewrite: block };
    return { pages };
  }),
  addDiceToCurrentPage: (record) => {
    const { pages, pageIndex } = get();
    const page = pages[pageIndex];
    if (!page) return;
    const updated = [...pages];
    updated[pageIndex] = { ...page, diceResults: [...(page.diceResults || []), record] };
    set({ pages: updated });
  },
}));
