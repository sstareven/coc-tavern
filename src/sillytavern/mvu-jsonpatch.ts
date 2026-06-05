// ===== MVU JSON Patch: pure parser + applier (MagVarUpdate ZOD dialect) =====
// Inspired by MagicalAstrogy/MagVarUpdate (beta JSONPatch variable update).
// NOTE: this is *translate-then-apply* semantics, NOT standard RFC 6902.
// Zero store dependencies, no side effects beyond mutating the passed `tree`.

import { matchRule, validateValue, clampToNumberRule, type MvuSchema } from './mvu-schema';

/* ============================== Types ============================== */

export type MvuOp =
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'delta'; path: string; value: number }
  | { op: 'insert' | 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move'; from: string; path?: string; to?: string };

/**
 * 一条 op 应用失败的结构化记录。`reason` 是人类可读的说明（含期望值/范围），
 * 既用于日志，也直接回灌给 LLM 让其自纠（见 useChatPipeline.runMvuSelfCorrect）。
 */
export interface MvuOpError {
  op: string;
  path: string;
  value: unknown;
  reason: string;
  rawOp: unknown;
}

/**
 * 一次 MVU 补丁应用后的汇总：成功条数 + 结构化失败清单。
 * processResponse / useChatPipeline / post-settle-evaluators 共享同一形状，集中此处避免内联重复。
 *
 * charSheetDeltas（A2.4）：本回合 MVU 应用中通过 applyCharsheetRedirect 旁路捕获的角色卡数值增减，
 * 由 useVariableStore.processResponse 聚合后透传给 post-settle-evaluator——sanityEvaluator 据此
 * 判定本次事件触发 INT 检定 / 不定性疯狂 / 永久疯狂。episodeId 用作幂等指纹：相同
 * (page+sanDelta+oldSan+ts) 不重复触发 INT 弹窗。
 */
export interface MvuPatchReport {
  applied: number;
  failed: MvuOpError[];
  /** A2.4：本回合角色卡数值旁路增减（目前只有 SAN 当前值；后续若有 HP/MP 类似需求一并扩在此）。 */
  charSheetDeltas?: { sanDelta?: number; episodeId?: string };
}

export interface ApplyOpts {
  /**
   * Return true when the op has been consumed externally (this engine skips it),
   * used to redirect e.g. `调查员.*` writes onto the character sheet.
   * Receives the resolved dot-path.
   */
  redirect?: (dotPath: string, op: string, value: unknown) => boolean;
  onError?: (msg: string) => void;
  /** 结构化失败回调：在 onError(字符串日志) 之外，额外收集每条失败 op 的上下文。 */
  onOpError?: (err: MvuOpError) => void;
  /** 可选的轻量字段校验：命中受控路径时对值做 type/enum/range 判定，违约则拒绝该 op。 */
  schema?: MvuSchema;
}

/* ============================== Extraction ============================== */

const BLOCK_RE =
  /<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable\s*>/gi;
const INNER_RE =
  /<(?:JSONPatch|JsonPatch|json_patch)\b[^>]*>([\s\S]*?)<\/(?:JSONPatch|JsonPatch|json_patch)\s*>/gi;
const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gi;

/**
 * Extract MVU JSON Patch operation arrays from LLM reply text.
 *
 * Tolerant of:
 *  - tag casing/variants: `<JSONPatch>` / `<JsonPatch>` / `<json_patch>`
 *  - inner markdown ```json fences (stripped)
 *  - multiple blocks (all collected & merged)
 *
 * Inner content is parsed with JSON.parse. On parse failure the block is
 * skipped. Returns the raw (unvalidated) op objects; validation happens
 * per-op inside applyMvuPatch.
 */
export function extractJsonPatchBlocks(text: string): unknown[] {
  if (!text) return [];
  const result: unknown[] = [];
  let blockMatch: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((blockMatch = BLOCK_RE.exec(text)) !== null) {
    const blockBody = blockMatch[1];
    INNER_RE.lastIndex = 0;
    let innerMatch: RegExpExecArray | null;
    while ((innerMatch = INNER_RE.exec(blockBody)) !== null) {
      const raw = innerMatch[1].replace(FENCE_RE, '').trim();
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const op of parsed) result.push(op);
        }
      } catch (err) {
        // malformed block: skip, do not abort other blocks
        console.warn('[mvu-jsonpatch] 跳过畸形 JSONPatch 块:', err, '原文:', raw.slice(0, 200));
      }
    }
  }
  return result;
}

