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
  /** 外观/个人描述 — 会作为 sheet.description 的【个人描述】段 */
  description: string;
  personality?: string;
  initialItemsRaw?: string;
  /** 与玩家角色卡 8 字段对齐;缺省时用 CharCreator 同款占位文案
   *  填后 sheet.description 拼成 8 段 markdown 风格,NpcOverlay「背景故事」段直接显示 */
  beliefs?: string;
  significantPeople?: string;
  meaningfulLocations?: string;
  treasuredPossessions?: string;
  traits?: string;
  injuries?: string;
  backgroundFears?: string;
  /** NPC 属性,玩家可见 + 仅编辑模式可见 */
  identityTag: string;
  attitudeDefault: number;
  relationshipDefault: string;
  locationDefault: string;
  publicBio: string;
  hiddenBio: string;
  /** 默认 'optional'(玩家可选配角);要锁定不可玩传 'locked_npc';强推主角传 'protagonist' */
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

function buildCharSheetDescription(input: MakeNpcInput): string {
  // 与 CharCreator handleConfirm 同款 8 段 markdown 风格(占位文案保持文学统一)。
  // 玩家在 NpcOverlay「背景故事」段看到结构化档案,与自己角色卡一致。
  const parts: string[] = [];
  parts.push(`【个人描述】\n${input.description?.trim() || '此人的过往如同被墨水浸染的旧档案，所有记录都已模糊不清。'}`);
  parts.push(`【思想/信念】\n${input.beliefs?.trim() || '信念栏是空白的——或许什么都不相信，又或许信念过于危险，不宜写下。'}`);
  parts.push(`【重要之人】\n${input.significantPeople?.trim() || '没有任何人被列为重要联系人。这意味着孤独，或者意味着保护。'}`);
  parts.push(`【重要场所】\n${input.meaningfulLocations?.trim() || '档案中未记录任何意义非凡之地。也许那些地方已经不复存在了。'}`);
  parts.push(`【珍贵之物】\n${input.treasuredPossessions?.trim() || '此人似乎没有任何牵挂之物——或者说，那些珍贵的东西早已失去。'}`);
  parts.push(`【特质】\n${input.traits?.trim() || '沉默寡言，行踪不定。'}`);
  parts.push(`【伤口/伤痕】\n${input.injuries?.trim() || '表面上看不出明显伤痕，但谁知道衣领下藏着什么。'}`);
  parts.push(`【恐惧症/狂躁症】\n${input.backgroundFears?.trim() || '未记录在案。但每个调查员都有不愿面对的东西。'}`);
  return parts.join('\n\n');
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
    description: buildCharSheetDescription(input),
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
    role: input.role ?? 'optional',
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
