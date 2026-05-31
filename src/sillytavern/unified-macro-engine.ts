import type { THVariable } from '../types';
import { formatStatDataYaml } from './mvu-format';

// ── Types ──

export interface MacroContext {
  macroVars: Record<string, string>;
  presetVars?: Record<string, THVariable>;
  charVars: Record<string, string>;
  gameVars: Record<string, string>;
  /** MVU ZOD nested narrative-state tree, for {{format_message_variable::stat_data[.path]}}. */
  statData?: Record<string, unknown>;
  charName: string;
  userName: string;
  modelName?: string;
  lastMessage?: string;
}

export interface MacroResult {
  text: string;
  outletMap: Map<string, string[]>;
  /**
   * 仅用于测试断言/审计日志，记录本次宏解析中发生的变量写操作。
   * 生产管线（useChatPipeline.ts）的变量持久化走 ctx.macroVars diff（对比 store 后 setMacroVar），
   * 并不消费此数组。切勿据此重放副作用——副作用已在解析过程中就地写入 ctx.macroVars。
   */
  mutations: MacroMutation[];
}

export interface MacroMutation {
  op: 'set' | 'inc' | 'dec' | 'add' | 'delete';
  scope: 'local' | 'global' | 'preset';
  name: string;
  value: string;
}

// ── Utilities ──

export function isTruthy(val: string | undefined): boolean {
  if (val === undefined || val === '') return false;
  const lower = val.toLowerCase();
  return lower !== 'false' && lower !== '0' && lower !== 'off' && lower !== 'no';
}

export function parseArgs(raw: string): string[] {
  return raw.split('::').map((s) => s.trim());
}

// ── Phase 0: Escape protection, comments, inject collection ──

const ESCAPE_PLACEHOLDER = '\x00ESC';

export function protectEscapes(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const result = text.replace(/\\\{\\\{([\s\S]*?)\\\}\\\}/g, (_, inner) => {
    tokens.push(`{{${inner}}}`);
    return `${ESCAPE_PLACEHOLDER}${tokens.length - 1}${ESCAPE_PLACEHOLDER}`;
  });
  return { text: result, tokens };
}

export function restoreEscapes(text: string, tokens: string[]): string {
  return text.replace(new RegExp(`${ESCAPE_PLACEHOLDER}(\\d+)${ESCAPE_PLACEHOLDER}`, 'g'), (_, idx) => {
    return tokens[Number(idx)] ?? '';
  });
}

const COMMENT_RE = /\{\{\s*\/\/[\s\S]*?\}\}/g;

export function removeComments(text: string): string {
  return text.replace(COMMENT_RE, '');
}

/**
 * Match inject macros, handling nested {{...}} inside content.
 * Uses a manual brace-depth scanner instead of pure regex.
 */
