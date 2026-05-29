# Unified Macro Engine Design

## Overview

Merge the existing 4-layer macro/substitution system into 2 layers:

1. **EJS Template Engine** (`ejs-template.ts`) — unchanged
2. **Unified Macro Engine** (`unified-macro-engine.ts`) — new, replaces 3 old layers

### Files Changed

| Action | File | Notes |
|--------|------|-------|
| **New** | `src/sillytavern/unified-macro-engine.ts` | ~800-900 lines |
| **Delete** | `src/sillytavern/macro-engine.ts` | Merged into new engine |
| **Delete** | `src/sillytavern/tavern-helper-macros.ts` | Merged into new engine |
| **Modify** | `src/hooks/useChatPipeline.ts` | Replace 3 call sites with 1 |
| **Modify** | `src/sillytavern/prompt-assembler.ts` | Remove `resolvePlaceholders` call from `assemblePrompt` |
| **Unchanged** | `src/sillytavern/ejs-template.ts` | |
| **Unchanged** | `src/sillytavern/th-script-engine.ts` | |
| **Unchanged** | All stores | |

---

## Public API

```typescript
interface MacroContext {
  macroVars: Record<string, string>;
  presetVars?: Record<string, THVariable>;
  charVars: Record<string, string>;
  gameVars: Record<string, string>;
  charName: string;
  userName: string;
  modelName?: string;
  lastMessage?: string;
}

interface MacroResult {
  text: string;
  outletMap: Map<string, string[]>;
  mutations: MacroMutation[];
}

interface MacroMutation {
  op: 'set' | 'inc' | 'dec' | 'add' | 'delete';
  scope: 'local' | 'global' | 'preset';
  name: string;
  value: string;
}

function resolveAllMacros(
  text: string,
  ctx: MacroContext,
  options?: { maxDepth?: number }
): MacroResult;

function resolveAllMacrosBatch(
  texts: string[],
  ctx: MacroContext,
  options?: { maxDepth?: number }
): MacroResult[];
```

- `resolveAllMacrosBatch`: all texts share one `outletMap` so cross-entry inject/outlet works
- `MacroMutation`: records all side effects; caller decides when to persist to store
- Backward compatible: old `{{get_global_variable::x}}` syntax mapped as aliases
- Macro names are case-insensitive: `{{User}}`, `{{USER}}`, `{{user}}` all resolve the same
- Argument separator is `::` (primary); space separator not supported to avoid ambiguity

---

## Supported Macros

### P0: Core

**Basic Placeholders**

| Macro | Output | Source |
|-------|--------|--------|
| `{{char}}` | Character name | `ctx.charName` |
| `{{user}}` | User name | `ctx.userName` |
| `{{model}}` | Model name | `ctx.modelName` |
| `{{lastMessage}}` | Last chat message | `ctx.lastMessage` |
| `{{time}}` | Current time HH:MM | `new Date()` |
| `{{date}}` | Current date YYYY-MM-DD | `new Date()` |
| `{{isodate}}` | ISO date | `new Date()` |
| `{{isotime}}` | ISO time HH:mm | `new Date()` |
| `{{weekday}}` | Day of week | `new Date()` |
| `{{newline}}` / `{{newline::N}}` | Newline(s) | Constant |
| `{{noop}}` | Empty string | Constant |
| `{{trim}}` | Remove surrounding whitespace | Special |

**Variable Operations (command-style)**

| Macro | Effect | Returns |
|-------|--------|---------|
| `{{getvar::name}}` | Read local var | Value |
| `{{setvar::name::value}}` | Set local var | Empty |
| `{{addvar::name::value}}` | Add to var (numeric or string) | Empty |
| `{{incvar::name}}` / `{{incvar::name::N}}` | Increment | New value |
| `{{decvar::name}}` / `{{decvar::name::N}}` | Decrement | New value |
| `{{hasvar::name}}` | Check existence | "true"/"false" |
| `{{deletevar::name}}` | Delete var | Empty |
| `{{getglobalvar::name}}` | Read global var | Value |
| `{{setglobalvar::name::value}}` | Set global var | Empty |
| `{{addglobalvar::name::value}}` | Add to global var | Empty |
| `{{incglobalvar::name}}` / `{{incglobalvar::name::N}}` | Increment global | New value |
| `{{decglobalvar::name}}` / `{{decglobalvar::name::N}}` | Decrement global | New value |
| `{{hasglobalvar::name}}` | Check existence | "true"/"false" |
| `{{deleteglobalvar::name}}` | Delete global var | Empty |

