import { useTavernHelperStore } from '../stores/useTavernHelperStore';
import type { THScope, THVariable } from '../types';

const GET_MACRO_RE = /\{\{get_(global|preset|chat|char|character)_variable::([^}]+)\}\}/g;
const FORMAT_MACRO_RE = /\{\{format_(global|preset|chat|char|character)_variable::([^:}]+)::([^}]*)\}\}/g;

function normalizeScope(raw: string): THScope {
  return raw === 'char' || raw === 'character' ? 'character' : raw as THScope;
}

/**
 * Resolve tavern helper macros in text once (non-recursive).
 * {{get_<scope>_variable::<name>}} → value
 * {{format_<scope>_variable::<name>::<template>}} → value formatted
 */
export function resolveTavernHelperMacros(
  text: string,
  presetVars?: Record<string, THVariable>,
): string {
  const store = useTavernHelperStore.getState();
  if (!store.enabled) return text;

  let result = text;

  // Format macros first (they may produce get macros inside)
  result = result.replace(FORMAT_MACRO_RE, (_match, scope: string, name: string, template: string) => {
    const scoped = normalizeScope(scope);
    const val = store.getVariable(scoped, name, presetVars);
    if (val === null) return `[未找到: ${scope}.${name}]`;
    // Simple %s or %s placeholder substitution — or just return the full value if no template
    if (template && template.includes('%s')) {
      return template.replace('%s', val);
    }
    return val;
  });

  // Get macros
  result = result.replace(GET_MACRO_RE, (_match, scope: string, name: string) => {
    const scoped = normalizeScope(scope);
    const val = store.getVariable(scoped, name, presetVars);
    if (val === null) return `[未找到: ${scope}.${name}]`;
    return val;
  });

  return result;
}

/**
 * Deep macro resolution — if a resolved value itself contains macros,
 * resolve them recursively up to maxDepth (default 3).
 */
export function resolveTavernHelperMacrosDeep(
  text: string,
  maxDepth = 3,
  presetVars?: Record<string, THVariable>,
): string {
  let result = text;
  for (let i = 0; i < maxDepth; i++) {
    const before = result;
    result = resolveTavernHelperMacros(result, presetVars);
    if (result === before) break; // No more macros to resolve
  }
  return result;
}

/**
 * Check if text contains any tavern helper macros.
 */
export function hasTavernHelperMacros(text: string): boolean {
  GET_MACRO_RE.lastIndex = 0;
  FORMAT_MACRO_RE.lastIndex = 0;
  return GET_MACRO_RE.test(text) || FORMAT_MACRO_RE.test(text);
}
