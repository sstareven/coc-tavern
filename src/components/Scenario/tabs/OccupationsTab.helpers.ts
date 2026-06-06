// OccupationsTab 纯辅助函数 — 拆出独立文件以满足 react-refresh/only-export-components
// 与 fast-refresh 友好,同时给单测直接 import 使用。
import type { Occupation } from '../../../sillytavern/coc-data';

export const SKILL_SLOT_COUNT = 8;
export const MAX_OCCUPATIONS = 15;

// 空职业骨架:8 个空槽,信用 10-50
export function makeBlankOccupation(): Occupation {
  return {
    name: '新职业',
    crMin: 10,
    crMax: 50,
    skills: Array(SKILL_SLOT_COUNT).fill(''),
  };
}

// 给现有职业兜底成 8 个槽位(老存档可能不足 8)
export function normalizeSkills(skills: string[] | undefined): string[] {
  const arr = Array.isArray(skills) ? skills.slice(0, SKILL_SLOT_COUNT) : [];
  while (arr.length < SKILL_SLOT_COUNT) arr.push('');
  return arr;
}

// 双 name 去重(同 name 覆盖,异 name 追加) — 派生新数组,不变更入参
export function upsertByName(list: Occupation[], next: Occupation, prevName: string): Occupation[] {
  // prevName!=next.name → 视为重命名,先剔除旧名,再 upsert 新名
  const filtered = prevName !== next.name ? list.filter((o) => o.name !== prevName) : list;
  const idx = filtered.findIndex((o) => o.name === next.name);
  if (idx >= 0) {
    return filtered.map((o, i) => (i === idx ? next : o));
  }
  return [...filtered, next];
}
