import { create } from 'zustand';
import type { THScriptTree, THScript, THScriptFolder, THRenderSettings, THOptimizeSettings, PTSettings, THScope, THVariable } from '../types';

const STORAGE_KEY = 'coc_th_v2';

interface PersistedState {
  enabled: boolean;
  globalScripts: THScriptTree[];
  render: THRenderSettings;
  optimize: THOptimizeSettings;
  promptTemplate: PTSettings;
  macroVars: Record<string, string>;
}

const defaults: PersistedState = {
  enabled: true,
  globalScripts: [],
  render: {
    renderEnabled: true,
    renderDepth: 0,
    codeCollapse: 'disable' as const,
    blobUrlRendering: false,
    disableCodeHighlight: true,
    allowStreamRender: false,
  },
  optimize: {
    optimizeMessageLoad: true,
    forceWorldbookSettings: true,
    maximizePresetContext: true,
  },
  macroVars: {},
  promptTemplate: {
    enabled: true,
    generateEnabled: true,
    generateLoaderEnabled: true,
    injectLoaderEnabled: false,
    renderEnabled: true,
    renderLoaderEnabled: true,
    codeBlocksEnabled: true,
    permanentEvaluation: true,
    filterChatMessage: true,
    chatDepth: -1,
    autosaveEnabled: false,
    preloadWorldinfo: true,
    withContextDisabled: false,
    debugEnabled: false,
    invertEnabled: true,
    compileWorkers: false,
    sandbox: false,
    cacheEnabled: 0,
    cacheSize: 64,
    cacheHasher: 'h32ToString',
  },
};

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

