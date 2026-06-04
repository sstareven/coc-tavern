import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from './useBookStore';
import { useCombatStore } from './useCombatStore';
import type { RewriteBlock, BookPage, Encounter } from '../types';

// ============================================================
// setPages — 开场白随版本刷新迁移
// ============================================================
describe('useBookStore.setPages — 开场白刷新迁移', () => {
  it('老存档的序章开场白页被刷新为最新模板（新中文引号），且保留原 id', () => {
    const savedPrologue = {
      id: 'prologue-old',
      leftHeader: '序章',
      leftContent: '旧版开场白："立即前来，切勿延误。"', // 旧的英文引号
      leftPage: '— 3 —',
      rightPage: '— 4 —',
      rightHeader: '命运的歧路',
      rightContent: '旧引导',
      rightChoices: [],
    };
    useBookStore.getState().setPages([savedPrologue]);

    const first = useBookStore.getState().pages[0];
    expect(first.id).toBe('prologue-old'); // 原 id 保留，React key 稳定
    expect(first.leftContent).toContain('「'); // 已是最新模板的中文引号
    expect(first.leftContent).not.toContain('立即前来'); // 旧固化文本被替换
  });

  it('保留序章之后的所有进度页不变', () => {
    const progressPage = {
      id: 'p2',
      leftHeader: '第二章',
      leftContent: '玩家的游戏进度',
      leftPage: '— 5 —',
      rightPage: '— 6 —',
      rightHeader: '行动',
      rightContent: '引导',
      rightChoices: [],
    };
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '序章', leftContent: '旧', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '命运的歧路', rightContent: '', rightChoices: [] },
      progressPage,
    ]);

    const pages = useBookStore.getState().pages;
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual(progressPage); // 进度页原样保留
  });

  it('首页不是序章时不做替换（不误伤）', () => {
    const nonPrologue = {
      id: 'x', leftHeader: '调查现场', leftContent: '某段叙事',
      leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [],
    };
    useBookStore.getState().setPages([nonPrologue]);
    expect(useBookStore.getState().pages[0]).toEqual(nonPrologue);
  });

  it('传入空数组时回退到默认序章（修复新建人物后空白书页）', () => {
    // 先放入一页非序章内容，再用空数组覆盖
    useBookStore.getState().setPages([
      { id: 'x', leftHeader: '调查现场', leftContent: '某段叙事', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    useBookStore.getState().setPages([]);
    const pages = useBookStore.getState().pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].leftHeader).toBe('序章');
    expect(pages[0].id).toBeTruthy(); // 已分配 id
    expect(useBookStore.getState().pageIndex).toBe(0);
  });
});

describe('useBookStore.resetToPrologue', () => {
  it('重置到全新序章，分配新 id，pageIndex 归零', () => {
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '序章', leftContent: '旧', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '命运的歧路', rightContent: '', rightChoices: [] },
      { id: 'p2', leftHeader: '第二章', leftContent: '进度', leftPage: '— 5 —', rightPage: '— 6 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    useBookStore.getState().resetToPrologue();
    const pages = useBookStore.getState().pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].leftHeader).toBe('序章');
    expect(pages[0].id).toBeTruthy();
    expect(useBookStore.getState().pageIndex).toBe(0);
  });
});

describe('useBookStore.setPageRewrite', () => {
  const block: RewriteBlock = {
    text: '过渡叙述',
    choices: [
      { num: 'V', text: 'a', action: 'a' },
      { num: 'VI', text: 'b', action: 'b' },
      { num: 'VII', text: 'c', action: 'c' },
      { num: 'VIII', text: 'd', action: 'd' },
    ],
    sourceInput: '我想点燃书',
  };

  it('把 rewrite 写入指定页', () => {
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '场景', leftContent: '...', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    useBookStore.getState().setPageRewrite(0, block);
    expect(useBookStore.getState().pages[0].rewrite).toEqual(block);
  });

  it('传 undefined 清除 rewrite', () => {
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '场景', leftContent: '...', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    useBookStore.getState().setPageRewrite(0, block);
    expect(useBookStore.getState().pages[0].rewrite).toEqual(block); // 前置：已写入
    useBookStore.getState().setPageRewrite(0, undefined);
    expect(useBookStore.getState().pages[0].rewrite).toBeUndefined();
  });

  it('越界索引安全忽略', () => {
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '场景', leftContent: '...', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    const before = useBookStore.getState().pages;
    expect(() => useBookStore.getState().setPageRewrite(99, block)).not.toThrow();
    expect(useBookStore.getState().pages).toBe(before); // 越界为 no-op，引用不变
  });
});

