import type { GameVariable } from '../types';

export function createVariable(
  name: string,
  value: string,
  source: GameVariable['source'] = 'manual',
  locked = false,
): GameVariable {
  return { name, value, locked, source, updatedAt: Date.now() };
}

// ── Extraction ──

/** Extract <var name="X" value="Y" /> XML-style variables from text */
export function extractXmlVariables(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const regex = /<var\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars[match[1]] = match[2];
  }
  return vars;
}

/** Extract {{set:name=value}} inline commands from text */
export function extractSetCommands(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const regex = /\{\{set:([a-zA-Z_\\u4e00-\\u9fff][a-zA-Z0-9_\\u4e00-\\u9fff]*)=([^}]*)\}\}/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars[match[1]] = match[2];
  }
  return vars;
}

/** Combined extraction — XML + set commands */
export function extractAllVariables(text: string): Record<string, string> {
  return { ...extractXmlVariables(text), ...extractSetCommands(text) };
}

// ── Narrative parsing ──

/**
 * Try to parse HP/SAN changes from narrative text.
 * Patterns like "HP-3", "SAN-1d6", "生命值-5", "理智-10"
 */
export function parseStatChanges(text: string): Record<string, string> {
  const changes: Record<string, string> = {};
  const patterns: Array<{ regex: RegExp; key: string }> = [
    { regex: /HP\s*[-−]\s*(\d+)/gi, key: 'hpChange' },
    { regex: /SAN\s*[-−]\s*(\d+)/gi, key: 'sanChange' },
    { regex: /生命值?\s*[-−]\s*(\d+)/gi, key: 'hpChange' },
    { regex: /理智值?\s*[-−]\s*(\d+)/gi, key: 'sanChange' },
    { regex: /幸运\s*[-−]\s*(\d+)/gi, key: 'luckChange' },
    { regex: /MP\s*[-−]\s*(\d+)/gi, key: 'mpChange' },
  ];
  for (const { regex, key } of patterns) {
    const m = regex.exec(text);
    if (m) changes[key] = m[1];
  }
  return changes;
}

// ── Merging ──

/** Merge extracted variables into current store, respecting locks */
export function mergeVariables(
  current: Record<string, GameVariable>,
  updates: Record<string, string>,
  source: GameVariable['source'] = 'llm',
): Record<string, GameVariable> {
  const merged = { ...current };
  for (const [name, value] of Object.entries(updates)) {
    const existing = merged[name];
    if (existing?.locked) continue; // locked variables are immutable
    merged[name] = createVariable(name, value, source, existing?.locked ?? false);
  }
  return merged;
}

// ── Strip variable markup from display text ──

/** Remove <var> tags and {{set:...}} commands from text for clean display */
export function stripVariableMarkup(text: string): string {
  return text
    .replace(/<var\s+name="[^"]+"\s+value="[^"]*"\s*\/>/gi, '')
    .replace(/\{\{set:[a-zA-Z_\\u4e00-\\u9fff][a-zA-Z0-9_\\u4e00-\\u9fff]*=[^}]*\}\}/gi, '');
}

// ── Substitution map builder ──

/** Build a flat {{name → value}} map from GameVariable records */
export function buildSubstitutionMap(variables: Record<string, GameVariable>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [name, v] of Object.entries(variables)) {
    map[name] = v.value;
  }
  return map;
}
