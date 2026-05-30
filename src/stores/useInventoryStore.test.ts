import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from './useInventoryStore';
import type { InventoryChange } from '../types';

function reset() {
  useInventoryStore.getState().clearAll();
}

describe('useInventoryStore.revertChanges — 删除回合时撤销物品变化', () => {
  beforeEach(reset);

  it('撤销 add：新加入的物品被移除', () => {
    const ch: InventoryChange[] = [{ action: 'add', name: '密信', category: 'clue', quantity: 1, description: '神秘信件' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().hasItem('密信')).toBe(true);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().hasItem('密信')).toBe(false);
  });

  it('撤销 add：关键物品同样被移除', () => {
    const ch: InventoryChange[] = [{ action: 'add', name: '古老钥匙', category: 'key_item' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('古老钥匙')?.isKeyItem).toBe(true);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().hasItem('古老钥匙')).toBe(false);
  });

  it('撤销 equip：装备状态回到未装备', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '左轮手枪', category: 'weapon' }]);
    const ch: InventoryChange[] = [{ action: 'equip', name: '左轮手枪' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('左轮手枪')?.equipped).toBe(true);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('左轮手枪')?.equipped).toBe(false);
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
    expect(useInventoryStore.getState().hasItem('绳索')).toBe(true);
  });

  it('完整一回合多项变化逆序撤销后回到原状', () => {
    // 先备好一把已有的火柴
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '火柴', category: 'consumable', quantity: 5 }]);
    const turn: InventoryChange[] = [
      { action: 'add', name: '密信', category: 'clue' },
      { action: 'add', name: '左轮手枪', category: 'weapon' },
      { action: 'equip', name: '左轮手枪' },
      { action: 'update', name: '火柴', quantity: -1 },
    ];
    useInventoryStore.getState().applyChanges(turn);
    expect(useInventoryStore.getState().findItem('火柴')?.quantity).toBe(4);

    useInventoryStore.getState().revertChanges(turn);
    const st = useInventoryStore.getState();
    expect(st.hasItem('密信')).toBe(false);
    expect(st.hasItem('左轮手枪')).toBe(false);
    expect(st.findItem('火柴')?.quantity).toBe(5);
  });
});
