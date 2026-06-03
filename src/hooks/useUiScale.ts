import { useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

/**
 * 把界面缩放倍率应用到根元素（等价浏览器缩放，整体放大像素 UI + 字体 + 浮层）。
 * 用 setProperty/removeProperty 而非 style.zoom：规避 TS DOM 对 zoom 的类型缺失与 jsdom 解析差异。
 * scale===1 时移除 zoom（恢复默认），其余设为字符串倍率。el 可注入，便于单测。
 */
export function applyUiScale(scale: number, el: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null): void {
  if (!el) return;
  if (scale === 1) el.style.removeProperty('zoom');
  else el.style.setProperty('zoom', String(scale));
}

/** 订阅设置中的 uiScale，变化时整体缩放界面。挂在 App 顶层调用一次。 */
export function useUiScale(): void {
  const uiScale = useSettingsStore((s) => s.uiScale);
  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);
}
