import type { AnchorNode } from '../types';

/** 按顺序找第一个 title 在所有 recentSummaries 里都没出现过的节点,返回它的 title。
 *  全部已涵盖 → 返回最后一节点 title(防 LLM 拿到空串);nodes 空 → 返回 ''。
 *  纯函数,无 store/网络依赖,可独立单测。 */
export function pickNextUnreachedNode(nodes: AnchorNode[], recentSummaries: string[]): string {
  if (nodes.length === 0) return '';
  const joined = recentSummaries.join('\n');
  for (const n of nodes) {
    if (!joined.includes(n.title)) return n.title;
  }
  return nodes[nodes.length - 1].title;
}
