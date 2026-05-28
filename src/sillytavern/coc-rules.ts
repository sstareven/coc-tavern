// ===== COC 7th Edition Rules: Pure functions =====
// Inspired by Call of Cthulhu 7th Edition rulebook
import type { COC7Characteristic } from '../types';

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
