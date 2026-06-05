import { useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

/**
 * v1.11.7 起：完全废弃 uiScale 整页 zoom 方案,改用「响应式 + 文字倍率」。
 *
 * 把「正文文字倍率」和「系统文字倍率」挂到根元素的 CSS 变量上,各组件的 fontSize 通过
 *   font-size: calc(15px * var(--text-ratio, 1))   // 正文
 *   font-size: calc(12px * var(--system-ratio, 1)) // 系统 UI
 * 这种表达式接入。比例 1.0 时移除属性(让 fallback 1 生效),避免计算开销。
 *
 * 几何元素(width/height/padding 等)不再受 ratio 影响,纯响应式(clamp/vw/vh)。
 *
 * el 可注入便于单测。
 */
export function applyTextRatios(
  textRatio: number,
  systemRatio: number,
  el: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!el) return;
  if (textRatio === 1) el.style.removeProperty('--text-ratio');
  else el.style.setProperty('--text-ratio', String(textRatio));
  if (systemRatio === 1) el.style.removeProperty('--system-ratio');
  else el.style.setProperty('--system-ratio', String(systemRatio));
}

/** 订阅 textRatio/systemRatio,变化时挂到 :root CSS 变量。挂在 App 顶层调用一次。 */
export function useTextRatios(): void {
  const textRatio = useSettingsStore((s) => s.textRatio);
  const systemRatio = useSettingsStore((s) => s.systemRatio);
  useEffect(() => {
    applyTextRatios(textRatio, systemRatio);
  }, [textRatio, systemRatio]);
}
