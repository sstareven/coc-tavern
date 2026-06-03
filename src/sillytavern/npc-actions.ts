import type { ManeuverKind } from '../types';

/**
 * 对【在场 NPC】可发起的行动目录（可扩展）。
 * - kind:'combat' → 进战斗：attack=普通攻击；maneuver 字段=COC7e 战技（缴械/擒抱/推倒/击晕）。
 * - kind:'check'  → 走「检定+提交」主管线（社交/调查/医疗/快速交谈/偷窃），skill 为治理技能。
 */
export interface NpcAction {
  id: string;
  /** 菜单显示名（玩家视角动作） */
  label: string;
  group: '快捷' | '社交' | '调查' | '战技' | '医疗';
  kind: 'combat' | 'check';
  /** check 动作对应的 COC 治理技能名 */
  skill?: string;
  /** 检定难度（缺省=普通） */
  difficulty?: '普通' | '困难' | '极难';
  /** combat 战技对应的 ManeuverKind（普通攻击为 undefined） */
  maneuver?: ManeuverKind;
}

export const NPC_ACTIONS: NpcAction[] = [
  // —— 快捷 ——
  { id: 'attack', label: '攻击', group: '快捷', kind: 'combat' },
  { id: 'talk', label: '快速交谈', group: '快捷', kind: 'check', skill: '话术' },
  { id: 'steal', label: '偷窃', group: '快捷', kind: 'check', skill: '妙手' },
  // —— 社交 ——
  { id: 'persuade', label: '说服', group: '社交', kind: 'check', skill: '说服' },
  { id: 'charm', label: '取悦', group: '社交', kind: 'check', skill: '取悦' },
  { id: 'intimidate', label: '恐吓', group: '社交', kind: 'check', skill: '恐吓' },
  { id: 'psychology', label: '读心', group: '社交', kind: 'check', skill: '心理学' },
  { id: 'psychoanalysis', label: '安抚', group: '社交', kind: 'check', skill: '精神分析' },
  // —— 调查 ——
  { id: 'spot', label: '观察', group: '调查', kind: 'check', skill: '侦查' },
  { id: 'listen', label: '聆听', group: '调查', kind: 'check', skill: '聆听' },
  { id: 'sneak', label: '尾随', group: '调查', kind: 'check', skill: '潜行' },
  // —— 战技（进战斗，COC7e 6.3）——
  { id: 'grapple', label: '擒抱', group: '战技', kind: 'combat', maneuver: 'grapple' },
  { id: 'disarm', label: '缴械', group: '战技', kind: 'combat', maneuver: 'disarm' },
  { id: 'shove', label: '推倒', group: '战技', kind: 'combat', maneuver: 'shove' },
  { id: 'knockout', label: '击晕', group: '战技', kind: 'combat', maneuver: 'knockout' },
  // —— 医疗 ——
  { id: 'firstaid', label: '急救', group: '医疗', kind: 'check', skill: '急救' },
  { id: 'medicine', label: '施救', group: '医疗', kind: 'check', skill: '医学' },
];

/** 「更多▾」展开时的分组顺序（快捷行单列，不在此）。 */
export const NPC_ACTION_GROUPS: NpcAction['group'][] = ['社交', '调查', '战技', '医疗'];

/** 快捷行动作（攻击/快速交谈/偷窃）。 */
export const NPC_QUICK_ACTIONS: NpcAction[] = NPC_ACTIONS.filter((a) => a.group === '快捷');

export function npcActionsByGroup(group: NpcAction['group']): NpcAction[] {
  return NPC_ACTIONS.filter((a) => a.group === group);
}
