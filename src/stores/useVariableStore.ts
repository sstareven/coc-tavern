import { create } from 'zustand';
import type { GameVariable } from '../types';
import { useCharSheetStore } from './useCharSheetStore';
import {
  createVariable,
  extractAllVariables,
  mergeVariables,
  parseStatChanges,
  stripVariableMarkup,
  buildSubstitutionMap,
} from '../sillytavern/variables';
import { applyMvuPatch, extractJsonPatchBlocks } from '../sillytavern/mvu-jsonpatch';
import { isCharsheetPath, applyCharsheetRedirect } from '../sillytavern/mvu-charsheet-redirect';
import { flattenStatData } from '../sillytavern/mvu-flatten';

interface VariableStore {
  // All game variables (legacy flat map: <var>/{{set:}}, manual, locked, hpChange aliases)
  variables: Record<string, GameVariable>;
  // MVU ZOD nested narrative-state tree (世界.* / 剧情.* / NPC / flags). NOT 调查员.* (char sheet owns those).
  statData: Record<string, unknown>;

  // Actions
  setVariable: (name: string, value: string, source?: GameVariable['source']) => void;
  deleteVariable: (name: string) => void;
  toggleLock: (name: string) => void;

  // Process LLM response — extract variables, return cleaned text
  processResponse: (text: string) => { cleanedText: string; extracted: Record<string, string> };

  // Build the full substitution map (variables + statData + character sheet)
  buildFullSubstitutionMap: () => Record<string, string>;

  // statData direct access (persistence + initvar seeding)
  setStatData: (tree: Record<string, unknown>) => void;

  // Bulk import/export
  importVariables: (json: string) => boolean;
  exportVariables: () => string;
  replaceAll: (variables: Record<string, GameVariable>) => void;
  clearAll: () => void;
}

