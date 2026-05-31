import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { THScriptTree, THRenderSettings, THOptimizeSettings, PTSettings } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

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

// 已废弃的 MVU 死代码脚本（th-mvu-loader 仅 console.log；th-mvu-schema 包在 window 判断内、
// 被脚本沙箱屏蔽 window 而永不执行）。变量更新已由 mvu-extractor.ts 接管。merge 时清除老存档残留。
const DEPRECATED_SCRIPT_IDS = ['th-mvu-loader', 'th-mvu-schema'];

export const BUILTIN_TH_IDS = new Set<string>();

interface TavernHelperStore extends PersistedState {
  presetScripts: THScriptTree[];

  setGlobalScripts: (items: THScriptTree[]) => void;
  addGlobalItem: (item: THScriptTree) => void;
  deleteGlobalItem: (id: string) => void;
  updateGlobalItem: (id: string, updater: (item: THScriptTree) => THScriptTree) => void;
  importGlobalScripts: (scripts: THScriptTree[]) => void;

  setPresetScripts: (items: THScriptTree[]) => void;
  addPresetItem: (item: THScriptTree) => void;
  deletePresetItem: (id: string) => void;
  updatePresetItem: (id: string, updater: (item: THScriptTree) => THScriptTree) => void;

  setRender: (partial: Partial<THRenderSettings>) => void;
  setOptimize: (partial: Partial<THOptimizeSettings>) => void;
  setPromptTemplate: (partial: Partial<PTSettings>) => void;

  setMacroVar: (name: string, value: string) => void;
  setMacroVars: (vars: Record<string, string>) => void;
  getMacroVar: (name: string) => string;

  findItem: (tree: THScriptTree[], id: string) => THScriptTree | null;
}

export function uid(): string {
  return 'th-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export const useTavernHelperStore = create<TavernHelperStore>()(
  persist(
    (set, get) => ({
      ...defaults,
      presetScripts: [],

      setGlobalScripts: (items) => set({ globalScripts: items }),

      addGlobalItem: (item) => set((s) => ({ globalScripts: [...s.globalScripts, item] })),

      deleteGlobalItem: (id) => set((s) => {
        if (BUILTIN_TH_IDS.has(id)) return s;
        function remove(items: THScriptTree[]): THScriptTree[] {
          return items
            .filter((i) => i.id !== id)
            .map((i) => i.type === 'folder' ? { ...i, children: remove(i.children) } : i);
        }
        return { globalScripts: remove([...s.globalScripts]) };
      }),

      updateGlobalItem: (id, updater) => set((s) => {
        function update(items: THScriptTree[]): THScriptTree[] {
          return items.map((i) => {
            if (i.id === id) return updater({ ...i });
            if (i.type === 'folder') return { ...i, children: update(i.children) };
            return i;
          });
        }
        return { globalScripts: update([...s.globalScripts]) };
      }),

      importGlobalScripts: (scripts) => set((s) => ({ globalScripts: [...s.globalScripts, ...scripts] })),

      setPresetScripts: (items) => set({ presetScripts: items }),
      addPresetItem: (item) => set((s) => ({ presetScripts: [...s.presetScripts, item] })),
      deletePresetItem: (id) => set((s) => {
        function remove(items: THScriptTree[]): THScriptTree[] {
          return items
            .filter((i) => i.id !== id)
            .map((i) => i.type === 'folder' ? { ...i, children: remove(i.children) } : i);
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

      setRender: (partial) => set((s) => ({ render: { ...s.render, ...partial } })),

      setOptimize: (partial) => set((s) => ({ optimize: { ...s.optimize, ...partial } })),

      setPromptTemplate: (partial) => set((s) => ({ promptTemplate: { ...s.promptTemplate, ...partial } })),

      setMacroVar: (name, value) => set((s) => ({ macroVars: { ...s.macroVars, [name]: value } })),
    setMacroVars: (vars) => set({ macroVars: { ...vars } }),
      getMacroVar: (name) => get().macroVars[name] ?? '',

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
    }),
    {
      name: 'coc_th_v2',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => {
        const data = stripFunctions(state);
        delete (data as Record<string, unknown>).presetScripts;
        // macroVars 改为按会话隔离，存入关系表（gameState），不再随 TH 全局持久化
        delete (data as Record<string, unknown>).macroVars;
        return data;
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<TavernHelperStore>) };
        // 清除已废弃的 MVU 死代码脚本（含老存档残留），变量更新已由 mvu-extractor 接管
        const scripts = merged.globalScripts ?? [];
        merged.globalScripts = scripts.filter(
          (s) => !(s.type === 'script' && DEPRECATED_SCRIPT_IDS.includes(s.id)),
        );
        return merged as TavernHelperStore;
      },
    },
  ),
);
