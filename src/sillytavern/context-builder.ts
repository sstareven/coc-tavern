import { useBookStore } from '../stores/useBookStore';

export function buildContextFromPages(): string {
  const { pages, pageIndex } = useBookStore.getState();
  const relevantPages = pages.slice(Math.max(0, pageIndex - 2), pageIndex + 1);
  let ctx = relevantPages
    .map((p) => `【${p.leftHeader}】${p.leftContent}\n【${p.rightHeader}】${p.rightContent}`)
    .join('\n\n');

  // Append current scene info as context for continuity
  const currentPage = pages[pageIndex];
  if (currentPage?.sceneInfo) {
    const si = currentPage.sceneInfo;
    ctx += `\n\n[当前场景: ${si.date} ${si.weekday} ${si.time} | 天气: ${si.weather} | 地点: ${si.location}]`;
  }
  return ctx;
}

export function computeNextPageNumber(): string {
  const { pages } = useBookStore.getState();
  // Existing pages use odd numbers like '— 3 —', '— 5 —'
  // Calculate next odd number based on total pages
  const nextNum = pages.length * 2 + 1;
  return `— ${nextNum} —`;
}
