import type { CharacterSheet } from '../types';

/** Whether a dot-path belongs to the character-sheet namespace (调查员.*). */
export function isCharsheetPath(dotPath: string): boolean {
  return dotPath === '调查员' || dotPath.startsWith('调查员.');
}

/** Map a 调查员.* secondary path to its sheet location. Returns null if unrecognized. */
function secondaryTarget(dotPath: string): { stat: 'hp' | 'san' | 'mp'; field: 'current' | 'max' } | 'luck' | null {
  const map: Record<string, { stat: 'hp' | 'san' | 'mp'; field: 'current' | 'max' }> = {
    '调查员.生命值.当前': { stat: 'hp', field: 'current' },
    '调查员.生命值.最大': { stat: 'hp', field: 'max' },
    '调查员.理智值.当前': { stat: 'san', field: 'current' },
    '调查员.理智值.最大': { stat: 'san', field: 'max' },
    '调查员.魔法值.当前': { stat: 'mp', field: 'current' },
    '调查员.魔法值.最大': { stat: 'mp', field: 'max' },
  };
  if (dotPath in map) return map[dotPath];
  if (dotPath === '调查员.幸运') return 'luck';
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Apply an MVU JSON Patch op that targets the 调查员.* (character-sheet) namespace,
 * returning a NEW CharacterSheet. Returns null if the op cannot/should not be applied to
 * the sheet (unrecognized path, non-numeric value, or an op that has no sheet meaning) —
 * in which case the caller leaves the op for statData / error logging.
 *
 * Source-of-truth boundary: the character sheet stays authoritative for 调查员.*; MVU patches
 * to those paths are redirected here instead of writing a parallel statData leaf.
 * Supported ops: replace (set), delta (numeric add). Numeric fields only (HP/SAN/MP current/max,
 * luck, skill.current).
 */
export function applyCharsheetRedirect(
  sheet: CharacterSheet,
  dotPath: string,
  op: string,
  value: unknown,
): CharacterSheet | null {
  if (op !== 'replace' && op !== 'delta') return null;

  // ── Secondary stats (HP/SAN/MP current|max) + luck ──
  const sec = secondaryTarget(dotPath);
  if (sec) {
    const delta = toNumber(value);
    if (delta === null) return null;
    if (sec === 'luck') {
      const next = op === 'delta' ? sheet.secondary.luck + delta : delta;
      return { ...sheet, secondary: { ...sheet.secondary, luck: next } };
    }
    const cur = sheet.secondary[sec.stat][sec.field];
    const next = op === 'delta' ? cur + delta : delta;
    return {
      ...sheet,
      secondary: {
        ...sheet.secondary,
        [sec.stat]: { ...sheet.secondary[sec.stat], [sec.field]: next },
      },
    };
  }

  // ── Skills (调查员.技能.XXX → skills.XXX.current) ──
  if (dotPath.startsWith('调查员.技能.')) {
    const skillName = dotPath.slice('调查员.技能.'.length);
    if (!skillName) return null;
    const n = toNumber(value);
    if (n === null) return null;
    const existing = sheet.skills[skillName];
    const nextCurrent = op === 'delta' ? (existing?.current ?? 0) + n : n;
    return {
      ...sheet,
      skills: {
        ...sheet.skills,
        [skillName]: { base: existing?.base ?? 0, current: nextCurrent },
      },
    };
  }

  // Unrecognized 调查员.* subpath (e.g. identity fields, unknown) → not consumed here.
  return null;
}
