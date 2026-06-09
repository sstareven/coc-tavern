import type { MapLocation, MapEdge } from '../types';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegalUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export interface SanitizedMapData {
  locations: MapLocation[];
  edges: MapEdge[];
  currentLocationId: string | null;
  remapCount: number;
}

/**
 * 兜底洗净地图数据中的非法 id。
 * 适用于 replaceAll 入口(读档/剧本/快照回灌)防脏数据回潮：
 * 历史版本曾允许 LLM 学样喂出形如 UUID 的伪字符串(如含 'l' 的非法十六进制),
 * 一旦落 IndexedDB 就会代代复读。这里在写入边界统一拦截。
 */
export function sanitizeMapData(
  locations: MapLocation[],
  edges: MapEdge[],
  currentLocationId?: string | null,
): SanitizedMapData {
  const remap = new Map<string, string>();
  let remapCount = 0;

  const cleanLocations = locations.map((l) => {
    if (isLegalUuid(l.id)) return l;
    const newId = crypto.randomUUID();
    remap.set(l.id, newId);
    remapCount++;
    return { ...l, id: newId };
  });

  const cleanEdges = edges.map((e) => {
    const fromId = remap.get(e.fromId) ?? e.fromId;
    const toId = remap.get(e.toId) ?? e.toId;
    if (isLegalUuid(e.id)) {
      return fromId === e.fromId && toId === e.toId ? e : { ...e, fromId, toId };
    }
    remapCount++;
    return { ...e, id: crypto.randomUUID(), fromId, toId };
  });

  const cleanCurrent = currentLocationId != null
    ? (remap.get(currentLocationId) ?? currentLocationId)
    : null;

  return {
    locations: cleanLocations,
    edges: cleanEdges,
    currentLocationId: cleanCurrent,
    remapCount,
  };
}
