import { describe, it, expect } from 'vitest';
import { resolveActiveBooks, sortByInsertionStrategy } from './worldinfo-scope';
import type { LoreBook } from '../types';

const makeBook = (over: Partial<LoreBook> = {}): LoreBook => ({
  name: 'b', entries: {}, enabled: true, ...over,
});

describe('resolveActiveBooks', () => {
  it('includes global books regardless of session binding', () => {
    const books = { g: makeBook({ scope: 'global' }) };
    const r = resolveActiveBooks(books, [], false);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bookId: 'g', source: 'global' });
  });

  it('treats undefined scope as global', () => {
    const books = { g: makeBook({ scope: undefined }) };
    const r = resolveActiveBooks(books, [], false);
    expect(r).toHaveLength(1);
    expect(r[0].source).toBe('global');
  });

  it('includes chat books only when bound to the session', () => {
    const books = { c: makeBook({ scope: 'chat' }) };
    expect(resolveActiveBooks(books, [], false)).toHaveLength(0);
    const bound = resolveActiveBooks(books, ['c'], false);
    expect(bound).toHaveLength(1);
    expect(bound[0].source).toBe('chat');
  });

  it('excludes disabled books unless forceAll', () => {
    const books = { g: makeBook({ scope: 'global', enabled: false }) };
    expect(resolveActiveBooks(books, [], false)).toHaveLength(0);
    expect(resolveActiveBooks(books, [], true)).toHaveLength(1);
  });

  it('forceAll still respects chat binding requirement', () => {
    const books = { c: makeBook({ scope: 'chat', enabled: false }) };
    // forceAll bypasses enabled, but chat book still needs binding
    expect(resolveActiveBooks(books, [], true)).toHaveLength(0);
    expect(resolveActiveBooks(books, ['c'], true)).toHaveLength(1);
  });
});

describe('sortByInsertionStrategy', () => {
  const g1 = { priority: 10, _source: 'global' as const, id: 'g1' };
  const g2 = { priority: 30, _source: 'global' as const, id: 'g2' };
  const c1 = { priority: 20, _source: 'chat' as const, id: 'c1' };

  it('evenly sorts by priority descending, ignoring source', () => {
    const r = sortByInsertionStrategy([g1, c1, g2], 'evenly');
    expect(r.map((e) => e.id)).toEqual(['g2', 'c1', 'g1']);
  });

  it('global-first puts global entries before chat, priority within group', () => {
    const r = sortByInsertionStrategy([c1, g1, g2], 'global-first');
    expect(r.map((e) => e.id)).toEqual(['g2', 'g1', 'c1']);
  });

  it('chat-first puts chat entries before global', () => {
    const r = sortByInsertionStrategy([g2, c1, g1], 'chat-first');
    expect(r.map((e) => e.id)).toEqual(['c1', 'g2', 'g1']);
  });

  it('does not mutate the input array', () => {
    const input = [g1, g2];
    sortByInsertionStrategy(input, 'global-first');
    expect(input.map((e) => e.id)).toEqual(['g1', 'g2']);
  });
});
