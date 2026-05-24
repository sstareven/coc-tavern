import type { LoreBook, LoreEntry } from '../types';

export function matchLorebooks(input: string, books: LoreBook[]): Array<{ book: string; entry: LoreEntry }> {
  const results: Array<{ book: string; entry: LoreEntry }> = [];
  for (const book of books) {
    for (const [id, entry] of Object.entries(book.entries)) {
      const keys = entry.keys.split(',').map(k => k.trim().toLowerCase());
      const inputLower = input.toLowerCase();
      const matches = entry.logic === 'AND'
        ? keys.every(k => inputLower.includes(k))
        : keys.some(k => inputLower.includes(k));
      if (matches) results.push({ book: book.name, entry });
    }
  }
  results.sort((a, b) => b.entry.priority - a.entry.priority);
  return results;
}
