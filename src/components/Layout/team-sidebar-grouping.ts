import type { NpcProfile } from '../../types';

export interface PartyGrouping {
  /** 已入队：isPresent && inParty */
  party: NpcProfile[];
  /** 在场非队：isPresent && !inParty */
  presentOutside: NpcProfile[];
}

/** 把 NPC 名册按"在场+入队"二维状态拆成两组。
 *  - 已入队 = isPresent && inParty(显式队员,TeamSidebar 主列表显示)
 *  - 在场非队 = isPresent && !inParty(同场陌生人/中立 NPC,折叠段显示+【邀请入队】按钮)
 *  - 缺席 NPC(isPresent=false)两组都不进。
 *  纯函数,无副作用,可单测。 */
export function groupNpcsByParty(npcs: NpcProfile[]): PartyGrouping {
  const party: NpcProfile[] = [];
  const presentOutside: NpcProfile[] = [];
  for (const n of npcs) {
    if (!n.isPresent) continue;
    if (n.inParty === true) party.push(n);
    else presentOutside.push(n);
  }
  const cmp = (a: NpcProfile, b: NpcProfile) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  party.sort(cmp);
  presentOutside.sort(cmp);
  return { party, presentOutside };
}
