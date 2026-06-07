// Pure roster grouping for RosterPicker — React 只渲染，分组排序在这。
// 三段：protagonists / optionals / userCreated；都保留 scn.characters 原序 idx，
// userCreated 按 createdAt 倒序（新建的卡排前面）；locked_npc 不出现在任何一段。
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';

export interface RosterRow {
  c: ScenarioCharacter;
  idx: number;
}

export interface GroupedRoster {
  protagonists: RosterRow[];
  optionals: RosterRow[];
  userCreated: RosterRow[];
}

export function groupRoster(scn: ScenarioDoc | undefined): GroupedRoster {
  if (!scn) return { protagonists: [], optionals: [], userCreated: [] };
  const indexed: RosterRow[] = scn.characters.map((c, idx) => ({ c, idx }));
  return {
    protagonists: indexed.filter(({ c }) => c.role === 'protagonist'),
    optionals: indexed.filter(({ c }) => c.role === 'optional'),
    userCreated: indexed
      .filter(({ c }) => c.role === 'player_created')
      .sort((a, b) => (b.c.createdAt ?? 0) - (a.c.createdAt ?? 0)),
  };
}
