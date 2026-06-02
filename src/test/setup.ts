import 'fake-indexeddb/auto';

// Node 测试环境无 requestAnimationFrame——用 setTimeout 兜底，使依赖 rAF 的翻页逻辑可测。
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number);
  globalThis.cancelAnimationFrame = ((id: number): void => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => { store.set(key, value); },
    removeItem: (key: string): void => { store.delete(key); },
    clear: (): void => { store.clear(); },
  },
  writable: true,
  configurable: true,
});
