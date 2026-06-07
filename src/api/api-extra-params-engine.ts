// src/api/api-extra-params-engine.ts —— ApiProfile.extraParams 解析与应用 (纯函数)
// 设计:与 zustand/React/网络完全解耦,所有解析+应用都是纯函数,可独立单测。
//
// 语法(每行一条,按顺序应用;空行 + # 行整体忽略):
//   - field                           禁用(删除)字段;支持 dot path(如 stream_options.include_usage)
//   + field value                     添加或覆盖字段
//   field value                       同上(裸覆盖,兼容)
//   # 任意注释                         忽略
//
// value 类型识别(按优先级首个命中即采纳):
//   true / false       → boolean
//   null               → null
//   ^-?\d+(\.\d+)?$    → number
//   { / [ 开头         → JSON.parse;失败回退原 string
//   "..." 双引号包裹   → 剥引号 string
//   其他                → 原样 string(trim 后)
//
// 应用顺序:与文件顺序一致,后行覆盖前行(- top_p 然后 + top_p 0.9 → 最终保留 0.9)。
// 错误处理:单行解析失败 → 跳过该行 + console.warn,不抛错,不影响其他行。
//
// 触发场景:DeepSeek 等模型拒绝 temperature+top_p 同传,用 `- top_p` 局部禁用解决。

/** 字段名匹配:必须以字母/下划线开头,支持点号嵌套。 */
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** 单条规则:删除或赋值,带行号供 debug。 */
export type ExtraParamRule =
  | { kind: 'remove'; path: string[]; line: number }
  | { kind: 'set'; path: string[]; value: unknown; line: number };

interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

interface ParseResult {
  rules: ExtraParamRule[];
  errors: ParseError[];
}

/** 把一行 value 字符串识别成 unknown(自动判断类型)。 */
function parseValue(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return ''; // 显式空串
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s); } catch { /* fall through to string */ }
  }
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  return s;
}

/**
 * 解析 extraParams 文本为规则数组。返回 { rules, errors }。
 * 空串/纯注释 → rules:[], errors:[]
 */
export function parseExtraParamsRules(text: string): ParseResult {
  const rules: ExtraParamRule[] = [];
  const errors: ParseError[] = [];
  if (!text || typeof text !== 'string') return { rules, errors };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // 形态:`- field` 或 `+ field value` 或 `field value`
    let kind: 'remove' | 'set' = 'set';
    let rest = trimmed;
    if (trimmed.startsWith('-')) {
      kind = 'remove';
      rest = trimmed.slice(1).trim();
    } else if (trimmed.startsWith('+')) {
      rest = trimmed.slice(1).trim();
    }

    // rest 切第一个空白前为 field,剩余为 value
    const m = rest.match(/^(\S+)(?:\s+(.+))?$/);
    if (!m) {
      errors.push({ line: i + 1, raw, reason: '空字段名' });
      continue;
    }
    const field = m[1];
    const valueRaw = m[2];

    if (!FIELD_RE.test(field)) {
      errors.push({ line: i + 1, raw, reason: '字段名不合法(只允许字母/数字/下划线/点号)' });
      continue;
    }
    const path = field.split('.');

    if (kind === 'remove') {
      if (valueRaw !== undefined) {
        errors.push({ line: i + 1, raw, reason: '- 删除规则不接受 value' });
        continue;
      }
      rules.push({ kind: 'remove', path, line: i + 1 });
    } else {
      if (valueRaw === undefined) {
        errors.push({ line: i + 1, raw, reason: '+ 添加规则缺少 value' });
        continue;
      }
      const value = parseValue(valueRaw);
      rules.push({ kind: 'set', path, value, line: i + 1 });
    }
  }

  return { rules, errors };
}

/** 把规则应用到 body。返回新对象(浅克隆顶层 + 路径上嵌套写时复制),原 body 不变。 */
function applyOne(body: Record<string, unknown>, rule: ExtraParamRule): Record<string, unknown> {
  if (rule.path.length === 0) return body;
  const next: Record<string, unknown> = { ...body };

  if (rule.path.length === 1) {
    if (rule.kind === 'remove') delete next[rule.path[0]];
    else next[rule.path[0]] = rule.value;
    return next;
  }

  // 多层路径:递归写时复制
  const [head, ...tail] = rule.path;
  const existing = next[head];
  const sub: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  next[head] = applyOne(sub, { ...rule, path: tail } as ExtraParamRule);
  return next;
}

/**
 * 把规则(或原始文本)应用到 body,返回新对象。
 * 空规则/空文本 → 直接返回原 body 的浅拷贝(免外部 mutate 顾虑)。
 */
export function applyExtraParamsRules(
  body: Record<string, unknown>,
  rulesOrText: ExtraParamRule[] | string,
): Record<string, unknown> {
  const rules: ExtraParamRule[] = typeof rulesOrText === 'string'
    ? parseExtraParamsRules(rulesOrText).rules
    : rulesOrText;
  if (rules.length === 0) return { ...body };

  let acc = body;
  for (const r of rules) {
    acc = applyOne(acc, r);
  }
  return acc;
}

/** 给 UI 展示「N 条 / 跳过 M 条 / 首个错误」的轻量摘要。 */
export function summarizeExtraParamsRules(text: string): { ok: number; skipped: number; firstError?: string } {
  const { rules, errors } = parseExtraParamsRules(text);
  return {
    ok: rules.length,
    skipped: errors.length,
    firstError: errors[0]?.reason,
  };
}
