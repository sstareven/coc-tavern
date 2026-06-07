// Konami 序列检测 hook（↑↑↓↓←→←→BA）。
// 设计要点：
//   - O(1) 比对：用 useRef<number>(0) 维护已匹配前缀长度；只看当前按键 vs 序列下一位
//   - 按错回退：next key 能匹配序列[0] 时接为 1，否则归 0（Konami 序列无自相似前缀，足够）
//   - 防误触：input/textarea/contenteditable 内不监听；Ctrl/Alt/Meta 组合不计；长按 e.repeat 不重复推进
//   - 匹配成功调 onUnlock 后归零（允许玩家再输一次玩花活）
//
// 用法（在 App.tsx mount 时挂一个就行）：
//   useKonamiCode(() => useSettingsStore.getState().unlockCheating());

import { useEffect, useRef } from 'react';

/** ↑ ↑ ↓ ↓ ← → ← → B A */
export const KONAMI_SEQUENCE: readonly string[] = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
] as const;

/** 把按键事件归一化为「单一可比较 key」字符串，b/a 不区分大小写。 */
function normalizeKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k.length === 1) return k.toLowerCase();
  return k;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface UseKonamiCodeOptions {
  /** 自定义序列；默认 KONAMI_SEQUENCE。所有 key 用小写字母（b/a），方向用 ArrowUp 等。 */
  sequence?: readonly string[];
  /** 全局开关 — 为 false 时 hook 不挂监听（避免已解锁后浪费 CPU） */
  enabled?: boolean;
}

/**
 * @param onUnlock 匹配成功时调；hook 内部立刻归零进度，可重入触发
 * @param opts.sequence 默认 KONAMI_SEQUENCE
 * @param opts.enabled 默认 true；传 false 时彻底不挂 keydown 监听
 */
export function useKonamiCode(onUnlock: () => void, opts: UseKonamiCodeOptions = {}) {
  const { sequence = KONAMI_SEQUENCE, enabled = true } = opts;
  const matchedRef = useRef(0);
  // 把 onUnlock 通过 ref 透传 — 避免 caller 每次 render 给新引用导致 effect 反复挂卸
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent): void => {
      // 1) 长按不重复推进（按住 ↑ 不能一路打满序列）
      if (e.repeat) return;
      // 2) 组合键不计（Ctrl+ArrowUp 等浏览器原生快捷键）
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // 3) input/textarea/contenteditable 内打字不监听
      if (isInteractiveTarget(e.target)) return;

      const key = normalizeKey(e);
      const expected = sequence[matchedRef.current];

      if (key === expected) {
        matchedRef.current += 1;
        if (matchedRef.current === sequence.length) {
          matchedRef.current = 0;
          onUnlockRef.current();
        }
      } else if (key === sequence[0]) {
        // 按错但当前键能开始新匹配（典型例：↑↑↑↑ 后还能从第二个 ↑ 开始）
        matchedRef.current = 1;
      } else {
        matchedRef.current = 0;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sequence, enabled]);
}
