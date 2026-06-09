// 剧本仓库 — 见 docs/specs/2026-06-06-scenario-system-design.md §3 / §A2
// 内置剧本(builtin=true)在 onRehydrate 时灌回 builtins;持久化只保留用户态。
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';
// D3:BUILTIN_SCENARIOS 顶层会同步 import 8 个剧本(每个含大段叙事/条目/暗线 JSON),
// 启动同步阻塞约百毫秒级。改成 ensureBuiltinsLoaded() 首次访问时同步灌入,延迟到 ScenarioScreen
// 真正打开时才付代价。TODO:后续真正走 dynamic import 拆出独立 chunk,可异步 prefetch。
import { BUILTIN_SCENARIOS } from '../data/builtin-scenarios';
import type {
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioCharacter,
  ScenarioDoc,
  ScenarioPatch,
  ScenarioRelation,
  RelationType,
  RescueEnding,
} from '../types/scenario';

interface ScenarioState {
  builtins: ScenarioDoc[];
  userScenarios: ScenarioDoc[];
  activeId: string | null;
  lastPicked: string | null;
  // 内置 id → 当前会话已 fork 出的副本 id;不跨会话,startNewConversation/loadConversation 会清空
  forkMap: Record<string, string>;
}

interface ScenarioStore extends ScenarioState {
  getById: (id: string) => ScenarioDoc | undefined;
  // 内置剧本被 upsert 时会自动 fork 出一份新 id 的用户副本(返回新 id);
  // 同一会话内对同一内置 id 再次 upsert 会复用 forkMap 中的副本就地更新(返回该副本 id)。
  upsert: (doc: ScenarioDoc) => string;
  remove: (id: string) => void;
  fork: (id: string) => string | null;
  setActive: (id: string | null) => void;
  setLastPicked: (id: string | null) => void;
  applyPatch: (id: string, patch: ScenarioPatch) => void;
  // 关系增量补丁的统一入口:遍历 deltas,upsert/删除 source 角色的 relations 出边,
  // 再走 applyPatch + patchCharacters,自动经 forkMap 副本路径(builtin 不污染)。
  // reason 非空 → 填入新增/更新项的 note(供 lorebook 用)。
  applyRelationDelta: (
    scenarioId: string,
    deltas: Array<{ sourceId: string; targetId: string; newType: RelationType | 'stranger'; reason?: string }>,
  ) => void;
  // 会话切换时调用,丢弃过往会话的 fork 记录(副本本身保留)
  clearForkMap: () => void;
  // D3:延迟初始化 builtins——首次 ScenarioScreen 访问时同步灌入,把启动同步开销挪到打开剧本面板时。
  ensureBuiltinsLoaded: () => void;
}

const now = () => Date.now();
const uuid = (): string => {
  // 容错:测试环境/老浏览器没有 crypto.randomUUID
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'scn_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function cloneDoc(doc: ScenarioDoc): ScenarioDoc {
  return JSON.parse(JSON.stringify(doc)) as ScenarioDoc;
}

