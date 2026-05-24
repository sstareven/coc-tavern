import { useState, useRef, useCallback, useEffect } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { useAudio } from './useAudio';

export type FlipDirection = 'forward' | 'backward';

const FLIP_DURATION = 1500; // ms — matches FLIP_CONFIG.TOTAL

export function usePageFlip() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const isFlipping = useBookStore((s) => s.isFlipping);
  const nextPage = useBookStore((s) => s.nextPage);
  const prevPage = useBookStore((s) => s.prevPage);
  const setFlipping = useBookStore((s) => s.setFlipping);
  const pagesLen = useBookStore((s) => s.pages.length);
  const audio = useAudio();

  const [direction, setDirection] = useState<FlipDirection>('forward');
  const [flipProgress, setFlipProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const flip = useCallback(
    (dir: FlipDirection) => {
      if (isFlipping) return;
      if (dir === 'forward' && pageIndex >= pagesLen - 1) return;
      if (dir === 'backward' && pageIndex <= 0) return;

      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); }

      setDirection(dir);
      setFlipping(true);
      setFlipProgress(0);
      audio.playFlip();

      startRef.current = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startRef.current;
        const raw = Math.min(1, elapsed / FLIP_DURATION);
        setFlipProgress(raw);
        if (raw < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setFlipProgress(1);
          if (dir === 'forward') nextPage();
          else prevPage();
          setFlipping(false);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [isFlipping, pageIndex, pagesLen, setFlipping, audio, nextPage, prevPage],
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
    isFlipping,
    flipProgress,
    pageIndex,
    direction,
    canGoNext: pageIndex < pagesLen - 1,
    canGoPrev: pageIndex > 0,
  };
}
