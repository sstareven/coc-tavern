import type { LoreBook } from '../types';

export type WorldInfoSource = 'global' | 'chat';
export type InsertionStrategy = 'evenly' | 'global-first' | 'chat-first';

export interface ScopedBook {
  bookId: string;
  book: LoreBook;
  source: WorldInfoSource;
}

/**
 * 解析当前生效的世界书集合并打来源标记。
 * - global 书（scope 缺省即 global）：enabled（或 forceAll）即入选
 * - chat 书：enabled 且 bookId ∈ sessionLorebookIds 才入选
 */
export function resolveActiveBooks(
  books: Record<string, LoreBook>,
  sessionLorebookIds: string[],
  forceAll: boolean,
): ScopedBook[] {
  const result: ScopedBook[] = [];
  for (const [bookId, book] of Object.entries(books)) {
    if (!forceAll && book.enabled === false) continue;
    const scope = book.scope ?? 'global';
    if (scope === 'chat') {
      if (!sessionLorebookIds.includes(bookId)) continue;
      result.push({ bookId, book, source: 'chat' });
    } else {
      result.push({ bookId, book, source: 'global' });
    }
  }
  return result;
}

/**
 * 在同一 position 组内按插入策略排序。
 * - global-first：global 来源在前；chat-first：chat 来源在前；evenly：不按来源
 * - 组内按 priority 降序（沿用现有约定）
 */
export function sortByInsertionStrategy<T extends { priority: number; _source?: WorldInfoSource }>(
  entries: T[],
  strategy: InsertionStrategy,
): T[] {
  const sourceRank = (e: T): number => {
    if (strategy === 'global-first') return e._source === 'global' ? 0 : 1;
    if (strategy === 'chat-first') return e._source === 'chat' ? 0 : 1;
    return 0; // evenly — 不按来源分组
  };
  return [...entries].sort(
    (a, b) => sourceRank(a) - sourceRank(b) || (b.priority ?? 0) - (a.priority ?? 0),
  );
}
