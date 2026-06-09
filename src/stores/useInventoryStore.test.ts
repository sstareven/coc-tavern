import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore, normalizeItems } from './useInventoryStore';
import { filterAlreadyAcquiredAdds } from '../sillytavern/item-acquisition';
import type { InventoryChange, InventoryItem } from '../types';

function reset() {
  useInventoryStore.getState().clearAll();
}

describe('useInventoryStore.revertChanges — 删除回合时撤销物品变化', () => {
  beforeEach(reset);

  it('撤销 add：新加入的物品被移除', () => {
    const ch: InventoryChange[] = [{ action: 'add', name: '密信', category: 'misc', quantity: 1, description: '神秘信件' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('密信')).toBeDefined();
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('密信')).toBeUndefined();
  });

  it('撤销 add：关键物品同样被移除', () => {
    const ch: InventoryChange[] = [{ action: 'add', name: '古老钥匙', category: 'key_item' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('古老钥匙')?.isKeyItem).toBe(true);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('古老钥匙')).toBeUndefined();
  });

  it('撤销 update：数量变动被反向抵消', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '火柴', category: 'consumable', quantity: 3 }]);
    const ch: InventoryChange[] = [{ action: 'update', name: '火柴', quantity: -2 }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('火柴')?.quantity).toBe(1);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('火柴')?.quantity).toBe(3);
  });

  it('撤销 remove：被移除的物品尽力恢复', () => {
    const ch: InventoryChange[] = [{ action: 'remove', name: '绳索', category: 'tool', quantity: 1 }];
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('绳索')).toBeDefined();
  });

  it('完整一回合多项变化逆序撤销后回到原状', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '火柴', category: 'consumable', quantity: 5 }]);
    const turn: InventoryChange[] = [
      { action: 'add', name: '密信', category: 'misc' },
      { action: 'add', name: '左轮手枪', category: 'weapon' },
      { action: 'update', name: '火柴', quantity: -1 },
    ];
    useInventoryStore.getState().applyChanges(turn);
    expect(useInventoryStore.getState().findItem('火柴')?.quantity).toBe(4);

    useInventoryStore.getState().revertChanges(turn);
    const st = useInventoryStore.getState();
    expect(st.findItem('密信')).toBeUndefined();
    expect(st.findItem('左轮手枪')).toBeUndefined();
    expect(st.findItem('火柴')?.quantity).toBe(5);
  });
});

describe('normalizeItems — 保证 id + 剥除遗留 equipped/equippable', () => {
  it('无 id 的物品被回填非空字符串 id', () => {
    const idless = { name: 'x', category: 'misc', description: '', quantity: 1, isKeyItem: false, acquiredAt: 1 } as InventoryItem;
    const out = normalizeItems([idless]);
    expect(typeof out[0].id).toBe('string');
    expect(out[0].id.length).toBeGreaterThan(0);
  });

  it('已有 id 的物品保留原 id', () => {
    const out = normalizeItems([
      { id: 'keep-me', name: '左轮', category: 'weapon', description: '', quantity: 1, isKeyItem: false, acquiredAt: 1 },
    ]);
    expect(out[0].id).toBe('keep-me');
  });

  it('剥除老存档残留的 equipped/equippable 字段', () => {
    const legacy = { id: 'c', name: '怪异硬币', category: 'misc', description: '', quantity: 1, isKeyItem: false, acquiredAt: 1, equipped: true, equippable: false } as unknown as InventoryItem;
    const out = normalizeItems([legacy]);
    expect('equipped' in out[0]).toBe(false);
    expect('equippable' in out[0]).toBe(false);
  });
});

describe('行动补写拾取 + 正文去重 — 防止同名物品数量翻倍（集成）', () => {
  beforeEach(reset);

  it('补写拾取已入库后，正文对同名物品的 add 被过滤 → 数量不翻倍', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    expect(useInventoryStore.getState().items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(1);

    const acquired = ['黄铜钥匙'];
    const mainChanges: InventoryChange[] = [
      { action: 'add', name: '黄铜钥匙', category: 'key_item' },
      { action: 'add', name: '火柴盒', category: 'consumable' },
    ];
    const deduped = filterAlreadyAcquiredAdds(mainChanges, acquired);
    useInventoryStore.getState().applyChanges(deduped);

    const items = useInventoryStore.getState().items;
    expect(items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(1);
    expect(items.find((i) => i.name === '火柴盒')?.quantity).toBe(1);
  });

  it('反例：不去重时同名 add 会被 applyChanges 合并致数量翻倍（验证去重的必要性）', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    expect(useInventoryStore.getState().items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(2);
  });
});
