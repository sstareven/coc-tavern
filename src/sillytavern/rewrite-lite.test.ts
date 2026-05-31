import { describe, it, expect } from 'vitest';
import { selectLoreForRewrite } from './rewrite-lite';
import type { LoreEntry } from '../types';

const BASE: LoreEntry = {
  name: 'e', keys: '', content: '', logic: 'AND_ANY', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
  groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
  groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
  preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
  ignoreReplyLimit: false,
};
const e = (name: string, o: Partial<LoreEntry> = {}): LoreEntry => ({ ...BASE, name, ...o });

const buckets = () => ({
  matchedKeyword: [e('kw1'), e('kw2')],
  summary: [e('sum1')],
  constant: [e('const1'), e('const2')],
  darkThread: [e('dark1', { constant: true })],
  generateInjects: [e('gen1')],
  inverted: [e('inv1', { disabled: true })],
});

describe('selectLoreForRewrite', () => {
  it('non-lite: returns the full set in canonical order (parity with normal build)', () => {
    const b = buckets();
    const out = selectLoreForRewrite(b, { lite: false });
    const names = out.map((x) => x.name);
    // canonical order: keyword → summary → constant → darkThread → generateInjects → inverted
    expect(names).toEqual(['kw1', 'kw2', 'sum1', 'const1', 'const2', 'dark1', 'gen1', 'inv1']);
  });

  it('lite: returns ONLY constant entries (drops summary/dark/generate/inverted/keyword)', () => {
    const b = buckets();
    const out = selectLoreForRewrite(b, { lite: true });
    expect(out.map((x) => x.name)).toEqual(['const1', 'const2']);
  });

  it('lite + liteIncludeMatchedLore: keeps keyword-matched lore + constants, still drops the rest', () => {
    const b = buckets();
    const out = selectLoreForRewrite(b, { lite: true, liteIncludeMatchedLore: true });
    expect(out.map((x) => x.name)).toEqual(['kw1', 'kw2', 'const1', 'const2']);
  });

  it('lite: empty buckets → empty output (no crash)', () => {
    const out = selectLoreForRewrite(
      { matchedKeyword: [], summary: [], constant: [], darkThread: [], generateInjects: [], inverted: [] },
      { lite: true },
    );
    expect(out).toEqual([]);
  });
});