function save(state: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

const persisted = load();

interface TavernHelperStore extends PersistedState {
  presetScripts: THScriptTree[];

  // Global scripts
  setGlobalScripts: (items: THScriptTree[]) => void;
  addGlobalItem: (item: THScriptTree) => void;
  deleteGlobalItem: (id: string) => void;
  updateGlobalItem: (id: string, updater: (item: THScriptTree) => THScriptTree) => void;
  importGlobalScripts: (scripts: THScriptTree[]) => void;

  // Preset scripts
  setPresetScripts: (items: THScriptTree[]) => void;
  addPresetItem: (item: THScriptTree) => void;
  deletePresetItem: (id: string) => void;
  updatePresetItem: (id: string, updater: (item: THScriptTree) => THScriptTree) => void;

  // Render
  setRender: (partial: Partial<THRenderSettings>) => void;

  // Optimize
  setOptimize: (partial: Partial<THOptimizeSettings>) => void;

  // Prompt template
  setPromptTemplate: (partial: Partial<PTSettings>) => void;

  // Macro variables (flat — persistent)
  setMacroVar: (name: string, value: string) => void;
  getMacroVar: (name: string) => string;
  incMacroVar: (name: string, amount: number) => void;
  decMacroVar: (name: string, amount: number) => void;

  // Multi-scope variable lookup (for {{get_<scope>_variable::name}})
  getVariable: (scope: THScope, name: string, presetVars?: Record<string, THVariable>) => string | null;

  // Helpers
  findItem: (tree: THScriptTree[], id: string) => THScriptTree | null;
}

export function uid(): string {
  return 'th-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export const useTavernHelperStore = create<TavernHelperStore>((set, get) => ({
  ...persisted,
  presetScripts: [],

  setGlobalScripts: (items) => set((s) => {
    const st = { ...s, globalScripts: items };
    save(st);
    return { globalScripts: items };
  }),

  addGlobalItem: (item) => set((s) => {
    const items = [...s.globalScripts, item];
    save({ ...s, globalScripts: items });
    return { globalScripts: items };
  }),

  deleteGlobalItem: (id) => set((s) => {
    function remove(items: THScriptTree[]): THScriptTree[] {
      return items.filter((i) => {
        if (i.id === id) return false;
        if (i.type === 'folder') i.children = remove(i.children);
        return true;
      });
    }
    const items = remove([...s.globalScripts]);
    save({ ...s, globalScripts: items });
    return { globalScripts: items };
  }),

  updateGlobalItem: (id, updater) => set((s) => {
    function update(items: THScriptTree[]): THScriptTree[] {
      return items.map((i) => {
        if (i.id === id) return updater({ ...i });
        if (i.type === 'folder') return { ...i, children: update(i.children) };
        return i;
      });
    }
    const items = update([...s.globalScripts]);
    save({ ...s, globalScripts: items });
    return { globalScripts: items };
  }),

  importGlobalScripts: (scripts) => set((s) => {
    const items = [...s.globalScripts, ...scripts];
    save({ ...s, globalScripts: items });
    return { globalScripts: items };
  }),

  setPresetScripts: (items) => set({ presetScripts: items }),
  addPresetItem: (item) => set((s) => ({ presetScripts: [...s.presetScripts, item] })),
  deletePresetItem: (id) => set((s) => {
    function remove(items: THScriptTree[]): THScriptTree[] {
      return items.filter((i) => {
        if (i.id === id) return false;
        if (i.type === 'folder') i.children = remove(i.children);
        return true;
      });
    }
    return { presetScripts: remove([...s.presetScripts]) };
  }),

  updatePresetItem: (id, updater) => set((s) => {
    function update(items: THScriptTree[]): THScriptTree[] {
      return items.map((i) => {
        if (i.id === id) return updater({ ...i });
        if (i.type === 'folder') return { ...i, children: update(i.children) };
        return i;
      });
    }
    return { presetScripts: update([...s.presetScripts]) };
  }),

  setRender: (partial) => set((s) => {
    const render = { ...s.render, ...partial };
    save({ ...s, render });
    return { render };
  }),

  setOptimize: (partial) => set((s) => {
    const optimize = { ...s.optimize, ...partial };
    save({ ...s, optimize });
    return { optimize };
  }),

  setPromptTemplate: (partial) => set((s) => {
    const promptTemplate = { ...s.promptTemplate, ...partial };
    save({ ...s, promptTemplate });
    return { promptTemplate };
  }),

  setMacroVar: (name, value) => set((s) => {
    const macroVars = { ...s.macroVars, [name]: value };
    save({ ...s, macroVars });
    return { macroVars };
  }),
  getMacroVar: (name) => get().macroVars[name] ?? '',
  incMacroVar: (name, amount) => {
    const current = parseFloat(get().macroVars[name] || '0') || 0;
    get().setMacroVar(name, String(current + amount));
  },
  decMacroVar: (name, amount) => {
    const current = parseFloat(get().macroVars[name] || '0') || 0;
    get().setMacroVar(name, String(current - amount));
  },

  getVariable: (scope, name, presetVars) => {
    switch (scope) {
      case 'global':
        return get().macroVars[name] ?? null;
      case 'preset':
        return presetVars?.[name]?.value ?? null;
      case 'chat':
        return get().macroVars[name] ?? null; // Chat scope shares macroVars for now
      case 'character': {
        try {
          const { useCharSheetStore } = require('../stores/useCharSheetStore');
          const sheet = useCharSheetStore.getState().sheet;
          const charVars: Record<string, string> = {
            name: sheet.identity.name,
            occupation: sheet.identity.occupation,
            age: String(sheet.identity.age),
            gender: sheet.identity.gender,
            hp: String(sheet.secondary.hp.current),
            hpMax: String(sheet.secondary.hp.max),
            san: String(sheet.secondary.san.current),
            sanMax: String(sheet.secondary.san.max),
            mp: String(sheet.secondary.mp.current),
            mpMax: String(sheet.secondary.mp.max),
            luck: String(sheet.secondary.luck),
          };
          // Also all characteristics
          for (const [k, v] of Object.entries(sheet.characteristics)) {
            charVars[k.toLowerCase()] = String(v);
          }
          return charVars[name] ?? charVars[name.toLowerCase()] ?? null;
        } catch {
          return null;
        }
      }
      default:
        return null;
    }
  },

  findItem: (tree, id) => {
    for (const item of tree) {
      if (item.id === id) return item;
      if (item.type === 'folder') {
        const found = get().findItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  },
}));
