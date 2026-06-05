// 剧本仓库 — 见 docs/specs/2026-06-06-scenario-system-design.md §3 / §A2
// 内置剧本(builtin=true)在 onRehydrate 时灌回 builtins;持久化只保留用户态。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
import { BUILTIN_SCENARIOS } from '../data/builtin-scenarios';
import type {
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioDoc,
  ScenarioPatch,
} from '../types/scenario';

interface ScenarioState {
  builtins: ScenarioDoc[];
  userScenarios: ScenarioDoc[];
  activeId: string | null;
  lastPicked: string | null;
}

interface ScenarioStore extends ScenarioState {
  getById: (id: string) => ScenarioDoc | undefined;
  // 内置剧本被 upsert 时会自动 fork 出一份新 id 的用户副本(返回新 id);否则原地 upsert 并返回原 id。
  upsert: (doc: ScenarioDoc) => string;
  remove: (id: string) => void;
  fork: (id: string) => string | null;
  setActive: (id: string | null) => void;
  setLastPicked: (id: string | null) => void;
  applyPatch: (id: string, patch: ScenarioPatch) => void;
}

const now = () => Date.now();
const uuid = (): string => {
  // 容错:测试环境/老浏览器没有 crypto.randomUUID
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'scn_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

function cloneDoc(doc: ScenarioDoc): ScenarioDoc {
  return JSON.parse(JSON.stringify(doc)) as ScenarioDoc;
}

function forkDoc(src: ScenarioDoc): ScenarioDoc {
  const copy = cloneDoc(src);
  copy.id = uuid();
  copy.builtin = false;
  copy.meta = { ...copy.meta, name: copy.meta.name + '(副本)' };
  copy.createdAt = now();
  copy.updatedAt = now();
  return copy;
}

// patch 应用:按字段顺序合并到目标 doc(纯函数,便于将来挪到 scenario-patch.ts)
function mergePatch(doc: ScenarioDoc, patch: ScenarioPatch): ScenarioDoc {
  const next = cloneDoc(doc);
  if (patch.patchMeta) next.meta = { ...next.meta, ...patch.patchMeta };
  if (patch.upsertEntries?.length) {
    const map = new Map(next.entries.map(e => [e.id, e]));
    for (const e of patch.upsertEntries) map.set(e.id, e);
    next.entries = Array.from(map.values());
  }
  if (patch.removeEntryIds?.length) {
    const drop = new Set(patch.removeEntryIds);
    next.entries = next.entries.filter(e => !drop.has(e.id));
  }
  if (patch.recategorize?.length) {
    const reMap = new Map<string, ScenarioCategory>(patch.recategorize.map(r => [r.id, r.category]));
    next.entries = next.entries.map(e => (reMap.has(e.id) ? { ...e, category: reMap.get(e.id)! } : e));
  }
  if (patch.setCachePolicies?.length) {
    const polMap = new Map<string, ScenarioCachePolicy>(patch.setCachePolicies.map(r => [r.id, r.cachePolicy]));
    next.entries = next.entries.map(e => (polMap.has(e.id) ? { ...e, cachePolicy: polMap.get(e.id)! } : e));
  }
  if (patch.upsertDarkTimeline?.length) {
    const map = new Map(next.darkTimeline.map(p => [p.id, p]));
    for (const p of patch.upsertDarkTimeline) map.set(p.id, p);
    next.darkTimeline = Array.from(map.values());
  }
  if (patch.upsertBadEndings?.length) {
    const map = new Map(next.badEndings.map(b => [b.id, b]));
    for (const b of patch.upsertBadEndings) map.set(b.id, b);
    next.badEndings = Array.from(map.values());
  }
  if (patch.patchCharacters?.length) {
    const map = new Map(next.characters.map(c => [c.id, c]));
    for (const c of patch.patchCharacters) map.set(c.id, c);
    next.characters = Array.from(map.values());
  }
  next.updatedAt = now();
  return next;
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      builtins: BUILTIN_SCENARIOS, // 启动时立即可用,onRehydrateStorage 会再覆盖一次确保最新
      userScenarios: [],
      activeId: null,
      lastPicked: null,

      getById: (id) => {
        const s = get();
        return s.builtins.find(d => d.id === id) ?? s.userScenarios.find(d => d.id === id);
      },

      upsert: (doc) => {
        const s = get();
        const isBuiltin = s.builtins.some(b => b.id === doc.id);
        if (isBuiltin) {
          // 内置剧本不可改 → 自动 fork 新 id
          const forked = forkDoc({ ...doc, id: doc.id });
          set({ userScenarios: [...s.userScenarios, forked] });
          return forked.id;
        }
        const idx = s.userScenarios.findIndex(d => d.id === doc.id);
        const stamped: ScenarioDoc = {
          ...doc,
          builtin: false,
          createdAt: idx >= 0 ? s.userScenarios[idx].createdAt : doc.createdAt || now(),
          updatedAt: now(),
        };
        const next = idx >= 0
          ? s.userScenarios.map((d, i) => (i === idx ? stamped : d))
          : [...s.userScenarios, stamped];
        set({ userScenarios: next });
        return stamped.id;
      },

      remove: (id) => {
        const s = get();
        if (s.builtins.some(b => b.id === id)) return; // 内置不可删
        set({
          userScenarios: s.userScenarios.filter(d => d.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          lastPicked: s.lastPicked === id ? null : s.lastPicked,
        });
      },

      fork: (id) => {
        const src = get().getById(id);
        if (!src) return null;
        const forked = forkDoc(src);
        set(s => ({ userScenarios: [...s.userScenarios, forked] }));
        return forked.id;
      },

      setActive: (id) => set({ activeId: id }),
      setLastPicked: (id) => set({ lastPicked: id }),

      applyPatch: (id, patch) => {
        const s = get();
        // 内置剧本应用 patch → 先 fork 再应用(行为同 upsert)
        const builtinSrc = s.builtins.find(b => b.id === id);
        if (builtinSrc) {
          const forked = forkDoc(builtinSrc);
          const patched = mergePatch(forked, patch);
          set({ userScenarios: [...s.userScenarios, patched] });
          return;
        }
        const idx = s.userScenarios.findIndex(d => d.id === id);
        if (idx < 0) return;
        const patched = mergePatch(s.userScenarios[idx], patch);
        set({ userScenarios: s.userScenarios.map((d, i) => (i === idx ? patched : d)) });
      },
    }),
    {
      name: 'coc_scenarios_v1',
      storage: createJSONStorage(createDexieStorage),
      // 内置剧本不入持久层,只保留用户态
      partialize: (state) =>
        stripFunctions({
          userScenarios: state.userScenarios,
          lastPicked: state.lastPicked,
        } as unknown as Record<string, unknown>) as Partial<ScenarioState>,
      onRehydrateStorage: () => (state) => {
        // 老存档没有 builtins(或被旧版灌过),统一以代码常量为准
        if (state) state.builtins = BUILTIN_SCENARIOS;
      },
    },
  ),
);
