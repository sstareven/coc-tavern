import type { CharacterSheet, COC7Characteristic } from '../../types';
import { ALL_SKILLS, SKILL_ALIASES } from '../../sillytavern/coc-data';

const CHAR_MAP: Record<string, COC7Characteristic> = {
  '力量': 'STR', '体质': 'CON', '意志': 'POW', '敏捷': 'DEX',
  '外貌': 'APP', '体型': 'SIZ', '智力': 'INT', '教育': 'EDU',
};

// COC 属性/副属性英文代码 → 中文名：LLM 偶尔直接用 INT/STR/LUCK 等英文代码发起检定，
// 若不归一，既显示成英文（不符期待），又因 resolvePlayerValue 只认中文而落到 fallback(目标值=1)。
// 统一在解析检定时归一为中文，显示与取值都正确。
const CHAR_EN_TO_ZH: Record<string, string> = {
  STR: '力量', CON: '体质', POW: '意志', DEX: '敏捷',
  APP: '外貌', SIZ: '体型', INT: '智力', EDU: '教育',
  LUCK: '幸运', SAN: '理智',
};

/** 把检定技能名归一：英文属性代码(INT/STR/…)→中文名；其余原样返回。 */
export function normalizeSkillName(raw: string): string {
  const t = raw.trim();
  return CHAR_EN_TO_ZH[t.toUpperCase()] ?? t;
}

export function resolvePlayerValue(
  rawName: string,
  sheet: CharacterSheet,
): { base: number; current: number } | null {
  const trimmed = rawName.trim().replace(/（/g, '(').replace(/）/g, ')');
  const name = SKILL_ALIASES[trimmed] ?? trimmed;
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
  let skill = sheet.skills[name];
  // 专精技能容错：查询「科学(生物学)」但卡里只存了裸「科学」，或反之（裸名查到唯一同前缀专精）。
  // 防止 key 形态不一致(专精↔裸名)时 miss → 退回 base 1。
  if (!skill) {
    const bare = name.replace(/\(.*\)$/, '');
    if (bare !== name && sheet.skills[bare]) {
      skill = sheet.skills[bare];
    } else {
      const hits = Object.keys(sheet.skills).filter((k) => k === bare || k.startsWith(bare + '('));
      if (hits.length === 1) skill = sheet.skills[hits[0]];
    }
  }
  const def = ALL_SKILLS.find((s) => s.name === name);
  // 解析技能基础值：多数为固定数字，但躲闪(DEX/2)与语言(母语)(EDU) 为派生标记，
  // 必须从角色卡属性换算，否则 typeof!=='number' 会落到 base=1 导致目标值恒为 1
  let base: number;
  if (typeof def?.base === 'number') base = def.base;
  else if (def?.base === 'DEX_HALF') base = Math.floor(sheet.characteristics.DEX / 2);
  else if (def?.base === 'EDU') base = sheet.characteristics.EDU;
  else base = 1;
  if (skill) return { base: skill.base ?? base, current: skill.current };
  return { base, current: base };
}

/**
 * 判断一个检定技能名是否能解析到「已知的检定目标」：属性、副属性(幸运/理智)、
 * 角色卡技能(含专精容错)、标准技能表 ALL_SKILLS 或别名之一。
 *
 * 用途：在解析选项里的检定标记时把「魔法值消耗」「魔法值」这类并非技能的词挡掉——
 * 它们不应被当作技能检定掷骰（resolvePlayerValue 对未知名会 fallback 到目标值 1，
 * 与基础 1% 的合法技能无法区分，故无法用目标值判断；这里用「是否找得到」来判定）。
 * 注意：入参应已用 normalizeSkillName 归一过英文属性码。
 */
export function isKnownCheckTarget(rawName: string, sheet: CharacterSheet): boolean {
  const trimmed = rawName.trim().replace(/（/g, '(').replace(/）/g, ')');
  const name = SKILL_ALIASES[trimmed] ?? trimmed;
  if (CHAR_MAP[name]) return true;
  if (name === '幸运' || name === '幸运值' || name === 'LUCK' || name === 'Luck') return true;
  if (name === '理智' || name === '理智值' || name === '理智检定' || name === 'SAN' || name === 'san') return true;
  // 信用评级是 COC 核心副技能但未列入 ALL_SKILLS；角色卡通常含该技能，但 defaultSheet/旧卡可能缺，显式放行避免误伤其检定。
  if (name === '信用评级') return true;
  if (sheet.skills[name]) return true;
  const bare = name.replace(/\(.*\)$/, '');
  if (bare !== name && sheet.skills[bare]) return true;
  if (Object.keys(sheet.skills).some((k) => k === bare || k.startsWith(bare + '('))) return true;
  if (ALL_SKILLS.some((s) => s.name === name || s.name === bare)) return true;
  return false;
}