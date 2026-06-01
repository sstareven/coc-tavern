import type { CharacterSheet, COC7Characteristic } from '../../types';
import { ALL_SKILLS } from '../../sillytavern/coc-data';

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

// 技能别名归一化：LLM 常用口语/简称发起检定，归一到 ALL_SKILLS / 角色卡的精确名，
// 避免不精确匹配落到 fallback。key 不得与任何精确技能名/属性名冲突。
// 注意：「驾驶」是合法精确名(Pilot 飞机/船)，故不作别名 key；「汽车/开车」单独归到「汽车驾驶」。
const SKILL_ALIASES: Record<string, string> = {
  '闪避': '躲闪',
  '母语': '语言(母语)',
  '外语': '语言(其他)', '其他语言': '语言(其他)',
  '格斗': '格斗(斗殴)', '斗殴': '格斗(斗殴)', '近战': '格斗(斗殴)',
  '手枪': '枪械(手枪)',
  '步枪': '枪械(步枪/霰弹枪)', '霰弹枪': '枪械(步枪/霰弹枪)', '猎枪': '枪械(步枪/霰弹枪)',
  '计算机': '计算机使用', '电脑': '计算机使用',
  '图书馆': '图书馆使用',
  '信用': '信用评级', '信誉': '信用评级',
  '侦察': '侦查',
  '快速交谈': '话术', '急智': '话术',
  '汽车': '汽车驾驶', '开车': '汽车驾驶', '驾车': '汽车驾驶',
  '克苏鲁': '克苏鲁神话', '神话': '克苏鲁神话',
};

export function resolvePlayerValue(
  rawName: string,
  sheet: CharacterSheet,
): { base: number; current: number } | null {
  const trimmed = rawName.trim();
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
  const skill = sheet.skills[name];
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