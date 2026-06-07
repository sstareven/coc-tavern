/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKonamiCode, KONAMI_SEQUENCE } from './useKonamiCode';

function fire(key: string, opts: Partial<KeyboardEventInit> = {}, target?: Element) {
  const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  if (target) {
    target.dispatchEvent(evt);
  } else {
    document.dispatchEvent(evt);
  }
}

function fireSequence(keys: readonly string[]) {
  for (const k of keys) fire(k);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useKonamiCode', () => {
  it('完整正确序列触发 onUnlock', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fireSequence(KONAMI_SEQUENCE);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('B 大小写都可以', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fireSequence([
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'B', 'A',
    ]);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('中途按错回退到「能从当前键 match 序列[0] 的位置」', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    // ↑↑↑（第 3 个 ↑ 错了，但因为 ↑ 仍能 match seq[0]，回退到 1 而不是 0）
    fireSequence(['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
    // 第 3 个 ↑ 让进度从 2 退回 1（因为 ↑ === seq[0]），但 seq[1] 是 ↑ → 第 4 键应是 ↓ 才对
    // 此时第 4 个键是 ArrowDown，匹配 seq[1]?? 不，seq[1]=ArrowUp。所以应不触发
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('完全错乱按键归零，正确序列接上也能触发', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fireSequence(['x', 'y', 'z']); // 全乱
    fireSequence(KONAMI_SEQUENCE);  // 重新走完整序列
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('在 input 内按完整序列不触发', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    for (const k of KONAMI_SEQUENCE) fire(k, {}, input);
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('在 textarea 内按完整序列不触发', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    for (const k of KONAMI_SEQUENCE) fire(k, {}, ta);
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('Ctrl+ArrowUp 不计入序列', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fire('ArrowUp', { ctrlKey: true });
    fireSequence(KONAMI_SEQUENCE.slice(1)); // 缺第一键
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('长按（e.repeat=true）不重复推进', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fire('ArrowUp', { repeat: true });
    fire('ArrowUp', { repeat: true });
    fire('ArrowUp', { repeat: true });
    fireSequence(['ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('enabled=false 时不挂监听', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock, { enabled: false }));
    fireSequence(KONAMI_SEQUENCE);
    expect(onUnlock).toHaveBeenCalledTimes(0);
  });

  it('解锁后归零，能再触发一次', () => {
    const onUnlock = vi.fn();
    renderHook(() => useKonamiCode(onUnlock));
    fireSequence(KONAMI_SEQUENCE);
    fireSequence(KONAMI_SEQUENCE);
    expect(onUnlock).toHaveBeenCalledTimes(2);
  });

  it('onUnlock 引用变化时 effect 不重新挂载（用 ref 透传）', () => {
    const onUnlock1 = vi.fn();
    const onUnlock2 = vi.fn();
    const { rerender } = renderHook(({ cb }) => useKonamiCode(cb), { initialProps: { cb: onUnlock1 } });
    rerender({ cb: onUnlock2 });
    fireSequence(KONAMI_SEQUENCE);
    expect(onUnlock1).toHaveBeenCalledTimes(0);
    expect(onUnlock2).toHaveBeenCalledTimes(1);
  });
});
