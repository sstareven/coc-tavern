import { useBookStore } from '../stores/useBookStore';
import { useAudio } from './useAudio';

export function usePageFlip() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const setFlipping = useBookStore((s) => s.setFlipping);
  const pagesLen = useBookStore((s) => s.pages.length);
  const audio = useAudio();

  const flipForward = () => {
    if (isFlipping || pageIndex >= pagesLen - 1) return;
    setFlipping(true);
    audio.playFlip();
    setTimeout(() => { nextPage(); setFlipping(false); }, 1200);
  };

  const flipBackward = () => {
    if (isFlipping || pageIndex <= 0) return;
    setFlipping(true);
    audio.playFlip();
    setTimeout(() => { prevPage(); setFlipping(false); }, 1200);
  };

  return {
    flipForward,
    flipBackward,
    isFlipping,
    pageIndex,
    canGoNext: pageIndex < pagesLen - 1,
    canGoPrev: pageIndex > 0,
  };
}
