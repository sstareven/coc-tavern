import { create } from 'zustand';
import type { BookPage, DiceRecord, RewriteBlock } from '../types';
import { sfxPageFlip } from '../audio/sfx';
import { useLorebookStore } from './useLorebookStore';

const defaultPages: BookPage[] = [
  // ▸▸▸ 序章：降生之梦 + 命运歧路 ◂◂◂
  {
    leftHeader: '序章',
    leftContent:
      '你做了一个{{梦}}——一个并不太像是属于你自己的梦。\n\n'
      + '梦里没有边际，也没有上下；你立于一片绝对的{{黑暗}}之上，脚下是一汪镜面般幽深、不起一丝波澜的湖水，幽暗得仿佛并非水，而是某种比水更古老、也更有耐心的东西。水面所倒映的并不是你的面容——而是几处你从未亲眼见过、却又莫名熟稔的去处；它们自深处一一浮起，彼此交叠、彼此渗透，仿佛有一只看不见的手，正不慌不忙地将散落的{{命运}}在你眼前缓缓摊开。\n\n'
      + '你看见一座倾颓的海港在涨潮里缓缓没入水面，码头湿淋淋的石阶上爬满了触须般纠结的纹路，而那些聚在岸边、垂着头一动不动的身影，眼睑似乎从不曾、也无从闭合；你看见一座孤零零的圆丘隆起于荒野，顶端环立着一圈被岁月磨钝的巨石，无星的夜空在那石环之上滚动着一种沉闷的、仿佛自地底深处传来的隆隆声，绵长得不像任何雷霆；你看见一道惨白如骨的山脉横亘在极南的冰原尽头，山体上那些棱角过于规则、过于对称——对称得令人不安，绝非任何风霜之力所能雕琢，倒像是某种远在人类之前的意志，亲手留下的手笔。\n\n'
      + '最后，水面浮起一座灰扑扑的小镇——尖顶的教堂、爬满常春藤的学院、一条静静穿城而过的河；一本摊开的羊皮残卷悬在镇子上空，纸页泛黄而潮润，其上以某种早已死去的文字写就的行行字迹，竟如活物般缓慢地蠕动、爬行，仿佛在等待着被人重新念诵出声。\n\n'
      + '便在此时，一道{{低语}}自湖底升起——它像是千万个声音叠合而成，又像是从不曾有任何声音真正响起，只是径直在你的颅骨内侧悄然成形：\n'
      + '「你已降生于这个时代，{{调查员}}。这些门，皆曾有人推开——也都将被再度推开。你的{{命运}}，尚未书写。」\n\n'
      + '你猛然睁开双眼。\n\n'
      + '窗外，是一九二五年某个再寻常不过的清晨，属于你的天空一如往日般灰白而沉默。\n'
      + '然而那湖底的低语仍黏在耳膜深处，久久不散——你说不清那究竟意味着什么，却隐隐地、确凿无疑地知道：自己即将做出的选择，将决定那一扇门，究竟通向何方。',
    leftPage: pageNum(0),
    rightPage: rightPageNum(0),
    rightHeader: '命运的歧路',
    rightContent:
      '那{{梦}}境消散之际，一股奇异的牵引却并未随之退去——它萦绕在意识的边缘，仿佛冥冥之中，某种远比你古老的力量早已为你铺下了数条岔路；每一条都通向截然不同的{{命运}}，也通向梦中那些似曾相识、却又叫人不敢深想的去处之一。\n\n'
      + '你只需伸出手，触碰其中一根纺线——故事，便会从那里悄然开始。\n\n'
      + '以下，是命运为你摊开的几种可能：',
    rightChoices: [
      {
        num: 'Ⅰ',
        text: '导师的急信',
        action:
          '前几日，我收到了一封自{{阿卡姆}}寄来的挂号信。寄信人是我大学时代的导师——一位治学严谨、素来不苟言笑的老者，如今在{{密斯卡塔尼克大学}}执教。然而那潦草而急促的字迹里，既无往日的寒暄，亦无落款的日期，只余寥寥数行：「即刻动身，万勿延误。馆中新到一卷残籍，其上的文字，遍寻同侪而唯你能识。此事……恕难形诸笔墨。」信纸的边缘洇着几点干涸的褐色污渍，像是溅落的咖啡——又或者，是别的什么。\n\n'
          + '我当日清晨便登上了北行的火车。车窗外的田野在薄雾里一掠而过，车厢中乘客寥寥，一路无人交谈。抵达时已近黄昏，{{阿卡姆}}的街道沉浸在一种不合时令的死寂之中，路灯尚未点亮，湿冷的秋风自河面卷来，裹挟着若有若无的、陈年纸张与霉变交织的气味。我紧了紧大衣的领口，朝着{{密斯卡塔尼克大学}}图书馆里那几扇仍亮着昏黄灯火的窗户走去。',
      },
      {
        num: 'Ⅱ',
        text: '海风中的遗产',
        action:
          '上个月，一封措辞干涩、近乎冷漠的律师函辗转送到了我的手中：一位我几乎不曾听闻、亦从未谋面的远房亲戚已然故去，而我，据信是他在这世上仅存的继承人。所谓遗产，是海滨小镇{{印斯茅斯}}的一处旧宅——以及随函附来的一枚样式古怪的金饰；那金属触手冰凉，其上的纹路繁复而扭曲，盘绕成某种说不出名目的图案，绝非新英格兰任何一位匠人的手艺。\n\n'
          + '通往{{印斯茅斯}}的班车一日仅有一趟，破败的车厢里，自始至终只有我一名外乡的乘客。越是驶近海岸，空气里那股咸腥的气味便越是浓重——那是海水、鱼获与某种缓慢腐败之物混合而成的味道，黏稠得几乎能附着在衣领上。司机一路沉着脸不发一语，直到我下车，才压低嗓子丢来一句叮嘱：「天黑之前办完你的事，赶最后一班车离开。」暮色里，镇子在我眼前缓缓铺展开来——倾颓的屋脊、荒废的码头，以及街角那几个垂着头、迟迟不肯抬眼看我的居民。',
      },
      {
        num: 'Ⅲ',
        text: '山丘的委托',
        action:
          '事情起于一桩看似再平常不过的委托。一位素未谋面的委托人辗转寻到了我，托我代为前往{{敦威治}}——那是马萨诸塞州中北部群山褶皱深处、一处几乎被所有地图遗忘了的没落村落——去核实一桩与当地某个古老家族有关的陈年旧事。报酬丰厚得有些不合常理，而对于此事的来龙去脉，委托人却始终讳莫如深，仿佛每一个字都需斟酌再三。\n\n'
          + '载我入山的马车在黄昏时分驶进了峡谷。两侧的山丘圆得出奇——圆得太过规整，反倒透出一种说不上来的不自然；坡上的树木生得格外茂密、格外扭曲，空气里弥漫着冷泉与腐叶交织的、挥之不去的不祥气味。车夫在村口便勒住了缰绳，无论我如何许诺，都不肯再往里走半步，只抬手指了指远处半山腰上一座孤零零的农舍——据说，{{沃特雷}}家的宅子就在那附近。入夜之后，我第一次听见了那种声音：自群山深处滚滚传来的、沉闷而绵长的隆隆声，仿佛是大地本身在黑暗里低声呻吟。',
      },
      {
        num: 'Ⅳ',
        text: '极地的邀约',
        action:
          '这桩差事的开端，是{{密斯卡塔尼克大学}}一间堆满标本、终年不见天日的地下室。校方正不动声色地筹备着一支远赴南极的考察队，而我，因着某项不甚起眼的专长，被延揽为随队的一员。在正式启程之前，他们要我先替几只木箱里的样本归档造册——那些是由先遣的商船自南方带回、封存于坚冰之中、又被小心翼翼解冻开来的化石。\n\n'
          + '我至今仍清楚地记得初次见到它们时的情形。那绝非任何我所熟知的生物遗骸：桶状的躯干、星状的头部、沿身侧对称排列的奇异脊状物——它们太过完整，也太过古老，古老到不该在任何一个已知的地质年代里留下哪怕一丝痕迹。带队的教授立在我身后，呼吸里压抑着一种近乎狂热的兴奋，低声说道：「你可明白这意味着什么？这是在生命……本不该存在的纪元之前。」窗外，初冬的{{阿卡姆}}正无声无息地落下今年的第一场雪。',
      },
      {
        num: 'Ⅴ',
        text: '镇上的异变',
        action:
          '我本就客居在{{阿卡姆}}——这座古老、保守、对一切外乡人都怀着几分本能戒备的小镇，密斯卡塔尼克河自它中央静静淌过，将它分作两半。原本，日子与这镇子一样平淡无波；直到近来，接二连三的怪事打破了那层维持已久的平静。\n\n'
          + '起先，是镇北的旧墓地接连失窃——被掘走的并非什么财物，而是新近入土的遗体；继而，有夜归的渔人信誓旦旦地宣称，曾望见河水的深处泛起过一阵不属于月色的、幽幽的青光；而每当夜深人静，疯人院那一侧的高墙之后，总会断续地飘来一两声尖叫——那声音，不似任何人类的喉咙所能发出。镇上的人对此噤若寒蝉，唯有在街头巷尾压低了嗓音，含糊地提起些关于女巫、关于古老集会的、世代相传的只言片语。今夜，我终于决意不再坐视——披上外套，走进了{{阿卡姆}}湿冷而沉默的夜色之中。',
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
