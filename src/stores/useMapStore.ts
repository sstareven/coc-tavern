import { create } from 'zustand';
import type { MapLocation, MapEdge, MapUpdates } from '../types';

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

      return { locations, edges, currentLocationId };
    });
  },

  replaceAll: (data) => set({
    locations: data.locations,
    edges: data.edges,
    currentLocationId: data.currentLocationId ?? null,
  }),

  setCurrentByName: (name) => set((s) => {
    const loc = name?.trim() ? findLocByName(s.locations, name) : undefined;
    return loc ? { currentLocationId: loc.id } : {};
  }),

  clearAll: () => set({ locations: [], edges: [], currentLocationId: null }),
}));
