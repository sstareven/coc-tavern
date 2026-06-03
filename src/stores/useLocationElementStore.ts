import { create } from 'zustand';
import type { LocationElement, LocationElementInput } from '../types';

export type { LocationElementInput };

interface LocationElementStore {
  elements: LocationElement[];

  /** 应用 LLM 抽取的一组地点元素：按 (locationName, name) 去重 upsert（非空才覆盖 description/category），否则新增。 */
  applyExtracted: (items: LocationElementInput[]) => void;
  /** 取某地点下的元素：精确名优先，再宽松包含兜底（与 useMapStore.findLocByName 语义一致）。 */
  getByLocation: (locationName: string) => LocationElement[];
  /** 把当前地点的已知元素拼成注入文本，供主生成参考保持一致；该地点无元素则返回 ''。 */
  buildContextInjection: (currentLocationName: string) => string;
  replaceAll: (list: LocationElement[]) => void;
  clearAll: () => void;
}

/** 在已存元素中按 (locationName, name) 精确查找（均 trim 比较），返回下标或 -1。 */
function findIdx(elements: LocationElement[], locationName: string, name: string): number {
  const loc = locationName.trim();
  const n = name.trim();
  return elements.findIndex((e) => e.locationName.trim() === loc && e.name.trim() === n);
}

export const useLocationElementStore = create<LocationElementStore>()((set, get) => ({
  elements: [],

  applyExtracted: (items) => {
    set((s) => {
      const elements = [...s.elements];
      for (const item of items) {
        const locationName = item.locationName?.trim();
        const name = item.name?.trim();
        if (!locationName || !name) continue;
        const idx = findIdx(elements, locationName, name);
        if (idx >= 0) {
          // 已存：仅在新值非空时覆盖 description/category
          const cur = elements[idx];
          elements[idx] = {
            ...cur,
            description: item.description?.trim() ? item.description : cur.description,
            category: item.category ? item.category : cur.category,
          };
        } else {
          // 不存在：新建——id 用随机 uuid、createdAt 用当前毫秒时间戳（照搬 useNpcStore）
          elements.push({
            id: crypto.randomUUID(),
            locationName,
            name,
            category: item.category,
            description: item.description ?? '',
            createdAt: Date.now(),
          });
        }
      }
      return { elements };
    });
  },

  getByLocation: (locationName) => {
    const t = locationName.trim();
    const all = get().elements;
    const exact = all.filter((e) => e.locationName === t);
    if (exact.length > 0) return exact;
    // 宽松包含兜底（双向 includes，与地图地点名称匹配语义一致）
    return all.filter((e) => e.locationName.includes(t) || t.includes(e.locationName));
  },

  buildContextInjection: (currentLocationName) => {
    const list = get().getByLocation(currentLocationName);
    if (list.length === 0) return '';
    const lines = list.map((e) => `- ${e.name}（${e.category}）：${e.description}`);
    return `[当前地点「${currentLocationName}」的已知元素——请与下列描述保持一致，勿与之矛盾，可在叙事中自然提及/复用]\n${lines.join('\n')}`;
  },

  replaceAll: (list) => set({ elements: list }),
  clearAll: () => set({ elements: [] }),
}));
