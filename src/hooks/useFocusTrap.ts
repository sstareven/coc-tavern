// useFocusTrap — 限定焦点在容器内循环;启用时记当前焦点并 focus 容器首焦点元素;
// 卸载/禁用时把焦点还回原 element。供 ModalShell 等模态壳层复用。
import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function collectFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const previousActiveEl = (document.activeElement instanceof HTMLElement) ? document.activeElement : null;

    // 初始焦点:若 root 本身可聚焦则聚焦 root,否则聚焦内部第一个可聚焦元素
    if (root.tabIndex >= 0) {
      root.focus();
    } else {
      const first = collectFocusable(root)[0];
      first?.focus();
    }

    const handleKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Tab') return;
      const focusable = collectFocusable(root);
      if (focusable.length === 0) {
        ev.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey) {
        if (active === first || !root.contains(active)) {
          ev.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        ev.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveEl?.focus?.();
    };
  }, [ref, enabled]);
}
