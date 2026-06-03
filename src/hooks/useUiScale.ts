import { useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

/**
 * 把界面缩放倍率应用到根元素（等价浏览器缩放，整体放大像素 UI + 字体 + 浮层）。
 * 用 setProperty/removeProperty 而非 style.zoom：规避 TS DOM 对 zoom 的类型缺失与 jsdom 解析差异。
 * 同时设 CSS 变量 --ui-scale：供「用 100dvh/vh 满高的容器」(如 GameView .app) 把高度除以 scale 抵消——
 * 因 zoom 下视口单位 dvh/vh 不收缩，100dvh 会渲染成 scale×视口、撑出溢出令居中内容下移；
 * .app 改用 calc(100dvh / var(--ui-scale)) 后渲染高恰为真实视口、居中复位。
 * scale===1 时移除两者（恢复默认）。el 可注入，便于单测。
 */
export function applyUiScale(scale: number, el: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null): void {
  if (!el) return;
  if (scale === 1) {
    el.style.removeProperty('zoom');
    el.style.removeProperty('--ui-scale');
  } else {
    el.style.setProperty('zoom', String(scale));
    el.style.setProperty('--ui-scale', String(scale));
  }
}

/** 订阅设置中的 uiScale，变化时整体缩放界面。挂在 App 顶层调用一次。 */
export function useUiScale(): void {
  const uiScale = useSettingsStore((s) => s.uiScale);
  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);
}
