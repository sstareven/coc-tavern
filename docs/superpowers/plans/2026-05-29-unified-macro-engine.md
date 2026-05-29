# Unified Macro Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3 separate macro/substitution layers (macro-engine.ts, tavern-helper-macros.ts, resolvePlaceholders) with one unified engine supporting full ST macro syntax including conditionals, variable shorthands, outlets, and nesting up to 5 levels.

**Architecture:** Layered pipeline — Phase 0 (preprocess: escapes, comments, inject collection) → Phase 1 (iterative resolution up to 5 rounds: if-blocks → variable shorthands → command macros → placeholders → compat layer → fallback lookup) → Phase 2 (outlet filling) → Phase 3 (post-process). EJS engine stays untouched.

**Tech Stack:** TypeScript, Vitest, Zustand stores (read-only from engine)

**Spec:** `docs/superpowers/specs/2026-05-29-unified-macro-engine-design.md`

---

### Task 1: Types, isTruthy, and argument parsing

**Files:**
- Create: `src/sillytavern/unified-macro-engine.ts`
- Create: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests for isTruthy and parseArgs**

```typescript
// src/sillytavern/unified-macro-engine.test.ts
import { describe, it, expect } from 'vitest';
import { isTruthy, parseArgs } from './unified-macro-engine';

describe('isTruthy', () => {
  it('returns false for falsy values', () => {
    expect(isTruthy(undefined)).toBe(false);
    expect(isTruthy('')).toBe(false);
    expect(isTruthy('false')).toBe(false);
    expect(isTruthy('False')).toBe(false);
    expect(isTruthy('0')).toBe(false);
    expect(isTruthy('off')).toBe(false);
    expect(isTruthy('no')).toBe(false);
    expect(isTruthy('NO')).toBe(false);
  });

  it('returns true for truthy values', () => {
    expect(isTruthy('true')).toBe(true);
    expect(isTruthy('1')).toBe(true);
    expect(isTruthy('hello')).toBe(true);
    expect(isTruthy('yes')).toBe(true);
    expect(isTruthy(' ')).toBe(true);
  });
});

describe('parseArgs', () => {
  it('splits on :: separator', () => {
    expect(parseArgs('a::b::c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace from args', () => {
    expect(parseArgs(' a :: b :: c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns single-element array for no separator', () => {
    expect(parseArgs('hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(parseArgs('')).toEqual(['']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement types and utility functions**

```typescript
// src/sillytavern/unified-macro-engine.ts
import type { THVariable } from '../types';

// ── Types ──

export interface MacroContext {
  macroVars: Record<string, string>;
  presetVars?: Record<string, THVariable>;
  charVars: Record<string, string>;
  gameVars: Record<string, string>;
  charName: string;
  userName: string;
  modelName?: string;
  lastMessage?: string;
}

export interface MacroResult {
  text: string;
  outletMap: Map<string, string[]>;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): 统一宏引擎骨架——类型定义+isTruthy+parseArgs"
```

---

### Task 2: Phase 0 — Escape protection, comments, inject collection

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests for Phase 0**

```typescript
// Add to unified-macro-engine.test.ts
import { protectEscapes, restoreEscapes, removeComments, collectInjects } from './unified-macro-engine';