export function collectInjects(text: string, outletMap: Map<string, string[]>): string {
  const INJECT_START = /\{\{\s*inject\s*::\s*(\S+?)\s*::\s*/gi;
  let result = '';
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  // Reset lastIndex for safety
  INJECT_START.lastIndex = 0;
  while ((m = INJECT_START.exec(text)) !== null) {
    const key = m[1];
    const contentStart = m.index + m[0].length;
    // Scan forward to find matching }} at depth 0
    let depth = 1; // we are inside one {{ already
    let i = contentStart;
    while (i < text.length) {
      if (text[i] === '{' && text[i + 1] === '{') {
        depth++;
        i += 2;
      } else if (text[i] === '}' && text[i + 1] === '}') {
        depth--;
        if (depth === 0) break;
        i += 2;
      } else {
        i++;
      }
    }
    if (depth !== 0) break; // unmatched, stop
    const content = text.slice(contentStart, i).trim();
    result += text.slice(lastEnd, m.index);
    lastEnd = i + 2; // skip the closing }}
    if (!outletMap.has(key)) outletMap.set(key, []);
    outletMap.get(key)!.push(content);
    INJECT_START.lastIndex = lastEnd;
  }
  result += text.slice(lastEnd);
  return result;
}

// ── Phase 1a: Basic placeholders ──

function rollDice(expr: string): number {
  const m = expr.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return 0;
  const [, countStr, sidesStr, modStr] = m;
  const count = Number(countStr);
  const sides = Number(sidesStr);
  const mod = modStr ? Number(modStr) : 0;
  let total = mod;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

const DAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// Two separate patterns to avoid matching command macros like {{getvar::x}}
// No-arg: matches {{char}}, {{user}}, {{time}}, etc.
const BASIC_NOARG_RE = /\{\{\s*(\w+)\s*\}\}/gi;
// With-arg: only for macros that take :: args (random, roll, newline, format_message_variable)
const BASIC_WITHARG_RE = /\{\{\s*(random|roll|newline|format_message_variable)\s*::\s*([\s\S]*?)\s*\}\}/gi;

export function resolvePlaceholders(text: string, ctx: MacroContext): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  // First pass: resolve with-arg macros (random, roll, newline::N)
  let result = text.replace(BASIC_WITHARG_RE, (match, rawName: string, rawArg: string) => {
    switch (rawName.toLowerCase()) {
      case 'newline': return '\n'.repeat(Number(rawArg) || 1);
      case 'random': {
        const options = rawArg.split('::').map((s) => s.trim());
        return options[Math.floor(Math.random() * options.length)];
      }
      case 'roll': return String(rollDice(rawArg.trim()));
      case 'format_message_variable': {
        // {{format_message_variable::stat_data}} or ::stat_data.世界.时间 — serialize the
        // statData (sub)tree to YAML so the AI sees current narrative state. The leading
        // "stat_data" segment is the root; an optional dotted suffix selects a subtree.
        const arg = rawArg.trim();
        const tree = ctx.statData ?? {};
        const path = arg.replace(/^stat_data\.?/, '').trim();
        let target: unknown = tree;
        if (path) {
          for (const seg of path.split('.')) {
            if (target && typeof target === 'object' && !Array.isArray(target)) {
              target = (target as Record<string, unknown>)[seg];
            } else { target = undefined; break; }
          }
        }
        return formatStatDataYaml(target);
      }
      default: return match;
    }
  });

  // Second pass: resolve no-arg macros
  result = result.replace(BASIC_NOARG_RE, (match, rawName: string) => {
    switch (rawName.toLowerCase()) {
      case 'char': return ctx.charName;
      case 'user': return ctx.userName;
      case 'model': return ctx.modelName ?? '';
      case 'lastmessage': return ctx.lastMessage ?? '';
      case 'time':
      case 'isotime':
        return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case 'date':
      case 'isodate':
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      case 'weekday': return DAYS_ZH[now.getDay()];
      case 'newline': return '\n';
      case 'noop': return '';
      case 'trim': return '\x01TRIM\x01';
      default: return match;
    }
  });

  return result;
}

// ── Phase 1b: Command-style variable macros ──

const CMD_MACRO_RE = /\{\{\s*(getvar|setvar|addvar|incvar|decvar|hasvar|deletevar|getglobalvar|setglobalvar|addglobalvar|incglobalvar|decglobalvar|hasglobalvar|deleteglobalvar)\s*::\s*([\s\S]*?)\s*\}\}/gi;

/** Split raw args preserving the value after the first :: (only trims the name, not the value) */
function splitCmdArgs(raw: string): { name: string; rest: string | undefined } {
  const idx = raw.indexOf('::');
  if (idx === -1) return { name: raw.trim(), rest: undefined };
  return { name: raw.slice(0, idx).trim(), rest: raw.slice(idx + 2) };
}

export function resolveCommandMacros(
  text: string,
  ctx: MacroContext,
  mutations: MacroMutation[],
): { text: string } {
  const result = text.replace(CMD_MACRO_RE, (_, rawCmd: string, rawArgs: string) => {
    const cmd = rawCmd.toLowerCase();
    const args = parseArgs(rawArgs);
    const isGlobal = cmd.includes('global');
    const scope: 'local' | 'global' = isGlobal ? 'global' : 'local';
    const baseCmd = cmd.replace('global', '');

    switch (baseCmd) {
      case 'getvar': {
        return ctx.macroVars[args[0]] ?? '';
      }
      case 'setvar': {
        const [name, ...rest] = args;
        const value = rest.join('::');
        ctx.macroVars[name] = value;
        mutations.push({ op: 'set', scope, name, value });
        return '';
      }
      case 'addvar': {
        const { name, rest } = splitCmdArgs(rawArgs);
        const val = rest ?? '';
        const current = ctx.macroVars[name] ?? '';
        const numCurrent = Number(current);
        const numVal = Number(val);
        if (!isNaN(numCurrent) && !isNaN(numVal) && current !== '' && val.trim() !== '') {
          const newVal = String(numCurrent + numVal);
          ctx.macroVars[name] = newVal;
          mutations.push({ op: 'add', scope, name, value: val });
        } else {
          const newVal = current + val;
          ctx.macroVars[name] = newVal;
          mutations.push({ op: 'add', scope, name, value: val });
        }
        return '';
      }
      case 'incvar': {
        const name = args[0];
        const amount = args[1] ? Number(args[1]) || 1 : 1;
        const current = Number(ctx.macroVars[name] || '0') || 0;
        const newVal = String(current + amount);
        ctx.macroVars[name] = newVal;
        mutations.push({ op: 'inc', scope, name, value: String(amount) });
        return newVal;
      }
      case 'decvar': {
        const name = args[0];
        const amount = args[1] ? Number(args[1]) || 1 : 1;
        const current = Number(ctx.macroVars[name] || '0') || 0;
        const newVal = String(current - amount);
        ctx.macroVars[name] = newVal;
        mutations.push({ op: 'dec', scope, name, value: String(amount) });
        return newVal;
      }
      case 'hasvar': {
        return String(args[0] in ctx.macroVars);
      }
      case 'deletevar': {
        delete ctx.macroVars[args[0]];
        mutations.push({ op: 'delete', scope, name: args[0], value: '' });
        return '';
      }
      default:
        return '';
    }
  });
  return { text: result };
}

// ── Phase 1c: Variable shorthands ──

const SHORTHAND_RE = /\{\{\s*([.$])([\w]+)\s*(?:(\?\?=|\|\|=|\+=|-=|==|!=|>=|<=|\?\?|\|\||\+\+|--|[=><])\s*([\s\S]*?)\s*)?\}\}/g;

export function resolveShorthands(
  text: string,
  ctx: MacroContext,
  mutations: MacroMutation[],
): { text: string } {
  const result = text.replace(SHORTHAND_RE, (_, prefix: string, name: string, op: string | undefined, value: string | undefined) => {
    const scope: 'local' | 'global' = prefix === '.' ? 'local' : 'global';
    const currentVal = ctx.macroVars[name];

    if (!op) {
      return currentVal ?? '';
    }

    switch (op) {
      case '=': {
        const v = value ?? '';
        ctx.macroVars[name] = v;
        mutations.push({ op: 'set', scope, name, value: v });
        return '';
      }
      case '++': {
        const num = (Number(currentVal) || 0) + 1;
        const v = String(num);
        ctx.macroVars[name] = v;
        mutations.push({ op: 'inc', scope, name, value: '1' });
        return v;
      }
      case '--': {
        const num = (Number(currentVal) || 0) - 1;
        const v = String(num);
        ctx.macroVars[name] = v;
        mutations.push({ op: 'dec', scope, name, value: '1' });
        return v;
      }
      case '+=': {
        const v = value ?? '';
        const numCur = Number(currentVal);
        const numVal = Number(v);
        if (!isNaN(numCur) && !isNaN(numVal) && currentVal !== undefined && currentVal !== '' && v !== '') {
          ctx.macroVars[name] = String(numCur + numVal);
        } else {
          ctx.macroVars[name] = (currentVal ?? '') + v;
        }
        mutations.push({ op: 'add', scope, name, value: v });
        return '';
      }
      case '-=': {
        const v = value ?? '0';
        const num = (Number(currentVal) || 0) - (Number(v) || 0);
        ctx.macroVars[name] = String(num);
        mutations.push({ op: 'dec', scope, name, value: v });
        return '';
      }
      case '==':
        return String((currentVal ?? '') === (value ?? ''));
      case '!=':
        return String((currentVal ?? '') !== (value ?? ''));
      case '>':
        return String(Number(currentVal) > Number(value));
      case '<':
        return String(Number(currentVal) < Number(value));
      case '>=':
        return String(Number(currentVal) >= Number(value));
      case '<=':
        return String(Number(currentVal) <= Number(value));
      case '||':
        return isTruthy(currentVal) ? (currentVal ?? '') : (value ?? '');
      case '??':
        return currentVal !== undefined ? currentVal : (value ?? '');
      case '||=': {
        if (!isTruthy(currentVal)) {
          const v = value ?? '';
          ctx.macroVars[name] = v;
          mutations.push({ op: 'set', scope, name, value: v });
          return v;
        }
        return currentVal ?? '';
      }
      case '??=': {
        if (currentVal === undefined) {
          const v = value ?? '';
          ctx.macroVars[name] = v;
          mutations.push({ op: 'set', scope, name, value: v });
          return v;
        }
        return currentVal;
      }
      default:
        return '';
    }
  });
  return { text: result };
}

// ── Phase 1d: If block parser ──

interface IfToken {
  type: 'if' | 'else' | 'endif';
  condition?: string;
  start: number;
  end: number;
}

/**
 * Tokenize if/else/endif blocks, handling nested {{...}} inside conditions.
 * We scan for {{ and then determine if it's an if/else/endif token by peeking
 * at the content. For {{if ...}}, we need to handle nested braces to find the
 * correct closing }}.
 */
function tokenizeIfBlocks(text: string): IfToken[] {
  const tokens: IfToken[] = [];
  let i = 0;
  while (i < text.length - 1) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const start = i;
      i += 2;
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i])) i++;

      // Check what kind of token this is
      const remaining = text.slice(i);
      const elseMatch = remaining.match(/^(else)\s*\}\}/i);
      const endifMatch = remaining.match(/^(\/if)\s*\}\}/i);
      const ifMatch = remaining.match(/^(if)\s+/i);

      if (elseMatch) {
        const end = i + elseMatch[0].length;
        tokens.push({ type: 'else', start, end });
        i = end;
      } else if (endifMatch) {
        const end = i + endifMatch[0].length;
        tokens.push({ type: 'endif', start, end });
        i = end;
      } else if (ifMatch) {
        // Skip past "if "
        i += ifMatch[0].length;
        // Now scan for the closing }} at depth 0 (counting nested {{ }})
        let depth = 1; // we are inside the outer {{
        const condStart = i;
        while (i < text.length) {
          if (text[i] === '{' && i + 1 < text.length && text[i + 1] === '{') {
            depth++;
            i += 2;
          } else if (text[i] === '}' && i + 1 < text.length && text[i + 1] === '}') {
            depth--;
            if (depth === 0) {
              const condition = text.slice(condStart, i).trim();
              const end = i + 2;
              tokens.push({ type: 'if', condition, start, end });
              i = end;
              break;
            }
            i += 2;
          } else {
            i++;
          }
        }
      } else {
        // Not an if/else/endif token, skip
        // Don't increment, let the main loop continue from i
      }
    } else {
      i++;
    }
  }
  return tokens;
}

