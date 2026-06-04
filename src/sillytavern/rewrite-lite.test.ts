import { describe, it, expect } from 'vitest';
import { selectLoreForRewrite, droppedLoreForRewrite } from './rewrite-lite';
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
  anchor: [e('锚点')],
  generateInjects: [e('gen1')],
  inverted: [e('inv1', { disabled: true })],
});

describe('selectLoreForRewrite', () => {
  it('non-lite: returns the full set in canonical order (parity with normal build)', () => {
    const b = buckets();
    const out = selectLoreForRewrite(b, { lite: false });
    const names = out.map((x) => x.name);
    // canonical order: keyword → summary → constant → darkThread → anchor → generateInjects → inverted
    expect(names).toEqual(['kw1', 'kw2', 'sum1', 'const1', 'const2', 'dark1', '锚点', 'gen1', 'inv1']);
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

  it('非 lite：包含 anchor 桶', () => {
    const out = selectLoreForRewrite(buckets(), { lite: false });
    expect(out.some((e) => e.name === '锚点')).toBe(true);
  });

  it('lite：丢弃 anchor 桶', () => {
    const out = selectLoreForRewrite(buckets(), { lite: true });
    expect(out.some((e) => e.name === '锚点')).toBe(false);
    expect(droppedLoreForRewrite(buckets(), { lite: true }).some((e) => e.name === '锚点')).toBe(true);
  });
});

describe('droppedLoreForRewrite', () => {
  it('non-lite: drops nothing', () => {
    expect(droppedLoreForRewrite(buckets(), { lite: false })).toEqual([]);
  });

  it('lite (max savings): drops summary/dark/generate/inverted/keyword', () => {
    const out = droppedLoreForRewrite(buckets(), { lite: true });
    expect(out.map((x) => x.name).sort()).toEqual(['dark1', 'gen1', 'inv1', 'kw1', 'kw2', 'sum1', '锚点'].sort());
  });

  it('lite + liteIncludeMatchedLore: keeps keyword (does NOT drop it)', () => {
    const out = droppedLoreForRewrite(buckets(), { lite: true, liteIncludeMatchedLore: true });
    expect(out.map((x) => x.name).sort()).toEqual(['dark1', 'gen1', 'inv1', 'sum1', '锚点'].sort());
  });

  it('invariant: kept + dropped = full set (no entry lost or duplicated)', () => {
    const b = buckets();
    const opts = { lite: true } as const;
    const kept = selectLoreForRewrite(b, opts);
    const dropped = droppedLoreForRewrite(b, opts);
    const full = selectLoreForRewrite(b, { lite: false });
    expect((kept.length + dropped.length)).toBe(full.length);
    expect([...kept, ...dropped].map((x) => x.name).sort()).toEqual(full.map((x) => x.name).sort());
  });
});
