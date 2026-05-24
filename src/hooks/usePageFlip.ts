import { useState, useRef, useCallback } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { useAudio } from './useAudio';

export type FlipDirection = 'forward' | 'backward';

export function usePageFlip() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const setFlipping = useBookStore((s) => s.setFlipping);
  const pagesLen = useBookStore((s) => s.pages.length);
  const audio = useAudio();

  const [direction, setDirection] = useState<FlipDirection>('forward');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flip = useCallback(
    (dir: FlipDirection) => {
      if (isFlipping) return;
      if (dir === 'forward' && pageIndex >= pagesLen - 1) return;
      if (dir === 'backward' && pageIndex <= 0) return;

      // Clear any stale timer
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

      setDirection(dir);
      setFlipping(true);
      audio.playFlip();
      timerRef.current = setTimeout(() => {
        if (dir === 'forward') nextPage();
        else prevPage();
        setFlipping(false);
        timerRef.current = null;
      }, 1200);
    },
    [isFlipping, pageIndex, pagesLen, setFlipping, audio, nextPage, prevPage],
  );

  const flipForward = () => flip('forward');
  const flipBackward = () => flip('backward');

  return {
    flipForward,
    flipBackward,
    isFlipping,
    pageIndex,
    direction,
    canGoNext: pageIndex < pagesLen - 1,
    canGoPrev: pageIndex > 0,
  };
}
