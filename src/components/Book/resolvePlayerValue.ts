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
  const skill = sheet.skills[name];
  const def = ALL_SKILLS.find((s) => s.name === name);
  const base = typeof def?.base === 'number' ? def.base : 1;
  if (skill) return { base: skill.base ?? base, current: skill.current };
  return { base, current: base };
}