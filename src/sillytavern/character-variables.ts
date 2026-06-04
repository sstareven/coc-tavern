import { useCharSheetStore } from '../stores/useCharSheetStore';
import type { COC7Characteristic } from '../types';

const CHAR_ZH: Record<COC7Characteristic, string> = {
  STR: '力量', CON: '体质', POW: '意志', DEX: '敏捷', APP: '外貌', SIZ: '体型', INT: '智力', EDU: '教育',
};

/**
 * 把 0-100 的属性值映射成 5 档定性描述。
 * 避免把"力量50"这种具体数字注入 prompt——LLM 看到数值会照搬进角色内心独白("我心想：力量50…")，
 * 极度脱戏。改用定性等级，LLM 仍能据此判断强项弱项，但叙事中不会蹦出数字。
 */
function qualitativeAttr(v: number): string {
  if (v >= 90) return '极高';
  if (v >= 70) return '高';
  if (v >= 50) return '中等';
  if (v >= 30) return '中下';
  return '低';
}

/**
 * 技能值定性等级（≥50 才算"擅长"，对应 COC7e 普通成功阈值起点）：
 * 90+「登峰造极」、75-89「炉火纯青」、60-74「颇为熟练」、50-59「略通门径」。
 */
function qualitativeSkill(v: number): string {
  if (v >= 90) return '登峰造极';
  if (v >= 75) return '炉火纯青';
  if (v >= 60) return '颇为熟练';
  return '略通门径';
}

/**
 * 调查员能力概览（属性 + 擅长技能 + 性格 + 当前姿态/状态）——注入 prompt，
 * 让 LLM 知道角色的强项与处境，从而生成贴合其能力与性格的行动选项。
 *
 * 【脱戏防护】2026-06-04 修复：把属性/技能值改为定性等级输出。曾出现过 LLM 把"医学85"
 * 这种数值直接写进 leftContent 的角色内心独白("我心想：医学85，够我判断…")，破坏沉浸感。
 * 数值仅在 charVars / mvu_var_list 等机制位置仍保留(用于 JSONPatch 计算)，叙事面不再暴露。
 */
export function buildAbilityBrief(): string {
  const sheet = useCharSheetStore.getState().sheet;
  const order: COC7Characteristic[] = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'];
  const attrs = order.map((k) => `${CHAR_ZH[k]}${qualitativeAttr(sheet.characteristics[k])}`).join('、');
  const topSkills = Object.entries(sheet.skills)
    .filter(([, s]) => s.current >= 50)
    .sort((a, b) => b[1].current - a[1].current)
    .slice(0, 10)
    .map(([name, s]) => `${name}(${qualitativeSkill(s.current)})`);
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
