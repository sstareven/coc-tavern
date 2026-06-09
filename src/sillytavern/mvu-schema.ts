/**
 * MVU 字段校验 schema（纯函数模块，零副作用、零 import 副作用）。
 *
 * 背景：MVU 用 JSONPatch 风格 op 改写嵌套状态树 statData，值常以 VWD 二元组
 * `[值, 描述]` 存储。本模块只负责「声明受控路径的取值约束」并给出无副作用的
 * 校验判断，供调用方决定是否接受某次写入——它不修改任何状态树。
 *
 * 校验语义刻意与 mvu-jsonpatch.ts 对齐：
 *  - number 字段接受「数字」与「能 coerce 成数字的纯数字字符串」（同 coerceNumeric，
 *    避免把 LLM 给的 "12" 误报为类型错误）。
 *  - VWD 二元组（数组且 length===2 且 [1] 为 string）只校验 [0] 这个真实值。
 */

/** 单个受控字段的取值规则。 */
export type MvuFieldRule =
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'string' }
  | { kind: 'boolean' };

/** 一份 schema：dot-path（可含 `*` 通配段）→ 字段规则。 */
export interface MvuSchema {
  rules: Record<string, MvuFieldRule>;
}

/**
 * COC 项目的受控字段 schema。路径用 dot-path 表达，`*` 表示任意单段通配。
 *
 * 校准依据（权威来源：mvu-initial-statdata.ts 种子 + useLorebookStore 的 [initvar]/schema/EJS）：
 *  - statData 真实根只有 世界.* / 剧情.* / 战斗.*；调查员.* 整支被 redirect 改道角色卡，
 *    **永不进 statData**，故不在此声明（旧的 调查员.HP/SAN/技能.* 是死规则，已删除）。
 *  - 只约束"有明确枚举/范围、且确实落 statData"的字段；自由文本(日期/地点/章节)、动态 map
 *    (关键事件/线索/敌人.*)、以及取值模糊的字段(世界.天气、剧情.结局类型)一律不写规则 →
 *    matchRule 返回 undefined → 调用方走软校验/放行，避免误报触发无谓自纠。
 */
export const COC_MVU_SCHEMA: MvuSchema = {
  rules: {
    // ── 剧情（强枚举/范围）──
    '剧情.阶段': { kind: 'enum', values: ['调查期', '揭露期', '高潮', '结局', '后日谈'] },
    '剧情.暗线.进度': { kind: 'number', min: 0, max: 100 },
    '剧情.暗线.威胁等级': { kind: 'enum', values: ['潜伏', '浮现', '紧迫', '爆发'] },
    '剧情.NPC.*.态度': { kind: 'number', min: -100, max: 100 },
    '剧情.NPC.*.是否存活': { kind: 'boolean' },
    // ── 剧情·救援路径（多结局推进系统）──
    '剧情.救援.全局状态': { kind: 'enum', values: ['潜伏', '对峙', '锁定'] },
    '剧情.救援.胜出路径': { kind: 'string' },
    '剧情.救援.路径.*.已解锁': { kind: 'boolean' },
    '剧情.救援.路径.*.进度': { kind: 'number', min: 0, max: 100 },
    // ── 战斗 ──
    '战斗.是否战斗中': { kind: 'boolean' },
    '战斗.回合数': { kind: 'number', min: 0 },
    // ── 调查员.* 理智/疯狂受控路径（A2.1）──
    //
    // 这些路径在 applyCharsheetRedirect 处会被 REDIRECT 改道到 CharacterSheet（永不落 statData），
    // 但 LLM 写入值仍需 schema 在 redirect 调度前做一层取值约束（与 secondaryTarget/skill 数值字段
    // 的「写前校验」语义对齐）。恐惧症/狂躁症是 string[]，由 redirect 内部 add/remove 语义守门，
    // 不在 schema 声明（避免误报「值不是 string」吞掉合法的数组语义）。
    '调查员.临时疯狂.active': { kind: 'boolean' },
    '调查员.临时疯狂.roundsLeft': { kind: 'number', min: 0 },
    '调查员.临时疯狂.bout.mode': { kind: 'enum', values: ['summary', 'realtime'] },
    '调查员.临时疯狂.bout.table': { kind: 'enum', values: ['VII', 'VIII'] },
    '调查员.临时疯狂.bout.entry': { kind: 'number', min: 1, max: 10 },
    '调查员.不定性疯狂.active': { kind: 'boolean' },
    '调查员.不定性疯狂.daysLeft': { kind: 'number', min: 0 },
    '调查员.永久疯狂': { kind: 'boolean' },
    '调查员.每日理智损失': { kind: 'number', min: 0 },
  },
};

/** dot-path 切段（空串 → 空数组），与 mvu-jsonpatch 的 toPathSegments 同义。 */
function toSegments(dotPath: string): string[] {
  if (dotPath === '') return [];
  return dotPath.split('.');
}

