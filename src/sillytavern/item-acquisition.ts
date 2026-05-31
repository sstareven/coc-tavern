import type { InventoryChange } from '../types';

/**
 * Fuzzy name match for already-acquired items, mirroring useInventoryStore.findByName's
 * exact-or-substring logic so "黄铜钥匙" and "钥匙" collapse to the same item.
 */
function sameItemName(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

/**
 * Drop `add` inventory changes whose item was ALREADY acquired via an action-rewrite pickup
 * (recorded in the page's `acquiredItems`). Prevents the subsequent main-narrative call from
 * re-adding the same item — which `applyChanges` would otherwise merge as a quantity bump.
 *
 * Only `add` is filtered; remove/equip/unequip/update pass through untouched.
 */
export function filterAlreadyAcquiredAdds(
  changes: InventoryChange[],
  acquiredNames: string[],
): InventoryChange[] {
  if (!acquiredNames.length) return changes;
  return changes.filter((c) => {
    if (c.action !== 'add') return true;
    return !acquiredNames.some((name) => sameItemName(c.name, name));
  });
}
