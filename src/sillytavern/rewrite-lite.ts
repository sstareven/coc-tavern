import type { LoreEntry } from '../types';

/**
 * Lore buckets assembled by the chat pipeline, before they are merged into the
 * single `matchedLore` list that feeds prompt assembly.
 *
 * Each bucket is kept separate so the rewrite-lite filter can drop the expensive,
 * rewrite-irrelevant ones while preserving canonical ordering for the normal path.
 */
export interface LoreBuckets {
  /** Keyword-matched, probability-filtered world-info entries (per-turn varying). */
  matchedKeyword: LoreEntry[];
  /** Auto-summary recap entries (capped). */
  summary: LoreEntry[];
  /** Always-injected constant lore (author-designated, trigger-filtered upstream). */
  constant: LoreEntry[];
  /** Dark-thread / foreshadowing injection entries. */
  darkThread: LoreEntry[];
  /** GENERATE/INJECT loader entries. */
  generateInjects: LoreEntry[];
  /** Invert-compatibility disabled entries. */
  inverted: LoreEntry[];
}

export interface RewriteLoreOptions {
  /**
   * Lightweight rewrite mode. When true, drop summary / dark-thread / generate-inject /
   * inverted buckets (and keyword-matched lore unless {@link RewriteLoreOptions.liteIncludeMatchedLore}
   * is set), keeping only always-injected constant lore. The action-rewrite call only needs the
   * current scene (page context, supplied separately) + character vars + constant frame to produce
   * 4 candidate options — resending the full context just to generate options is pure token waste.
   */
  lite: boolean;
  /**
   * Within lite mode, also keep keyword-matched world-info. Defaults to false (max savings).
   * The single lever between "max savings" and "lore-aware" when options reference matched-only facts.
   */
  liteIncludeMatchedLore?: boolean;
}

/**
 * Select which lore buckets contribute to the final `matchedLore` list.
 *
 * Non-lite (`lite: false`): returns the full set in canonical order, byte-for-byte
 * equivalent to the inline assembly the chat pipeline performed before extraction —
 * keyword → summary → constant → darkThread → generateInjects → inverted.
 *
 * Lite (`lite: true`): keeps only constant lore (+ keyword-matched when
 * `liteIncludeMatchedLore`), dropping the rewrite-irrelevant, expensive buckets.
 */
export function selectLoreForRewrite(buckets: LoreBuckets, opts: RewriteLoreOptions): LoreEntry[] {
  if (!opts.lite) {
    return [
      ...buckets.matchedKeyword,
      ...buckets.summary,
      ...buckets.constant,
      ...buckets.darkThread,
      ...buckets.generateInjects,
      ...buckets.inverted,
    ];
  }
  const out: LoreEntry[] = [];
  if (opts.liteIncludeMatchedLore) out.push(...buckets.matchedKeyword);
  out.push(...buckets.constant);
  return out;
}

/**
 * The lore entries that lite mode DROPS relative to the full (non-lite) build — i.e. the set
 * difference (full \ lite). Used to report how many tokens the lightweight rewrite saves.
 * Returns [] when not in lite mode (nothing dropped).
 */
export function droppedLoreForRewrite(buckets: LoreBuckets, opts: RewriteLoreOptions): LoreEntry[] {
  if (!opts.lite) return [];
  const dropped: LoreEntry[] = [
    ...buckets.summary,
    ...buckets.darkThread,
    ...buckets.generateInjects,
    ...buckets.inverted,
  ];
  if (!opts.liteIncludeMatchedLore) dropped.push(...buckets.matchedKeyword);
  return dropped;
}
