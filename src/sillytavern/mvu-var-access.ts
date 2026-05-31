import { useVariableStore } from '../stores/useVariableStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { isCharsheetPath, applyCharsheetRedirect } from './mvu-charsheet-redirect';

/**
 * Shared getvar/setvar resolution for EJS templates and TH scripts, so the two
 * (historically copy-paste twins) cannot drift. Implements the source-of-truth precedence
 * decided in the MVU ZOD architecture review.
 *
 * READ precedence for `readVar(name)`:
 *   1. locked flat variable (manual override) — highest
 *   2. flat variable (legacy <var>/{{set:}}/manual)
 *   3. statData tree walk (dotted path, e.g. 世界 / 剧情 narrative keys)
 *   4. char-sheet live value for 调查员 paths (via the substitution map's same derivation)
 *   5. fallback
 *
 * WRITE routing for `writeVar(name, value)`:
 *   - 调查员 paths → redirect into the character sheet (sheet stays authoritative)
 *   - other dotted path → statData leaf
 *   - non-dotted / legacy → flat variable
 */

function getTreePath(tree: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setTreePath(tree: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let cur: Record<string, unknown> = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function scalarString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function readVar(name: string, fallback = ''): string {
  try {
    const st = useVariableStore.getState();
    // 1+2. flat variable (locked or not) — legacy/manual takes precedence over the tree
    const flat = st.variables[name];
    if (flat) return flat.value ?? fallback;
    // 3. statData tree walk (dotted narrative path)
    if (name.includes('.')) {
      const fromTree = getTreePath(st.statData, name);
      if (fromTree !== undefined) return scalarString(fromTree);
    }
    // 4. char-sheet live for 调查员.* (and legacy char* aliases) via the substitution map
    if (isCharsheetPath(name) || name.startsWith('char')) {
      const map = st.buildFullSubstitutionMap();
      if (name in map) return map[name];
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeVar(name: string, value: string): void {
  try {
    // 调查员.* → character sheet (authoritative); use replace semantics
    if (isCharsheetPath(name)) {
      const sheet = useCharSheetStore.getState().sheet;
      const updated = applyCharsheetRedirect(sheet, name, 'replace', value);
      if (updated) {
        useCharSheetStore.getState().setSheet(updated);
        return;
      }
      // unrecognized 调查员.* leaf → fall through to flat var so it isn't silently lost
    }
    // other dotted path → statData leaf
    if (name.includes('.') && !isCharsheetPath(name)) {
      const st = useVariableStore.getState();
      const next = structuredClone(st.statData);
      setTreePath(next, name, value);
      st.setStatData(next);
      return;
    }
    // non-dotted / legacy → flat variable
    useVariableStore.getState().setVariable(name, value, 'llm');
  } catch {
    /* ignore */
  }
}
