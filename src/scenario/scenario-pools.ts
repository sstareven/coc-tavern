// 剧本系统 · 派生函数 — 时代化职业/技能池
// 给 StepSkills 和角色选择面板提供「当前剧本下玩家可见的池」。
// 纯函数,无副作用,可单测。
//
// 隔离策略(详见 spec §3 Section 2):
// - customOccupations 非空 → 强隔离,只返回它(罗马剧本里不会看到「会计师」)
// - customOccupations 为空 → fallback COC_OCCUPATIONS(「自由探索」走全集)
// - customSkills 始终并入 ALL_SKILLS(剔除 skillBlacklist 后)
// - 同名以 customSkills 为准(剧本可重定义"骑术"的 cat/base/desc)
import type { ScenarioDoc, ScenarioCustomSkill } from '../types/scenario';
import type { Occupation, SkillCat } from '../sillytavern/coc-data';
import { ALL_SKILLS, COC_OCCUPATIONS, SKILL_DESC } from '../sillytavern/coc-data';

// 池元素的统一形态:必有 name/base/cat;desc 可选。
// SkillCat 是 coc-data 的固定 6 类联合;自定义技能可填 SkillCat 之外的字符串,
// 调用方按 CAT_COLORS[?cat] 取色,缺色用默认灰。声明上保持宽松。
export interface ScenarioSkillPoolEntry {
  name: string;
  base: number | 'DEX_HALF' | 'EDU';
  cat: SkillCat | string;
  desc?: string;
}

/** 当前剧本下玩家可选职业池
 *  - customOccupations 非空 → 严格隔离(不混入 COC_OCCUPATIONS),罗马剧本看不到「会计师」
 *  - 否则回退 COC_OCCUPATIONS 全集(「自由探索」/未填本时代职业的剧本)
 */
export function getScenarioOccupationPool(scn?: ScenarioDoc | null): Occupation[] {
  if (scn && scn.customOccupations && scn.customOccupations.length > 0) {
    return scn.customOccupations;
  }
  return COC_OCCUPATIONS;
}

/** 当前剧本下玩家可见技能池
 *  起点 = ALL_SKILLS;
 *  剔除 skillBlacklist 中的名字;
 *  合并 customSkills(同名以 custom 为准,实现「剧本重定义"骑术"为 base 25」)。
 *  顺序 = ALL_SKILLS 现有顺序(保留 cat 分组) + 末尾追加非同名 customSkills。
 */
export function getScenarioSkillPool(scn?: ScenarioDoc | null): ScenarioSkillPoolEntry[] {
  if (!scn) return ALL_SKILLS as ScenarioSkillPoolEntry[];

  const blacklist = new Set(scn.skillBlacklist ?? []);
  const customByName = new Map<string, ScenarioCustomSkill>();
  for (const cs of scn.customSkills ?? []) customByName.set(cs.name, cs);

  const merged: ScenarioSkillPoolEntry[] = [];
  for (const sk of ALL_SKILLS) {
    if (blacklist.has(sk.name)) continue;
    const override = customByName.get(sk.name);
    if (override) {
      merged.push({ name: override.name, base: override.base, cat: override.cat, desc: override.desc });
      customByName.delete(sk.name); // 已并入,从待添加集合移除
    } else {
      merged.push(sk);
    }
  }
  // 剩下的(ALL_SKILLS 没出现过的纯新增技能)追加到末尾
  for (const cs of customByName.values()) {
    merged.push({ name: cs.name, base: cs.base, cat: cs.cat, desc: cs.desc });
  }
  return merged;
}

/** 当前剧本下的技能描述映射 — SKILL_DESC 合并 customSkills.desc */
export function getScenarioSkillDescMap(scn?: ScenarioDoc | null): Record<string, string> {
  if (!scn) return SKILL_DESC;
  const out: Record<string, string> = { ...SKILL_DESC };
  for (const cs of scn.customSkills ?? []) {
    if (cs.desc) out[cs.name] = cs.desc;
  }
  // 黑名单技能从描述里也剔除(避免提示 tooltip 出现已禁用技能的描述残留)
  for (const blocked of scn.skillBlacklist ?? []) delete out[blocked];
  return out;
}
