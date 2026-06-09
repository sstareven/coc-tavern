// ===== COC 7th Edition Rules: Pure functions =====
// Inspired by Call of Cthulhu 7th Edition rulebook
import type { COC7Characteristic } from '../types';
import { BOUT_BEHAVIOR_TABLE, PHOBIA_TABLE, MANIA_TABLE, type CocTableEntry } from './coc7e-tables';

/* ============================== Random Helpers ============================== */

export function roll3D6(): number {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

export function roll2D6(): number {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

export const CHAR_ROLL: Record<string, () => number> = {
  STR: () => roll3D6() * 5,
  CON: () => roll3D6() * 5,
  POW: () => roll3D6() * 5,
  DEX: () => roll3D6() * 5,
  APP: () => roll3D6() * 5,
  SIZ: () => (roll2D6() + 6) * 5,
  INT: () => (roll2D6() + 6) * 5,
  EDU: () => Math.min(99, (roll3D6() + 3) * 5),
};

/* ============================== DB / Build ============================== */

export function getDBBuild(strPlusSiz: number): { db: string; build: number } {
  if (strPlusSiz >= 2 && strPlusSiz <= 64) return { db: '-2', build: -2 };
  if (strPlusSiz <= 84) return { db: '-1', build: -1 };
  if (strPlusSiz <= 124) return { db: '0', build: 0 };
  if (strPlusSiz <= 164) return { db: '+1D4', build: 1 };
  if (strPlusSiz <= 204) return { db: '+1D6', build: 2 };
  return { db: '+1D6', build: 2 };
}

/* ============================== Skill Base Resolver ============================== */

export function resolveSkillBase(
  spec: number | 'DEX_HALF' | 'EDU',
  chars: Partial<Record<COC7Characteristic, number>>,
): number {
  if (spec === 'DEX_HALF') return Math.floor((chars.DEX ?? 50) / 2);
  if (spec === 'EDU') return chars.EDU ?? 50;
  return spec;
}

/* ============================== Secondary Stats ============================== */

/**
 * COC 7th 次生属性纯函数：从特征值派生 HP/SAN/MP/DB/Build。
 * hpMax = floor((SIZ + CON) / 10)；sanMax = POW；mpMax = floor(POW / 5)；
 * db/build 由 getDBBuild(STR + SIZ) 决定。
 * 调用方负责把缺省特征解析为数值后传入（不同入口缺省策略不同）。
 */
export function deriveSecondaryStats(
  chars: Partial<Record<COC7Characteristic, number>>,
): { hpMax: number; sanMax: number; mpMax: number; db: string; build: number } {
  const siz = chars.SIZ ?? 0;
  const con = chars.CON ?? 0;
  const pow = chars.POW ?? 0;
  const str = chars.STR ?? 0;
  const hpMax = Math.floor((siz + con) / 10);
  const sanMax = pow;
  const mpMax = Math.floor(pow / 5);
  const { db, build } = getDBBuild(str + siz);
  return { hpMax, sanMax, mpMax, db, build };
}

/* ============================== Sanity / Bout Rolls (A2.2) ============================== */
//
// 这些助手都接受外部注入的 `rng: () => number ∈ [0,1)`，便于单测用确定性序列；
// 调用方传 `Math.random` 即得到真实随机。
// 与上方 roll3D6/roll2D6 的「内部 Math.random」分离是有意的——疯狂/INT 检定走
// post-settle evaluator 路径，evaluator 注入受控 RNG 才能 dedupe 同一次 SAN 事件。

/** INT 检定：1D100 ≤ INT 为成功。 */
export function rollIntCheck(intStat: number, rng: () => number): { roll: number; success: boolean } {
  const roll = Math.floor(rng() * 100) + 1; // 1..100
  return { roll, success: roll <= intStat };
}

/** 在 N 项表（Bout VII/VIII 或 PHOBIA/MANIA）随机挑一项。 */
export function rollBoutEntry(rng: () => number, table: CocTableEntry[]): CocTableEntry {
  const idx = Math.min(table.length - 1, Math.floor(rng() * table.length));
  return table[idx];
}

/** PHOBIA 表 1D100（30 项种子时按比例索引）。 */
export function rollPhobia(rng: () => number): CocTableEntry {
  return rollBoutEntry(rng, PHOBIA_TABLE);
}

/** MANIA 表 1D100（30 项种子时按比例索引）。 */
export function rollMania(rng: () => number): CocTableEntry {
  return rollBoutEntry(rng, MANIA_TABLE);
}

/**
 * 保证 BOUT_BEHAVIOR_TABLE 在编译期被引用（防止上方的 import 在 tree-shake 后被误删）。
 * 实际运行时该常量仍由 A2.5 triggerBout 直接使用。
 */
void BOUT_BEHAVIOR_TABLE;

/* ============================== R8: Age Modifiers ============================== */
//
// COC7e 年龄修正表（七段带）：
// 15-19：STR+SIZ 共扣 5 / EDU 直扣 5 / MOV +1 / 0 次 EDU 提升 / 幸运重投取大
// 20-39：无扣 / MOV +0 / 1 次 EDU 提升
// 40-49：STR/CON/DEX 共扣 5  / APP -5  / MOV -1 / 2 次 EDU 提升
// 50-59：STR/CON/DEX 共扣 10 / APP -10 / MOV -2 / 3 次 EDU 提升
// 60-69：STR/CON/DEX 共扣 20 / APP -15 / MOV -3 / 4 次 EDU 提升
// 70-79：STR/CON/DEX 共扣 40 / APP -20 / MOV -4 / 4 次 EDU 提升
// 80-89：STR/CON/DEX 共扣 80 / APP -25 / MOV -5 / 4 次 EDU 提升
//
// 注意：MOV 基值由 STR/DEX 与 SIZ 比较得出（7/8/9 三档），再叠加 movDelta；
// 「STR/CON/DEX 共扣 X」「STR/SIZ 共扣 X」由玩家在 UI 分配（A3.2），本纯函数只返回需扣总额。

export interface AgeModifierResult {
  chars: Record<COC7Characteristic, number>;
  mov: number;
  eduImprovementCount: number;
  deductRemaining: { strSizGroup: number; strConDexGroup: number };
  appDeduct: number;
  luckRollAgain: boolean;
}

interface AgeBand {
  min: number; max: number;
  strSizGroup: number;       // 15-19: STR+SIZ 共扣 5
  strConDexGroup: number;    // 40+ : STR/CON/DEX 共扣 X
  appDeduct: number;
  movDelta: number;
  eduDirect: number;          // 仅 15-19 段直扣 EDU
  eduImprovementCount: number;
  luckRollAgain: boolean;
}

const AGE_BANDS: AgeBand[] = [
  { min: 15, max: 19, strSizGroup: 5, strConDexGroup: 0,  appDeduct: 0,  movDelta: 1,  eduDirect: 5, eduImprovementCount: 0, luckRollAgain: true  },
  { min: 20, max: 39, strSizGroup: 0, strConDexGroup: 0,  appDeduct: 0,  movDelta: 0,  eduDirect: 0, eduImprovementCount: 1, luckRollAgain: false },
  { min: 40, max: 49, strSizGroup: 0, strConDexGroup: 5,  appDeduct: 5,  movDelta: -1, eduDirect: 0, eduImprovementCount: 2, luckRollAgain: false },
  { min: 50, max: 59, strSizGroup: 0, strConDexGroup: 10, appDeduct: 10, movDelta: -2, eduDirect: 0, eduImprovementCount: 3, luckRollAgain: false },
  { min: 60, max: 69, strSizGroup: 0, strConDexGroup: 20, appDeduct: 15, movDelta: -3, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
  { min: 70, max: 79, strSizGroup: 0, strConDexGroup: 40, appDeduct: 20, movDelta: -4, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
  { min: 80, max: 89, strSizGroup: 0, strConDexGroup: 80, appDeduct: 25, movDelta: -5, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
];

/**
 * MOV 基值（COC7e 规则书 §3 Characteristics）：
 * STR 与 DEX 都 < SIZ → 7；都 > SIZ → 9；其余（含与 SIZ 持平）→ 8。
 * 这里以「应用扣点之后的 chars」为输入，保证 movDelta 叠加在正确的基值上。
 */
function baseMovForChars(chars: Partial<Record<COC7Characteristic, number>>): number {
  const str = chars.STR ?? 0, dex = chars.DEX ?? 0, siz = chars.SIZ ?? 0;
  if (str < siz && dex < siz) return 7;
  if (str > siz && dex > siz) return 9;
  return 8;
}

/**
 * R8 年龄修正纯函数：返回应用 APP/EDU 直扣后的属性、MOV、待扣组、EDU 提升次数、幸运重投旗标。
 * STR/CON/DEX 组与 STR/SIZ 组的具体分配由调用方（UI）完成；本函数只算总额。
 * 落地约束：APP/EDU 下限 1；out-of-range age（<15 或 ≥90）回退到 20-39 段（band index 1）。
 */
export function applyAgeModifiers(
  chars: Record<COC7Characteristic, number>,
  age: number,
): AgeModifierResult {
  const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max) ?? AGE_BANDS[1];
  const next = { ...chars };
  if (band.eduDirect > 0) next.EDU = Math.max(1, next.EDU - band.eduDirect);
  if (band.appDeduct > 0) next.APP = Math.max(1, next.APP - band.appDeduct);
  const mov = Math.max(1, baseMovForChars(next) + band.movDelta);
  return {
    chars: next,
    mov,
    eduImprovementCount: band.eduImprovementCount,
    deductRemaining: { strSizGroup: band.strSizGroup, strConDexGroup: band.strConDexGroup },
    appDeduct: band.appDeduct,
    luckRollAgain: band.luckRollAgain,
  };
}

/* ============================== R5: EDU & Skill Improvement ============================== */

export type RNG = () => number;
const defaultRng: RNG = Math.random;
const rollD = (sides: number, rng: RNG): number => Math.floor(rng() * sides) + 1;

/**
 * R5 EDU 提升检定：1D100 > 当前 EDU → +1D10（上限 99）。
 * 创建阶段「年龄修正」会反复调用本函数（次数由 applyAgeModifiers.eduImprovementCount 给出）。
 */
export function rollEduImprovement(
  currentEdu: number,
  rng: RNG = defaultRng,
): { roll: number; improved: boolean; gain: number; newEdu: number } {
  const roll = rollD(100, rng);
  if (roll > currentEdu) {
    const gain = rollD(10, rng);
    return { roll, improved: true, gain, newEdu: Math.min(99, currentEdu + gain) };
  }
  return { roll, improved: false, gain: 0, newEdu: currentEdu };
}

/* ============================== Skill point cap (creator) ============================== */

/**
 * 计算技能加点后允许的新值。
 *
 * 规则：base + occ + int <= 99；且不超过当前池剩余可分配点数。
 * 既适用职业加点（otherAlloc=该技能已分配的兴趣点），
 * 也适用兴趣加点（otherAlloc=该技能已分配的职业点）。
 *
 * @param cur          该技能在「正被编辑的那一池」里当前已分配点数
 * @param delta        本次按下 +1 / +5 / -1 / -5 的增量
 * @param base         技能基础值（与 charValues 相关，例如 闪避 = DEX_HALF）
 * @param otherAlloc   该技能在另一池里已分配的点数（联动钳的关键）
 * @param remaining    当前池子还剩多少点（即 pool - 已用）
 * @returns 钳制后的新分配值（≥ 0；base + 新值 + otherAlloc ≤ 99）
 */
export function clampSkillPointAlloc(
  cur: number,
  delta: number,
  base: number,
  otherAlloc: number,
  remaining: number,
): number {
  const maxBySkill = Math.max(0, 99 - base - otherAlloc);
  const target = cur + delta;
  const capByPool = Math.min(cur + remaining, maxBySkill);
  return Math.max(0, Math.min(capByPool, target));
}

