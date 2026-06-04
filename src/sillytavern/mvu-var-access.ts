import { useVariableStore } from '../stores/useVariableStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { isCharsheetPath, applyCharsheetRedirect } from './mvu-charsheet-redirect';
import { normalizeSkillKey } from './coc-data';

/**
 * Shared getvar/setvar resolution for EJS templates and TH scripts, so the two
 * (historically copy-paste twins) cannot drift. Implements the source-of-truth precedence
 * decided in the MVU ZOD architecture review.
 *
 * READ precedence for `readVar(name)` (statData/JSON Patch 真值优先于非锁定历史 flat):
 *   1. locked flat variable (manual override) — highest
 *   2. statData tree walk (dotted path, e.g. 世界 / 剧情 narrative keys) — JSON Patch 真值
 *   3. non-locked flat variable (legacy <var>/{{set:}}/manual fallback)
 *   4. char-sheet live value for 调查员 paths (via the substitution map's same derivation)
 *   5. fallback
 *
 * WRITE routing for `writeVar(name, value)`:
 *   - 调查员 paths → redirect into the character sheet (sheet stays authoritative)
 *   - other dotted path → statData leaf
 *   - non-dotted / legacy → flat variable
 */

export function getTreePath(tree: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setTreePath(tree: Record<string, unknown>, dotPath: string, value: unknown): void {
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
    const flat = st.variables[name];
    // 1. locked flat (手动锁定) — highest
    if (flat?.locked) return flat.value ?? fallback;
    // 2. statData tree (JSON Patch 真值) — 优先于非锁定历史 flat
    if (name.includes('.')) {
      const fromTree = getTreePath(st.statData, name);
      if (fromTree !== undefined) return scalarString(fromTree);
    }
    // 3. 非锁定 flat (legacy <var>/{{set:}}/manual 兜底)
    if (flat) return flat.value ?? fallback;
    // 4. char-sheet live for 调查员.* (and legacy char* aliases) via the substitution map
    if (isCharsheetPath(name) || name.startsWith('char')) {
      const map = st.buildFullSubstitutionMap();
      if (name in map) return map[name];
      // 技能别名/全角括号归一：map 里只存规范键，读 调查员.技能.闪避/手枪/快速交谈 等别名时归一后再查，
      // 与写入侧 canonicalSkillKey 对齐，避免「写得进、这条读路径读不到」的不对称。
      if (name.startsWith('调查员.技能.')) {
        const canon = '调查员.技能.' + normalizeSkillKey(name.slice('调查员.技能.'.length));
        if (canon !== name && canon in map) return map[canon];
      }
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
        // A2.3：redirect 返回 RedirectResult，落回 sheet 时取 .sheet。
        useCharSheetStore.getState().setSheet(updated.sheet);
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
