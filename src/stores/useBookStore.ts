import { create } from 'zustand';
import type { BookPage, DiceRecord, RewriteBlock, InventoryChange, LocationElementInput, DarkThreadData, CombatLog, NpcProfile } from '../types';
import type { NpcUpdate } from './useNpcStore';
import { sfxPageFlip } from '../audio/sfx';
import { useLorebookStore } from './useLorebookStore';
import { useCombatStore } from './useCombatStore';
import { useSanityBubbleStore } from './useSanityBubbleStore';
import { useChatStore } from './useChatStore';

const defaultPages: BookPage[] = [
  // ▸▸▸ 序章：降生之梦 + 命运歧路 ◂◂◂
  {
    leftHeader: '序章',
    leftContent:
      '调查员做了一个<kw>梦</kw>。\n\n'
      + '梦里没有边际，脚下是一汪幽深不波的湖水；水面倒映的并非调查员的面容，而是几处从未见过、却莫名熟稔的去处——一座在涨潮中缓缓没顶的海港、一圈夜空滚着隆隆声的巨石、一道棱角过于规则的惨白雪山，以及一座常春藤缠绕的尖顶小镇。\n\n'
      + '一道<kw>低语</kw>自湖底升起，并不像有声音响起，却径直在调查员颅内成形：\n'
      + '「你已降生于这个时代，<kw>调查员</kw>。这些门皆曾被推开，也都将再度被推开；你的<kw>命运</kw>，尚未书写。」\n\n'
      + '调查员猛然睁开双眼。窗外是一九二五年寻常的清晨，天空灰白而沉默——那低语却仍黏在耳膜深处，调查员隐隐知道，自己即将做出的选择，将决定那扇门通向何方。而无论那扇门通向何处，调查员都须在灾厄成形之前查明真相、集齐足以扭转结局的关键线索。',
    leftPage: pageNum(0),
    rightPage: rightPageNum(0),
    rightHeader: '命运的歧路',
    rightContent:
      '<kw>梦</kw>境虽散，牵引犹在——数条岔路已在眼前，每条都通向不同的<kw>命运</kw>。触碰一根纺线，故事就此开始：',
    rightChoices: [
      {
        num: 'Ⅰ',
        text: '导师的急信',
        action:
          '前几日，调查员收到了一封自<kw>阿卡姆</kw>寄来的挂号信。寄信人是调查员大学时代的导师——一位治学严谨、素来不苟言笑的老者，如今在<kw>密斯卡塔尼克大学</kw>执教。然而那潦草而急促的字迹里，既无往日的寒暄，亦无落款的日期，只余寥寥数行：「即刻动身，万勿延误。馆中新到一卷残籍，其上的文字，遍寻同侪而唯你能识。此事……恕难形诸笔墨。」信纸的边缘洇着几点干涸的褐色污渍，像是溅落的咖啡——又或者，是别的什么。\n\n'
          + '调查员当日清晨便登上了北行的火车。车窗外的田野在薄雾里一掠而过，车厢中乘客寥寥，一路无人交谈。抵达时已近黄昏，<kw>阿卡姆</kw>的街道沉浸在一种不合时令的死寂之中，路灯尚未点亮，湿冷的秋风自河面卷来，裹挟着若有若无的、陈年纸张与霉变交织的气味。调查员紧了紧大衣的领口，朝着<kw>密斯卡塔尼克大学</kw>图书馆里那几扇仍亮着昏黄灯火的窗户走去。',
      },
      {
        num: 'Ⅱ',
        text: '海风中的遗产',
        action:
          '上个月，一封措辞干涩、近乎冷漠的律师函辗转送到了调查员的手中：一位调查员几乎不曾听闻、亦从未谋面的远房亲戚已然故去，而调查员，据信是他在这世上仅存的继承人。所谓遗产，是海滨小镇<kw>印斯茅斯</kw>的一处旧宅——以及随函附来的一枚样式古怪的金饰；那金属触手冰凉，其上的纹路繁复而扭曲，盘绕成某种说不出名目的图案，绝非新英格兰任何一位匠人的手艺。\n\n'
          + '通往<kw>印斯茅斯</kw>的班车一日仅有一趟，破败的车厢里，自始至终只有调查员一名外乡的乘客。越是驶近海岸，空气里那股咸腥的气味便越是浓重——那是海水、鱼获与某种缓慢腐败之物混合而成的味道，黏稠得几乎能附着在衣领上。司机一路沉着脸不发一语，直到调查员下车，才压低嗓子丢来一句叮嘱：「天黑之前办完你的事，赶最后一班车离开。」暮色里，镇子在调查员眼前缓缓铺展开来——倾颓的屋脊、荒废的码头，以及街角那几个垂着头、迟迟不肯抬眼看调查员的居民。',
      },
      {
        num: 'Ⅲ',
        text: '山丘的委托',
        action:
          '事情起于一桩看似再平常不过的委托。一位素未谋面的委托人辗转寻到了调查员，托调查员代为前往<kw>敦威治</kw>——那是马萨诸塞州中北部群山褶皱深处、一处几乎被所有地图遗忘了的没落村落——去核实一桩与当地某个古老家族有关的陈年旧事。报酬丰厚得有些不合常理，而对于此事的来龙去脉，委托人却始终讳莫如深，仿佛每一个字都需斟酌再三。\n\n'
          + '载调查员入山的马车在黄昏时分驶进了峡谷。两侧的山丘圆得出奇——圆得太过规整，反倒透出一种说不上来的不自然；坡上的树木生得格外茂密、格外扭曲，空气里弥漫着冷泉与腐叶交织的、挥之不去的不祥气味。车夫在村口便勒住了缰绳，无论调查员如何许诺，都不肯再往里走半步，只抬手指了指远处半山腰上一座孤零零的农舍——据说，<kw>沃特雷</kw>家的宅子就在那附近。入夜之后，调查员第一次听见了那种声音：自群山深处滚滚传来的、沉闷而绵长的隆隆声，仿佛是大地本身在黑暗里低声呻吟。',
      },
      {
        num: 'Ⅳ',
        text: '极地的邀约',
        action:
          '这桩差事的开端，是<kw>密斯卡塔尼克大学</kw>一间堆满标本、终年不见天日的地下室。校方正不动声色地筹备着一支远赴南极的考察队，而调查员，因着某项不甚起眼的专长，被延揽为随队的一员。在正式启程之前，他们要调查员先替几只木箱里的样本归档造册——那些是由先遣的商船自南方带回、封存于坚冰之中、又被小心翼翼解冻开来的化石。\n\n'
          + '调查员至今仍清楚地记得初次见到它们时的情形。那绝非任何调查员所熟知的生物遗骸：桶状的躯干、星状的头部、沿身侧对称排列的奇异脊状物——它们太过完整，也太过古老，古老到不该在任何一个已知的地质年代里留下哪怕一丝痕迹。带队的教授立在调查员身后，呼吸里压抑着一种近乎狂热的兴奋，低声说道：「你可明白这意味着什么？这是在生命……本不该存在的纪元之前。」窗外，初冬的<kw>阿卡姆</kw>正无声无息地落下今年的第一场雪。',
      },
      {
        num: 'Ⅴ',
        text: '镇上的异变',
        action:
          '调查员本就客居在<kw>阿卡姆</kw>——这座古老、保守、对一切外乡人都怀着几分本能戒备的小镇，密斯卡塔尼克河自它中央静静淌过，将它分作两半。原本，日子与这镇子一样平淡无波；直到近来，接二连三的怪事打破了那层维持已久的平静。\n\n'
          + '起先，是镇北的旧墓地接连失窃——被掘走的并非什么财物，而是新近入土的遗体；继而，有夜归的渔人信誓旦旦地宣称，曾望见河水的深处泛起过一阵不属于月色的、幽幽的青光；而每当夜深人静，疯人院那一侧的高墙之后，总会断续地飘来一两声尖叫——那声音，不似任何人类的喉咙所能发出。镇上的人对此噤若寒蝉，唯有在街头巷尾压低了嗓音，含糊地提起些关于女巫、关于古老集会的、世代相传的只言片语。今夜，调查员终于决意不再坐视——披上外套，走进了<kw>阿卡姆</kw>湿冷而沉默的夜色之中。',
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
  manualFlip: (dir: 'forward' | 'backward') => void;
  settleFlip: () => void;
  /** Visual-only flip animation (no page change), calls onComplete when done */
  decorativeFlip: (direction: 'forward' | 'backward', duration: number, onComplete?: () => void) => void;
  /** Trim old pages to stay within limit (0 = no limit) */
  trimPages: (limit: number) => void;
  setPages: (pages: BookPage[]) => void;
  /** 重置到全新序章（新建人物时调用，确保新会话不残留上一局的页面）。 */
  resetToPrologue: () => void;
  setPageRewrite: (index: number, block: RewriteBlock | undefined) => void;
  /** 把一笔生成用量累加进某页的 genStats（如行动补写中途追加）；耗时不叠加，保留主生成时长。 */
  addPageGenStats: (index: number, delta: { totalTokens: number; promptTokens?: number; completionTokens?: number; estimated: boolean }) => void;
  /** 记录某页经行动补写已直接入库的物品名（用于阻止后续正文重复计数）。 */
  setPageAcquiredItems: (index: number, names: string[]) => void;
  /** 按 index 覆写某页的 inventoryChanges（供起始物品 fire-and-forget 异步生成后页锚定写回；删页重放据此恢复）。 */
  setPageInventoryChanges: (index: number, changes: InventoryChange[]) => void;
  /** 按 index 覆写某页的 locationElements（供地点元素 fire-and-forget 异步抽取后页锚定写回；删页重放据此恢复）。 */
  setPageLocationElements: (index: number, elements: LocationElementInput[]) => void;
  /** 按 index 覆写某页的 genStats（供 MVU 变量结算延后到页面提交之后时，回填本页 token 用量统计）。 */
  setPageGenStats: (index: number, genStats: BookPage['genStats']) => void;
  /** 给某页追加一条子调用统计（MVU/起始物品/坏结局/...等，按时间顺序累积）。供 CacheStatsPanel 按子调用细分显示。 */
  addPageSubCallStat: (index: number, stat: import('../types').PageSubCallStat) => void;
  /** 按 index 覆写某页的 darkThread（供暗线 fire-and-forget 定向补生成后页锚定写回；删页重放据此恢复）。 */
  setPageDarkThread: (index: number, darkThread: DarkThreadData) => void;
  /** 按 index 覆写某页的 npcUpdates 与 npcSnapshot（供 BUG2 Part 2 补写 API 重纠后页锚定写回；删页快照式回溯据 npcSnapshot 恢复）。 */
  setPageNpcRectification: (index: number, npcUpdates: NpcUpdate[], npcSnapshot: Record<string, NpcProfile>) => void;
  /** 按 index 覆写某页的 combatLog（脱战后把战斗日志固化进归属页；页锚定随页持久化）。 */
  setPageCombatLog: (index: number, combatLog: CombatLog) => void;
  /** 写入文生图结果(2026-06-08):url 走 storageMode 决定的格式,status 自动置 'done'。 */
  setPageImage: (index: number, payload: { url: string; prompt: string; at: number }) => void;
  /** 清空某页的图片字段(玩家手动删图或重新生成时清旧)。 */
  clearPageImage: (index: number) => void;
  /** 单独设置 imageGenStatus(用于 pending/failed/skipped 占位)。 */
  setPageImageStatus: (index: number, status: 'pending' | 'done' | 'failed' | 'skipped') => void;
  addDiceToCurrentPage: (record: DiceRecord) => void;
}

let flipRaf = 0;
// 当前进行中翻页的「终态结算」闭包：rAF 自然跑完、或被 settleFlip 强制结算时执行（且仅执行一次）。
// 把状态提交（翻页/复位/onComplete）从 rAF 完成帧解耦，使后台标签页 rAF 被暂停后仍能由 settleFlip 补齐。
let flipComplete: (() => void) | null = null;

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
    if (index < 0 || index >= s.pages.length) return s;
    // 序章（第 0 页）不可删除——至少保留一页
    const start = Math.max(1, index);
    if (start >= s.pages.length) return s;
    // 删除该页及其之后到最新页的所有页面，保持剧情连续性（不留断层）
    const removedPages = s.pages.slice(start);
    const kept = s.pages.slice(0, start);
    const fixed = kept.map((p, i) => ({ ...p, leftPage: pageNum(i), rightPage: rightPageNum(i) }));
    const pageIndex = Math.min(s.pageIndex, fixed.length - 1);
    const removedIds = removedPages.map((p) => p.id).filter((id): id is string => Boolean(id));
    // 派生状态(inventory/sheet/npc)走 page-delete-rollback-snapshot-pattern 不变量回滚：
    // - 物品按 removedPages.inventoryChanges 倒序 revert(逐回合反向施加)；
    // - sheet/npc 用 kept 末页快照整页替换(快照模式比 updates 重放更可靠，含战斗终值)；
    // - 老存档无快照则不动，避免误清(老档兜底仍由调用方 Storybook 的 clearAll+重放完成)。
    // 用 setTimeout 同步副作用避开 store 间循环依赖(同 lorebook/combat/sanity 的处理)。
    setTimeout(() => {
      if (removedIds.length) {
        const lore = useLorebookStore.getState();
        for (const id of removedIds) lore.removeSummaryEntry(id);
        // 删页/回溯若删掉战斗锚定页 → 清掉这场悬空战斗,否则它非空却任何页都渲染不出面板(隐形),
        // 会静默堵死所有进战入口(名册攻击/选项格斗/行动补写)。
        const enc = useCombatStore.getState().encounter;
        if (enc?.anchorPageId && removedIds.includes(enc.anchorPageId)) useCombatStore.getState().clearCombat();
        // useSanityBubbleStore.resolved 是 in-memory 解决态(按 page.sanityCheckPrompts.id 标记)。
        // 删页清掉气泡列表对应页 → resolved 也必须清,防新页 LLM 生成同 id(p1/p2/p3 是常见模板) 时
        // 被误判为"已触发"(SanityBubble 渲染为灰圆点、玩家点不开/不掉 SAN)。注释期望见 useSanityBubbleStore
        // 顶部 page-delete-rollback-snapshot-pattern 段;此处兑现该不变量。
        useSanityBubbleStore.getState().reset();
        // 文生图本页插画 blob(2026-06-08):删页 → 删对应 pageImages 行
        void (async () => {
          try {
            const { db } = await import('../db/database');
            await db.pageImages.where('pageId').anyOf(removedIds).delete();
          } catch (e) {
            console.warn('[useBookStore.deletePage] pageImages 清理失败:', e);
          }
        })();
      }
      // ── 物品回滚：倒序撤销被删页的 inventoryChanges ──
      void (async () => {
        const { useInventoryStore } = await import('./useInventoryStore');
        const inv = useInventoryStore.getState();
        for (let k = removedPages.length - 1; k >= 0; k--) {
          const p = removedPages[k];
          if (p.inventoryChanges?.length) inv.revertChanges(p.inventoryChanges);
        }
      })();
      // ── sheet/npc 快照式回滚：取 kept 末页(向前回溯找最近含快照的页)恢复 ──
      void (async () => {
        const lastSheetSnap = [...fixed].reverse().find((p) => p.sheetSnapshot)?.sheetSnapshot;
        if (lastSheetSnap) {
          const { useCharSheetStore } = await import('./useCharSheetStore');
          useCharSheetStore.getState().setSheet(lastSheetSnap);
        }
        const lastNpcSnap = [...fixed].reverse().find((p) => p.npcSnapshot)?.npcSnapshot;
        if (lastNpcSnap) {
          const { useNpcStore } = await import('./useNpcStore');
          useNpcStore.getState().replaceAll(Object.values(lastNpcSnap));
        }
      })();
    }, 0);
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

    // 终态结算：提交翻页并复位。挂到 flipComplete，使 settleFlip（切回前台）也能补齐。
    const finish = () => {
      flipRaf = 0;
      flipComplete = null;
      set({ flipProgress: 1 });
      get().nextPage();
      set({ isFlipping: false, flipProgress: 0 });
    };
    flipComplete = finish;

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / FLIP_DURATION);
      set({ flipProgress: raw });
      if (raw < 1) flipRaf = requestAnimationFrame(tick);
      else finish();
    };
    flipRaf = requestAnimationFrame(tick);
  },

  manualFlip: (dir) => {
    const { isFlipping, pages, pageIndex } = get();
    if (isFlipping) return;
    if (dir === 'forward' && pageIndex >= pages.length - 1) return;
    if (dir === 'backward' && pageIndex <= 0) return;
    if (flipRaf) cancelAnimationFrame(flipRaf);

    try { sfxPageFlip(); } catch { /* audio not available */ }

    set({ isFlipping: true, flipProgress: 0, flipDirection: dir });
    const start = performance.now();

    const finish = () => {
      flipRaf = 0;
      flipComplete = null;
      set({ flipProgress: 1 });
      if (dir === 'forward') get().nextPage(); else get().prevPage();
      set({ isFlipping: false, flipProgress: 0 });
    };
    flipComplete = finish;

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / FLIP_DURATION);
      set({ flipProgress: raw });
      if (raw < 1) flipRaf = requestAnimationFrame(tick);
      else finish();
    };
    flipRaf = requestAnimationFrame(tick);
  },

  // 切回前台等场景下，强制结算被后台 rAF 暂停而卡住的翻页——直接执行登记的终态，不再等动画帧。
  settleFlip: () => {
    if (!get().isFlipping) return;
    if (flipRaf) { cancelAnimationFrame(flipRaf); flipRaf = 0; }
    const f = flipComplete;
    flipComplete = null;
    if (f) f();
    else set({ isFlipping: false, flipProgress: 0 });
  },

  decorativeFlip: (direction, duration, onComplete) => {
    if (get().isFlipping) return;
    if (flipRaf) cancelAnimationFrame(flipRaf);
    try { sfxPageFlip(); } catch { /* audio not available */ }
    set({ isFlipping: true, flipProgress: 0, flipDirection: direction });
    const start = performance.now();
    const finish = () => {
      flipRaf = 0;
      flipComplete = null;
      set({ isFlipping: false, flipProgress: 0 });
      onComplete?.();
    };
    flipComplete = finish;
    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / duration);
      set({ flipProgress: raw });
      if (raw < 1) flipRaf = requestAnimationFrame(tick);
      else finish();
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
      // 裁页若裁掉战斗锚定页 → 清掉悬空战斗(同 deletePage，防隐形战斗堵死进战入口)。
      const enc = useCombatStore.getState().encounter;
      if (enc?.anchorPageId && removedPages.some((p) => p.id === enc.anchorPageId)) useCombatStore.getState().clearCombat();
    }, 0);
    set({ pages: trimmed, pageIndex: newPageIndex });
  },
  setPages: (pages) => {
    // 空页面（新会话 / 关系表无 pages 行 / 读档竞态）时，回退到默认序章——
    // 否则 Storybook 渲染空白书页（pages[0] 为 undefined）。与「序章不可删除、至少保留一页」不变量一致。
    if (pages.length === 0) {
      set({ pages: [{ ...defaultPages[0], id: crypto.randomUUID() }], pageIndex: 0 });
      return;
    }
    // 开场白随版本刷新：老存档里固化的序章页用最新模板替换，保留后续进度与原 id
    // 例外：剧本会话（scenarioId 存在）的 page0 是 scenario-engine LLM 扩写的专属序章，
    // 不能被默认模板覆盖——否则重载会话会把剧本开场白打回「你做了一个梦」。
    // 详见 scenario-engine.ts:264 的 activateScenario 注释。
    const chat = useChatStore.getState();
    const activeSession = chat.sessions.find(s => s.id === chat.activeId);
    const isScenarioSession = !!activeSession?.scenarioId;
    const refreshed = (pages[0]?.leftHeader === '序章' && !isScenarioSession)
      ? [{ ...defaultPages[0], id: pages[0].id }, ...pages.slice(1)]
      : pages;
    const withIds = refreshed.map(p => p.id ? p : { ...p, id: crypto.randomUUID() });
    set({ pages: withIds, pageIndex: Math.max(0, withIds.length - 1) });
  },
  resetToPrologue: () => {
    set({ pages: [{ ...defaultPages[0], id: crypto.randomUUID() }], pageIndex: 0 });
  },
  setPageRewrite: (index, block) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    // 重新续写（re-roll）会重生选项，清空该页此前补写拾取记录，避免拾取A后重写又拾取B二者皆入库。
    pages[index] = { ...pages[index], rewrite: block, acquiredItems: undefined };
    return { pages };
  }),
  addPageGenStats: (index, delta) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    const prev = pages[index].genStats;
    pages[index] = {
      ...pages[index],
      genStats: {
        totalTokens: (prev?.totalTokens ?? 0) + delta.totalTokens,
        promptTokens: (prev?.promptTokens ?? 0) + (delta.promptTokens ?? 0),
        completionTokens: (prev?.completionTokens ?? 0) + (delta.completionTokens ?? 0),
        durationMs: prev?.durationMs ?? 0,
        estimated: (prev?.estimated ?? false) || delta.estimated,
      },
    };
    return { pages };
  }),
  setPageAcquiredItems: (index, names) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    const prev = pages[index].acquiredItems ?? [];
    const merged = Array.from(new Set([...prev, ...names]));
    pages[index] = { ...pages[index], acquiredItems: merged };
    return { pages };
  }),
  setPageInventoryChanges: (index, changes) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], inventoryChanges: changes };
    return { pages };
  }),
  setPageLocationElements: (index, elements) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], locationElements: elements };
    return { pages };
  }),
  setPageGenStats: (index, genStats) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], genStats };
    return { pages };
  }),
  addPageSubCallStat: (index, stat) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    const page = pages[index];
    const existing = page.genStats?.subCalls ?? [];
    pages[index] = {
      ...page,
      genStats: page.genStats
        ? { ...page.genStats, subCalls: [...existing, stat] }
        // 极少数情况主回合 genStats 还没写就有子调用：占位 genStats 让数据不丢
        : { totalTokens: 0, durationMs: 0, estimated: true, subCalls: [stat] },
    };
    return { pages };
  }),
  setPageDarkThread: (index, darkThread) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], darkThread };
    return { pages };
  }),
  setPageNpcRectification: (index, npcUpdates, npcSnapshot) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    const prevPage = pages[index];
    // 合并：保留原 npcUpdates，追加补写出来的（按 name 去重，原项优先——主回合若有同名则不被补写覆盖）。
    const prevUpdates = prevPage.npcUpdates ?? [];
    const seen = new Set(prevUpdates.map((n) => n.name.trim()));
    const merged = [...prevUpdates];
    for (const u of npcUpdates) {
      const key = u.name.trim();
      if (!key || seen.has(key)) continue;
      merged.push(u);
      seen.add(key);
    }
    pages[index] = { ...prevPage, npcUpdates: merged, npcSnapshot };
    return { pages };
  }),
  setPageCombatLog: (index, combatLog) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], combatLog };
    return { pages };
  }),
  setPageImage: (index, payload) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = {
      ...pages[index],
      imageUrl: payload.url,
      imagePrompt: payload.prompt,
      imageGenAt: payload.at,
      imageGenStatus: 'done',
    };
    return { pages };
  }),
  clearPageImage: (index) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    const { imageUrl: _u, imagePrompt: _p, imageGenAt: _a, imageGenStatus: _st, ...rest } = pages[index];
    void _u; void _p; void _a; void _st;
    pages[index] = rest;
    return { pages };
  }),
  setPageImageStatus: (index, status) => set((s) => {
    if (index < 0 || index >= s.pages.length) return s;
    const pages = [...s.pages];
    pages[index] = { ...pages[index], imageGenStatus: status };
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
