import { useCharSheetStore } from '../stores/useCharSheetStore';
import type { COC7Characteristic } from '../types';

const CHAR_ZH: Record<COC7Characteristic, string> = {
  STR: '力量', CON: '体质', POW: '意志', DEX: '敏捷', APP: '外貌', SIZ: '体型', INT: '智力', EDU: '教育',
};

/**
 * 调查员能力概览（属性 + 擅长技能 + 性格 + 当前姿态/状态）——注入 prompt，
 * 让 LLM 知道角色的强项与处境，从而生成贴合其能力与性格的行动选项。
 */
export function buildAbilityBrief(): string {
  const sheet = useCharSheetStore.getState().sheet;
  const order: COC7Characteristic[] = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'];
  const attrs = order.map((k) => `${CHAR_ZH[k]}${sheet.characteristics[k]}`).join('、');
  const topSkills = Object.entries(sheet.skills)
    .filter(([, s]) => s.current >= 50)
    .sort((a, b) => b[1].current - a[1].current)
    .slice(0, 10)
    .map(([name, s]) => `${name}${s.current}`);
  const skillStr = topSkills.length ? topSkills.join('、') : '无特别突出的专长';
  const parts = [`属性——${attrs}`, `擅长技能(技能值≥50)——${skillStr}`];
  if (sheet.personality?.trim()) parts.push(`性格——${sheet.personality.trim()}`);
  if (sheet.posture && sheet.posture !== '站立') parts.push(`当前姿态——${sheet.posture}`);
  if (sheet.statusConditions.length) parts.push(`当前状态——${sheet.statusConditions.map((c) => c.name).join('、')}`);
  return parts.join('；');
}

export function buildCharacterVariables(): Record<string, string> {
  const sheet = useCharSheetStore.getState().sheet;
  const chars = Object.entries(sheet.characteristics)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return {
    charName: sheet.identity.name,
    charOccupation: sheet.identity.occupation,
    charAge: String(sheet.identity.age),
    charGender: sheet.identity.gender,
    charCharacteristics: chars,
    charHP: `${sheet.secondary.hp.current}/${sheet.secondary.hp.max}`,
    charSAN: `${sheet.secondary.san.current}/${sheet.secondary.san.max}`,
    charMP: `${sheet.secondary.mp.current}/${sheet.secondary.mp.max}`,
    charLuck: String(sheet.secondary.luck),
    // ── Nested ZOD path entries ──
    '调查员.生命值.当前': String(sheet.secondary.hp.current),
    '调查员.生命值.最大': String(sheet.secondary.hp.max),
    '调查员.理智值.当前': String(sheet.secondary.san.current),
    '调查员.理智值.最大': String(sheet.secondary.san.max),
    '调查员.魔法值.当前': String(sheet.secondary.mp.current),
    '调查员.魔法值.最大': String(sheet.secondary.mp.max),
    '调查员.姓名': sheet.identity.name,
    '调查员.职业': sheet.identity.occupation,
    '调查员.年龄': String(sheet.identity.age),
    '调查员.性别': sheet.identity.gender,
    '调查员.幸运': String(sheet.secondary.luck),
    // ── Skill entries ──
    ...Object.fromEntries(
      Object.entries(sheet.skills).map(([name, skill]) => [
        `调查员.技能.${name}`,
        String(skill.current),
      ]),
    ),
    greeting: sheet.greeting || '',
    description: sheet.description || '',
    personality: sheet.personality || '',
    scenario: sheet.scenario || '',
    personaDescription: sheet.personaDescription || '',
  };
}
