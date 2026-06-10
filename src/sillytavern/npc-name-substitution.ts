import type { NpcProfile } from '../types';

/**
 * 从 NPC profiles 构建 oldName → newName 替换映射。
 * 只包含有 aliases 且别名与当前名不同的条目。
 */
export function buildNameSubstitutions(profiles: Record<string, NpcProfile>): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of Object.values(profiles)) {
    if (!p.aliases?.length) continue;
    for (const alias of p.aliases) {
      const trimmed = alias.trim();
      if (trimmed && trimmed !== p.name.trim()) {
        map.set(trimmed, p.name.trim());
      }
    }
  }
  return map;
}

/**
 * 对文本做全局名称替换。按旧名长度从长到短排序（防止短名是长名的子串时误替换）。
 * subs 为空时直接返回原文本（零开销）。
 */
export function applyNameSubstitutions(text: string, subs: Map<string, string>): string {
  if (!text || subs.size === 0) return text;
  const sorted = [...subs.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = text;
  for (const [oldName, newName] of sorted) {
    result = result.split(oldName).join(newName);
  }
  return result;
}