function resolveCondition(condition: string, ctx: MacroContext, mutations: MacroMutation[]): boolean {
  let resolved = condition;
  resolved = resolveShorthands(resolved, ctx, mutations).text;
  resolved = resolvePlaceholders(resolved, ctx);
  resolved = resolved.trim();
  const inverted = resolved.startsWith('!');
  if (inverted) resolved = resolved.slice(1).trim();
  const result = isTruthy(resolved);
  return inverted ? !result : result;
}

export function resolveIfBlocks(text: string, ctx: MacroContext, mutations: MacroMutation[]): string {
  let result = text;
  let safety = 50;

  while (safety-- > 0) {
    const tokens = tokenizeIfBlocks(result);
    if (tokens.length === 0) break;

    let foundBlock = false;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'if') continue;

      let depth = 0;
      let elseIdx = -1;
      let endIdx = -1;

      for (let j = i; j < tokens.length; j++) {
        if (tokens[j].type === 'if') depth++;
        if (tokens[j].type === 'endif') {
          depth--;
          if (depth === 0) { endIdx = j; break; }
        }
        if (tokens[j].type === 'else' && depth === 1) elseIdx = j;
      }

      if (endIdx === -1) continue;

      const ifToken = tokens[i];
      const endToken = tokens[endIdx];
      const truthy = resolveCondition(ifToken.condition!, ctx, mutations);

      let replacement: string;
      if (elseIdx >= 0) {
        const elseToken = tokens[elseIdx];
        const trueBranch = result.slice(ifToken.end, elseToken.start);
        const falseBranch = result.slice(elseToken.end, endToken.start);
        replacement = truthy ? trueBranch : falseBranch;
      } else {
        replacement = truthy ? result.slice(ifToken.end, endToken.start) : '';
      }

      result = result.slice(0, ifToken.start) + replacement + result.slice(endToken.end);
      foundBlock = true;
      break;
    }

    if (!foundBlock) break;
  }

  return result;
}