**Variable Shorthands**

Prefix `.` = local, `$` = global.

| Shorthand | Equivalent | Returns |
|-----------|-----------|---------|
| `{{.name}}` | `{{getvar::name}}` | Value |
| `{{$name}}` | `{{getglobalvar::name}}` | Value |
| `{{.name = val}}` | `{{setvar::name::val}}` | Empty |
| `{{.name++}}` | `{{incvar::name}}` | New value |
| `{{.name--}}` | `{{decvar::name}}` | New value |
| `{{.name += N}}` | `{{addvar::name::N}}` | Empty |
| `{{.name -= N}}` | Subtract | Empty |
| `{{.name == val}}` | Compare equal | "true"/"false" |
| `{{.name != val}}` | Compare not equal | "true"/"false" |
| `{{.name > N}}` | Greater than | "true"/"false" |
| `{{.name < N}}` | Less than | "true"/"false" |
| `{{.name >= N}}` | Greater or equal | "true"/"false" |
| `{{.name <= N}}` | Less or equal | "true"/"false" |
| `{{.name \|\| fallback}}` | Return fallback if falsy | Value or fallback |
| `{{.name ?? fallback}}` | Return fallback if undefined | Value or fallback |
| `{{.name \|\|= default}}` | Set if falsy | Final value |
| `{{.name ??= default}}` | Set if undefined | Final value |

**Conditionals**

```
{{if condition}}...{{else}}...{{/if}}
```

- `condition` is resolved first (may contain nested macros)
- Result checked via `isTruthy()`: falsy = empty, "false", "0", "off", "no"
- `!` prefix inverts: `{{if !{{.combat}}}}`
- Supports nesting: if blocks inside if blocks

**Random / Dice**

| Macro | Effect | Example |
|-------|--------|---------|
| `{{random::a::b::c}}` | Pick one randomly | `{{random::晴天::阴天::雨天}}` |
| `{{roll::XdY}}` | Dice roll | `{{roll::2d6}}` → `7` |

**Outlet System**

| Macro | Effect |
|-------|--------|
| `{{outlet::key}}` | Named insertion point, replaced by collected inject content |
| `{{inject::key::content}}` | Inject content into named outlet, self removed |

**Utility**

| Macro | Effect |
|-------|--------|
| `{{// comment}}` | Removed from output |
| `\{\{...\}\}` | Escape — outputs literal `{{...}}` |

### P1: Backward Compatibility

| Legacy Syntax | Maps To |
|---------------|---------|
| `{{get_global_variable::x}}` | `{{getglobalvar::x}}` |
| `{{get_chat_variable::x}}` | `{{getvar::x}}` |
| `{{get_preset_variable::x}}` | Read from `ctx.presetVars` |
| `{{get_char_variable::x}}` / `{{get_character_variable::x}}` | Read from `ctx.charVars` |
| `{{format_<scope>_variable::x::tpl}}` | Read + `%s` replacement |
| `<USER>` | `{{user}}` |
| `<BOT>` / `<CHAR>` | `{{char}}` |

### Fallback Variable Lookup

Any `{{name}}` not matching the above patterns is looked up in `ctx.gameVars` → `ctx.charVars`. Supports Chinese characters and dots in names (e.g. `{{调查员.生命值.当前}}`). Unresolved macros are left as-is.

### Skipped (not needed for COC)

- Group chat macros: `{{group}}`, `{{groupNotMuted}}`, `{{charIfNotGroup}}`, `{{notChar}}`
- ST character card fields: `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{persona}}`, `{{mesExamples}}`
- ST prompt template macros: `{{systemPrompt}}`, `{{instructXxx}}`, etc.
- ST runtime state: `{{summary}}`, `{{hasExtension}}`, `{{isMobile}}`, `{{lastGenerationType}}`
- Context tokens: `{{maxPrompt}}`, `{{maxContextTokens}}`, `{{maxResponseTokens}}`
- Advanced time: `{{datetimeformat}}`, `{{timeDiff}}`, `{{idleDuration}}`
- Stable random: `{{pick}}`
- String utility: `{{reverse}}`
- Scoped macro syntax (multiline `{{setvar x}}...{{/setvar}}`)
- Macro flags: `#`, `!`, `?`, `~`, `>` (except `/` for closing tags)

---

## Processing Pipeline

