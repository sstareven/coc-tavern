import type { CharacterSheet, StatusCondition } from '../types';
import { normalizeSkillKey } from './coc-data';

/** Whether a dot-path belongs to the character-sheet namespace (调查员.*). */
export function isCharsheetPath(dotPath: string): boolean {
  return dotPath === '调查员' || dotPath.startsWith('调查员.');
}

/**
 * 把 LLM 写入用的技能名归一到角色卡「读取时」会查的同一个键，避免写入键与掷骰/显示键不一致
 * 而在 sheet.skills 里造出永不被读的「孤儿技能」（如写 手枪/闪避，读时归一为 枪械(手枪)/躲闪）。
 *  1. 别名 + 全角括号归一（normalizeSkillKey）。
 *  2. 若归一后键已存在则用之；否则按裸名↔专精做唯一前缀匹配（对齐 resolvePlayerValue 的读取容错）。
 *  3. 仍无命中＝全新技能，用归一后的规范名作键。
 */
function canonicalSkillKey(raw: string, sheet: CharacterSheet): string {
  const aliased = normalizeSkillKey(raw);
  if (sheet.skills[aliased]) return aliased;
  const bare = aliased.replace(/\(.*\)$/, '');
  if (bare !== aliased && sheet.skills[bare]) return bare;
  const hits = Object.keys(sheet.skills).filter((k) => k === bare || k.startsWith(bare + '('));
  if (hits.length === 1) return hits[0];
  return aliased;
}

/**
 * 是否为「角色卡数值目标」路径——HP/SAN/MP 当前|最大、幸运、技能.*。
 * 这些路径用 replace/delta 时必须给数字值；redirect 返回 null 即意味着值非数字，
 * 属真实失败（应上报），区别于身份字段等良性「不消费」的 null。
 */
export function isNumericCharsheetTarget(dotPath: string): boolean {
  return (
    secondaryTarget(dotPath) !== null ||
    dotPath === '调查员.幸运' ||
    dotPath.startsWith('调查员.技能.')
  );
}

/**
 * 「已知但不写入」的 调查员.* 路径白名单：身份字段(姓名/职业/年龄/性别)等。
 * applyCharsheetRedirect 返回 null 不报错；不在此白名单且未被 redirect 消费的视为未知路径(G2)。
 *
 * 故意 NOT 包含的 path:
 *  - '调查员' (裸根): 全树替换在 MVU 语义里没有合理用途, 应报错防 LLM 误用整树覆盖.
 */
const KNOWN_OPTIONAL_CHARSHEET_PATHS: ReadonlySet<string> = new Set([
  '调查员.姓名',
  '调查员.职业',
  '调查员.年龄',
  '调查员.性别',
  // C2/M4 法术名册(本里程碑仅占位,redirect 不写,但不报 unknown)
  '调查员.已知法术',
]);

export function isKnownOptionalCharsheetPath(dotPath: string): boolean {
  return KNOWN_OPTIONAL_CHARSHEET_PATHS.has(dotPath);
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

const SEVERITIES = ['minor', 'moderate', 'severe', 'critical'] as const;

/** 把任意 LLM 给的值规整为一个 StatusCondition（容忍中英文键、裸字符串）。 */
function coerceCondition(v: unknown, fallbackName?: string): StatusCondition | null {
  if (typeof v === 'string') {
    return fallbackName ? { name: fallbackName, severity: 'moderate', description: v } : null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = String(o.name ?? o['名称'] ?? fallbackName ?? '').trim();
  if (!name) return null;
  const sevRaw = String(o.severity ?? o['严重度'] ?? 'moderate');
  const severity = (SEVERITIES as readonly string[]).includes(sevRaw)
    ? (sevRaw as StatusCondition['severity'])
    : 'moderate';
  const description = String(o.description ?? o['描述'] ?? '');
  return { name, severity, description };
}

function coerceConditions(v: unknown): StatusCondition[] {
  if (Array.isArray(v)) {
    return v.map((x) => coerceCondition(x)).filter((x): x is StatusCondition => x !== null);
  }
  const one = coerceCondition(v);
  return one ? [one] : [];
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
  // ── Posture (调查员.姿态 → posture string) ──
  if (dotPath === '调查员.姿态') {
    if (op !== 'replace') return null;
    const s = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (!s) return null;
    return { ...sheet, posture: s };
  }

  // ── Status conditions (调查员.状态条件 数组) ──
  if (dotPath === '调查员.状态条件') {
    if (op === 'replace') {
      return { ...sheet, statusConditions: coerceConditions(value) };
    }
    if (op === 'insert') {
      const added = coerceConditions(value);
      if (added.length === 0) return null;
      const addedNames = new Set(added.map((c) => c.name));
      const kept = sheet.statusConditions.filter((c) => !addedNames.has(c.name)); // 同名覆盖
      return { ...sheet, statusConditions: [...kept, ...added] };
    }
    return null;
  }
  // 单条状态：调查员.状态条件.<名称>（remove 删除 / replace|insert 覆盖单条）
  if (dotPath.startsWith('调查员.状态条件.')) {
    const name = dotPath.slice('调查员.状态条件.'.length);
    if (!name) return null;
    if (op === 'remove') {
      // 优先按名删（状态名通常是描述性中文，含恰为纯数字的名）；仅当无此名、且 name 是合法数组下标时，
      // 才容忍 JSONPatch 通用模板的下标删法 /调查员/状态条件/0。
      if (sheet.statusConditions.some((c) => c.name === name)) {
        return { ...sheet, statusConditions: sheet.statusConditions.filter((c) => c.name !== name) };
      }
      if (/^\d+$/.test(name)) {
        const idx = Number(name);
        if (idx >= 0 && idx < sheet.statusConditions.length) {
          const next = sheet.statusConditions.slice();
          next.splice(idx, 1);
          return { ...sheet, statusConditions: next };
        }
      }
      return { ...sheet, statusConditions: sheet.statusConditions.filter((c) => c.name !== name) };
    }
    if (op === 'replace' || op === 'insert') {
      const cond = coerceCondition(value, name);
      if (!cond) return null;
      const kept = sheet.statusConditions.filter((c) => c.name !== name);
      return { ...sheet, statusConditions: [...kept, cond] };
    }
    return null;
  }

  if (op !== 'replace' && op !== 'delta') return null;

  // ── Secondary stats (HP/SAN/MP current|max) + luck ──
  const sec = secondaryTarget(dotPath);
  if (sec) {
    const delta = toNumber(value);
    if (delta === null) return null;
    if (sec === 'luck') {
      const raw = op === 'delta' ? sheet.secondary.luck + delta : delta;
      // 幸运恒夹在 0~99（update_rules 明示 range:0~99）——避免越界值写入后污染检定/显示。
      const next = Math.max(0, Math.min(99, raw));
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
    const rawName = dotPath.slice('调查员.技能.'.length);
    if (!rawName) return null;
    const n = toNumber(value);
    if (n === null) return null;
    // 写入键归一到读取侧同一规范键，防止别名/简称造出孤儿技能。
    const skillName = canonicalSkillKey(rawName, sheet);
    const existing = sheet.skills[skillName];
    const nextCurrent = op === 'delta' ? (existing?.current ?? 0) + n : n;
    return {
      ...sheet,
      skills: {
        ...sheet.skills,
        [skillName]: {
          base: existing?.base ?? 0,
          current: nextCurrent,
          ticked: existing?.ticked ?? false,
        },
      },
    };
  }

  // Unrecognized 调查员.* subpath (e.g. identity fields, unknown) → not consumed here.
  return null;
}
