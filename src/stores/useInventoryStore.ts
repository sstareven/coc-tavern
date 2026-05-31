import { create } from 'zustand';
import type { InventoryItem, InventoryChange, ItemCategory } from '../types';
import { pushLog } from './useLogStore';

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
  /** 完全逆转一组物品变化（用于删除某页/回合时撤销其物品增删与装备）。 */
  revertChanges: (changes: InventoryChange[]) => void;
  equipItem: (name: string) => void;
  unequipItem: (name: string) => void;
  hasItem: (name: string) => boolean;
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

/** 按 category 推定可否装备：武器/工具默认可装备，其余默认不可（信件、纸张、线索等）。 */
const EQUIPPABLE_CATEGORIES: ItemCategory[] = ['weapon', 'tool'];
function deriveEquippable(category: ItemCategory, explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return EQUIPPABLE_CATEGORIES.includes(category);
}
/** 物品当前是否可装备：以显式 equippable 为准，缺省按 category 兜底。 */
function itemEquippable(item: InventoryItem): boolean {
  return item.equippable ?? EQUIPPABLE_CATEGORIES.includes(item.category);
}

/**
 * 规范化一组物品（用于持久化迁移、replaceAll、会话恢复等所有外部入口）：
 * 1) 回填缺省的 equippable（按 category 推定）；
 * 2) 卸下「不可装备却 equipped=true」的非法老存档物品，避免按钮消失后永久卡在已装备态。
 */
export function normalizeItems(items: InventoryItem[]): InventoryItem[] {
  return items.map((it) => {
    const equippable = it.equippable ?? EQUIPPABLE_CATEGORIES.includes(it.category);
    const equipped = it.equipped && equippable;
    if (equippable === it.equippable && equipped === it.equipped) return it;
    return { ...it, equippable, equipped };
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
              const equippable = deriveEquippable(category, c.equippable);
              // 问题5：AI 要求装备但物品判定为不可装备（常因漏标 equippable 且 category 落到非武器/工具）→ 静默降级，记日志
              if (c.equipped === true && !equippable) {
                pushLog('warn', `[物品栏] "${c.name}"(${category}) 请求 equipped:true 但判定为不可装备（AI 可能漏标 equippable），已降级为未装备`, 'system');
              }
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: c.quantity ?? 1,
                equipped: (c.equipped ?? false) && equippable,
                equippable,
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
          case 'equip': {
            if (idx >= 0 && itemEquippable(items[idx])) items[idx] = { ...items[idx], equipped: true };
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
              const equippable = deriveEquippable(category, c.equippable);
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: c.quantity ?? 1,
                equipped: (c.equipped ?? false) && equippable,
                equippable,
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
              const equippable = deriveEquippable(category, c.equippable);
              items.push({
                id: crypto.randomUUID(),
                name: c.name,
                category,
                description: c.description ?? '',
                quantity: delta,
                equipped: false,
                equippable,
                isKeyItem: category === 'key_item',
                acquiredAt: Date.now(),
              });
            }
            break;
          }
          case 'equip': {
            if (idx >= 0) items[idx] = { ...items[idx], equipped: false };
            break;
          }
          case 'unequip': {
            // 撤销 unequip = 恢复装备，但须守卫：不可装备物品不得被装回（与 applyChanges equip 对称）
            if (idx >= 0 && itemEquippable(items[idx])) items[idx] = { ...items[idx], equipped: true };
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
      if (idx >= 0 && itemEquippable(items[idx])) items[idx] = { ...items[idx], equipped: true };
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
  replaceAll: (items: InventoryItem[]) => set({ items: normalizeItems(items) }),
}));

export { CATEGORY_LABELS, itemEquippable };
