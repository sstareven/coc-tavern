// ===== Cliché Cleaner Engine =====
// Pure-function vocabulary replacement post-processor.
// Applies rule-based substitutions to eliminate formulaic LLM phrasing.
// No store access, no side effects; RNG is injectable for determinism.

// ── Types ────────────────────────────────────────────────

export interface CleanerSubRule {
  targets: string[];       // patterns to match
  replacements: string[];  // what to replace with (empty array = delete match)
  mode: 'text' | 'simple' | 'regex';
  remark?: string;
}

export interface CleanerRuleGroup {
  name: string;
  subRules: CleanerSubRule[];
  enabled: boolean;
}

export type Rng = () => number;

// ── Structure Protection ─────────────────────────────────

const PROTECTED_RE = /<[^>]+>|\{\{[^}]+\}\}/g;

/**
 * Replace `<tag ...>` and `{{macro}}` with null-byte placeholders,
 * returning the cleaned string and a restore function.
 */
function protectStructures(text: string): { cleaned: string; restore: (s: string) => string } {
  const placeholders: string[] = [];
  const cleaned = text.replace(PROTECTED_RE, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\x00PH${idx}\x00`;
  });
  return {
    cleaned,
    restore: (s: string) =>
      s.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[Number(i)] ?? ''),
  };
}

// ── Simple Pattern Expansion ─────────────────────────────

/**
 * Expand custom simple-mode syntax into a regex source string.
 *
 * `{a,b,c}` becomes `(?:a|b|c)`.
 * Literal text outside braces is escaped and preserved.
 * A trailing `?` after a `}` is kept as regex optional.
 *
 * Example: `"{几不,微不}{可查,可察}"` => `"(?:几不|微不)(?:可查|可察)"`
 */
export function expandSimplePattern(pattern: string): string {
  // If no braces at all, return the literal (no escaping needed for
  // Chinese chars, but escape regex-special chars in literal segments)
  if (!pattern.includes('{')) return escapeRegex(pattern);

  let result = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '{') {
      const close = pattern.indexOf('}', i);
      if (close === -1) {
        // Malformed — treat rest as literal
        result += escapeRegex(pattern.slice(i));
        break;
      }
      const inner = pattern.slice(i + 1, close);
      const alternatives = inner.split(',').map(escapeRegex);
      result += `(?:${alternatives.join('|')})`;
      i = close + 1;
    } else {
      // `?` right after a closing `}` is regex-optional, not literal
      if (pattern[i] === '?' && i > 0 && pattern[i - 1] === '}') {
        result += '?';
        i++;
      } else {
        result += escapeRegex(pattern[i]);
        i++;
      }
    }
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Rule Compilation ─────────────────────────────────────

interface CompiledRule {
  regex: RegExp;
  replacements: string[];
}

function compileSubRule(sub: CleanerSubRule): CompiledRule[] {
  const compiled: CompiledRule[] = [];
  for (const target of sub.targets) {
    let source: string;
    switch (sub.mode) {
      case 'text':
        source = escapeRegex(target);
        break;
      case 'simple':
        source = expandSimplePattern(target);
        break;
      case 'regex':
        source = target;
        break;
    }
    try {
      compiled.push({
        regex: new RegExp(source, 'g'),
        replacements: sub.replacements,
      });
    } catch {
      // Skip invalid regex patterns silently
    }
  }
  return compiled;
}

// ── Core Cleaner ─────────────────────────────────────────

/**
 * Apply all enabled rule groups to the given narrative text.
 *
 * - Protects `<tag>` and `{{macro}}` structures from modification.
 * - Applies rules in group order, sub-rule order, target order.
 * - When `replacements` is empty, the match is deleted.
 * - When `replacements` has multiple entries, one is chosen via `rng`.
 */
export function cleanClicheText(
  text: string,
  rules: CleanerRuleGroup[],
  rng: Rng = Math.random,
): string {
  if (!text) return text;

  const { cleaned, restore } = protectStructures(text);

  let result = cleaned;
  for (const group of rules) {
    if (!group.enabled) continue;
    for (const sub of group.subRules) {
      const compiled = compileSubRule(sub);
      for (const { regex, replacements } of compiled) {
        // Reset lastIndex for safety
        regex.lastIndex = 0;
        if (replacements.length === 1 && replacements[0].includes('$')) {
          // Use string replacement to support $1, $2 etc. backreferences
          result = result.replace(regex, replacements[0]);
        } else {
          result = result.replace(regex, () => {
            if (replacements.length === 0) return '';
            if (replacements.length === 1) return replacements[0];
            return replacements[Math.floor(rng() * replacements.length)];
          });
        }
      }
    }
  }

  return restore(result);
}
