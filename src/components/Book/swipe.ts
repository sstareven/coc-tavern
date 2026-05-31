export type SwipeDir = 'left' | 'right' | null;

interface SwipeOpts {
  /** 触发翻页的最小水平位移(px)，默认 50 */
  threshold?: number;
  /** 水平须为垂直的几倍才算横滑，默认 1.5（防纵向滚动误触） */
  ratio?: number;
}

/** 根据触摸起止位移判定翻页方向。向左=left（下一张），向右=right（上一张）。 */
export function resolveSwipe(dx: number, dy: number, opts: SwipeOpts = {}): SwipeDir {
  const threshold = opts.threshold ?? 50;
  const ratio = opts.ratio ?? 1.5;
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) < Math.abs(dy) * ratio) return null;
  return dx < 0 ? 'left' : 'right';
}