/**
 * 判断 schema 中的 pattern（可含 `*`）是否匹配实际 dotPath。
 * 段数必须相等；`*` 段匹配任意单段，非 `*` 段须逐字相等。
 */
function patternMatches(pattern: string, dotPath: string): boolean {
  const ps = toSegments(pattern);
  const ds = toSegments(dotPath);
  if (ps.length !== ds.length) return false;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] === '*') continue;
    if (ps[i] !== ds[i]) return false;
  }
  return true;
}

/**
 * 在 schema 中查找匹配 dotPath 的规则。
 *  1. 先精确命中（pattern === dotPath）。
 *  2. 否则在所有 `*` 通配 pattern 中取**最具体**的一条——即 `*` 段数最少者。
 * 无命中返回 undefined。
 */
export function matchRule(schema: MvuSchema, dotPath: string): MvuFieldRule | undefined {
  const exact = schema.rules[dotPath];
  if (exact) return exact;

  let best: MvuFieldRule | undefined;
  let bestWildcards = Infinity;
  for (const pattern of Object.keys(schema.rules)) {
    if (!pattern.includes('*')) continue;
    if (!patternMatches(pattern, dotPath)) continue;
    const wildcards = toSegments(pattern).filter((s) => s === '*').length;
    if (wildcards < bestWildcards) {
      bestWildcards = wildcards;
      best = schema.rules[pattern];
    }
  }
  return best;
}

/** 本地 isVwdTuple，语义对齐 mvu-jsonpatch：数组 + length===2 + [1] 为 string。 */
function isVwdTuple(v: unknown): v is [unknown, string] {
  return Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';
}

/**
 * 宽松数字 coerce，语义对齐 mvu-jsonpatch.coerceNumeric：
 * 数字原样接受；纯（非空白）数字字符串转为数字；否则返回 null。
 */
function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/** 校验结果：成功只有 ok，失败带 reason 与人类可读的 expected。 */
type ValidateResult = { ok: true } | { ok: false; reason: string; expected: string };

/**
 * 校验单个值是否满足规则（无副作用，不修改入参）。
 *
 * 若 rawValue 是 VWD 二元组 `[值, 描述]`，只取 [0] 作为待校验值。
 *  - number：用 coerceNumber 宽松转换；转不出 → reason='type'；越界 → reason='range'。
 *  - enum：String(值) 不在 values 列表 → reason='enum'。
 *  - string：接受任意可 String 化的值（宽松）。
 *  - boolean：接受 true/false 及字符串 'true'/'false'（宽松）。
 */
export function validateValue(rule: MvuFieldRule, rawValue: unknown): ValidateResult {
  const value = isVwdTuple(rawValue) ? rawValue[0] : rawValue;

  switch (rule.kind) {
    case 'number': {
      const n = coerceNumber(value);
      if (n === null) return { ok: false, reason: 'type', expected: 'number' };
      if (rule.min !== undefined && n < rule.min) {
        return { ok: false, reason: 'range', expected: rangeText(rule) };
      }
      if (rule.max !== undefined && n > rule.max) {
        return { ok: false, reason: 'range', expected: rangeText(rule) };
      }
      return { ok: true };
    }
    case 'enum': {
      if (!rule.values.includes(String(value))) {
        return { ok: false, reason: 'enum', expected: rule.values.join('|') };
      }
      return { ok: true };
    }
    case 'string': {
      // 宽松：null/undefined 无法稳定 String 化为有意义内容，其余一律接受。
      if (value === null || value === undefined) {
        return { ok: false, reason: 'type', expected: 'string' };
      }
      return { ok: true };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true };
      if (value === 'true' || value === 'false') return { ok: true };
      return { ok: false, reason: 'type', expected: 'boolean' };
    }
  }
}

/** 把 number 规则的 min/max 渲染成 '0..99' 形式（缺省端用空串）。 */
function rangeText(rule: { kind: 'number'; min?: number; max?: number }): string {
  const lo = rule.min !== undefined ? String(rule.min) : '';
  const hi = rule.max !== undefined ? String(rule.max) : '';
  return `${lo}..${hi}`;
}

/**
 * 把数值夹进 number 规则的 [min,max]；非 number 规则或无界则原样返回。
 * 供引擎在 delta 越界时「饱和到边界」而非整条丢弃——避免合规的增量推进（如暗线进度逼近 100、
 * NPC 态度逼近 ±100）被静默吞掉、需靠自纠兜回。
 */
export function clampToNumberRule(rule: MvuFieldRule, n: number): number {
  if (rule.kind !== 'number') return n;
  let r = n;
  if (rule.min !== undefined && r < rule.min) r = rule.min;
  if (rule.max !== undefined && r > rule.max) r = rule.max;
  return r;
}