describe('Phase 0: Preprocessing', () => {
  describe('escape protection', () => {
    it('replaces escaped braces with placeholders', () => {
      const { text, tokens } = protectEscapes('hello \\{\\{world\\}\\} end');
      expect(text).not.toContain('\\{\\{');
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toBe('{{world}}');
    });

    it('restores placeholders to literal braces', () => {
      const { text, tokens } = protectEscapes('\\{\\{literal\\}\\}');
      const restored = restoreEscapes(text, tokens);
      expect(restored).toBe('{{literal}}');
    });

    it('handles no escapes', () => {
      const { text, tokens } = protectEscapes('no escapes here');
      expect(text).toBe('no escapes here');
      expect(tokens.length).toBe(0);
    });
  });

  describe('removeComments', () => {
    it('removes inline comments', () => {
      expect(removeComments('before {{// comment}} after')).toBe('before  after');
    });

    it('handles multiple comments', () => {
      expect(removeComments('{{// a}} middle {{// b}}')).toBe(' middle ');
    });
  });

  describe('collectInjects', () => {
    it('collects inject macros into outletMap', () => {
      const map = new Map<string, string[]>();
      const text = collectInjects('before {{inject::CombatInfo::深潜者 HP:45}} after', map);
      expect(text).toBe('before  after');
      expect(map.get('CombatInfo')).toEqual(['深潜者 HP:45']);
    });

    it('collects multiple injects for same key', () => {
      const map = new Map<string, string[]>();
      collectInjects('{{inject::Info::A}} {{inject::Info::B}}', map);
      expect(map.get('Info')).toEqual(['A', 'B']);
    });

    it('handles no injects', () => {
      const map = new Map<string, string[]>();
      const text = collectInjects('nothing here', map);
      expect(text).toBe('nothing here');
      expect(map.size).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement Phase 0 functions**

```typescript
// Add to unified-macro-engine.ts

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

const INJECT_RE = /\{\{\s*inject\s*::\s*(\S+?)\s*::\s*([\s\S]*?)\s*\}\}/g;

export function collectInjects(text: string, outletMap: Map<string, string[]>): string {
  return text.replace(INJECT_RE, (_, key: string, content: string) => {
    if (!outletMap.has(key)) outletMap.set(key, []);
    outletMap.get(key)!.push(content);
    return '';
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): Phase 0——转义保护+注释移除+inject收集"
```

---

### Task 3: Basic placeholders — char, user, time, random, roll, newline, etc.

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests for basic placeholders**

```typescript
// Add to unified-macro-engine.test.ts
import { resolvePlaceholders } from './unified-macro-engine';

function makeCtx(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    macroVars: {},
    charVars: {},
    gameVars: {},
    charName: 'Alice',
    userName: '调查员',
    modelName: 'gpt-4',
    lastMessage: 'Hello world',
    ...overrides,
  };
}

describe('Basic placeholders', () => {
  it('resolves {{char}}', () => {
    expect(resolvePlaceholders('Hello {{char}}', makeCtx())).toBe('Hello Alice');
  });

  it('resolves {{user}}', () => {
    expect(resolvePlaceholders('Hi {{user}}', makeCtx())).toBe('Hi 调查员');
  });

  it('resolves {{model}}', () => {
    expect(resolvePlaceholders('Using {{model}}', makeCtx())).toBe('Using gpt-4');
  });

  it('resolves {{lastMessage}}', () => {
    expect(resolvePlaceholders('Last: {{lastMessage}}', makeCtx())).toBe('Last: Hello world');
  });

  it('is case-insensitive', () => {
    expect(resolvePlaceholders('{{CHAR}} {{User}}', makeCtx())).toBe('Alice 调查员');
  });

  it('resolves {{newline}}', () => {
    expect(resolvePlaceholders('a{{newline}}b', makeCtx())).toBe('a\nb');
  });

  it('resolves {{newline::3}}', () => {
    expect(resolvePlaceholders('a{{newline::3}}b', makeCtx())).toBe('a\n\n\nb');
  });

  it('resolves {{noop}} to empty', () => {
    expect(resolvePlaceholders('a{{noop}}b', makeCtx())).toBe('ab');
  });

  it('resolves {{random::a::b::c}} to one of the options', () => {
    const result = resolvePlaceholders('{{random::晴::阴::雨}}', makeCtx());
    expect(['晴', '阴', '雨']).toContain(result);
  });

  it('resolves {{roll::2d6}} to a number between 2-12', () => {
    const result = resolvePlaceholders('{{roll::2d6}}', makeCtx());
    const num = Number(result);
    expect(num).toBeGreaterThanOrEqual(2);
    expect(num).toBeLessThanOrEqual(12);
  });

  it('resolves {{time}} to HH:MM format', () => {
    const result = resolvePlaceholders('{{time}}', makeCtx());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('resolves {{date}} to YYYY-MM-DD format', () => {
    const result = resolvePlaceholders('{{date}}', makeCtx());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves {{isodate}} to YYYY-MM-DD format', () => {
    const result = resolvePlaceholders('{{isodate}}', makeCtx());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves {{isotime}} to HH:mm format', () => {
    const result = resolvePlaceholders('{{isotime}}', makeCtx());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('resolves {{weekday}} to a day name', () => {
    const result = resolvePlaceholders('{{weekday}}', makeCtx());
    expect(result.length).toBeGreaterThan(0);
  });

  it('leaves unknown macros as-is', () => {
    expect(resolvePlaceholders('{{unknown_macro}}', makeCtx())).toBe('{{unknown_macro}}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL — `resolvePlaceholders` not exported

- [ ] **Step 3: Implement basic placeholder resolver**

```typescript
// Add to unified-macro-engine.ts

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
// With-arg: only for macros that take :: args (random, roll, newline)
const BASIC_WITHARG_RE = /\{\{\s*(random|roll|newline)\s*::\s*([\s\S]*?)\s*\}\}/gi;

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): 基础占位符——char/user/time/date/random/roll/newline/noop"
```

---

### Task 4: Command-style variable macros — getvar, setvar, incvar, decvar, addvar, hasvar, deletevar

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to unified-macro-engine.test.ts
import { resolveCommandMacros } from './unified-macro-engine';

describe('Command-style variable macros', () => {
  it('resolves {{getvar::name}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    const { text } = resolveCommandMacros('HP: {{getvar::hp}}', ctx, []);
    expect(text).toBe('HP: 100');
  });

  it('resolves {{getvar::name}} to empty for missing var', () => {
    const { text } = resolveCommandMacros('{{getvar::missing}}', makeCtx(), []);
    expect(text).toBe('');
  });

  it('resolves {{setvar::name::value}} and mutates ctx', () => {
    const ctx = makeCtx();
    const mutations: MacroMutation[] = [];
    const { text } = resolveCommandMacros('{{setvar::hp::100}}rest', ctx, mutations);
    expect(text).toBe('rest');
    expect(ctx.macroVars.hp).toBe('100');
    expect(mutations).toEqual([{ op: 'set', scope: 'local', name: 'hp', value: '100' }]);
  });

  it('resolves {{incvar::name}} increments by 1', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{incvar::hp}}', ctx, []);
    expect(text).toBe('11');
    expect(ctx.macroVars.hp).toBe('11');
  });

  it('resolves {{incvar::name::5}} increments by N', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{incvar::hp::5}}', ctx, []);
    expect(text).toBe('15');
  });

  it('resolves {{decvar::name}} decrements by 1', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{decvar::hp}}', ctx, []);
    expect(text).toBe('9');
  });

  it('resolves {{addvar::name::value}} adds numeric', () => {
    const ctx = makeCtx({ macroVars: { score: '100' } });
    resolveCommandMacros('{{addvar::score::50}}', ctx, []);
    expect(ctx.macroVars.score).toBe('150');
  });

  it('resolves {{addvar::name::value}} concatenates strings', () => {
    const ctx = makeCtx({ macroVars: { name: 'hello' } });
    resolveCommandMacros('{{addvar::name:: world}}', ctx, []);
    expect(ctx.macroVars.name).toBe('hello world');
  });

  it('resolves {{hasvar::name}} returns true/false', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    expect(resolveCommandMacros('{{hasvar::hp}}', ctx, []).text).toBe('true');
    expect(resolveCommandMacros('{{hasvar::missing}}', ctx, []).text).toBe('false');
  });

  it('resolves {{deletevar::name}} removes the var', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    resolveCommandMacros('{{deletevar::hp}}', ctx, []);
    expect(ctx.macroVars.hp).toBeUndefined();
  });

  it('resolves global variants the same way', () => {
    const ctx = makeCtx({ macroVars: { g: '5' } });
    expect(resolveCommandMacros('{{getglobalvar::g}}', ctx, []).text).toBe('5');
    resolveCommandMacros('{{setglobalvar::x::99}}', ctx, []);
    expect(ctx.macroVars.x).toBe('99');
  });

  it('is case-insensitive for command names', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    expect(resolveCommandMacros('{{GetVar::hp}}', ctx, []).text).toBe('10');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement command macro resolver**

```typescript
// Add to unified-macro-engine.ts

const CMD_MACRO_RE = /\{\{\s*(getvar|setvar|addvar|incvar|decvar|hasvar|deletevar|getglobalvar|setglobalvar|addglobalvar|incglobalvar|decglobalvar|hasglobalvar|deleteglobalvar)\s*::\s*([\s\S]*?)\s*\}\}/gi;

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
        const [name, val] = args;
        const current = ctx.macroVars[name] ?? '';
        const numCurrent = Number(current);
        const numVal = Number(val);
        if (!isNaN(numCurrent) && !isNaN(numVal) && current !== '' && val !== '') {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): 命令式变量宏——get/set/inc/dec/add/has/delete + global variants"
```

---

### Task 5: Variable shorthand parser — all 16+ operators

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to unified-macro-engine.test.ts
import { resolveShorthands } from './unified-macro-engine';

describe('Variable shorthands', () => {
  describe('get (no operator)', () => {
    it('{{.name}} reads local var', () => {
      const ctx = makeCtx({ macroVars: { hp: '100' } });
      expect(resolveShorthands('{{.hp}}', ctx, []).text).toBe('100');
    });

    it('{{$name}} reads global var', () => {
      const ctx = makeCtx({ macroVars: { hp: '100' } });
      expect(resolveShorthands('{{$hp}}', ctx, []).text).toBe('100');
    });

    it('returns empty for missing var', () => {
      expect(resolveShorthands('{{.missing}}', makeCtx(), []).text).toBe('');
    });
  });

  describe('set (=)', () => {
    it('sets variable and returns empty', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.hp = 100}}', ctx, []).text).toBe('');
      expect(ctx.macroVars.hp).toBe('100');
    });
  });

  describe('arithmetic (++, --, +=, -=)', () => {
    it('++ increments by 1 and returns new value', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{.hp++}}', ctx, []).text).toBe('11');
    });

    it('-- decrements by 1 and returns new value', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{.hp--}}', ctx, []).text).toBe('9');
    });

    it('+= adds value and returns empty', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      resolveShorthands('{{.hp += 5}}', ctx, []);
      expect(ctx.macroVars.hp).toBe('15');
    });

    it('-= subtracts value and returns empty', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      resolveShorthands('{{.hp -= 3}}', ctx, []);
      expect(ctx.macroVars.hp).toBe('7');
    });
  });

  describe('comparison (==, !=, >, <, >=, <=)', () => {
    it('== returns "true" on match', () => {
      const ctx = makeCtx({ macroVars: { status: 'active' } });
      expect(resolveShorthands('{{.status == active}}', ctx, []).text).toBe('true');
    });

    it('== returns "false" on mismatch', () => {
      const ctx = makeCtx({ macroVars: { status: 'idle' } });
      expect(resolveShorthands('{{.status == active}}', ctx, []).text).toBe('false');
    });

    it('!= returns "true" on mismatch', () => {
      const ctx = makeCtx({ macroVars: { status: 'idle' } });
      expect(resolveShorthands('{{.status != active}}', ctx, []).text).toBe('true');
    });

    it('> compares numerically', () => {
      const ctx = makeCtx({ macroVars: { hp: '50' } });
      expect(resolveShorthands('{{.hp > 30}}', ctx, []).text).toBe('true');
      expect(resolveShorthands('{{.hp > 80}}', ctx, []).text).toBe('false');
    });

    it('< compares numerically', () => {
      const ctx = makeCtx({ macroVars: { hp: '20' } });
      expect(resolveShorthands('{{.hp < 30}}', ctx, []).text).toBe('true');
    });

    it('>= and <= work', () => {
      const ctx = makeCtx({ macroVars: { hp: '50' } });
      expect(resolveShorthands('{{.hp >= 50}}', ctx, []).text).toBe('true');
      expect(resolveShorthands('{{.hp <= 50}}', ctx, []).text).toBe('true');
    });
  });

  describe('coalescing (||, ??, ||=, ??=)', () => {
    it('|| returns fallback when falsy', () => {
      const ctx = makeCtx({ macroVars: { name: '' } });
      expect(resolveShorthands('{{.name || Guest}}', ctx, []).text).toBe('Guest');
    });

    it('|| returns value when truthy', () => {
      const ctx = makeCtx({ macroVars: { name: 'Alice' } });
      expect(resolveShorthands('{{.name || Guest}}', ctx, []).text).toBe('Alice');
    });

    it('?? returns fallback when undefined', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.missing ?? default}}', ctx, []).text).toBe('default');
    });

    it('?? returns value even if falsy when defined', () => {
      const ctx = makeCtx({ macroVars: { flag: '0' } });
      expect(resolveShorthands('{{.flag ?? default}}', ctx, []).text).toBe('0');
    });

    it('||= sets and returns when falsy', () => {
      const ctx = makeCtx({ macroVars: { name: '' } });
      expect(resolveShorthands('{{.name ||= Guest}}', ctx, []).text).toBe('Guest');
      expect(ctx.macroVars.name).toBe('Guest');
    });

    it('??= sets and returns when undefined', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.missing ??= default}}', ctx, []).text).toBe('default');
      expect(ctx.macroVars.missing).toBe('default');
    });
  });

  describe('whitespace tolerance', () => {
    it('handles extra whitespace', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{ .hp }}', ctx, []).text).toBe('10');
      expect(resolveShorthands('{{ .hp == 10 }}', ctx, []).text).toBe('true');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement shorthand parser**

```typescript
// Add to unified-macro-engine.ts

const SHORTHAND_RE = /\{\{\s*([.$])([\w][\w-]*)\s*(?:(\?\?=|\|\|=|\+=|-=|==|!=|>=|<=|\?\?|\|\||\+\+|--|[=><])\s*([\s\S]*?)\s*)?\}\}/g;

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): 变量简写——16个操作符(get/set/inc/dec/add/sub/compare/coalesce)"
```

---

### Task 6: If block parser — stack-based with nesting

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to unified-macro-engine.test.ts
import { resolveIfBlocks } from './unified-macro-engine';

describe('If block parser', () => {
  it('keeps true branch when condition is truthy', () => {
    const result = resolveIfBlocks('{{if true}}yes{{/if}}', makeCtx(), []);
    expect(result).toBe('yes');
  });

  it('removes content when condition is falsy', () => {
    const result = resolveIfBlocks('{{if false}}no{{/if}}', makeCtx(), []);
    expect(result).toBe('');
  });

  it('uses else branch when condition is falsy', () => {
    const result = resolveIfBlocks('{{if 0}}yes{{else}}no{{/if}}', makeCtx(), []);
    expect(result).toBe('no');
  });

  it('handles ! prefix inversion', () => {
    const result = resolveIfBlocks('{{if !false}}inverted{{/if}}', makeCtx(), []);
    expect(result).toBe('inverted');
  });

  it('resolves nested macros in condition', () => {
    const ctx = makeCtx({ macroVars: { hp: '20' } });
    const result = resolveIfBlocks('{{if {{.hp < 30}}}}low{{else}}ok{{/if}}', ctx, []);
    expect(result).toBe('low');
  });

  it('handles nested if blocks', () => {
    const ctx = makeCtx({ macroVars: { a: 'true', b: 'true' } });
    const result = resolveIfBlocks(
      '{{if {{.a}}}}outer{{if {{.b}}}}inner{{/if}}{{/if}}',
      ctx, [],
    );
    expect(result).toBe('outerinner');
  });

  it('handles nested if with else', () => {
    const ctx = makeCtx({ macroVars: { a: 'true', b: 'false' } });
    const result = resolveIfBlocks(
      '{{if {{.a}}}}A{{if {{.b}}}}B{{else}}C{{/if}}D{{/if}}',
      ctx, [],
    );
    expect(result).toBe('ACD');
  });

  it('leaves unmatched if blocks as-is', () => {
    const result = resolveIfBlocks('{{if true}}no closing', makeCtx(), []);
    expect(result).toBe('{{if true}}no closing');
  });

  it('is case-insensitive for if/else/endif', () => {
    const result = resolveIfBlocks('{{IF true}}yes{{ELSE}}no{{/IF}}', makeCtx(), []);
    expect(result).toBe('yes');
  });

  it('preserves surrounding text', () => {
    const result = resolveIfBlocks('before {{if true}}middle{{/if}} after', makeCtx(), []);
    expect(result).toBe('before middle after');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement if block parser**

```typescript
// Add to unified-macro-engine.ts

const IF_TOKEN_RE = /\{\{\s*(if\s+[\s\S]*?|else|\/if)\s*\}\}/gi;

interface IfToken {
  type: 'if' | 'else' | 'endif';
  condition?: string;
  start: number;
  end: number;
}

function tokenizeIfBlocks(text: string): IfToken[] {
  const tokens: IfToken[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IF_TOKEN_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim();
    if (raw.toLowerCase() === 'else') {
      tokens.push({ type: 'else', start: m.index, end: m.index + m[0].length });
    } else if (raw.toLowerCase() === '/if') {
      tokens.push({ type: 'endif', start: m.index, end: m.index + m[0].length });
    } else if (raw.toLowerCase().startsWith('if ')) {
      tokens.push({ type: 'if', condition: raw.slice(3).trim(), start: m.index, end: m.index + m[0].length });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): if块解析器——栈式匹配+嵌套支持+条件递归解析"
```

---

### Task 7: Backward compatibility layer + fallback variable lookup

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Add to unified-macro-engine.test.ts
import { resolveCompatLayer, resolveFallbackVars } from './unified-macro-engine';

describe('Backward compatibility layer', () => {
  it('resolves {{get_global_variable::x}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{get_global_variable::hp}}', ctx).text).toBe('100');
  });

  it('resolves {{get_chat_variable::x}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{get_chat_variable::hp}}', ctx).text).toBe('100');
  });

  it('resolves {{get_preset_variable::x}} from presetVars', () => {
    const ctx = makeCtx({ presetVars: { mood: { name: 'mood', value: 'happy' } } });
    expect(resolveCompatLayer('{{get_preset_variable::mood}}', ctx).text).toBe('happy');
  });

  it('resolves {{get_char_variable::x}} from charVars', () => {
    const ctx = makeCtx({ charVars: { charName: 'Alice' } });
    expect(resolveCompatLayer('{{get_char_variable::charName}}', ctx).text).toBe('Alice');
  });

  it('resolves {{get_character_variable::x}} same as char', () => {
    const ctx = makeCtx({ charVars: { charHP: '80' } });
    expect(resolveCompatLayer('{{get_character_variable::charHP}}', ctx).text).toBe('80');
  });

  it('resolves {{format_global_variable::x::HP: %s}} with template', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{format_global_variable::hp::HP: %s}}', ctx).text).toBe('HP: 100');
  });

  it('resolves <USER> to user name', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('<USER>', ctx).text).toBe('调查员');
  });

  it('resolves <BOT> and <CHAR> to char name', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('<BOT>', ctx).text).toBe('Alice');
    expect(resolveCompatLayer('<CHAR>', ctx).text).toBe('Alice');
  });

  it('shows [未找到] for missing compat vars', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('{{get_preset_variable::missing}}', ctx).text).toContain('未找到');
  });
});

describe('Fallback variable lookup', () => {
  it('resolves {{varName}} from gameVars', () => {
    const ctx = makeCtx({ gameVars: { charHP: '80' } });
    expect(resolveFallbackVars('HP: {{charHP}}', ctx)).toBe('HP: 80');
  });

  it('resolves Chinese variable names', () => {
    const ctx = makeCtx({ gameVars: { '调查员.生命值.当前': '65' } });
    expect(resolveFallbackVars('{{调查员.生命值.当前}}', ctx)).toBe('65');
  });

  it('falls back from gameVars to charVars', () => {
    const ctx = makeCtx({ charVars: { charName: 'Bob' } });
    expect(resolveFallbackVars('{{charName}}', ctx)).toBe('Bob');
  });

  it('leaves unresolved macros as-is', () => {
    expect(resolveFallbackVars('{{unknown}}', makeCtx())).toBe('{{unknown}}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement compat layer and fallback lookup**

```typescript
// Add to unified-macro-engine.ts

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

const FALLBACK_VAR_RE = /\{\{([\w一-鿿][\w一-鿿.]*)\}\}/g;

export function resolveFallbackVars(text: string, ctx: MacroContext): string {
  return text.replace(FALLBACK_VAR_RE, (match, name: string) => {
    if (name in ctx.gameVars) return ctx.gameVars[name];
    if (name in ctx.charVars) return ctx.charVars[name];
    return match;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): 向后兼容层——get_<scope>_variable+format+<USER>/<BOT>+兜底变量"
```

---

### Task 8: Outlet system + iterative resolver + public API

**Files:**
- Modify: `src/sillytavern/unified-macro-engine.ts`
- Modify: `src/sillytavern/unified-macro-engine.test.ts`

- [ ] **Step 1: Write failing tests for outlet + public API**

```typescript
// Add to unified-macro-engine.test.ts
import { resolveAllMacros, resolveAllMacrosBatch } from './unified-macro-engine';

describe('Outlet system', () => {
  it('fills outlet with collected inject content', () => {
    const texts = [
      '状态: {{outlet::CombatInfo}}',
      '{{inject::CombatInfo::HP: 100}}',
    ];
    const ctx = makeCtx();
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('状态: HP: 100');
    expect(results[1].text).toBe('');
  });

  it('joins multiple injects with newline', () => {
    const texts = [
      '{{outlet::Info}}',
      '{{inject::Info::Line A}}',
      '{{inject::Info::Line B}}',
    ];
    const results = resolveAllMacrosBatch(texts, makeCtx());
    expect(results[0].text).toBe('Line A\nLine B');
  });

  it('resolves macros inside inject content', () => {
    const texts = [
      '{{outlet::Status}}',
      '{{inject::Status::HP: {{.hp}}}}',
    ];
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('HP: 100');
  });

  it('empty outlet when no injects', () => {
    const result = resolveAllMacros('{{outlet::Missing}}', makeCtx());
    expect(result.text).toBe('');
  });
});

describe('resolveAllMacros (single text)', () => {
  it('resolves nested macros through multiple iterations', () => {
    const ctx = makeCtx({ macroVars: { 'Alice_hp': '80' } });
    const result = resolveAllMacros('HP: {{getvar::{{char}}_hp}}', ctx);
    expect(result.text).toBe('HP: 80');
  });

  it('respects maxDepth', () => {
    const ctx = makeCtx();
    const result = resolveAllMacros('{{char}}', ctx, { maxDepth: 1 });
    expect(result.text).toBe('Alice');
  });

  it('handles escape sequences', () => {
    const result = resolveAllMacros('\\{\\{not a macro\\}\\}', makeCtx());
    expect(result.text).toBe('{{not a macro}}');
  });

  it('removes comments', () => {
    const result = resolveAllMacros('before {{// comment}} after', makeCtx());
    expect(result.text).toBe('before  after');
  });

  it('handles complex nested scenario', () => {
    const ctx = makeCtx({ macroVars: { hp: '20', combat: 'true' } });
    const result = resolveAllMacros(
      '{{if {{.combat}}}}战斗中 {{if {{.hp < 30}}}}危险{{else}}安全{{/if}}{{/if}}',
      ctx,
    );
    expect(result.text).toBe('战斗中 危险');
  });

  it('collects mutations from all processing', () => {
    const ctx = makeCtx();
    const result = resolveAllMacros('{{setvar::x::1}}{{.y = 2}}', ctx);
    expect(result.text).toBe('');
    expect(result.mutations.length).toBe(2);
    expect(ctx.macroVars.x).toBe('1');
    expect(ctx.macroVars.y).toBe('2');
  });

  it('handles trim macro', () => {
    const result = resolveAllMacros('\n\n{{trim}}\n\n', makeCtx());
    expect(result.text.trim()).toBe('');
  });
});

describe('resolveAllMacrosBatch', () => {
  it('shares macroVars mutations across texts', () => {
    const texts = [
      '{{setvar::mode::combat}}',
      'Mode: {{getvar::mode}}',
    ];
    const ctx = makeCtx();
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('');
    expect(results[1].text).toBe('Mode: combat');
  });

  it('returns separate MacroResult per text', () => {
    const texts = ['{{char}}', '{{user}}'];
    const results = resolveAllMacrosBatch(texts, makeCtx());
    expect(results.length).toBe(2);
    expect(results[0].text).toBe('Alice');
    expect(results[1].text).toBe('调查员');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the public API — iterativeResolve, resolveAllMacros, resolveAllMacrosBatch**

```typescript
// Add to unified-macro-engine.ts

const OUTLET_RE = /\{\{\s*outlet\s*::\s*(\S+?)\s*\}\}/g;

function fillOutlets(text: string, outletMap: Map<string, string[]>): string {
  return text.replace(OUTLET_RE, (_, key: string) => {
    const contents = outletMap.get(key);
    return contents ? contents.join('\n') : '';
  });
}

function processTrim(text: string): string {
  return text.replace(/[ \t]*\x01TRIM\x01[ \t]*/g, '').replace(/^\n+|\n+$/g, '');
}

function iterativeResolve(text: string, ctx: MacroContext, mutations: MacroMutation[], maxDepth: number): string {
  let result = text;
  for (let i = 0; i < maxDepth; i++) {
    const before = result;
    result = resolveIfBlocks(result, ctx, mutations);
    result = resolveShorthands(result, ctx, mutations).text;
    result = resolvePlaceholders(result, ctx);       // basic placeholders BEFORE commands
    result = resolveCommandMacros(result, ctx, mutations).text;  // so {{getvar::{{char}}_hp}} works
    result = resolveCompatLayer(result, ctx).text;
    result = resolveFallbackVars(result, ctx);
    if (result === before) break;
  }
  return result;
}

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

  const phase0 = texts.map((t, i) => {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sillytavern/unified-macro-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/unified-macro-engine.ts src/sillytavern/unified-macro-engine.test.ts
git commit -m "feat(macro): Outlet系统+迭代解析器+公开API(resolveAllMacros/Batch)"
```

---

### Task 9: Pipeline integration — wire into useChatPipeline.ts

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`
- Modify: `src/sillytavern/prompt-assembler.ts`
- Delete: `src/sillytavern/macro-engine.ts`
- Delete: `src/sillytavern/tavern-helper-macros.ts`

- [ ] **Step 1: Update useChatPipeline.ts imports**

Replace old imports (lines 23-24):

```typescript
// REMOVE these two lines:
// import { processMacros } from '../sillytavern/macro-engine';
// import { resolveTavernHelperMacrosDeep } from '../sillytavern/tavern-helper-macros';

// ADD this line:
import { resolveAllMacros, resolveAllMacrosBatch, type MacroContext } from '../sillytavern/unified-macro-engine';
```

- [ ] **Step 2: Replace macro processing in buildPromptMessages**

In `buildPromptMessages` (around line 125-134), replace the `processMacros` + `filterChat` block:

```typescript
// REMOVE the old processMacros + filterChat block (lines 125-134):
//   const pt = useTavernHelperStore.getState().promptTemplate;
//   const templateEnabled = pt.enabled && pt.generateEnabled;
//   let macroProcessedInput = templateEnabled ? processMacros(effectiveInput) : effectiveInput;
//   if (pt.enabled && pt.filterChatMessage) {
//     macroProcessedInput = macroProcessedInput
//       .replace(/\{\{(?:setvar|getvar|incvar|decvar)::[^}]*\}\}/g, '')
//       .trim();
//   }

// REPLACE with (just pass through for now — unified engine handles macros later):
const pt = useTavernHelperStore.getState().promptTemplate;
let macroProcessedInput = effectiveInput;
```

- [ ] **Step 3: Replace TH macro resolution with unified engine**

Replace lines 288-300 (the `resolveTavernHelperMacrosDeep` block) AND the assemblePrompt call to skip its internal `resolvePlaceholders`:

```typescript
// REMOVE the old TH macro block (lines 288-300):
//   if (useTavernHelperStore.getState().enabled) { ... }

// ADD unified macro engine call (after EJS rendering, before regex):
const charSheet = useCharSheetStore.getState().sheet;
const macroCtx: MacroContext = {
  macroVars: { ...useTavernHelperStore.getState().macroVars },
  presetVars: activePreset.tavernHelperVars,
  charVars: charVars,
  gameVars: gameVars,
  charName: charSheet?.identity?.name ?? '',
  userName: variables['charName'] || '调查员',
  modelName: useSettingsStore.getState().apiModel,
  lastMessage: '', // Will be filled from chat history if available
};

// Resolve macros in all texts at once (shared outletMap for inject/outlet)
const allTexts = [
  processedPreset.systemPrompt,
  ...processedLore.map((e) => e.content),
  macroProcessedInput,
  processedFormat,
];
const macroResults = resolveAllMacrosBatch(allTexts, macroCtx);

// Distribute results back
processedPreset.systemPrompt = macroResults[0].text;
for (let i = 0; i < processedLore.length; i++) {
  processedLore[i].content = macroResults[i + 1].text;
}
macroProcessedInput = macroResults[processedLore.length + 1].text;
const resolvedFormat = macroResults[processedLore.length + 2].text;

// Persist macro var mutations back to store
const mutationStore = useTavernHelperStore.getState();
for (const [key, val] of Object.entries(macroCtx.macroVars)) {
  if (mutationStore.macroVars[key] !== val) {
    mutationStore.setMacroVar(key, val);
  }
}
```

- [ ] **Step 4: Update assemblePrompt call to pass pre-resolved texts**

Change the `assemblePrompt` call to use the already-resolved format instruction, and modify `prompt-assembler.ts` to accept a flag or simply pass `{}` as variables since macros are already resolved:

In `prompt-assembler.ts`, change `resolvePlaceholders` calls to be no-ops when variables is empty. The simplest approach: pass an empty `{}` as variables to `assemblePrompt` since the unified engine already resolved everything.

In `useChatPipeline.ts`, update the assemblePrompt call:

```typescript
const messages = assemblePrompt(
  regexProcessedInput,
  [],
  processedPreset,
  processedLore,
  {},  // ← empty: unified engine already resolved all variables
  resolvedFormat,  // ← use the macro-resolved format
  { before: wbBefore, after: wbAfter },
);
```

- [ ] **Step 5: Delete old macro files**

```bash
git rm src/sillytavern/macro-engine.ts
git rm src/sillytavern/tavern-helper-macros.ts
```

- [ ] **Step 6: Run full test suite and verify dev server starts**

Run: `npx vitest run`
Expected: All tests pass

Run: `npm run dev` (or equivalent)
Expected: App compiles without errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(macro): Pipeline集成——统一宏引擎替换3个旧层+删除旧文件"
```

---

### Task 10: Manual verification & push

**Files:** None (verification only)

- [ ] **Step 1: Verify existing world book entries still work**

Start the dev server, enter the game, and confirm:
1. EJS entries (e.g. `EJS·理智状态`) still render correctly
2. `{{charHP}}`, `{{调查员.生命值.当前}}` placeholders still resolve in prompts
3. `{{get_global_variable::x}}` style macros in any existing world book entries still work

- [ ] **Step 2: Test new macro features**

Create a test world book entry with:
```
{{.test_var = hello}}
Variable: {{.test_var}}
Condition: {{if {{.test_var == hello}}}}matched{{else}}nope{{/if}}
```

Verify the entry content resolves to:
```
Variable: hello
Condition: matched
```

- [ ] **Step 3: Run all tests one final time**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Push**

```bash
git push
```
