import { create } from 'zustand';
import type { GameVariable } from '../types';
import {
  createVariable,
  extractAllVariables,
  mergeVariables,
  parseStatChanges,
  stripVariableMarkup,
  buildSubstitutionMap,
} from '../sillytavern/variables';

interface VariableStore {
  // All game variables
  variables: Record<string, GameVariable>;

  // Actions
  setVariable: (name: string, value: string, source?: GameVariable['source']) => void;
  deleteVariable: (name: string) => void;
  toggleLock: (name: string) => void;

  // Process LLM response — extract variables, return cleaned text
  processResponse: (text: string) => { cleanedText: string; extracted: Record<string, string> };

  // Build the full substitution map (variables + character sheet)
  buildFullSubstitutionMap: () => Record<string, string>;

  // Bulk import/export
  importVariables: (json: string) => boolean;
  exportVariables: () => string;
  clearAll: () => void;
}

export const useVariableStore = create<VariableStore>((set, get) => ({
  variables: {},

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
    const extracted = extractAllVariables(text);
    const statChanges = parseStatChanges(text);

    // Merge all extracted variables
    const allExtracted = { ...extracted, ...statChanges };
    const st = get();
    const merged = mergeVariables(st.variables, allExtracted, 'llm');
    set({ variables: merged });

    return {
      cleanedText: stripVariableMarkup(text),
      extracted: allExtracted,
    };
  },

  buildFullSubstitutionMap: () => {
    const st = get();
    const map = buildSubstitutionMap(st.variables);

    // Auto-inject character sheet data
    try {
      const { useCharSheetStore } = require('../stores/useCharSheetStore');
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
    } catch {
      // char sheet store not available
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

  clearAll: () => {
    set({ variables: {} });
  },
}));
