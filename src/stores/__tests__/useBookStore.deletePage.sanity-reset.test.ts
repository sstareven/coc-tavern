import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from '../useBookStore';
import { useSanityBubbleStore } from '../useSanityBubbleStore';
import type { BookPage } from '../../types';

function makePage(overrides: Partial<BookPage> = {}): BookPage {
  return {
    id: crypto.randomUUID(),
    leftHeader: '页',
    leftContent: '内容',
    leftPage: '— 1 —',
    rightHeader: '行动',
    rightContent: '右',
    rightChoices: [],
    rightPage: '— 2 —',
    ...overrides,
  };
}

describe('useBookStore.deletePage — 删页时 reset useSanityBubbleStore', () => {
  beforeEach(() => {
    // 还原 store 到干净状态
    useSanityBubbleStore.getState().reset();
    const prologue = makePage({ leftHeader: '序章' });
    const p1 = makePage();
    const p2 = makePage();
    useBookStore.setState({ pages: [prologue, p1, p2], pageIndex: 2 });
  });

  it('删页时清空 useSanityBubbleStore.resolved——防新页同 id SAN 被误判已触发', async () => {
    // 玩家在某页解决了 SAN check p1
    useSanityBubbleStore.getState().setPending(['p1']);
    useSanityBubbleStore.getState().markResolved('p1');
    expect(useSanityBubbleStore.getState().resolved.has('p1')).toBe(true);

    // 删页（删除 index 2 及之后）
    useBookStore.getState().deletePage(2);

    // deletePage 内副作用走 setTimeout(.., 0)，flush 微任务
    await new Promise((r) => setTimeout(r, 0));

    // resolved 集合应被清空——新生成同 id 的 SAN 才能正确触发
    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
    expect(useSanityBubbleStore.getState().pending).toEqual([]);
  });

  it('删多页时 resolved 全清', async () => {
    useSanityBubbleStore.getState().setPending(['p1', 'p2', 'p3']);
    useSanityBubbleStore.getState().markResolved('p1');
    useSanityBubbleStore.getState().markResolved('p2');
    expect(useSanityBubbleStore.getState().resolved.size).toBe(2);

    useBookStore.getState().deletePage(1);

    await new Promise((r) => setTimeout(r, 0));

    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
  });
});
