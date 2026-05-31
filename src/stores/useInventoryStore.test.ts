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

describe('useInventoryStore.revertChanges — unequip 撤销加装备守卫（问题4）', () => {
  beforeEach(reset);

  it('撤销 unequip 不会把不可装备物品重新装备', () => {
    // 构造一个老存档式非法物品：misc + equipped=true + equippable 缺省（read 时判定为不可装备）
    useInventoryStore.getState().replaceAll([
      { id: 'x1', name: '怪异硬币', category: 'misc', description: '', quantity: 1, equipped: true, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    // 对它发 unequip 再撤销
    const ch: InventoryChange[] = [{ action: 'unequip', name: '怪异硬币' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('怪异硬币')?.equipped).toBe(false);
    useInventoryStore.getState().revertChanges(ch);
    // 撤销 unequip 本应恢复 equipped=true，但物品不可装备 → 守卫拦截，保持 false
    expect(useInventoryStore.getState().findItem('怪异硬币')?.equipped).toBe(false);
  });

  it('撤销 unequip 对可装备物品仍正常恢复装备', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '左轮手枪', category: 'weapon' }]);
    useInventoryStore.getState().equipItem('左轮手枪');
    const ch: InventoryChange[] = [{ action: 'unequip', name: '左轮手枪' }];
    useInventoryStore.getState().applyChanges(ch);
    expect(useInventoryStore.getState().findItem('左轮手枪')?.equipped).toBe(false);
    useInventoryStore.getState().revertChanges(ch);
    expect(useInventoryStore.getState().findItem('左轮手枪')?.equipped).toBe(true);
  });
});

describe('normalizeItems — 老存档规范化（问题3）', () => {
  it('缺省 equippable 按 category 回填', () => {
    const out = normalizeItems([
      { id: 'a', name: '左轮', category: 'weapon', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
      { id: 'b', name: '密信', category: 'clue', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(out[0].equippable).toBe(true);
    expect(out[1].equippable).toBe(false);
  });

  it('卸下「不可装备却 equipped=true」的非法老物品', () => {
    const out = normalizeItems([
      { id: 'c', name: '怪异硬币', category: 'misc', description: '', quantity: 1, equipped: true, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(out[0].equippable).toBe(false);
    expect(out[0].equipped).toBe(false);
  });

  it('保留可装备物品的 equipped=true', () => {
    const out = normalizeItems([
      { id: 'd', name: '左轮', category: 'weapon', description: '', quantity: 1, equipped: true, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(out[0].equippable).toBe(true);
    expect(out[0].equipped).toBe(true);
  });

  it('显式 equippable=true 的 misc 物品保留装备态', () => {
    const out = normalizeItems([
      { id: 'e', name: '护身符', category: 'misc', description: '', quantity: 1, equipped: true, equippable: true, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(out[0].equipped).toBe(true);
  });
});

describe('replaceAll 走规范化（问题3）', () => {
  beforeEach(reset);

  it('replaceAll 注入老存档非法物品时自动卸下', () => {
    useInventoryStore.getState().replaceAll([
      { id: 'z', name: '旧符', category: 'misc', description: '', quantity: 1, equipped: true, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(useInventoryStore.getState().findItem('旧符')?.equipped).toBe(false);
    expect(useInventoryStore.getState().findItem('旧符')?.equippable).toBe(false);
  });
});

describe('normalizeItems — 保证每个物品都有 id（P2-8 复合主键保护）', () => {
  // 老存档/外部入口可能缺失 id；saveConversation 用 itemId: item.id 作复合主键，
  // id 为 undefined 会破坏 [conversationId+itemId] 键。normalizeItems 须兜底回填 id。
  // 用 Omit<InventoryItem,'id'> 构造无 id 物品，避免 `as any`。
  function itemWithoutId(partial: Omit<InventoryItem, 'id'>): InventoryItem {
    // id 缺省：用 Omit 精确建模无 id 的老存档物品，再窄化为 InventoryItem（非 `as any`）。
    const idless: Omit<InventoryItem, 'id'> & { id?: string } = { ...partial };
    return idless as InventoryItem;
  }

  it('无 id 的物品被回填非空字符串 id', () => {
    const out = normalizeItems([
      itemWithoutId({ name: 'x', category: 'misc', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 }),
    ]);
    expect(typeof out[0].id).toBe('string');
    expect(out[0].id.length).toBeGreaterThan(0);
  });

  it('已有 id 的物品保留原 id', () => {
    const out = normalizeItems([
      { id: 'keep-me', name: '左轮', category: 'weapon', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 } as InventoryItem,
    ]);
    expect(out[0].id).toBe('keep-me');
  });

  it('replaceAll 注入无 id 老存档物品时全部回填 id', () => {
    useInventoryStore.getState().replaceAll([
      itemWithoutId({ name: '断剑', category: 'weapon', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 }),
      itemWithoutId({ name: '残页', category: 'clue', description: '', quantity: 1, equipped: false, isKeyItem: false, acquiredAt: 1 }),
    ]);
    const items = useInventoryStore.getState().items;
    expect(items).toHaveLength(2);
    for (const it of items) {
      expect(typeof it.id).toBe('string');
      expect(it.id.length).toBeGreaterThan(0);
    }
  });
});

describe('行动补写拾取 + 正文去重 — 防止同名物品数量翻倍（集成）', () => {
  beforeEach(reset);

  it('补写拾取已入库后，正文对同名物品的 add 被过滤 → 数量不翻倍', () => {
    // 1) 补写拾取：直接入库「黄铜钥匙」(数量1)
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    expect(useInventoryStore.getState().items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(1);

    // 2) 玩家选了拾取选项并提交 → 正文 API 也想加同名物品（+ 一件无关物品）
    const acquired = ['黄铜钥匙'];
    const mainChanges: InventoryChange[] = [
      { action: 'add', name: '黄铜钥匙', category: 'key_item' },
      { action: 'add', name: '火柴盒', category: 'consumable' },
    ];
    const deduped = filterAlreadyAcquiredAdds(mainChanges, acquired);
    useInventoryStore.getState().applyChanges(deduped);

    const items = useInventoryStore.getState().items;
    // 钥匙仍为 1（去重生效，未被合并翻倍），火柴盒正常入库
    expect(items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(1);
    expect(items.find((i) => i.name === '火柴盒')?.quantity).toBe(1);
  });

  it('反例：不去重时同名 add 会被 applyChanges 合并致数量翻倍（验证去重的必要性）', () => {
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    // 不过滤，直接再加一次同名 → 数量变 2（这正是去重要防止的）
    useInventoryStore.getState().applyChanges([{ action: 'add', name: '黄铜钥匙', category: 'key_item' }]);
    expect(useInventoryStore.getState().items.find((i) => i.name === '黄铜钥匙')?.quantity).toBe(2);
  });
});
