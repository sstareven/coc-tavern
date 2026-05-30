import { create } from 'zustand';
import type { RegexScript, RegexScriptType } from '../types';

let idCounter = 0;
function uid(): string {
  return `regex_${Date.now()}_${++idCounter}`;
}

const DEFAULT_GLOBAL_SCRIPTS: RegexScript[] = [
  {
    id: 'mvu-clean',
    scriptName: 'MVU — 清理变量标签(显示端)',
    findRegex: '/<var\\s+[^>]*\\/>/gi',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true, promptOnly: false, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
  },
  {
    id: 'mvu-clean-set',
    scriptName: 'MVU — 清理set命令(显示端)',
    findRegex: '/\\{\\{set:[^}]+\\}\\}/gi',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true, promptOnly: false, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
  },
];

export const BUILTIN_REGEX_IDS = new Set(DEFAULT_GLOBAL_SCRIPTS.map((s) => s.id));

interface RegexStore {
  // Scripts by type
  globalScripts: RegexScript[];
  presetScripts: RegexScript[];

  // UI state
  isEditorOpen: boolean;
  editingScript: RegexScript | null;
  editingScope: RegexScriptType;
  editingType: 'global' | 'preset';

  // Actions — scripts
  getScripts: (type: RegexScriptType) => RegexScript[];
  addScript: (script: RegexScript, type: RegexScriptType) => void;
  updateScript: (id: string, type: RegexScriptType, updates: Partial<RegexScript>) => void;
  deleteScript: (id: string, type: RegexScriptType) => void;
  toggleScript: (id: string, type: RegexScriptType) => void;
  moveScript: (id: string, fromType: RegexScriptType, toType: RegexScriptType) => void;

  // Bulk actions
  bulkToggleAll: (type: RegexScriptType, disabled: boolean) => void;
  bulkDelete: (ids: string[], type: RegexScriptType) => void;

  // Editor
  openEditor: (script: RegexScript | null, type: RegexScriptType) => void;
  closeEditor: () => void;

  // Import/Export
  importScript: (json: string, type: RegexScriptType) => boolean;
  exportScript: (id: string, type: RegexScriptType) => string | null;
  exportAllScripts: () => string;
}

export const useRegexStore = create<RegexStore>((set, get) => ({
  globalScripts: [...DEFAULT_GLOBAL_SCRIPTS],
  presetScripts: [],

  isEditorOpen: false,
  editingScript: null,
  editingScope: 'global',
  editingType: 'global',

  getScripts: (type) => {
    switch (type) {
      case 'global': return get().globalScripts;
      case 'preset': return get().presetScripts;
    }
  },

  addScript: (script, type) => {
    const s = { ...script, id: script.id || uid() };
    set((st) => {
      switch (type) {
        case 'global': return { globalScripts: [...st.globalScripts, s] };
        case 'preset': return { presetScripts: [...st.presetScripts, s] };
      }
    });
  },

  updateScript: (id, type, updates) => {
    set((st) => {
      const update = (arr: RegexScript[]) =>
        arr.map((s) => (s.id === id ? { ...s, ...updates } : s));
      switch (type) {
        case 'global': return { globalScripts: update(st.globalScripts) };
        case 'preset': return { presetScripts: update(st.presetScripts) };
      }
    });
  },

  deleteScript: (id, type) => {
    if (BUILTIN_REGEX_IDS.has(id)) return;
    set((st) => {
      switch (type) {
        case 'global': return { globalScripts: st.globalScripts.filter((s) => s.id !== id) };
        case 'preset': return { presetScripts: st.presetScripts.filter((s) => s.id !== id) };
      }
    });
  },

  toggleScript: (id, type) => {
    set((st) => {
      const toggle = (arr: RegexScript[]) =>
        arr.map((s) => (s.id === id ? { ...s, disabled: !s.disabled } : s));
      switch (type) {
        case 'global': return { globalScripts: toggle(st.globalScripts) };
        case 'preset': return { presetScripts: toggle(st.presetScripts) };
      }
    });
  },

  moveScript: (id, fromType, toType) => {
    if (BUILTIN_REGEX_IDS.has(id)) return;
    const st = get();
    const fromArr = st.getScripts(fromType);
    const script = fromArr.find((s) => s.id === id);
    if (!script) return;
    get().deleteScript(id, fromType);
    get().addScript(script, toType);
  },

  bulkToggleAll: (type, disabled) => {
    set((st) => {
      const toggleAll = (arr: RegexScript[]) => arr.map((s) => ({ ...s, disabled }));
      switch (type) {
        case 'global': return { globalScripts: toggleAll(st.globalScripts) };
        case 'preset': return { presetScripts: toggleAll(st.presetScripts) };
      }
    });
  },

  bulkDelete: (ids, type) => {
    const filtered = ids.filter((id) => !BUILTIN_REGEX_IDS.has(id));
    if (filtered.length === 0) return;
    set((st) => {
      const filterAll = (arr: RegexScript[]) => arr.filter((s) => !filtered.includes(s.id));
      switch (type) {
        case 'global': return { globalScripts: filterAll(st.globalScripts) };
        case 'preset': return { presetScripts: filterAll(st.presetScripts) };
      }
    });
  },

  openEditor: (script, type) => {
    set({ isEditorOpen: true, editingScript: script, editingType: type });
  },

  closeEditor: () => {
    set({ isEditorOpen: false, editingScript: null });
  },

  importScript: (json, type) => {
    try {
      const data = JSON.parse(json);
      const scripts: RegexScript[] = Array.isArray(data) ? data : [data];
      for (const s of scripts) {
        if (!s.scriptName || !s.findRegex) continue;
        get().addScript({ ...s, id: uid() }, type);
      }
      return true;
    } catch {
      return false;
    }
  },

  exportScript: (id, type) => {
    const script = get().getScripts(type).find((s) => s.id === id);
    return script ? JSON.stringify(script, null, 2) : null;
  },

  exportAllScripts: () => {
    const st = get();
    const all = [...st.globalScripts, ...st.presetScripts];
    return JSON.stringify(all, null, 2);
  },
}));