function forkDoc(src: ScenarioDoc): ScenarioDoc {
  const copy = cloneDoc(src);
  copy.id = uuid();
  copy.builtin = false;
  copy.meta = { ...copy.meta, name: `${copy.meta.name} (修改 ${dateStamp()})` };
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
  if (patch.removeCharacterIds?.length) {
    const drop = new Set(patch.removeCharacterIds);
    next.characters = next.characters.filter(c => !drop.has(c.id));
  }
  if (patch.patchCharacters?.length) {
    const map = new Map(next.characters.map(c => [c.id, c]));
    for (const c of patch.patchCharacters) {
      const existing = map.get(c.id);
      // 浅合并:patch 里出现的字段覆盖旧字段,未出现的字段保留旧值;
      // 完整新建(无 existing)时直接 set 整条。
      map.set(c.id, existing ? { ...existing, ...c } : c);
    }
    next.characters = Array.from(map.values());
  }
  if (patch.patchImageGen) {
    const cur = next.imageGen ?? {};
    const merged = { ...cur, ...patch.patchImageGen };
    // 显式 undefined 表示删该字段
    (Object.keys(patch.patchImageGen) as (keyof typeof patch.patchImageGen)[]).forEach((k) => {
      if (patch.patchImageGen![k] === undefined) delete merged[k];
    });
    next.imageGen = Object.keys(merged).length === 0 ? undefined : merged;
  }
  if (patch.rescueEndings) {
    const r = patch.rescueEndings;
    if (r.replaceAll) {
      next.rescueEndings = [...r.replaceAll];
    } else {
      let arr: RescueEnding[] = next.rescueEndings ? [...next.rescueEndings] : [];
      if (r.upsert?.length) {
        const existedIds = new Set(arr.map((e) => e.id));
        const incoming = new Map(r.upsert.map((e) => [e.id, e] as const));
        const mapped = arr.map((e) => incoming.get(e.id) ?? e);
        const appended = r.upsert.filter((e) => !existedIds.has(e.id));
        arr = [...mapped, ...appended];
      }
      if (r.removeIds?.length) {
        const drop = new Set(r.removeIds);
        arr = arr.filter((e) => !drop.has(e.id));
      }
      next.rescueEndings = arr;
    }
  }
  next.updatedAt = now();
  return next;
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    (set, get) => ({
      // D3:初始为空,首次 ensureBuiltinsLoaded() / onRehydrateStorage 时灌入,
      // 把启动同步开销挪到打开剧本面板时。
      builtins: [],
      userScenarios: [],
      activeId: null,
      lastPicked: null,
      forkMap: {},

      ensureBuiltinsLoaded: () => {
        if (get().builtins.length === 0) {
          set({ builtins: BUILTIN_SCENARIOS });
        }
      },

      getById: (id) => {
        const s = get();
        return s.builtins.find(d => d.id === id) ?? s.userScenarios.find(d => d.id === id);
      },

      upsert: (doc) => {
        const s = get();
        const isBuiltin = s.builtins.some(b => b.id === doc.id);
        if (isBuiltin) {
          // 同一会话内已 fork 过 → 就地更新副本(避免每次编辑累积新副本)
          const existingForkId = s.forkMap[doc.id];
          if (existingForkId) {
            const idx = s.userScenarios.findIndex(d => d.id === existingForkId);
            if (idx >= 0) {
              const target = s.userScenarios[idx];
              // 用传入 doc 的字段覆盖现有副本,但保留副本 id / builtin=false / createdAt / 命名后缀
              const updated: ScenarioDoc = {
                ...doc,
                id: target.id,
                builtin: false,
                meta: { ...doc.meta, name: target.meta.name },
                createdAt: target.createdAt,
                updatedAt: now(),
              };
              set({
                userScenarios: s.userScenarios.map((d, i) => (i === idx ? updated : d)),
              });
              return target.id;
            }
            // C5:forkMap 命中但目标副本已不在 userScenarios(被外部删除/GC) → 显式清掉 stale 映射,
            // 再走 fork 流程,否则下一次写入仍会命中这条死映射、重复进入 idx<0 死循环。
            console.warn('[useScenarioStore.upsert] forkMap 命中已删副本,清理 stale 映射', { builtinId: doc.id, staleForkId: existingForkId });
            const cleaned = { ...s.forkMap };
            delete cleaned[doc.id];
            set({ forkMap: cleaned });
          }
          // 首次 fork:基于传入 doc(已带本次编辑)做副本,记入 forkMap
          const forked = forkDoc({ ...doc, id: doc.id });
          set(prev => ({
            userScenarios: [...prev.userScenarios, forked],
            forkMap: { ...prev.forkMap, [doc.id]: forked.id },
          }));
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
        // 同步清理 forkMap 里指向这条副本的映射,避免下次 upsert 还命中已删 id
        const nextForkMap = { ...s.forkMap };
        for (const [builtinId, forkId] of Object.entries(nextForkMap)) {
          if (forkId === id) delete nextForkMap[builtinId];
        }
        set({
          userScenarios: s.userScenarios.filter(d => d.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          lastPicked: s.lastPicked === id ? null : s.lastPicked,
          forkMap: nextForkMap,
        });
      },

      fork: (id) => {
        // 显式 fork 行为:不查 forkMap,每次都新建副本(用户主动复制)
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
        const builtinSrc = s.builtins.find(b => b.id === id);
        if (builtinSrc) {
          // 同一会话内已 fork → 就地 patch 该副本
          const existingForkId = s.forkMap[id];
          if (existingForkId) {
            const idx = s.userScenarios.findIndex(d => d.id === existingForkId);
            if (idx >= 0) {
              const patched = mergePatch(s.userScenarios[idx], patch);
              set({
                userScenarios: s.userScenarios.map((d, i) => (i === idx ? patched : d)),
              });
              return;
            }
            // C5:forkMap 命中但目标副本已不在 userScenarios → 清掉 stale 映射再走 fork 流程,
            // 防御下一次 patch 仍命中死映射。
            console.warn('[useScenarioStore.applyPatch] forkMap 命中已删副本,清理 stale 映射', { builtinId: id, staleForkId: existingForkId });
            const cleaned = { ...s.forkMap };
            delete cleaned[id];
            set({ forkMap: cleaned });
          }
          const forked = forkDoc(builtinSrc);
          const patched = mergePatch(forked, patch);
          set(prev => ({
            userScenarios: [...prev.userScenarios, patched],
            forkMap: { ...prev.forkMap, [id]: patched.id },
          }));
          return;
        }
        const idx = s.userScenarios.findIndex(d => d.id === id);
        if (idx < 0) return;
        const patched = mergePatch(s.userScenarios[idx], patch);
        set({ userScenarios: s.userScenarios.map((d, i) => (i === idx ? patched : d)) });
      },

      applyRelationDelta: (scenarioId, deltas) => {
        if (!deltas?.length) return;
        const doc = get().getById(scenarioId);
        if (!doc) return;

        // 把 deltas 收敛成 sourceId → 该角色最终 relations[] 的映射,然后一次 applyPatch 下去。
        const finalRelsBySource = new Map<string, ScenarioRelation[]>();
        for (const d of deltas) {
          const src = doc.characters.find(c => c.id === d.sourceId);
          if (!src) continue;
          const current = finalRelsBySource.get(d.sourceId) ?? [...(src.relations ?? [])];
          const idx = current.findIndex(r => r.targetId === d.targetId);
          if (d.newType === 'stranger') {
            if (idx >= 0) current.splice(idx, 1);
          } else {
            const next: ScenarioRelation = idx >= 0
              ? { ...current[idx], type: d.newType, ...(d.reason ? { note: d.reason } : {}) }
              : { targetId: d.targetId, type: d.newType, ...(d.reason ? { note: d.reason } : {}) };
            if (idx >= 0) current[idx] = next; else current.push(next);
          }
          finalRelsBySource.set(d.sourceId, current);
        }

        if (finalRelsBySource.size === 0) return;

        const patchCharacters = Array.from(finalRelsBySource.entries())
          .map(([sourceId, relations]) => ({ id: sourceId, relations } as ScenarioCharacter));
        get().applyPatch(scenarioId, { patchCharacters });
      },

      clearForkMap: () => set({ forkMap: {} }),
    }),
    {
      name: 'coc_scenarios_v1',
      storage: createJSONStorage(createDexieStorage),
      // D4:forkMap 是会话内 dedup map, 不跨页面会话保留;同 tab 刷新依赖 startNewConversation
      // 重建,刻意不写入 Dexie(注释跨会话不持久符号设计意图)。只持久化 userScenarios + lastPicked。
      partialize: (state) =>
        stripFunctions({
          userScenarios: state.userScenarios,
          lastPicked: state.lastPicked,
        } as unknown as Record<string, unknown>) as Partial<ScenarioState>,
      onRehydrateStorage: () => (state) => {
        // 老存档没有 builtins(或被旧版灌过),统一以代码常量为准(D3:这里同步灌入 = 首次开 app 也立即可用)
        if (state) {
          state.builtins = BUILTIN_SCENARIOS;
          if (!state.forkMap) state.forkMap = {};
          // A4:forkMap GC——清掉指向已不在 userScenarios 中的 forkId(被外部 remove / 数据迁移裁掉),
          // 否则后续 upsert / applyPatch 会命中死映射,再走 stale 清理路径反而绕一圈。
          state.forkMap = Object.fromEntries(
            Object.entries(state.forkMap ?? {}).filter(([, forkId]) =>
              state.userScenarios.some(d => d.id === forkId)
            )
          );
        }
      },
    },
  ),
);
