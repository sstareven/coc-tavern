import type { CharacterSheet, StatusCondition } from '../types';
import { normalizeSkillKey } from './coc-data';

/** Whether a dot-path belongs to the character-sheet namespace (调查员.*). */
export function isCharsheetPath(dotPath: string): boolean {
  return dotPath === '调查员' || dotPath.startsWith('调查员.');
}

/**
 * 把 LLM 写入用的技能名归一到角色卡「读取时」会查的同一个键，避免写入键与掷骰/显示键不一致
 * 而在 sheet.skills 里造出永不被读的「孤儿技能」（如裸名/全角括号差异）。
 *  1. 全角括号归一（normalizeSkillKey；SKILL_ALIASES 已清空，技能名一刀切规则书 canonical）。
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
 * A2.3：把 redirect 的返回值由「裸 CharacterSheet」升级为带额外通道的对象。
 *  - sheet：更新后的角色卡（不可为 null；null 走外层的 RedirectResult|null）。
 *  - sanDelta：仅当 path 是 调查员.理智值.当前 时给出 (newSan - oldSan)，
 *    其它路径不带此字段。供 A2.4 sanity evaluator 在 post-settle 阶段一次性读到 SAN 增减，
 *    无需自己 diff 老 sheet 做对比。
 */
export interface RedirectResult {
  sheet: CharacterSheet;
  /** 仅当 path 是 调查员.理智值.当前 时给出 (newSan - oldSan)；其它路径不带此字段。 */
  sanDelta?: number;
}

/**
 * Apply an MVU JSON Patch op that targets the 调查员.* (character-sheet) namespace,
 * returning a NEW CharacterSheet wrapped in RedirectResult. Returns null if the op
 * cannot/should not be applied to the sheet (unrecognized path, non-numeric value,
 * or an op that has no sheet meaning) — in which case the caller leaves the op for
 * statData / error logging.
 *
 * Source-of-truth boundary: the character sheet stays authoritative for 调查员.*; MVU patches
 * to those paths are redirected here instead of writing a parallel statData leaf.
 *
 * Supported ops & branches:
 *  - replace/delta: HP/SAN/MP current|max, luck, skill.current, 临时疯狂.roundsLeft,
 *    不定性疯狂.daysLeft, 每日理智损失
 *  - replace: 姿态 (string), 临时疯狂.active/不定性疯狂.active/永久疯狂 (boolean),
 *    临时疯狂.bout (structured {mode,table,entry})
 *  - replace/insert/remove: 状态条件 (array + single)
 *  - add/insert/replace/remove: 恐惧症 / 狂躁症 (string[] with dedup)
 *
 * A2.3：返回类型由 `CharacterSheet | null` 改为 `RedirectResult | null`。
 * SAN 当前值分支额外回带 sanDelta 字段，供 A2.4 evaluator 读 ξ 一次性拿到 SAN 增减。
 */
