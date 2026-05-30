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

describe('useInventoryStore — equippable 能否装备', () => {
  beforeEach(reset);

  it('武器/工具默认可装备', () => {
    useInventoryStore.getState().applyChanges([
      { action: 'add', name: '左轮手枪', category: 'weapon' },
      { action: 'add', name: '绳索', category: 'tool' },
    ]);
    expect(useInventoryStore.getState().findItem('左轮手枪')?.equippable).toBe(true);
    expect(useInventoryStore.getState().findItem('绳索')?.equippable).toBe(true);
  });

  it('线索/纸张等默认不可装备', () => {
    useInventoryStore.getState().applyChanges([
      { action: 'add', name: '密信', category: 'clue' },
      { action: 'add', name: '旧照片', category: 'misc' },
    ]);
    expect(useInventoryStore.getState().findItem('密信')?.equippable).toBe(false);
    expect(useInventoryStore.getState().findItem('旧照片')?.equippable).toBe(false);
  });

  it('显式 equippable 可覆盖 category 默认（misc 护身符标为可装备）', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜护身符', category: 'misc', equippable: true }]);
    expect(useInventoryStore.getState().findItem('黄铜护身符')?.equippable).toBe(true);
  });

  it('不可装备物品的 equip 动作被忽略', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '密信', category: 'clue' }]);
    useInventoryStore.getState().applyChanges([{ action: 'equip', name: '密信' }]);
    expect(useInventoryStore.getState().findItem('密信')?.equipped).toBe(false);
  });

  it('add 时即便请求 equipped:true，不可装备物品也不会被装备', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '剪报', category: 'clue', equipped: true }]);
    expect(useInventoryStore.getState().findItem('剪报')?.equipped).toBe(false);
  });

  it('equipItem 对不可装备物品是空操作', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '笔记', category: 'misc' }]);
    useInventoryStore.getState().equipItem('笔记');
    expect(useInventoryStore.getState().findItem('笔记')?.equipped).toBe(false);
  });
});