// ── Phase 1e: Backward compatibility layer ──

const COMPAT_GET_RE = /\{\{get_(global|preset|chat|char|character)_variable::([^}]+)\}\}/gi;
const COMPAT_FMT_RE = /\{\{format_(global|preset|chat|char|character)_variable::([^:}]+)::([^}]*)\}\}/gi;
const LEGACY_TAG_RE = /<(USER|BOT|CHAR)>/g;

function resolveCompatScope(scope: string, name: string, ctx: MacroContext): string | null {
  const s = scope.toLowerCase();
  switch (s) {
    case 'global':
    case 'chat':
      return ctx.macroVars[name] ?? null;
    case 'preset':
      return ctx.presetVars?.[name]?.value ?? null;
    case 'char':
    case 'character':
      return ctx.charVars[name] ?? null;
    default:
      return null;
  }
}

export function resolveCompatLayer(text: string, ctx: MacroContext): { text: string } {
  let result = text;

  result = result.replace(COMPAT_FMT_RE, (_, scope: string, name: string, template: string) => {
    const val = resolveCompatScope(scope, name, ctx);
    if (val === null) return `[未找到: ${scope}.${name}]`;
    return template.includes('%s') ? template.replace('%s', val) : val;
  });

  result = result.replace(COMPAT_GET_RE, (_, scope: string, name: string) => {
    const val = resolveCompatScope(scope, name, ctx);
    if (val === null) return `[未找到: ${scope}.${name}]`;
    return val;
  });

  result = result.replace(LEGACY_TAG_RE, (_, tag: string) => {
    switch (tag.toUpperCase()) {
      case 'USER': return ctx.userName;
      case 'BOT':
      case 'CHAR': return ctx.charName;
      default: return '';
    }
  });

  return { text: result };
}

