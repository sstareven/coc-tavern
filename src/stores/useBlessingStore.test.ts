import { describe, it, expect, beforeEach } from 'vitest';
import { useBlessingStore } from './useBlessingStore';

describe('useBlessingStore', () => {
  beforeEach(() => {
    useBlessingStore.getState().clearPending();
  });

  it('starts with null pending', () => {
    expect(useBlessingStore.getState().pending).toBeNull();
  });

  it('setPending stores data', () => {
    const data = { expr: '1D6', label: 'test', inputText: '', resolve: () => {}, cancel: () => {} };
    useBlessingStore.getState().setPending(data);
    expect(useBlessingStore.getState().pending).toMatchObject({ expr: '1D6', label: 'test', inputText: '' });
  });

  it('clearPending resets to null', () => {
    useBlessingStore.getState().setPending({ expr: '1D6', label: 't', inputText: '', resolve: () => {}, cancel: () => {} });
    useBlessingStore.getState().clearPending();
    expect(useBlessingStore.getState().pending).toBeNull();
  });

  it('setPending replaces previous value', () => {
    const a = { expr: '1D4', label: 'a', inputText: '', resolve: () => {}, cancel: () => {} };
    const b = { expr: '2D6', label: 'b', inputText: '', resolve: () => {}, cancel: () => {} };
    useBlessingStore.getState().setPending(a);
    useBlessingStore.getState().setPending(b);
    expect(useBlessingStore.getState().pending?.expr).toBe('2D6');
  });
});
