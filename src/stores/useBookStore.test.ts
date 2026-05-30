import { describe, it, expect } from 'vitest';
import { useBookStore } from './useBookStore';
import type { RewriteBlock } from '../types';

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
    useBookStore.getState().setPageRewrite(0, undefined);
    expect(useBookStore.getState().pages[0].rewrite).toBeUndefined();
  });

  it('越界索引安全忽略', () => {
    expect(() => useBookStore.getState().setPageRewrite(99, block)).not.toThrow();
  });
});
