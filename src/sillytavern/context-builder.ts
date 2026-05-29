import { useBookStore } from '../stores/useBookStore';
import { useInventoryStore } from '../stores/useInventoryStore';

export function buildContextFromPages(): string {
  const { pages, pageIndex } = useBookStore.getState();
  const relevantPages = pages.slice(Math.max(0, pageIndex - 2), pageIndex + 1);
  let ctx = relevantPages
    .map((p) => {
      let section = `【${p.leftHeader}】${p.leftContent}\n【${p.rightHeader}】${p.rightContent}`;
      if (p.summary) section = `[摘要: ${p.summary}]\n${section}`;
      if (p.keywords) {
        const kwList = Object.keys(p.keywords).join(', ');
        if (kwList) section += `\n[关键词: ${kwList}]`;
      }
      if (p.diceResults && p.diceResults.length > 0) {
        section += `\n[检定记录: ${p.diceResults.map((d) => `${d.skill} d100=${d.roll}/${d.target} ${d.type}`).join('; ')}]`;
      }
      return section;
    })
    .join('\n\n');

  // Append current scene info as context for continuity
  const currentPage = pages[pageIndex];
  if (currentPage?.sceneInfo) {
    const si = currentPage.sceneInfo;
    ctx += `\n\n[当前场景: ${si.date} ${si.weekday} ${si.time} | 天气: ${si.weather} | 地点: ${si.location}]`;
  }

  const invSummary = useInventoryStore.getState().buildInventorySummary();
  if (invSummary) {
    ctx += `\n\n${invSummary}`;
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

export function computeNextRightPageNumber(): string {
  const { pages } = useBookStore.getState();
  // Right pages use even numbers: '— 2 —', '— 4 —', '— 6 —'
  const nextNum = pages.length * 2 + 2;
  return `— ${nextNum} —`;
}