// ── Phase 1f: Fallback variable lookup ──

const FALLBACK_VAR_RE = /\{\{([\w一-鿿][\w一-鿿.]*)\}\}/g;

export function resolveFallbackVars(text: string, ctx: MacroContext): string {
  return text.replace(FALLBACK_VAR_RE, (match, name: string) => {
    if (name in ctx.gameVars) return ctx.gameVars[name];
    if (name in ctx.charVars) return ctx.charVars[name];
    return match;
  });
}

// ── Phase 2: Outlet system ──

const OUTLET_RE = /\{\{\s*outlet\s*::\s*(\S+?)\s*\}\}/gi;

function fillOutlets(text: string, outletMap: Map<string, string[]>): string {
  return text.replace(OUTLET_RE, (_, key: string) => {
    const contents = outletMap.get(key);
    return contents ? contents.join('\n') : '';
  });
}

// ── Phase 3: Post-processing ──

function processTrim(text: string): string {
  return text.replace(/[ \t]*\x01TRIM\x01[ \t]*/g, '').replace(/^\n+|\n+$/g, '');
}

// ── Iterative resolver ──

function iterativeResolve(text: string, ctx: MacroContext, mutations: MacroMutation[], maxDepth: number): string {
  let result = text;
  for (let i = 0; i < maxDepth; i++) {
    const before = result;
    result = resolveIfBlocks(result, ctx, mutations);
    result = resolveShorthands(result, ctx, mutations).text;
    result = resolvePlaceholders(result, ctx);
    result = resolveCommandMacros(result, ctx, mutations).text;
    result = resolveCompatLayer(result, ctx).text;
    result = resolveFallbackVars(result, ctx);
    if (result === before) break;
  }
  return result;
}

// ── Public API ──

export function resolveAllMacros(
  text: string,
  ctx: MacroContext,
  options?: { maxDepth?: number },
): MacroResult {
  const maxDepth = options?.maxDepth ?? 5;
  const mutations: MacroMutation[] = [];
  const outletMap = new Map<string, string[]>();

  const { text: escaped, tokens } = protectEscapes(text);
  let result = removeComments(escaped);
  result = collectInjects(result, outletMap);
  result = iterativeResolve(result, ctx, mutations, maxDepth);

  for (const [key, contents] of outletMap) {
    outletMap.set(key, contents.map((c) => iterativeResolve(c, ctx, mutations, maxDepth)));
  }
  result = fillOutlets(result, outletMap);
  result = restoreEscapes(result, tokens);
  result = processTrim(result);

  return { text: result, outletMap, mutations };
}

export function resolveAllMacrosBatch(
  texts: string[],
  ctx: MacroContext,
  options?: { maxDepth?: number },
): MacroResult[] {
  const maxDepth = options?.maxDepth ?? 5;
  const sharedOutletMap = new Map<string, string[]>();
  const allMutations: MacroMutation[][] = texts.map(() => []);
  const allTokens: string[][] = [];

  const phase0 = texts.map((t) => {
    const { text: escaped, tokens } = protectEscapes(t);
    allTokens.push(tokens);
    let result = removeComments(escaped);
    result = collectInjects(result, sharedOutletMap);
    return result;
  });

  const phase1 = phase0.map((t, i) => iterativeResolve(t, ctx, allMutations[i], maxDepth));

  for (const [key, contents] of sharedOutletMap) {
    sharedOutletMap.set(key, contents.map((c) => iterativeResolve(c, ctx, [], maxDepth)));
  }

  const phase2 = phase1.map((t) => fillOutlets(t, sharedOutletMap));

  return phase2.map((t, i) => {
    let result = restoreEscapes(t, allTokens[i]);
    result = processTrim(result);
    return { text: result, outletMap: sharedOutletMap, mutations: allMutations[i] };
  });
}
