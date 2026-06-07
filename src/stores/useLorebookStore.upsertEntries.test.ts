import { describe, it, expect, beforeEach } from 'vitest';
import { useLorebookStore } from './useLorebookStore';
import type { LoreEntry } from '../types';

function makeEntry(name: string): LoreEntry {
  return {
    name, keys: '', content: '', logic: 'AND_ANY', priority: 10,
    disabled: false, constant: false, position: 0, depth: 0, probability: 100,
    secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
    groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
    groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
    preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
    ignoreReplyLimit: false,
  };
}

describe('useLorebookStore.upsertEntries', () => {
  const BOOK_ID = '__test_scenario_relentries';

  beforeEach(() => {
    useLorebookStore.setState({
      books: {
        [BOOK_ID]: {
          name: '测试本',
          enabled: true,
          entries: {
            scn_main: makeEntry('主条目'),
            rel_old1: makeEntry('旧关系1'),
            rel_old2: makeEntry('旧关系2'),
          },
        },
      },
    });
  });

  it('按前缀替换：保留主条目，清掉旧 rel_*，写入新 rel_*', () => {
    useLorebookStore.getState().upsertEntries(
      BOOK_ID,
      {
        rel_a: makeEntry('新关系A'),
        rel_b: makeEntry('新关系B'),
      },
      { prefix: 'rel_' },
    );
    const entries = useLorebookStore.getState().books[BOOK_ID].entries;
    expect(entries.scn_main.name).toBe('主条目');
    expect(entries.rel_old1).toBeUndefined();
    expect(entries.rel_old2).toBeUndefined();
    expect(entries.rel_a.name).toBe('新关系A');
    expect(entries.rel_b.name).toBe('新关系B');
  });

  it('book 不存在时静默跳过', () => {
    useLorebookStore.getState().upsertEntries(
      '__not_exist',
      { rel_a: makeEntry('A') },
      { prefix: 'rel_' },
    );
    expect(useLorebookStore.getState().books['__not_exist']).toBeUndefined();
  });

  it('空 entries + prefix：仅清除旧 rel_* 不写新条目', () => {
    useLorebookStore.getState().upsertEntries(BOOK_ID, {}, { prefix: 'rel_' });
    const entries = useLorebookStore.getState().books[BOOK_ID].entries;
    expect(entries.scn_main).toBeDefined();
    expect(entries.rel_old1).toBeUndefined();
    expect(entries.rel_old2).toBeUndefined();
  });
});