// ============================================================
// settleFlip — 切回前台补齐被后台 rAF 暂停而卡住的翻页
// ============================================================
describe('useBookStore.settleFlip — 后台翻页卡页修复', () => {
  const twoPages = [
    { id: 'a', leftHeader: '场景一', leftContent: 'x', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    { id: 'b', leftHeader: '场景二', leftContent: 'y', leftPage: '— 5 —', rightPage: '— 6 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
  ];

  it('自动翻页进行中调 settleFlip → 立即提交到下一页并复位 isFlipping', () => {
    useBookStore.getState().setPages(twoPages);
    useBookStore.setState({ pageIndex: 0, isFlipping: false, flipProgress: 0 });

    useBookStore.getState().autoFlipForward();
    // 发起后：标记为翻页中，但动画未完成（rAF 异步），尚未真正翻页
    expect(useBookStore.getState().isFlipping).toBe(true);
    expect(useBookStore.getState().pageIndex).toBe(0);

    // 模拟切回前台的强制结算
    useBookStore.getState().settleFlip();
    expect(useBookStore.getState().pageIndex).toBe(1);
    expect(useBookStore.getState().isFlipping).toBe(false);
    expect(useBookStore.getState().flipProgress).toBe(0);
  });

  it('手动向后翻页进行中调 settleFlip → 提交到上一页', () => {
    useBookStore.getState().setPages(twoPages);
    useBookStore.setState({ pageIndex: 1, isFlipping: false, flipProgress: 0 });

    useBookStore.getState().manualFlip('backward');
    expect(useBookStore.getState().isFlipping).toBe(true);

    useBookStore.getState().settleFlip();
    expect(useBookStore.getState().pageIndex).toBe(0);
    expect(useBookStore.getState().isFlipping).toBe(false);
  });

  it('装饰翻页进行中调 settleFlip → 触发 onComplete 并复位（不改变页码）', () => {
    useBookStore.getState().setPages(twoPages);
    useBookStore.setState({ pageIndex: 1, isFlipping: false, flipProgress: 0 });
    let done = false;

    useBookStore.getState().decorativeFlip('backward', 800, () => { done = true; });
    expect(useBookStore.getState().isFlipping).toBe(true);

    useBookStore.getState().settleFlip();
    expect(done).toBe(true);
    expect(useBookStore.getState().isFlipping).toBe(false);
    expect(useBookStore.getState().pageIndex).toBe(1); // 装饰翻页不改页码
  });

  it('未在翻页时 settleFlip 为安全 no-op', () => {
    useBookStore.getState().setPages(twoPages);
    useBookStore.setState({ pageIndex: 0, isFlipping: false, flipProgress: 0 });
    expect(() => useBookStore.getState().settleFlip()).not.toThrow();
    expect(useBookStore.getState().pageIndex).toBe(0);
  });
});

// ============================================================
// deletePage / trimPages — 清理悬空战斗（删掉锚定页后不留隐形僵尸战斗）
// ============================================================
describe('useBookStore — 删页/裁页清理悬空战斗', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const mkEnc = (anchorPageId: string): Encounter => ({
    active: true, round: 1, turnOrder: [], currentIdx: 0,
    combatants: [], bystanders: [], playerTargetId: null,
    log: [], diceRecords: [], status: 'active', anchorPageId,
  });
  const pg = (id: string): BookPage => ({
    id, leftHeader: '', leftContent: '', leftPage: '', rightPage: '',
    rightHeader: '', rightContent: '', rightChoices: [],
  });

  beforeEach(() => useCombatStore.getState().clearAll());

  it('deletePage 删掉战斗锚定页 → clearCombat', async () => {
    useBookStore.getState().setPages([pg('p0'), pg('p1'), pg('p2')]);
    useCombatStore.getState().start(mkEnc('p2'));
    useBookStore.getState().deletePage(2); // 删掉锚定页 p2（及其后）
    await tick();
    expect(useCombatStore.getState().encounter).toBeNull();
  });

  it('deletePage 删的不是锚定页 → 战斗保留', async () => {
    useBookStore.getState().setPages([pg('p0'), pg('p1'), pg('p2')]);
    useCombatStore.getState().start(mkEnc('p0')); // 锚在 p0，删 p2 不应影响
    useBookStore.getState().deletePage(2);
    await tick();
    expect(useCombatStore.getState().encounter).not.toBeNull();
  });

  it('trimPages 裁掉战斗锚定页 → clearCombat', async () => {
    useBookStore.getState().setPages([pg('p0'), pg('p1'), pg('p2'), pg('p3')]);
    useCombatStore.getState().start(mkEnc('p0')); // p0 会被裁掉
    useBookStore.getState().trimPages(2); // 仅保留最后 2 页 → 裁掉 p0/p1
    await tick();
    expect(useCombatStore.getState().encounter).toBeNull();
  });
});
