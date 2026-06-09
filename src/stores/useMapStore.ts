import { create } from 'zustand';
import type { MapLocation, MapEdge, MapUpdates } from '../types';
import { sanitizeMapData, UUID_RE } from './map-id-sanitize';

export type { MapUpdates };

interface MapStore {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;

  locations: MapLocation[];
  edges: MapEdge[];
  currentLocationId: string | null;

  applyUpdates: (u: MapUpdates) => void;
  setCurrentByName: (name: string) => void;
  /** 移除连接指定两地点（按名匹配）的连线，无视方向。供地图自检纠正「错挂」的边。 */
  removeEdgesByName: (pairs: { from: string; to: string }[]) => void;
  /** 把若干别名地点合并进 canonical：重挂别名连线、去重、删别名节点、必要时补描述。供地图自检消除重复地点。 */
  mergeLocations: (canonical: string, aliases: string[]) => void;
  replaceAll: (data: { locations: MapLocation[]; edges: MapEdge[]; currentLocationId?: string | null }) => void;
  clearAll: () => void;
}

function findLocByName(locations: MapLocation[], name: string): MapLocation | undefined {
  const t = name.trim();
  return locations.find((l) => l.name === t) ?? locations.find((l) => l.name.includes(t) || t.includes(l.name));
}

export const useMapStore = create<MapStore>()((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),

  locations: [],
  edges: [],
  currentLocationId: null,

  applyUpdates: (u) => {
    set((s) => {
      const locations = [...s.locations];
      const edges = [...s.edges];

      const ensureLoc = (name: string, description?: string): MapLocation => {
        const t = name.trim();
        let loc = findLocByName(locations, t);
        if (!loc) {
          loc = { id: crypto.randomUUID(), name: t, description: description ?? '' };
          locations.push(loc);
        } else if (description && !loc.description) {
          loc.description = description;
        }
        return loc;
      };

      for (const nl of u.newLocations ?? []) {
        if (nl?.name?.trim()) ensureLoc(nl.name, nl.description);
      }

      // BUG3: 二次遍历 newLocations —— 对带描述的条目，无条件覆盖现有节点的空/旧描述。
      // ensureLoc 仅在「现描述为空」时写入(first-writer-wins)；当 LLM 之后给了更详细的
      // 描述时，原 ensureLoc 不会更新。这里补一道：只要新描述非空就刷新。
      for (const nl of u.newLocations ?? []) {
        const t = nl?.name?.trim();
        const desc = nl?.description?.trim();
        if (!t || !desc) continue;
        const existing = findLocByName(locations, t);
        if (existing) existing.description = desc;
      }

      for (const ne of u.newEdges ?? []) {
        if (!ne?.from?.trim() || !ne?.to?.trim()) continue;
        const from = ensureLoc(ne.from);
        const to = ensureLoc(ne.to);
        if (from.id === to.id) continue;
        const type = ne.type === 'oneway' ? 'oneway' : 'bidirectional';
        // 去重：同向同型边不重复；双向边视 from/to 无序
        const dup = edges.some((e) =>
          e.type === type && (
            (e.fromId === from.id && e.toId === to.id) ||
            (type === 'bidirectional' && e.fromId === to.id && e.toId === from.id)
          ));
        if (!dup) edges.push({ id: crypto.randomUUID(), fromId: from.id, toId: to.id, type, description: ne.description });
      }

      let currentLocationId = s.currentLocationId;
      if (u.current?.trim()) {
        currentLocationId = ensureLoc(u.current).id;
      }

      console.assert(
        locations.every((l) => UUID_RE.test(l.id)) && edges.every((e) => UUID_RE.test(e.id)),
        '[useMapStore] applyUpdates 产出了非法 UUID — 某条路径绕过了 crypto.randomUUID()',
      );

      return { locations, edges, currentLocationId };
    });
  },

  replaceAll: (data) => {
    const clean = sanitizeMapData(data.locations, data.edges, data.currentLocationId);
    if (clean.remapCount > 0) {
      console.warn(`[useMapStore] sanitize 重发了 ${clean.remapCount} 个非法地图 id(读档/剧本回灌脏数据)`);
    }
    set({
      locations: clean.locations,
      edges: clean.edges,
      currentLocationId: clean.currentLocationId,
    });
  },

  setCurrentByName: (name) => set((s) => {
    const loc = name?.trim() ? findLocByName(s.locations, name) : undefined;
    return loc ? { currentLocationId: loc.id } : {};
  }),

  removeEdgesByName: (pairs) => set((s) => {
    if (!pairs?.length) return {};
    // 把每对名字解析成 id 键（双向：a|b 与 b|a 都记，删边无视方向）。
    const kill = new Set<string>();
    for (const p of pairs) {
      const a = p?.from?.trim() ? findLocByName(s.locations, p.from) : undefined;
      const b = p?.to?.trim() ? findLocByName(s.locations, p.to) : undefined;
      if (!a || !b || a.id === b.id) continue;
      kill.add(`${a.id}|${b.id}`);
      kill.add(`${b.id}|${a.id}`);
    }
    if (kill.size === 0) return {};
    const edges = s.edges.filter((e) => !kill.has(`${e.fromId}|${e.toId}`));
    return edges.length === s.edges.length ? {} : { edges };
  }),

  mergeLocations: (canonical, aliases) => set((s) => {
    const canon = canonical?.trim() ? findLocByName(s.locations, canonical) : undefined;
    if (!canon) return {};
    // 收集别名 id（排除 canonical 自身）。
    const aliasIds = new Set<string>();
    for (const a of aliases ?? []) {
      const loc = a?.trim() ? findLocByName(s.locations, a) : undefined;
      if (loc && loc.id !== canon.id) aliasIds.add(loc.id);
    }
    if (aliasIds.size === 0) return {};

    // canonical 空描述时，取首个有描述的别名补上。
    let canonDesc = canon.description;
    if (!canonDesc.trim()) {
      for (const id of aliasIds) {
        const al = s.locations.find((l) => l.id === id);
        if (al?.description.trim()) { canonDesc = al.description; break; }
      }
    }

    // 别名连线重挂到 canonical：合并后自环丢弃，再按 类型+端点 去重（双向无序/单向有序，与 applyUpdates 一致）。
    const remap = (id: string) => (aliasIds.has(id) ? canon.id : id);
    const seen = new Set<string>();
    const edges: MapEdge[] = [];
    for (const e of s.edges) {
      const fromId = remap(e.fromId);
      const toId = remap(e.toId);
      if (fromId === toId) continue;
      const key = e.type === 'bidirectional'
        ? `b|${[fromId, toId].sort().join('|')}`
        : `o|${fromId}|${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ ...e, fromId, toId });
    }

    const locations = s.locations
      .filter((l) => !aliasIds.has(l.id))
      .map((l) => (l.id === canon.id ? { ...l, description: canonDesc } : l));

    const currentLocationId = s.currentLocationId && aliasIds.has(s.currentLocationId)
      ? canon.id
      : s.currentLocationId;

    return { locations, edges, currentLocationId };
  }),

  clearAll: () => set({ locations: [], edges: [], currentLocationId: null }),
}));
