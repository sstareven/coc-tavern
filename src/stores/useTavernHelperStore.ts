import { create } from 'zustand';
import type { THScriptTree, THRenderSettings, THOptimizeSettings, PTSettings, THScope, THVariable } from '../types';

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
  globalScripts: [
    {
      id: 'th-mvu-loader',
      type: 'script' as const,
      enabled: true,
      name: 'MVU',
      content: `// MVU 变量更新引擎加载器
// 基于 MagicalAstrogy/MagVarUpdate (https://github.com/MagicalAstrogy/MagVarUpdate)
// 在 SillyTavern 环境中自动加载 bundle

if (typeof window !== 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';
  script.type = 'module';
  document.head.appendChild(script);
  console.log('[MVU] MagVarUpdate bundle loaded');
}`,
      info: '加载 MagVarUpdate 变量更新引擎 bundle',
    },
    {
      id: 'th-mvu-schema',
      type: 'script' as const,
      enabled: true,
      name: '变量结构',
      content: `// 变量结构 ZOD Schema — COC 7th TRPG 世界状态
// 注册到 MVU 系统的变量结构定义
// 基于 MagicalAstrogy/MagVarUpdate + StageDog/tavern_resource

if (typeof window !== 'undefined' && window.registerMvuSchema) {
  const { z } = window;
  const { _ } = window;

  const Schema = z.object({
    调查员: z.object({
      姓名: z.string().prefault('未知'),
      年龄: z.coerce.number().prefault(25),
      性别: z.string().prefault('男'),
      职业: z.string().prefault('调查员'),
      生命值: z.object({ 当前: z.coerce.number().prefault(10), 最大: z.coerce.number().prefault(10) }).prefault({}),
      理智值: z.object({ 当前: z.coerce.number().prefault(50), 最大: z.coerce.number().prefault(99) }).prefault({}),
      魔法值: z.object({ 当前: z.coerce.number().prefault(10), 最大: z.coerce.number().prefault(10) }).prefault({}),
      幸运: z.coerce.number().transform(v => _.clamp(Number(v), 0, 99)).prefault(50),
      信用评级: z.coerce.number().transform(v => _.clamp(Number(v), 0, 99)).prefault(20),
      状态: z.record(z.string().describe('状态标签'), z.object({
        名称: z.string(),
        严重程度: z.enum(['轻微', '中等', '严重', '致命']).prefault('轻微'),
        持续回合: z.coerce.number().prefault(0),
      }).prefault({})).prefault({}),
      技能: z.record(z.string().describe('技能名'), z.object({
        基础值: z.coerce.number(),
        当前值: z.coerce.number(),
        成长标记: z.boolean().prefault(false),
      }).prefault({})).prefault({}),
      物品栏: z.record(z.string().describe('物品名'), z.object({
        描述: z.string().prefault(''),
        数量: z.coerce.number().prefault(1),
        是否关键物品: z.boolean().prefault(false),
      }).prefault({})).prefault({}),
    }).prefault({}),
    世界: z.object({
      日期: z.string().prefault('1925-01-01'),
      时间: z.string().prefault('清晨'),
      天气: z.string().prefault('薄雾'),
      地点: z.string().prefault('阿卡姆'),
      场景描述: z.string().prefault(''),
    }).prefault({}),
    剧情: z.object({
      当前章节: z.string().prefault('序章'),
      章节概述: z.string().prefault(''),
      关键事件: z.record(z.string().describe('事件编号'), z.object({
        名称: z.string(),
        发生时间: z.string().prefault(''),
        影响: z.string().prefault(''),
      }).prefault({})).prefault({}),
      线索: z.record(z.string().describe('线索名称'), z.object({
        内容: z.string(),
        发现地点: z.string().prefault(''),
        关联事件: z.string().prefault(''),
        是否已调查: z.boolean().prefault(false),
      }).prefault({})).prefault({}),
      NPC: z.record(z.string().describe('NPC名称'), z.object({
        身份: z.string().prefault(''),
        关系: z.string().prefault('陌生人'),
        态度: z.coerce.number().transform(v => _.clamp(Number(v), -100, 100)).prefault(0),
        位置: z.string().prefault('未知'),
        是否存活: z.boolean().prefault(true),
        备注: z.string().prefault(''),
      }).prefault({})).prefault({}),
      任务: z.record(z.string().describe('任务名'), z.object({
        状态: z.enum(['进行中', '已完成', '失败', '搁置']).prefault('进行中'),
        说明: z.string().prefault(''),
        目标: z.string().prefault(''),
        奖励: z.string().prefault(''),
      }).prefault({})).prefault({}),
    }).prefault({}),
    战斗: z.object({
      是否战斗中: z.boolean().prefault(false),
      回合数: z.coerce.number().prefault(0),
      敌人: z.record(z.string().describe('敌人名称'), z.object({
        生命值: z.object({ 当前: z.coerce.number().prefault(0), 最大: z.coerce.number().prefault(0) }).prefault({}),
        护甲: z.coerce.number().prefault(0),
        状态: z.string().prefault(''),
      }).prefault({})).prefault({}),
    }).prefault({}),
    _元数据: z.object({
      _最后更新: z.string().prefault(''),
      _变量版本: z.string().prefault('1.0'),
    }).prefault({}),
  });

  window.registerMvuSchema(Schema);
  console.log('[MVU] ZOD Schema registered');
}`,
      info: 'COC 7th TRPG 变量结构 ZOD Schema（调查员/世界/剧情）',
    },
  ],
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

// MVU default script IDs that must always be present
const MVU_SCRIPT_IDS = ['th-mvu-loader', 'th-mvu-schema'];

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const saved: PersistedState = { ...defaults, ...JSON.parse(raw) };
    // Ensure MVU scripts are always present by merging default MVU scripts
    const mvuDefaults = defaults.globalScripts.filter(
      (s) => s.type === 'script' && MVU_SCRIPT_IDS.includes(s.id)
    );
    const hasMvu = saved.globalScripts.some(
      (s) => s.type === 'script' && MVU_SCRIPT_IDS.includes(s.id)
    );
    if (!hasMvu) {
      saved.globalScripts = [...mvuDefaults, ...saved.globalScripts];
    }
    return saved;
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
