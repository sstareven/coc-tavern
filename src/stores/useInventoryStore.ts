import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InventoryItem, InventoryChange, ItemCategory } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

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
  equipItem: (name: string) => void;
  unequipItem: (name: string) => void;
  hasItem: (name: string) => boolean;
  findItem: (name: string) => InventoryItem | undefined;
  buildInventorySummary: () => string;
  clearAll: () => void;
}

function findByName(items: InventoryItem[], name: string): number {
  const exact = items.findIndex((i) => i.name === name);
  if (exact >= 0) return exact;
  return items.findIndex((i) => i.name.includes(name) || name.includes(i.name));
}

export const useInventoryStore = create<InventoryStore>()(
  persist(
    (set, get) => ({
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
                  items.push({
                    id: crypto.randomUUID(),
                    name: c.name,
                    category: c.category ?? 'misc',
                    description: c.description ?? '',
                    quantity: c.quantity ?? 1,
                    equipped: c.equipped ?? false,
                    isKeyItem: (c.category ?? 'misc') === 'key_item',
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
              case 'equip': {
                if (idx >= 0) items[idx] = { ...items[idx], equipped: true };
                break;
              }
              case 'unequip': {
                if (idx >= 0) items[idx] = { ...items[idx], equipped: false };
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

      equipItem: (name) => {
        set((s) => {
          const items = [...s.items];
          const idx = findByName(items, name);
          if (idx >= 0) items[idx] = { ...items[idx], equipped: true };
          return { items };
        });
      },

      unequipItem: (name) => {
        set((s) => {
          const items = [...s.items];
          const idx = findByName(items, name);
          if (idx >= 0) items[idx] = { ...items[idx], equipped: false };
          return { items };
        });
      },

      hasItem: (name) => findByName(get().items, name) >= 0,
      findItem: (name) => {
        const idx = findByName(get().items, name);
        return idx >= 0 ? get().items[idx] : undefined;
      },

      buildInventorySummary: () => {
        const { items } = get();
        if (items.length === 0) return '';
        const equipped = items.filter((i) => i.equipped);
        const bag = items.filter((i) => !i.equipped);
        const fmt = (i: InventoryItem) =>
          i.quantity > 1
            ? `${i.name}x${i.quantity}(${CATEGORY_LABELS[i.category]})`
            : `${i.name}(${CATEGORY_LABELS[i.category]})`;
        const parts: string[] = ['[调查员物品栏]'];
        if (equipped.length > 0) parts.push(`装备中: ${equipped.map(fmt).join(', ')}`);
        if (bag.length > 0) parts.push(`背包: ${bag.map(fmt).join(', ')}`);
        return parts.join('\n');
      },

      clearAll: () => set({ items: [] }),
    }),
    {
      name: 'coc_inventory',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state as unknown as Record<string, unknown>) as Partial<InventoryStore>,
    },
  ),
);

export { CATEGORY_LABELS };
