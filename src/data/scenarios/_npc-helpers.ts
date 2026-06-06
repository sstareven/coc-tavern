// 剧本 NPC 辅助函数 — 极简地生成 ScenarioCharacter
// 调用方只填关键字段(name/age/occupation/八围/技能/角色 attrs),其他由 helper 兜底
import type { CharacterSheet, COC7Characteristic } from '../../types';
import type { ScenarioCharacter } from '../../types/scenario';
import { deriveSecondaryStats } from '../../sillytavern/coc-rules';

interface MakeNpcInput {
  id: string;
  name: string;
  age: number;
  gender: string;
  occupation: string;
  birthplace?: string;
  residence?: string;
  /** 八围, 缺省按 50/50/... 兜底 */
  chars: Partial<Record<COC7Characteristic, number>>;
  /** 仅记关键技能, base/current 同值即可(简化) */
  skills?: Record<string, number>;
  description: string;
  personality?: string;
  initialItemsRaw?: string;
  /** NPC 属性,玩家可见 + 仅编辑模式可见 */
  identityTag: string;
  attitudeDefault: number;
  relationshipDefault: string;
  locationDefault: string;
  publicBio: string;
  hiddenBio: string;
  /** 默认 'npc_only';若想让玩家可扮演,传 'protagonist_candidate' */
  role?: ScenarioCharacter['role'];
}

const DEFAULT_CHARS: Record<COC7Characteristic, number> = {
  STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50,
};

function buildHalfFifth(chars: Record<COC7Characteristic, number>) {
  const out = {} as Record<COC7Characteristic, { half: number; fifth: number }>;
  for (const k of Object.keys(chars) as COC7Characteristic[]) {
    out[k] = { half: Math.floor(chars[k] / 2), fifth: Math.floor(chars[k] / 5) };
  }
  return out;
}

export function makeNpc(input: MakeNpcInput): ScenarioCharacter {
  const chars: Record<COC7Characteristic, number> = { ...DEFAULT_CHARS, ...input.chars } as Record<COC7Characteristic, number>;
  const { hpMax, sanMax, mpMax, db, build } = deriveSecondaryStats(chars);
  const skills: Record<string, { base: number; current: number }> = {};
  for (const [name, v] of Object.entries(input.skills ?? {})) {
    skills[name] = { base: v, current: v };
  }
  const sheet: CharacterSheet = {
    characteristics: chars,
    halfFifth: buildHalfFifth(chars),
    secondary: {
      hp: { current: hpMax, max: hpMax },
      san: { current: sanMax, max: sanMax },
      mp: { current: mpMax, max: mpMax },
      luck: 50,
      mov: 8,
      db,
      build,
    },
    skills,
    identity: {
      name: input.name,
      occupation: input.occupation,
      age: input.age,
      gender: input.gender,
      birthplace: input.birthplace ?? '',
      residence: input.residence ?? '',
      id: input.id,
    },
    greeting: '',
    description: input.description,
    personality: input.personality ?? '',
    scenario: '',
    personaDescription: '',
    posture: '站立',
    statusConditions: [],
    dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false,
    phobias: [],
    manias: [],
    known_spells: [],
    recovery: {},
    initialItemsRaw: input.initialItemsRaw ?? '',
  };
  return {
    id: input.id,
    role: input.role ?? 'npc_only',
    sheet,
    npcAttrs: {
      identityTag: input.identityTag,
      attitudeDefault: input.attitudeDefault,
      relationshipDefault: input.relationshipDefault,
      locationDefault: input.locationDefault,
      publicBio: input.publicBio,
      hiddenBio: input.hiddenBio,
    },
  };
}
