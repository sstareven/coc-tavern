import { describe, it, expect, beforeEach } from 'vitest';
import { useNarrationStore } from './useNarrationStore';

describe('useNarrationStore', () => {
  beforeEach(() => {
    useNarrationStore.getState().clearPending();
  });

  it('append 后 drainPending 返回累积并清空', () => {
    const s = useNarrationStore.getState();
    s.append('A 因与 B 反目，离队而去。');
    s.append('C 抛下队伍，独自走入夜色。');
    expect(useNarrationStore.getState().pending).toEqual([
      'A 因与 B 反目，离队而去。',
      'C 抛下队伍，独自走入夜色。',
    ]);
    const drained = useNarrationStore.getState().drainPending();
    expect(drained).toEqual([
      'A 因与 B 反目，离队而去。',
      'C 抛下队伍，独自走入夜色。',
    ]);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });

  it('drainPending 在空 pending 时返回空数组', () => {
    expect(useNarrationStore.getState().drainPending()).toEqual([]);
  });

  it('clearPending 把 pending 清空', () => {
    useNarrationStore.getState().append('test');
    useNarrationStore.getState().clearPending();
    expect(useNarrationStore.getState().pending).toEqual([]);
  });
});
