import { useRef, useCallback, useEffect } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { useAudio } from './useAudio';

export type FlipDirection = 'forward' | 'backward';

const FLIP_DURATION = 1500;

export function usePageFlip() {
  const isFlipping = useBookStore((s) => s.isFlipping);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const pagesLen = useBookStore((s) => s.pages.length);
  const pageIndex = useBookStore((s) => s.pageIndex);
  const audio = useAudio();

  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const flip = useCallback(
    (dir: FlipDirection) => {
      if (isFlipping) return;
      if (dir === 'forward' && pageIndex >= pagesLen - 1) return;
      if (dir === 'backward' && pageIndex <= 0) return;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      useBookStore.setState({ isFlipping: true, flipProgress: 0, flipDirection: dir });
      audio.playFlip();

      startRef.current = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startRef.current;
        const raw = Math.min(1, elapsed / FLIP_DURATION);
        useBookStore.setState({ flipProgress: raw });
        if (raw < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          useBookStore.setState({ flipProgress: 1 });
          if (dir === 'forward') nextPage();
          else prevPage();
          useBookStore.setState({ isFlipping: false, flipProgress: 0 });
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [isFlipping, pageIndex, pagesLen, audio, nextPage, prevPage],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const flipForward = () => flip('forward');
  const flipBackward = () => flip('backward');

  return {
    flipForward,
    flipBackward,
    canGoNext: pageIndex < pagesLen - 1,
    canGoPrev: pageIndex > 0,
  };
}