/**
 * 嗅探「LLM 想输出 MVU 补丁块、但没能产出任何可用 op」的静默失败。
 *
 * 典型成因：响应在末尾的 <UpdateVariable>…</UpdateVariable> 处被 max_tokens 截断
 * （补丁块按 format-instruction 约定写在整个 JSON 之后、是回复的最末尾），
 * 导致 BLOCK_RE 因缺闭合标签整体不匹配、extractJsonPatchBlocks 返回 []。
 * 由于「本回合本就无状态变化」也会得到 0 op，二者不能只看 op 数区分——
 * 故以「出现了 <UpdateVariable 开标签」为判据：开了头却抽不出 op，即疑似截断/畸形。
 *
 * @returns true 表示文本里出现了 UpdateVariable 开标签（调用方据此在 op 数为 0 时告警）。
 */
export function hasUpdateVariableMarker(text: string): boolean {
  return /<UpdateVariable\b/i.test(text);
}

/* ============================== Path helpers ============================== */

/** Split a dot-path into segments. Empty path → []. */
function toPathSegments(dotPath: string): string[] {
  if (dotPath === '') return [];
  return dotPath.split('.');
}

/** JSON Pointer `/a/b/c` → dot-path `a.b.c`. Tolerant of a missing leading `/`. */
function ptrToPath(pointer: string): string {
  const p = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  return p.replace(/\//g, '.');
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === 'object' && v !== null;
}

/** Whether a value is a [number|string|..., string] VWD 2-tuple. */
function isVwdTuple(v: unknown): v is [unknown, string] {
  return Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';
}

function getByPath(tree: Record<string, unknown>, dotPath: string): unknown {
  const segs = toPathSegments(dotPath);
  let cur: unknown = tree;
  for (const seg of segs) {
    if (!isContainer(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function hasPath(tree: Record<string, unknown>, dotPath: string): boolean {
  const segs = toPathSegments(dotPath);
  if (segs.length === 0) return true;
  let cur: unknown = tree;
  for (let i = 0; i < segs.length; i++) {
    if (!isContainer(cur)) return false;
    const seg = segs[i];
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return false;
      cur = cur[idx];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return false;
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return true;
}

function setByPath(
  tree: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const segs = toPathSegments(dotPath);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> | unknown[] = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    const next: unknown = (cur as Record<string, unknown>)[segs[i]];
    if (!isContainer(next)) return;
    cur = next;
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) {
    cur[Number(last)] = value;
  } else {
    (cur as Record<string, unknown>)[last] = value;
  }
}

function unsetByPath(tree: Record<string, unknown>, dotPath: string): void {
  const segs = toPathSegments(dotPath);
  if (segs.length === 0) return;
  let cur: unknown = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isContainer(cur)) return;
    cur = (cur as Record<string, unknown>)[segs[i]];
  }
  if (!isContainer(cur)) return;
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) cur.splice(idx, 1);
  } else {
    delete (cur as Record<string, unknown>)[last];
  }
}

/* ============================== Apply ============================== */

function isPlainOp(op: unknown): op is Record<string, unknown> {
  return typeof op === 'object' && op !== null && !Array.isArray(op);
}

/** A dot-path is read-only if any segment starts with `_` or `$`. */
function isReadOnlyPath(dotPath: string): boolean {
  return toPathSegments(dotPath).some((s) => s.startsWith('_') || s.startsWith('$'));
}

/** Coerce a numeric-string new value when the old value is a number. */
function coerceNumeric(oldVal: unknown, newVal: unknown): unknown {
  if (
    typeof oldVal === 'number' &&
    typeof newVal === 'string' &&
    newVal.trim() !== '' &&
    !Number.isNaN(Number(newVal))
  ) {
    return Number(newVal);
  }
  return newVal;
}

/**
 * Apply MVU patch ops to `tree` in place (MagVarUpdate ZOD dialect).
 * Each op is validated individually; invalid ops are skipped via onError.
 */
export function applyMvuPatch(
  tree: Record<string, unknown>,
  ops: unknown[],
  opts?: ApplyOpts,
): void {
  const baseOnError =
    opts?.onError ?? ((msg: string) => console.warn('[mvu-jsonpatch] op 跳过:', msg));
  const collect = opts?.onOpError;
  const redirect = opts?.redirect;
  const schema = opts?.schema;

  for (const rawOp of ops) {
    // 为本条 op 构造带上下文的错误回调：始终走原 onError(字符串日志)，
    // 并把结构化失败上报给 onOpError（用于校验可见 + AI 自纠回灌）。
    const isObj = isPlainOp(rawOp);
    const ctxOp = isObj && typeof rawOp.op === 'string' ? rawOp.op : '?';
    const ctxPath =
      isObj && typeof rawOp.path === 'string'
        ? ptrToPath(rawOp.path)
        : isObj && typeof rawOp.from === 'string'
          ? ptrToPath(rawOp.from)
          : '';
    const ctxValue = isObj ? rawOp.value : undefined;
    const onError = (msg: string): void => {
      baseOnError(msg);
      collect?.({ op: ctxOp, path: ctxPath, value: ctxValue, reason: msg, rawOp });
    };

    if (!isObj) {
      onError(`invalid op (not an object): ${JSON.stringify(rawOp)}`);
      continue;
    }
    const opName = rawOp.op;
    if (typeof opName !== 'string') {
      onError(`op missing 'op' field: ${JSON.stringify(rawOp)}`);
      continue;
    }

    if (opName === 'move') {
      applyMove(tree, rawOp, onError, redirect);
      continue;
    }

    const rawPath = rawOp.path;
    if (typeof rawPath !== 'string') {
      onError(`op missing 'path': ${JSON.stringify(rawOp)}`);
      continue;
    }
    const dotPath = ptrToPath(rawPath);
    const value = rawOp.value;

    // redirect takes priority (only for ops that carry a path)
    if (redirect && redirect(dotPath, opName, value)) continue;

    // `_`/`$` segments are read-only (empty path is the whole-tree replace,
    // which has no segments and is allowed).
    if (dotPath !== '' && isReadOnlyPath(dotPath)) {
      onError(`read-only path skipped: ${dotPath}`);
      continue;
    }

    switch (opName) {
      case 'replace':
        applyReplace(tree, dotPath, value, onError, schema);
        break;
      case 'delta':
        applyDelta(tree, dotPath, value, onError, schema);
        break;
      case 'insert':
      case 'add':
        applyInsert(tree, dotPath, value, onError);
        break;
      case 'remove':
        applyRemove(tree, dotPath, onError);
        break;
      default:
        onError(`unknown op '${opName}'`);
    }
  }
}

/**
 * 与 applyMvuPatch 同语义，但把每条失败 op 收集进数组并返回，便于调用方
 * （如 useVariableStore / 测试）拿到结构化失败清单。原地修改 `tree`。
 */
export function applyMvuPatchCollect(
  tree: Record<string, unknown>,
  ops: unknown[],
  opts?: ApplyOpts,
): MvuOpError[] {
  const errors: MvuOpError[] = [];
  applyMvuPatch(tree, ops, {
    ...opts,
    onOpError: (err) => {
      errors.push(err);
      opts?.onOpError?.(err);
    },
  });
  return errors;
}

function applyReplace(
  tree: Record<string, unknown>,
  dotPath: string,
  value: unknown,
  onError: (m: string) => void,
  schema?: MvuSchema,
): void {
  if (dotPath === '') {
    if (isContainer(value) && !Array.isArray(value)) {
      Object.assign(tree, value);
    } else {
      onError(`replace at root requires an object value`);
    }
    return;
  }
  if (!hasPath(tree, dotPath)) {
    onError(`replace path does not exist: ${dotPath}`);
    return;
  }
  // 轻量 schema 校验：命中受控路径时拒绝越界/类型不符的新值（VWD 元组由 validateValue 取 [0]）。
  if (schema) {
    const rule = matchRule(schema, dotPath);
    if (rule) {
      const r = validateValue(rule, value);
      if (!r.ok) {
        onError(`schema ${r.reason} at ${dotPath}: 期望 ${r.expected}，收到 ${JSON.stringify(value)}`);
        return;
      }
    }
  }
  const oldVal = getByPath(tree, dotPath);
  if (isVwdTuple(oldVal)) {
    const next = coerceNumeric(oldVal[0], value);
    setByPath(tree, dotPath, [next, oldVal[1]]);
    return;
  }
  setByPath(tree, dotPath, coerceNumeric(oldVal, value));
}

function applyDelta(
  tree: Record<string, unknown>,
  dotPath: string,
  value: unknown,
  onError: (m: string) => void,
  schema?: MvuSchema,
): void {
  if (!hasPath(tree, dotPath)) {
    onError(`delta path does not exist: ${dotPath}`);
    return;
  }
  const delta = typeof value === 'string' ? Number(value) : value;
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    onError(`delta value is not a number: ${JSON.stringify(value)}`);
    return;
  }
  const oldVal = getByPath(tree, dotPath);
  // 计算结果并对结果做 schema 校验（如 HP delta 后跌破 min → 拒绝该 op）。
  const rule = schema ? matchRule(schema, dotPath) : undefined;
  if (isVwdTuple(oldVal)) {
    if (typeof oldVal[0] !== 'number') {
      onError(`delta on non-number VWD value: ${dotPath}`);
      return;
    }
    const result = oldVal[0] + delta;
    if (rule) {
      if (rule.kind === 'number' && rule.min !== undefined && rule.max !== undefined) {
        // 双界字段(进度0-100/态度±100)：越界饱和到边界，不整条丢弃合规增量推进。
        // 单边界字段(如回合数 min:0)不在此列——越界即逻辑错误，应走下面的 reject+自纠。
        setByPath(tree, dotPath, [clampToNumberRule(rule, result), oldVal[1]]);
        return;
      }
      const r = validateValue(rule, result);
      if (!r.ok) {
        onError(`schema ${r.reason} at ${dotPath}: 期望 ${r.expected}，delta 后得 ${result}`);
        return;
      }
    }
    setByPath(tree, dotPath, [result, oldVal[1]]);
    return;
  }
  if (typeof oldVal !== 'number') {
    onError(`delta on non-number value: ${dotPath}`);
    return;
  }
  const result = oldVal + delta;
  if (rule) {
    if (rule.kind === 'number' && rule.min !== undefined && rule.max !== undefined) {
      // 双界字段(进度0-100/态度±100)：越界饱和到边界，不整条丢弃合规增量推进。
      // 单边界字段(如回合数 min:0)不在此列——越界即逻辑错误，应走下面的 reject+自纠。
      setByPath(tree, dotPath, clampToNumberRule(rule, result));
      return;
    }
    const r = validateValue(rule, result);
    if (!r.ok) {
      onError(`schema ${r.reason} at ${dotPath}: 期望 ${r.expected}，delta 后得 ${result}`);
      return;
    }
  }
  setByPath(tree, dotPath, result);
}

