import { describe, it, expect, beforeEach } from 'vitest';
import { useSanityBubbleStore } from '../useSanityBubbleStore';

describe('useSanityBubbleStore.loadPage — 新页加载原子化重置', () => {
  beforeEach(() => {
    useSanityBubbleStore.getState().reset();
  });

  it('loadPage(ids) → resolved 清空 + pending=ids', () => {
    useSanityBubbleStore.getState().loadPage(['p1', 'p2']);
    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
    expect(useSanityBubbleStore.getState().pending).toEqual(['p1', 'p2']);
  });

  it('上页解决了 p1，新页 loadPage(["p1"]) → p1 不再被误判已触发', () => {
    // 模拟上页流程
    useSanityBubbleStore.getState().setPending(['p1']);
    useSanityBubbleStore.getState().markResolved('p1');
    expect(useSanityBubbleStore.getState().resolved.has('p1')).toBe(true);

    // 新页生成同 id —— 关键修复点
    useSanityBubbleStore.getState().loadPage(['p1']);

    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
    expect(useSanityBubbleStore.getState().resolved.has('p1')).toBe(false);
    expect(useSanityBubbleStore.getState().pending).toEqual(['p1']);
    // 新页 p1 应被视为未触发——allClicked()=false → 选项锁住等玩家点
    expect(useSanityBubbleStore.getState().allClicked()).toBe(false);
  });

  it('loadPage([]) 也清 resolved（新页无 SAN check）', () => {
    useSanityBubbleStore.getState().setPending(['p1']);
    useSanityBubbleStore.getState().markResolved('p1');

    useSanityBubbleStore.getState().loadPage([]);

    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
    expect(useSanityBubbleStore.getState().pending).toEqual([]);
    // 无 pending → allClicked=true → 选项可点
    expect(useSanityBubbleStore.getState().allClicked()).toBe(true);
  });

  it('多 id 部分匹配——上页 {p1,p2} resolved，新页 loadPage(["p1","p3"]) → 全清', () => {
    useSanityBubbleStore.getState().setPending(['p1', 'p2']);
    useSanityBubbleStore.getState().markResolved('p1');
    useSanityBubbleStore.getState().markResolved('p2');

    useSanityBubbleStore.getState().loadPage(['p1', 'p3']);

    // 即使 ids 部分重叠也全清——按页隔离比按 id 隔离更稳
    expect(useSanityBubbleStore.getState().resolved.size).toBe(0);
    expect(useSanityBubbleStore.getState().pending).toEqual(['p1', 'p3']);
  });
});
