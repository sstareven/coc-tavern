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