function applyInsert(
  tree: Record<string, unknown>,
  dotPath: string,
  value: unknown,
  onError: (m: string) => void,
): void {
  const segs = toPathSegments(dotPath);
  if (segs.length === 0) {
    onError(`insert requires a non-empty path`);
    return;
  }
  const last = segs[segs.length - 1];
  const containerSegs = segs.slice(0, -1);

  // Walk/create the container chain.
  let cur: Record<string, unknown> | unknown[] = tree;
  for (let i = 0; i < containerSegs.length; i++) {
    const seg = containerSegs[i];
    const existing: unknown = Array.isArray(cur)
      ? cur[Number(seg)]
      : (cur as Record<string, unknown>)[seg];
    if (existing === undefined || existing === null) {
      // Decide child container type from the *next* segment.
      const nextSeg = i + 1 < containerSegs.length ? containerSegs[i + 1] : last;
      const child: Record<string, unknown> | unknown[] =
        nextSeg === '-' || /^\d+$/.test(nextSeg) ? [] : {};
      if (Array.isArray(cur)) cur[Number(seg)] = child;
      else (cur as Record<string, unknown>)[seg] = child;
      cur = child;
    } else if (isContainer(existing)) {
      cur = existing;
    } else {
      onError(`insert container is a scalar: ${dotPath}`);
      return;
    }
  }

  if (Array.isArray(cur)) {
    if (last === '-') {
      cur.splice(cur.length, 0, value);
    } else if (/^\d+$/.test(last)) {
      cur.splice(Number(last), 0, value);
    } else {
      onError(`insert into array with non-index key: ${last}`);
    }
  } else if (isContainer(cur)) {
    (cur as Record<string, unknown>)[last] = value;
  } else {
    onError(`insert container is a scalar: ${dotPath}`);
  }
}

