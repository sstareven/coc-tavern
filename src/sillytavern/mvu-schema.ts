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
 * COC 项目的示例 schema。路径用 dot-path 表达，`*` 表示任意单段通配
 * （如 '剧情.暗线.*.进度' 匹配 '剧情.暗线.邪教.进度'）。
 *
 * 注：'调查员.技能.*' 与 mvu-charsheet-redirect.ts 中
 * '调查员.技能.<技能名>' 的命名空间一致，作为技能字段约束蓝本（0..99）。
 * 枚举严重度等借鉴该文件的 SEVERITIES 风格。
 */
export const COC_MVU_SCHEMA: MvuSchema = {
  rules: {
    '调查员.HP': { kind: 'number', min: 0 },
    '调查员.SAN': { kind: 'number', min: 0, max: 99 },
    '调查员.技能.*': { kind: 'number', min: 0, max: 99 },
    '世界.时间.小时': { kind: 'number', min: 0, max: 23 },
    '世界.天气': { kind: 'enum', values: ['晴', '阴', '雨', '雾', '雪'] },
    '剧情.暗线.*.进度': { kind: 'number', min: 0, max: 100 },
    '剧情.暗线.*.状态': { kind: 'enum', values: ['未触发', '进行中', '已揭示', '已闭合'] },
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
