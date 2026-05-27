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
  {
    id: 'mvu-hp-track',
    scriptName: 'MVU — HP变化追踪(提示词端)',
    findRegex: '/(?:失去了?|损失了?|减少|扣除|受到|掉了|丢了|承受)(\\d+)点?(?:生命值?|HP|体力|伤害|生命|血)/gi',
    replaceString: `$& <var name='hpChange' value='-$1'/>`,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false, promptOnly: true, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
  },
  {
    id: 'mvu-san-track',
    scriptName: 'MVU — SAN变化追踪(提示词端)',
    findRegex: '/(\\d+)点?(?:理智值?|SAN|神智|精神|理智)(?:损失|扣除|减少|冲击|伤害|受损)/gi',
    replaceString: `$& <var name='sanChange' value='-$1'/>`,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false, promptOnly: true, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
  },
  {
    id: 'mvu-skill-check',
    scriptName: 'MVU — 技能检定追踪(提示词端)',
    findRegex: '/(?:进行|请过|做一个?|一个?|通过了?|失败了?)([\\u4e00-\\u9fff()（）]{1,12}?)(?:检定|技能|判定)/g',
    replaceString: `$& <var name='lastCheck' value='$1'/>`,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false, promptOnly: true, runOnEdit: false,
    substituteRegex: 0, minDepth: null, maxDepth: null,
  },
];

interface RegexStore {
  // Scripts by type
  globalScripts: RegexScript[];
  presetScripts: RegexScript[];

  // UI state
  isEditorOpen: boolean;
  editingScript: RegexScript | null;
  editingType: RegexScriptType;
  testInput: string;
  testOutput: string;

  // Actions — scripts
  getScripts: (type: RegexScriptType) => RegexScript[];
  addScript: (script: RegexScript, type: RegexScriptType) => void;
  updateScript: (id: string, type: RegexScriptType, updates: Partial<RegexScript>) => void;
  deleteScript: (id: string, type: RegexScriptType) => void;
  toggleScript: (id: string, type: RegexScriptType) => void;
  moveScript: (id: string, fromType: RegexScriptType, toType: RegexScriptType) => void;
  reorderScripts: (type: RegexScriptType, ids: string[]) => void;

  // Bulk actions
  bulkToggleAll: (type: RegexScriptType, disabled: boolean) => void;
  bulkDelete: (ids: string[], type: RegexScriptType) => void;

  // Editor
  openEditor: (script: RegexScript | null, type: RegexScriptType) => void;
  closeEditor: () => void;
  setTestInput: (text: string) => void;
  setTestOutput: (text: string) => void;

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
  editingType: 'global',
  testInput: '',
  testOutput: '',

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
    const st = get();
    const fromArr = st.getScripts(fromType);
    const script = fromArr.find((s) => s.id === id);
    if (!script) return;
    get().deleteScript(id, fromType);
    get().addScript(script, toType);
  },

  reorderScripts: (type, ids) => {
    set((st) => {
      const arr = st.getScripts(type);
      const reordered = ids.map((id) => arr.find((s) => s.id === id)).filter(Boolean) as RegexScript[];
      switch (type) {
        case 'global': return { globalScripts: reordered };
        case 'preset': return { presetScripts: reordered };
      }
    });
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
    set((st) => {
      const filterAll = (arr: RegexScript[]) => arr.filter((s) => !ids.includes(s.id));
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
    set({ isEditorOpen: false, editingScript: null, testInput: '', testOutput: '' });
  },

  setTestInput: (text) => set({ testInput: text }),
  setTestOutput: (text) => set({ testOutput: text }),

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