```
Input text
  │
  ├─ Phase 0: Preprocessing
  │   ├─ Escape protection: \{\{...\}\} → placeholder tokens
  │   ├─ Remove comments: {{// ...}} → empty
  │   └─ Collect {{inject::key::content}} → outletMap, remove self
  │
  ├─ Phase 1: Iterative resolution (max 5 rounds, until stable)
  │   │
  │   │  Each round, in order:
  │   │
  │   ├─ Step A: Resolve {{if}}...{{else}}...{{/if}} blocks
  │   │   ├─ Stack-based matcher finds innermost if block
  │   │   ├─ Condition text recursively macro-resolved
  │   │   ├─ isTruthy() check → keep matching branch
  │   │   └─ Repeat until no if blocks remain
  │   │
  │   ├─ Step B: Variable shorthands
  │   │   ├─ {{.name op value}} / {{$name op value}}
  │   │   ├─ Match long operators first (??=, ||=, +=, -=, ==, !=, >=, <=)
  │   │   └─ Then short operators (??, ||, ++, --, =, >, <) and bare get
  │   │
  │   ├─ Step C: Command-style macros
  │   │   ├─ {{setvar::x::v}} {{getvar::x}} {{incvar::x}} ...
  │   │   ├─ {{setglobalvar::x::v}} {{getglobalvar::x}} ...
  │   │   ├─ {{hasvar::x}} {{deletevar::x}} ...
  │   │   └─ {{addvar::x::v}} {{addglobalvar::x::v}}
  │   │
  │   ├─ Step D: Basic placeholders
  │   │   ├─ {{char}} {{user}} {{model}} {{lastMessage}}
  │   │   ├─ {{time}} {{date}} {{isodate}} {{isotime}} {{weekday}}
  │   │   ├─ {{newline}} {{noop}} {{trim}}
  │   │   └─ {{random::a::b::c}} {{roll::XdY}}
  │   │
  │   ├─ Step E: Backward compatibility layer
  │   │   ├─ {{get_<scope>_variable::x}} → scope-based read
  │   │   ├─ {{format_<scope>_variable::x::tpl}} → read + %s replace
  │   │   └─ <USER> <BOT> <CHAR> → {{user}} {{char}} {{char}}
  │   │
  │   └─ Step F: Fallback variable lookup
  │       └─ {{anyName}} → lookup in gameVars → charVars
  │
  ├─ Phase 2: Outlet filling
  │   └─ {{outlet::key}} → inject collected content from outletMap
  │
  └─ Phase 3: Post-processing
      ├─ Restore escape placeholders → literal \{\{...\}\}
      ├─ Process {{trim}} effect (remove surrounding blank lines)
      └─ Return MacroResult
```

### Inject Content Resolution

Inject content collected in Phase 0 is raw and may contain macros. Before Phase 2 outlet filling, all outletMap values go through Phase 1 iterative resolution.

### Batch Processing for World Book Entries

```typescript
function resolveAllMacrosBatch(texts: string[], ctx: MacroContext): MacroResult[] {
  const outletMap = new Map<string, string[]>();

  // Phase 0: collect injects from ALL texts into shared outletMap
  const phase0 = texts.map(t => collectInjects(t, outletMap));

  // Phase 1: iterative resolve all texts
  const phase1 = phase0.map(t => iterativeResolve(t, ctx));
  // Also resolve inject content in outletMap
  for (const [key, contents] of outletMap) {
    outletMap.set(key, contents.map(c => iterativeResolve(c, ctx)));
  }

  // Phase 2: fill outlets
  const phase2 = phase1.map(t => fillOutlets(t, outletMap));

  // Phase 3: post-process
  return phase2.map(t => postProcess(t, ctx, outletMap));
}
```

---

## Variable Shorthand Parser

### Regex

```typescript
const SHORTHAND_RE = /\{\{\s*([.$])(\w[\w-]*\w|\w)\s*(?:(\?\?=|\|\|=|\+=|-=|==|!=|>=|<=|\?\?|\|\||\+\+|--|[=><])\s*(.*?)\s*)?\}\}/g;
```

Groups: [1]=prefix(.|$), [2]=name, [3]=operator(optional), [4]=value(optional)

### Operator Dispatch

| Operator | Action | Returns |
|----------|--------|---------|
| (none) | Get | Variable value |
| `=` | Set | Empty |
| `++` | Increment by 1 | New value |
| `--` | Decrement by 1 | New value |
| `+=` | Add (numeric or string concat) | Empty |
| `-=` | Subtract (numeric only) | Empty |
| `==` | Compare equal | "true"/"false" |
| `!=` | Compare not equal | "true"/"false" |
| `>` | Greater than | "true"/"false" |
| `<` | Less than | "true"/"false" |
| `>=` | Greater or equal | "true"/"false" |
| `<=` | Less or equal | "true"/"false" |
| `\|\|` | Logical OR (fallback if falsy) | Value or fallback |
| `??` | Nullish coalescing (fallback if undefined) | Value or fallback |
| `\|\|=` | OR-assign (set if falsy) | Final value |
| `??=` | Nullish-assign (set if undefined) | Final value |

