import { create } from 'zustand';
import type { InventoryItem, InventoryChange, ItemCategory } from '../types';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器',
  tool: '工具',
  consumable: '消耗品',
  clue: '线索',
  key_item: '关键物品',
  misc: '杂物',
};

interface InventoryStore {
  items: InventoryItem[];
  isOpen: boolean;

  toggle: () => void;
  close: () => void;

  applyChanges: (changes: InventoryChange[]) => void;
  /** 完全逆转一组物品变化（用于删除某页/回合时撤销其物品增删）。 */
  revertChanges: (changes: InventoryChange[]) => void;
  findItem: (name: string) => InventoryItem | undefined;
  buildInventorySummary: () => string;
  clearAll: () => void;
  replaceAll: (items: InventoryItem[]) => void;
}

function findByName(items: InventoryItem[], name: string): number {
  const exact = items.findIndex((i) => i.name === name);
  if (exact >= 0) return exact;
  return items.findIndex((i) => i.name.includes(name) || name.includes(i.name));
}

/**
 * 规范化一组物品（用于持久化迁移、replaceAll、会话恢复等所有外部入口）：
 * 保证每个物品都有非空 id（saveConversation 用 itemId: item.id 作复合主键，缺 id 会破坏键）。
 * 顺带剥除旧存档可能残留的 equipped/equippable 字段（已废弃「装备中」概念）。
 */
export function normalizeItems(items: InventoryItem[]): InventoryItem[] {
  return items.map((it) => {
    const legacy = it as InventoryItem & { equipped?: unknown; equippable?: unknown };
    if (it.id && legacy.equipped === undefined && legacy.equippable === undefined) return it;
    const { equipped: _e, equippable: _q, ...rest } = legacy;
    void _e; void _q;
    return { ...rest, id: it.id || crypto.randomUUID() } as InventoryItem;
  });
}

export const useInventoryStore = create<InventoryStore>()((set, get) => ({
  items: [],
  isOpen: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),

  applyChanges: (changes) => {
    set((s) => {
      const items = [...s.items];
      for (const c of changes) {
        if (!c.name || !c.action) continue;
        const idx = findByName(items, c.name);

        switch (c.action) {
          case 'add': {
            if (idx >= 0) {
              items[idx] = { ...items[idx], quantity: items[idx].quantity + (c.quantity ?? 1) };
              if (c.description) items[idx] = { ...items[idx], description: c.description };
            } else {
              const category = c.category ?? 'misc';
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: c.quantity ?? 1,
                isKeyItem: category === 'key_item',
                acquiredAt: Date.now(),
              });
            }
            break;
          }
          case 'remove': {
            if (idx >= 0 && !items[idx].isKeyItem) {
              items.splice(idx, 1);
            }
            break;
          }
          case 'update': {
            if (idx >= 0) {
              const newQty = items[idx].quantity + (c.quantity ?? 0);
              if (newQty <= 0 && !items[idx].isKeyItem) {
                items.splice(idx, 1);
              } else {
                items[idx] = { ...items[idx], quantity: Math.max(0, newQty) };
                if (c.description) items[idx] = { ...items[idx], description: c.description };
              }
            }
            break;
          }
        }
      }
      return { items };
    });
  },

  revertChanges: (changes) => {
    set((s) => {
      const items = [...s.items];
      // 逆序撤销本回合的每一项变化
      for (let k = changes.length - 1; k >= 0; k--) {
        const c = changes[k];
        if (!c.name || !c.action) continue;
        const idx = findByName(items, c.name);
        switch (c.action) {
          case 'add': {
            // 撤销新增：减去新增的数量，归零则移除（关键物品同样移除）
            if (idx >= 0) {
              const q = items[idx].quantity - (c.quantity ?? 1);
              if (q <= 0) items.splice(idx, 1);
              else items[idx] = { ...items[idx], quantity: q };
            }
            break;
          }
          case 'remove': {
            // 撤销移除：尽力恢复（缺失则按变化记录重建）
            if (idx < 0) {
              const category = c.category ?? 'misc';
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: c.quantity ?? 1,
                isKeyItem: category === 'key_item',
                acquiredAt: Date.now(),
              });
            }
            break;
          }
          case 'update': {
            // 撤销数量变动：施加反向增量
            const delta = -(c.quantity ?? 0);
            if (idx >= 0) {
              const q = items[idx].quantity + delta;
              if (q <= 0) items.splice(idx, 1);
              else items[idx] = { ...items[idx], quantity: q };
            } else if (delta > 0) {
              const category = c.category ?? 'misc';
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: delta,
                isKeyItem: category === 'key_item',
                acquiredAt: Date.now(),
              });
            }
            break;
          }
        }
      }
      return { items };
    });
  },

  findItem: (name) => {
    const idx = findByName(get().items, name);
    return idx >= 0 ? get().items[idx] : undefined;
  },

  buildInventorySummary: () => {
    const { items } = get();
    if (items.length === 0) return '';
    const fmt = (i: InventoryItem) =>
      i.quantity > 1
        ? `${i.name}x${i.quantity}(${CATEGORY_LABELS[i.category]})`
        : `${i.name}(${CATEGORY_LABELS[i.category]})`;
    return `[调查员随身物品]\n${items.map(fmt).join(', ')}`;
  },

  clearAll: () => set({ items: [] }),
  replaceAll: (items: InventoryItem[]) => set({ items: normalizeItems(items) }),
}));

export { CATEGORY_LABELS };