function applyRemove(
  tree: Record<string, unknown>,
  dotPath: string,
  onError: (m: string) => void,
): void {
  if (!hasPath(tree, dotPath)) {
    onError(`remove path does not exist: ${dotPath}`);
    return;
  }
  unsetByPath(tree, dotPath);
}

function applyMove(
  tree: Record<string, unknown>,
  rawOp: Record<string, unknown>,
  onError: (m: string) => void,
  redirect: ApplyOpts['redirect'],
): void {
  const from = rawOp.from;
  const destRaw = rawOp.path ?? rawOp.to;
  if (typeof from !== 'string' || typeof destRaw !== 'string') {
    onError(`move requires 'from' and 'path'/'to': ${JSON.stringify(rawOp)}`);
    return;
  }
  const fromPath = ptrToPath(from);
  const destPath = ptrToPath(destRaw);

  if (redirect && (redirect(fromPath, 'move', undefined) || redirect(destPath, 'move', undefined))) {
    return;
  }

  if (isReadOnlyPath(fromPath) || isReadOnlyPath(destPath)) {
    onError(`move touches read-only path: ${fromPath} -> ${destPath}`);
    return;
  }
  if (!hasPath(tree, fromPath)) {
    onError(`move 'from' does not exist: ${fromPath}`);
    return;
  }
  const value = getByPath(tree, fromPath);
  unsetByPath(tree, fromPath);
  applyInsert(tree, destPath, value, onError);
}
