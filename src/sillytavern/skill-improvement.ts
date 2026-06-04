// ============================================================
// A3.4/A3.5 — 发展阶段（Skill Improvement）的纯函数实现
// ----------------------------------------------------------
// COC7e R5: 本场冒险中触发过「成功打钩(ticked)」的技能，在发展阶段
// 各自掷一次 d100；若 roll > current OR roll ≥ 96 → 提升 1d10（上限 99）。
//
// 排除：
//   - 信用评级（按 7e 规则用职业线归零/起点，不参与日常成长）
//   - 克苏鲁神话（只能由特定剧情节点提升，玩家不能"练熟"它）
//
// A3.5：当一项技能在本次发展阶段跨过 90% 阈值（before<90 && after≥90），
// 额外获得 +2D6 SAN（一次性，记录在 row.sanBonus）。
//
// 这里只暴露纯函数；React 端只做表格 + 提交按钮 + 浮动 chip 效果。
// 所有路径都用 dotted（后续由调用方拼成 JSON Patch 的斜线路径 /调查员/技能/X/…）。
// ============================================================

import type { CharacterSheet } from '../types';

export type RNG = () => number;
const defaultRng: RNG = Math.random;

/** [1..faces] 离散均匀。 */
function rollD(faces: number, rng: RNG): number {
  return Math.floor(rng() * faces) + 1;
}

export function roll2d6(rng: RNG = defaultRng): number {
  return rollD(6, rng) + rollD(6, rng);
}

/**
 * 本技能是否参与发展阶段成长。
 * 排除：信用评级（隶属职业起点 / 财富线，独立于打钩成长），克苏鲁神话（神秘剧情解锁）。
 * 包括：所有语言（语言(母语)/语言(其他)/语言(X) 等）——按 7e 规则可在本场使用成功后成长。
 */
export function isDevelopmentEligible(skillName: string): boolean {
  if (skillName === '信用评级' || skillName === '克苏鲁神话') return false;
  return true;
}

/**
 * R5 单技能成长：
 *  - d100 > current OR d100 ≥ 96 → 提升 1d10（上限 99）
 *  - 否则不变
 * 返回 {d100, d10(0=未提升), improved, finalValue}
 */
export interface SkillImprovementResult {
  d100: number;
  d10: number;
  improved: boolean;
  finalValue: number;
}
export function rollSkillImprovement(
  current: number,
  rng: RNG = defaultRng,
): SkillImprovementResult {
  const d100 = rollD(100, rng);
  if (d100 > current || d100 >= 96) {
    const d10 = rollD(10, rng);
    const finalValue = Math.min(99, current + d10);
    return { d100, d10, improved: finalValue !== current, finalValue };
  }
  return { d100, d10: 0, improved: false, finalValue: current };
}

/** before<90 && after≥90 → 跨越成功，发奖 +2D6 SAN。 */
export function crossed90Threshold(before: number, after: number): boolean {
  return before < 90 && after >= 90;
}

/* ============================== Row / Op Builders ============================== */

export interface DevPhaseRow {
  /** 技能名（角色卡内 sheet.skills 的键）。 */
  name: string;
  /** 发展前的 current。 */
  before: number;
  /** 发展后的 current（未提升时与 before 相等）。 */
  after: number;
  /** d100 检定值。 */
  d100: number;
  /** d10 提升量（0 表示未提升）。 */
  d10: number;
  /** 是否提升了。 */
  improved: boolean;
  /** 是否本次跨越 90%。 */
  crossed90: boolean;
  /** 跨越 90% 时的 +2D6 SAN 奖励（仅 crossed90=true 时存在）。 */
  sanBonus?: number;
}

/**
 * 从角色卡 sheet.skills 中按规则筛选 + 掷骰生成发展期表格行。
 *
 *  - 只包含 ticked=true 且 isDevelopmentEligible 的技能。
 *  - rng 同时驱动 d100 / d10 / 2d6（SAN 奖励）；按 entries 顺序消费，保证可重放。
 *  - 顺序：Object.entries(skills) 的插入序（角色卡通常以技能表顺序写入）。
 */
export function buildDevelopmentRows(
  skills: Record<string, { current: number; ticked?: boolean }>,
  rng: RNG = defaultRng,
): DevPhaseRow[] {
  const rows: DevPhaseRow[] = [];
  for (const [name, skill] of Object.entries(skills)) {
    if (!skill?.ticked) continue;
    if (!isDevelopmentEligible(name)) continue;
    const before = skill.current;
    const r = rollSkillImprovement(before, rng);
    const after = r.finalValue;
    const crossed = crossed90Threshold(before, after);
    const row: DevPhaseRow = {
      name,
      before,
      after,
      d100: r.d100,
      d10: r.d10,
      improved: r.improved,
      crossed90: crossed,
    };
    if (crossed) {
      // A3.5：跨越 90% → +2D6 SAN
      row.sanBonus = roll2d6(rng);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 把 Row[] 拼成提交给 useVariableStore.applyCorrectiveOps 的 JSON Patch op 列表。
 *
 *  - 提升的：`replace /调查员/技能/X value=after`（约定：写技能即写 current；redirect 在该分支落地）
 *  - 所有行（无论提升与否）：`replace /调查员/技能/X/ticked value=false`（清打钩）
 *  - 跨越 90% 的：`delta /调查员/理智值/当前 value=sanBonus`
 *
 * 由调用方一次性 applyCorrectiveOps([..ops])；redirect 内的 ticked / current / SAN 分支会落地。
 * 路径约定来自 useLorebookStore 写规则：`/调查员/技能/<技能名>`，值为当前成功率（数字）；
 * 不写 `/调查员/技能/X/current`（不在 redirect 支持范围内）。
 */
export interface MvuOp {
  op: string;
  path: string;
  value: unknown;
}

export function buildDevelopmentOps(rows: DevPhaseRow[]): MvuOp[] {
  const ops: MvuOp[] = [];
  for (const row of rows) {
    if (row.improved) {
      ops.push({ op: 'replace', path: `/调查员/技能/${row.name}`, value: row.after });
    }
    // 总是清打钩（包括未提升的）——下场冒险重新累积。
    ops.push({ op: 'replace', path: `/调查员/技能/${row.name}/ticked`, value: false });
    if (row.crossed90 && typeof row.sanBonus === 'number' && row.sanBonus > 0) {
      ops.push({ op: 'delta', path: '/调查员/理智值/当前', value: row.sanBonus });
    }
  }
  return ops;
}

/* ============================== UI Helper ============================== */

/**
 * 角色卡是否存在任一「ticked=true 且 isDevelopmentEligible」的技能。
 * 用于 CharSheetOverlay 的「结束本章·发展期」入口按钮 disabled 判断。
 */
export function hasTickedDevelopmentSkill(sheet: CharacterSheet): boolean {
  for (const [name, skill] of Object.entries(sheet.skills)) {
    if (skill?.ticked && isDevelopmentEligible(name)) return true;
  }
  return false;
}
