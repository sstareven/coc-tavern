import { describe, it, expect } from 'vitest';
import { filterAlreadyAcquiredAdds } from './item-acquisition';
import type { InventoryChange } from '../types';

const add = (name: string): InventoryChange => ({ action: 'add', name });
const remove = (name: string): InventoryChange => ({ action: 'remove', name });

describe('filterAlreadyAcquiredAdds', () => {
  it('no acquired names → passthrough unchanged', () => {
    const changes = [add('黄铜钥匙'), remove('火把')];
    expect(filterAlreadyAcquiredAdds(changes, [])).toEqual(changes);
  });

  it('drops add whose name was already acquired (exact)', () => {
    const out = filterAlreadyAcquiredAdds([add('黄铜钥匙'), add('左轮手枪')], ['黄铜钥匙']);
    expect(out.map((c) => c.name)).toEqual(['左轮手枪']);
  });

  it('drops add by fuzzy substring match (钥匙 ⊂ 黄铜钥匙)', () => {
    expect(filterAlreadyAcquiredAdds([add('黄铜钥匙')], ['钥匙'])).toEqual([]);
    expect(filterAlreadyAcquiredAdds([add('钥匙')], ['黄铜钥匙'])).toEqual([]);
  });

  it('never filters non-add actions even if name matches', () => {
    const changes = [remove('黄铜钥匙'), { action: 'update', name: '黄铜钥匙', quantity: -1 } as InventoryChange];
    expect(filterAlreadyAcquiredAdds(changes, ['黄铜钥匙'])).toEqual(changes);
  });

  it('keeps unrelated adds', () => {
    const out = filterAlreadyAcquiredAdds([add('信件'), add('钥匙')], ['钥匙']);
    expect(out.map((c) => c.name)).toEqual(['信件']);
  });
});
