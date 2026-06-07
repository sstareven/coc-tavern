// 选角预览 — 把 ScenarioCharacter 派生为玩家可见的 view model。
// HARD CONTRACT: never read char.npcAttrs.hiddenBio in this file.
//   hiddenBio 是守秘人/反派/卧底身份机密，玩家选角预览展示会剧透。
//   relations 里 target 是 locked_npc 时仍可显示其姓名/关系，但本期 v1 直接信任作者写的 note。

import type { ScenarioCharacter, ScenarioDoc, RelationType } from '../types/scenario';
import type { COC7Characteristic } from '../types';

const CHAR_ORDER: COC7Characteristic[] = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];
const CHAR_LABELS: Record<COC7Characteristic, string> = {
  STR: '力量', CON: '体质', POW: '意志', DEX: '敏捷',
  APP: '外貌', SIZ: '体型', INT: '智力', EDU: '教育',
};

const RELATION_LABELS: Record<RelationType, string> = {
  family: '亲属',
  lover: '恋人',
  friend: '朋友',
  colleague: '同事',
  mentor: '师徒',
  rival: '竞争对手',
  enemy: '敌人',
  acquaintance: '点头之交',
};

export interface PreviewRelation {
  targetId: string;
  targetName: string;
  targetOccupation: string;
  typeLabel: string;
  note?: string;
}

export interface CharacterPreviewVM {
  name: string;
  occupation: string;
  ageGenderResidence: string;
  roleHint: '推荐主角' | '配角视角' | '你的角色';
  chars: Array<{ key: COC7Characteristic; label: string; value: number }>;
  vitals: { hpMax: number; sanMax: number; mpMax: number };
  topSkills: Array<{ name: string; value: number }>;
  publicBio: string;
  description: string;   // 外貌/气质（npcAttrs.description）
  traits: string;        // 行为/性格细节（npcAttrs.traits）
  itemsRaw: string;      // 随身物品自由文本（未拆分）
  // 折叠区（B 档）
  beliefs?: string;
  significantPeople?: string;
  meaningfulLocations?: string;
  treasuredPossessions?: string;
  injuries?: string;
  backgroundFears?: string;
  relations: PreviewRelation[];
}

export function buildCharacterPreviewVM(char: ScenarioCharacter, scn: ScenarioDoc): CharacterPreviewVM {
  const sheet = char.sheet;
  const id = sheet.identity;
  const sec = sheet.secondary;
  const npc = char.npcAttrs;

  const roleHint = char.role === 'protagonist' ? '推荐主角' as const
    : char.role === 'optional' ? '配角视角' as const
    : '你的角色' as const;

  const chars = CHAR_ORDER.map((k) => ({
    key: k,
    label: CHAR_LABELS[k],
    value: sheet.characteristics[k] ?? 50,
  }));

  // Top 6 技能 — 取 current 倒序；克苏鲁神话作元知识不列在「擅长」榜（剧透）
  const topSkills = Object.entries(sheet.skills)
    .map(([name, s]) => ({ name, value: s.current }))
    .filter((s) => s.name !== '克苏鲁神话')
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const ageGenderResidence = [
    id.age ? `${id.age}岁` : '',
    id.gender,
    id.residence,
  ].filter(Boolean).join(' · ');

  const relations: PreviewRelation[] = [];
  for (const r of char.relations ?? []) {
    const target = scn.characters.find((c) => c.id === r.targetId);
    if (!target) continue;
    relations.push({
      targetId: target.id,
      targetName: target.sheet?.identity?.name || target.npcAttrs.identityTag || '未命名',
      targetOccupation: target.sheet?.identity?.occupation || '',
      typeLabel: RELATION_LABELS[r.type] ?? '未知',
      note: r.note,
    });
  }

  return {
    name: id.name || npc.identityTag || '未命名',
    occupation: id.occupation || '',
    ageGenderResidence,
    roleHint,
    chars,
    vitals: { hpMax: sec.hp.max, sanMax: sec.san.max, mpMax: sec.mp.max },
    topSkills,
    publicBio: npc.publicBio || '',
    description: npc.description || '',
    traits: npc.traits || '',
    itemsRaw: npc.initialItemsRaw || '',
    beliefs: npc.beliefs,
    significantPeople: npc.significantPeople,
    meaningfulLocations: npc.meaningfulLocations,
    treasuredPossessions: npc.treasuredPossessions,
    injuries: npc.injuries,
    backgroundFears: npc.backgroundFears,
    relations,
  };
}