### Truthy/Falsy Rules (ST-compatible)

Falsy values: `undefined`, `""`, `"false"`, `"0"`, `"off"`, `"no"` (case-insensitive).
Everything else is truthy.

### Scope Mapping

| Prefix | Scope | Storage |
|--------|-------|---------|
| `.` | local | `ctx.macroVars` |
| `$` | global | `ctx.macroVars` (same store; separate routing possible later) |

### Side Effect Collection

All write operations immediately update `ctx.macroVars` (so subsequent macros in the same batch read new values) AND record to `mutations[]` for the caller to persist.

---

## If Block Parser

### Token Regex

```typescript
const IF_OPEN_RE  = /\{\{\s*if\s+(.*?)\s*\}\}/gi;
const ELSE_RE     = /\{\{\s*else\s*\}\}/gi;
const IF_CLOSE_RE = /\{\{\s*\/if\s*\}\}/gi;
```

### Algorithm

1. Scan text for all `{{if}}`, `{{else}}`, `{{/if}}` positions
2. Stack-based matching to find nesting levels
3. Process from innermost out (inside-out)
4. For each if block:
   a. Recursively resolve macros in condition text
   b. Handle `!` prefix inversion
   c. `isTruthy()` check on resolved condition
   d. Keep matching branch (true or else), replace block in text
5. Repeat until no if blocks remain

### Example

```
Input:  {{if {{.hp < 30}}}}Injured{{else}}Healthy{{/if}}

Round 1 Step A:
  Found if block, condition = "{{.hp < 30}}"
  Resolve condition → "true" (assuming hp=20)
  isTruthy("true") = true → keep "Injured"

Output: Injured
```

---

## Pipeline Integration

### useChatPipeline.ts Changes

**Before (3 separate calls):**
```
Step 2:  processMacros(input)              ← macro-engine.ts
Step 7:  renderTemplate(...)               ← ejs-template.ts (unchanged)
Step 8:  resolveTavernHelperMacrosDeep(...) ← tavern-helper-macros.ts
Step 10: resolvePlaceholders(...)          ← prompt-assembler.ts
```

**After (1 unified call):**
```
Step 7:  renderTemplate(...)               ← ejs-template.ts (unchanged)
Step 8:  resolveAllMacrosBatch(allTexts, macroCtx)  ← unified-macro-engine.ts
```

### MacroContext Construction

```typescript
const macroCtx: MacroContext = {
  macroVars: useTavernHelperStore.getState().macroVars,
  presetVars: currentPreset?.tavernHelperVars,
  charVars: buildCharacterVariables(charSheet),
  gameVars: buildFullSubstitutionMap(),
  charName: charSheet?.name ?? '',
  userName: settings.userName ?? '调查员',
  modelName: currentModel?.name,
  lastMessage: messages[messages.length - 1]?.content,
};
```

### Backward Compatibility Guarantees

| Existing Usage | How New Engine Handles | Breaking? |
|----------------|----------------------|-----------|
| `{{setvar::x::v}}` in user input | Step C command macros | No |
| `{{get_global_variable::x}}` in world book | Step E compat layer | No |
| `{{charHP}}` in prompts | Step F fallback lookup | No |
| `{{调查员.生命值.当前}}` in world book | Step F fallback (supports Chinese + dots) | No |
| EJS `<%= getvar('x') %>` | EJS engine unchanged (step 7) | No |
| TH script hooks | th-script-engine.ts unchanged | No |

### Fallback Variable Name Regex

```typescript
const FALLBACK_VAR_RE = /\{\{([\w一-鿿][\w一-鿿.]*)\}\}/g;
```

Supports Chinese characters and dot-separated paths.

---

## Error Handling

- Unresolved variables in fallback lookup: left as-is (`{{unknownVar}}` stays in text)
- Division by zero in arithmetic: returns "NaN", logged as warning
- Invalid dice syntax in `{{roll}}`: returns empty string
- Max nesting depth exceeded: stops iteration, returns current state
- If block without matching `{{/if}}`: left as-is (not processed)
- Inject to non-existent outlet: content is silently dropped
