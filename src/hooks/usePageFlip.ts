import { useBookStore } from '../stores/useBookStore';

export type FlipDirection = 'forward' | 'backward';

/**
 * 手动翻页（书本左右翻页按钮）。翻页动画与状态提交统一收敛进 useBookStore.manualFlip，
 * 与自动翻页(autoFlipForward)、装饰翻页(decorativeFlip)共用同一套 flipComplete/settleFlip 机制，
 * 从而在切回前台时可被 settleFlip 统一补齐（修复后台 rAF 暂停导致的卡页）。
 */
export function usePageFlip() {
  const pagesLen = useBookStore((s) => s.pages.length);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const manualFlip = useBookStore((s) => s.manualFlip);

  return {
    flipForward: () => manualFlip('forward'),
    flipBackward: () => manualFlip('backward'),
    canGoNext: pageIndex < pagesLen - 1,
    canGoPrev: pageIndex > 0,
  };
}