export function applyCharsheetRedirect(
  sheet: CharacterSheet,
  dotPath: string,
  op: string,
  value: unknown,
): RedirectResult | null {
  // ── Posture (调查员.姿态 → posture string) ──
  if (dotPath === '调查员.姿态') {
    if (op !== 'replace') return null;
    const s = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (!s) return null;
    return { sheet: { ...sheet, posture: s } };
  }

  // ── Status conditions (调查员.状态条件 数组) ──
  if (dotPath === '调查员.状态条件') {
    if (op === 'replace') {
      return { sheet: { ...sheet, statusConditions: coerceConditions(value) } };
    }
    if (op === 'insert') {
      const added = coerceConditions(value);
      if (added.length === 0) return null;
      const addedNames = new Set(added.map((c) => c.name));
      const kept = sheet.statusConditions.filter((c) => !addedNames.has(c.name)); // 同名覆盖
      return { sheet: { ...sheet, statusConditions: [...kept, ...added] } };
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
        return { sheet: { ...sheet, statusConditions: sheet.statusConditions.filter((c) => c.name !== name) } };
      }
      if (/^\d+$/.test(name)) {
        const idx = Number(name);
        if (idx >= 0 && idx < sheet.statusConditions.length) {
          const next = sheet.statusConditions.slice();
          next.splice(idx, 1);
          return { sheet: { ...sheet, statusConditions: next } };
        }
      }
      return { sheet: { ...sheet, statusConditions: sheet.statusConditions.filter((c) => c.name !== name) } };
    }
    if (op === 'replace' || op === 'insert') {
      const cond = coerceCondition(value, name);
      if (!cond) return null;
      const kept = sheet.statusConditions.filter((c) => c.name !== name);
      return { sheet: { ...sheet, statusConditions: [...kept, cond] } };
    }
    return null;
  }

  // ── 临时疯狂 ──
  if (dotPath === '调查员.临时疯狂.active') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, active: v } } };
  }
  if (dotPath === '调查员.临时疯狂.roundsLeft') {
    if (op !== 'replace' && op !== 'delta') return null;
    const n = toNumber(value);
    if (n === null) return null;
    const cur = sheet.temporaryInsanity.roundsLeft;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, roundsLeft: next } } };
  }
  if (dotPath === '调查员.临时疯狂.bout') {
    if (op !== 'replace' || !value || typeof value !== 'object') return null;
    const v = value as { mode?: unknown; table?: unknown; entry?: unknown };
    const mode = v.mode === 'summary' || v.mode === 'realtime' ? v.mode : null;
    const table = v.table === 'VII' || v.table === 'VIII' ? v.table : null;
    const entry = toNumber(v.entry);
    if (!mode || !table || entry === null) return null;
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, bout: { mode, table, entry } } } };
  }

  // ── 不定性疯狂 ──
  if (dotPath === '调查员.不定性疯狂.active') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, indefiniteInsanity: { ...sheet.indefiniteInsanity, active: v } } };
  }
  if (dotPath === '调查员.不定性疯狂.daysLeft') {
    if (op !== 'replace' && op !== 'delta') return null;
    const n = toNumber(value);
    if (n === null) return null;
    const cur = sheet.indefiniteInsanity.daysLeft;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, indefiniteInsanity: { ...sheet.indefiniteInsanity, daysLeft: next } } };
  }

  // ── 永久疯狂 ──
  if (dotPath === '调查员.永久疯狂') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, permanentInsanity: v } };
  }

  // ── 恐惧症 / 狂躁症（string[] 受控；add/insert/replace 追加去重、remove 过滤）──
  const arrayPath: 'phobias' | 'manias' | null =
    dotPath === '调查员.恐惧症' ? 'phobias' :
    dotPath === '调查员.狂躁症' ? 'manias' : null;
  if (arrayPath) {
    const item = typeof value === 'string' ? value.trim() : '';
    if (!item) return null;
    const cur: string[] = sheet[arrayPath] ?? [];
    if (op === 'add' || op === 'insert' || op === 'replace') {
      // 去重：已存在直接返回当前 sheet（不报错，由 redirect 自然消费）
      if (cur.includes(item)) return { sheet };
      const nextSheet: CharacterSheet = arrayPath === 'phobias'
        ? { ...sheet, phobias: [...cur, item] }
        : { ...sheet, manias: [...cur, item] };
      return { sheet: nextSheet };
    }
    if (op === 'remove') {
      const filtered = cur.filter((x) => x !== item);
      const nextSheet: CharacterSheet = arrayPath === 'phobias'
        ? { ...sheet, phobias: filtered }
        : { ...sheet, manias: filtered };
      return { sheet: nextSheet };
    }
    return null;
  }

  // ── 每日理智损失 ──
  if (dotPath === '调查员.每日理智损失') {
    if (op !== 'replace' && op !== 'delta') return null;
    const n = toNumber(value);
    if (n === null) return null;
    const cur = sheet.dailySanLoss ?? 0;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, dailySanLoss: next } };
  }

  // ── Skill ticked flag (调查员.技能.XXX.ticked → skills.XXX.ticked) ──
  // A3.3：成功+ 检定通过 useDiceStore.emitTickOp 走 op='replace' value=true 落标。
  // 必须在 numeric guard 之前判定，因为 ticked 走布尔不走数字。
  if (dotPath.startsWith('调查员.技能.') && dotPath.endsWith('.ticked')) {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
    if (v === null) return null;
    const rawName = dotPath.slice('调查员.技能.'.length, -'.ticked'.length);
    if (!rawName) return null;
    const skillName = canonicalSkillKey(rawName, sheet);
    const existing = sheet.skills[skillName];
    if (!existing) return null;  // 未知技能不落 ticked（避免造孤儿条目）
    return {
      sheet: {
        ...sheet,
        skills: { ...sheet.skills, [skillName]: { ...existing, ticked: v } },
      },
    };
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
      return { sheet: { ...sheet, secondary: { ...sheet.secondary, luck: next } } };
    }
    const cur = sheet.secondary[sec.stat][sec.field];
    const next = op === 'delta' ? cur + delta : delta;
    const newSheet: CharacterSheet = {
      ...sheet,
      secondary: {
        ...sheet.secondary,
        [sec.stat]: { ...sheet.secondary[sec.stat], [sec.field]: next },
      },
    };
    // SAN 当前值的特例：把本次实际增减 (next - cur) 透出给 A2.4 evaluator，
    // 避免后者再自己读旧 sheet diff，省一次 sheet 快照拷贝且对 replace/delta 都正确。
    if (sec.stat === 'san' && sec.field === 'current') {
      return { sheet: newSheet, sanDelta: next - cur };
    }
    return { sheet: newSheet };
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
      sheet: {
        ...sheet,
        skills: {
          ...sheet.skills,
          [skillName]: {
            base: existing?.base ?? 0,
            current: nextCurrent,
            ticked: existing?.ticked ?? false,
          },
        },
      },
    };
  }

  // Unrecognized 调查员.* subpath (e.g. identity fields, unknown) → not consumed here.
  return null;
}