export const useVariableStore = create<VariableStore>((set, get) => ({
  variables: {},
  statData: {},

  setVariable: (name, value, source = 'manual') => {
    set((s) => {
      const existing = s.variables[name];
      if (existing?.locked) return s;
      return {
        variables: {
          ...s.variables,
          [name]: createVariable(name, value, source, existing?.locked ?? false),
        },
      };
    });
  },

  deleteVariable: (name) => {
    set((s) => {
      const vars = { ...s.variables };
      delete vars[name];
      return { variables: vars };
    });
  },

  toggleLock: (name) => {
    set((s) => {
      const v = s.variables[name];
      if (!v) return s;
      return { variables: { ...s.variables, [name]: { ...v, locked: !v.locked } } };
    });
  },

  processResponse: (text) => {
    // ── Legacy flat path: <var>/{{set:}} + narrative stat regex (kept for back-compat) ──
    const extracted = extractAllVariables(text);
    const statChanges = parseStatChanges(text);
    const allExtracted = { ...extracted, ...statChanges };
    const st = get();
    const merged = mergeVariables(st.variables, allExtracted, 'llm');

    // ── MVU ZOD path: <UpdateVariable><JSONPatch> applied to the statData tree ──
    const ops = extractJsonPatchBlocks(text);
    let nextStatData = st.statData;
    if (ops.length > 0) {
      nextStatData = structuredClone(st.statData);
      // redirect: ops targeting 调查员.* are applied to the character sheet, NOT statData.
      let sheet = useCharSheetStore.getState().sheet;
      let sheetChanged = false;
      applyMvuPatch(nextStatData, ops, {
        redirect: (dotPath, op, value) => {
          if (!isCharsheetPath(dotPath)) return false;
          const updated = applyCharsheetRedirect(sheet, dotPath, op, value);
          if (updated) {
            sheet = updated;
            sheetChanged = true;
          }
          // Always consume 调查员.* here so statData never stores a char-sheet leaf,
          // even when the specific field wasn't writable (avoids parallel source of truth).
          return true;
        },
      });
      if (sheetChanged) useCharSheetStore.getState().setSheet(sheet);
    }

    set({ variables: merged, statData: nextStatData });

    return {
      cleanedText: stripVariableMarkup(text),
      extracted: allExtracted,
    };
  },

  setStatData: (tree) => set({ statData: { ...tree } }),

  buildFullSubstitutionMap: () => {
    const st = get();
    const map = buildSubstitutionMap(st.variables);

    // MVU statData (narrative 世界.*/剧情.* tree) flattened to dotted keys, UNDER flat vars
    // (a locked manual flat var overrides) but the char-sheet 调查员.* injection below still wins
    // for 调查员.* (statData never contains those — they're redirected to the sheet).
    const flatStat = flattenStatData(st.statData);
    for (const [key, value] of Object.entries(flatStat)) {
      if (!(key in map)) map[key] = value;
    }

    // Auto-inject character sheet data
    const sheet = useCharSheetStore.getState().sheet;
    const chars = Object.entries(sheet.characteristics)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (!st.variables.charName?.locked) map.charName = sheet.identity.name;
    if (!st.variables.charOccupation?.locked) map.charOccupation = sheet.identity.occupation;
    if (!st.variables.charAge?.locked) map.charAge = String(sheet.identity.age);
    if (!st.variables.charGender?.locked) map.charGender = sheet.identity.gender;
    if (!st.variables.charHP?.locked) map.charHP = `${sheet.secondary.hp.current}/${sheet.secondary.hp.max}`;
    if (!st.variables.charSAN?.locked) map.charSAN = `${sheet.secondary.san.current}/${sheet.secondary.san.max}`;
    if (!st.variables.charMP?.locked) map.charMP = `${sheet.secondary.mp.current}/${sheet.secondary.mp.max}`;
    if (!st.variables.charLuck?.locked) map.charLuck = String(sheet.secondary.luck);
    if (!st.variables.charCharacteristics?.locked) map.charCharacteristics = chars;
    // ── Nested ZOD path entries (调查员.生命值.当前 etc.) ──
    if (!st.variables['调查员.生命值.当前']?.locked) map['调查员.生命值.当前'] = String(sheet.secondary.hp.current);
    if (!st.variables['调查员.生命值.最大']?.locked) map['调查员.生命值.最大'] = String(sheet.secondary.hp.max);
    if (!st.variables['调查员.理智值.当前']?.locked) map['调查员.理智值.当前'] = String(sheet.secondary.san.current);
    if (!st.variables['调查员.理智值.最大']?.locked) map['调查员.理智值.最大'] = String(sheet.secondary.san.max);
    if (!st.variables['调查员.魔法值.当前']?.locked) map['调查员.魔法值.当前'] = String(sheet.secondary.mp.current);
    if (!st.variables['调查员.魔法值.最大']?.locked) map['调查员.魔法值.最大'] = String(sheet.secondary.mp.max);
    if (!st.variables['调查员.姓名']?.locked) map['调查员.姓名'] = sheet.identity.name;
    if (!st.variables['调查员.职业']?.locked) map['调查员.职业'] = sheet.identity.occupation;
    if (!st.variables['调查员.年龄']?.locked) map['调查员.年龄'] = String(sheet.identity.age);
    if (!st.variables['调查员.性别']?.locked) map['调查员.性别'] = sheet.identity.gender;
    if (!st.variables['调查员.幸运']?.locked) map['调查员.幸运'] = String(sheet.secondary.luck);
    // ── Skill entries ──
    for (const [name, skill] of Object.entries(sheet.skills)) {
      const key = `调查员.技能.${name}`;
      if (!st.variables[key]?.locked) {
        map[key] = String(skill.current);
      }
    }

    return map;
  },

  importVariables: (json) => {
    try {
      const data = JSON.parse(json);
      const vars: Record<string, GameVariable> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.name) {
            vars[item.name] = createVariable(
              item.name,
              String(item.value ?? ''),
              item.source ?? 'manual',
              item.locked ?? false,
            );
          }
        }
      } else if (typeof data === 'object') {
        for (const [name, value] of Object.entries(data)) {
          vars[name] = createVariable(name, String(value), 'manual');
        }
      }
      set((s) => ({ variables: { ...s.variables, ...vars } }));
      return true;
    } catch {
      return false;
    }
  },

  exportVariables: () => {
    return JSON.stringify(Object.values(get().variables), null, 2);
  },

  replaceAll: (variables) => {
    set({ variables: { ...variables } });
  },

  clearAll: () => {
    set({ variables: {}, statData: {} });
  },
}));
