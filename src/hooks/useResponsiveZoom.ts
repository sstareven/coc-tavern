import { useEffect } from 'react';

/** 响应式 zoom 基准宽度（设计稿宽度）—— viewport 等于这个时 zoom=1.0。 */
const BASELINE_WIDTH = 1280;
/** zoom 上下界 —— 防止极小/极大屏幕下 UI 错乱（700px 屏 zoom≈0.55 太小、4K 屏 zoom≈3 太大）。 */
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.5;

/** 据当前窗口宽度算 zoom。 */
function computeZoom(): number {
  if (typeof window === 'undefined') return 1;
  const w = window.innerWidth;
  const raw = w / BASELINE_WIDTH;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, raw));
}

/** 把 zoom 挂到 :root style.zoom + 同步 CSS 变量 --auto-zoom 供弹窗 calc(... / var(--auto-zoom)) 抵消防溢出。 */
function apply(): void {
  const el = typeof document !== 'undefined' ? document.documentElement : null;
  if (!el) return;
  const z = computeZoom();
  if (z === 1) {
    el.style.removeProperty('zoom');
    el.style.removeProperty('--auto-zoom');
  } else {
    el.style.setProperty('zoom', String(z));
    el.style.setProperty('--auto-zoom', String(z));
  }
}

/**
 * 响应式 zoom —— 整页根据浏览器窗口大小自动缩放,无需用户手动调。
 *
 * v1.11.8 起：取代旧 uiScale 档位选择(那是用户控制),改为「窗口越大、UI 越大,反之亦然」
 * 全自动响应。1280px 基准 zoom=1.0; 1920px → zoom=1.5(封顶); 800px → zoom=0.75(封底)。
 *
 * App 顶层调一次,挂 resize 监听。文字倍率(textRatio/systemRatio)叠加在这之上。
 */
export function useResponsiveZoom(): void {
  useEffect(() => {
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}
