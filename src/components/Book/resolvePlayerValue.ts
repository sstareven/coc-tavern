import type { CharacterSheet, COC7Characteristic } from '../../types';
import { ALL_SKILLS } from '../../sillytavern/coc-data';

const CHAR_MAP: Record<string, COC7Characteristic> = {
  '力量': 'STR', '体质': 'CON', '意志': 'POW', '敏捷': 'DEX',
  '外貌': 'APP', '体型': 'SIZ', '智力': 'INT', '教育': 'EDU',
};

export function resolvePlayerValue(
  name: string,
  sheet: CharacterSheet,
): { base: number; current: number } | null {
  const charKey = CHAR_MAP[name];
  if (charKey) {
    const val = sheet.characteristics[charKey];
    return { base: val, current: val };
  }
  // 副属性检定：幸运、理智(SAN) 存在于 secondary 而非 skills/characteristics，需单独映射
  // 否则会落到末尾 fallback 返回 {base:1, current:1}，导致目标值恒为 1
  if (name === '幸运' || name === '幸运值' || name === 'LUCK' || name === 'Luck') {
    const luck = sheet.secondary.luck;
    return { base: luck, current: luck };
  }
  if (name === '理智' || name === '理智值' || name === '理智检定' || name === 'SAN' || name === 'san') {
    const san = sheet.secondary.san;
    return { base: san.max, current: san.current };
  }
  const skill = sheet.skills[name];
  const def = ALL_SKILLS.find((s) => s.name === name);
  const base = typeof def?.base === 'number' ? def.base : 1;
  if (skill) return { base: skill.base ?? base, current: skill.current };
  return { base, current: base };
}