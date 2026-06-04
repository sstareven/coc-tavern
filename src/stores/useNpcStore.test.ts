import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore } from './useNpcStore';
import { useCharSheetStore } from './useCharSheetStore';

function reset() { useNpcStore.getState().clearAll(); }
function useChatSheetName(name: string) {
  const s = useCharSheetStore.getState();
  s.setSheet({ ...s.sheet, identity: { ...s.sheet.identity, name } });
}

describe('useNpcStore.applyUpdates', () => {
  beforeEach(reset);

  it('首次出现创建 NPC（默认在场、好感度0）', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', identity: '看门人', appearance: '佝偻', personality: '多疑' }]);
    const present = useNpcStore.getState().getPresent();
    expect(present).toHaveLength(1);
    expect(present[0].name).toBe('老约翰');
    expect(present[0].identity).toBe('看门人');
    expect(present[0].favorability).toBe(0);
    expect(present[0].isPresent).toBe(true);
  });

  it('同名更新而非重复创建；favorabilityDelta 累加并夹紧', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', identity: '看门人' }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', favorabilityDelta: 40 }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', favorabilityDelta: 80 }]);
    const all = Object.values(useNpcStore.getState().profiles);
    expect(all).toHaveLength(1);
    expect(all[0].favorability).toBe(100); // 40+80=120 → 夹到 100
  });

  it('addMemory 追加记忆；isPresent=false 移到离场', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', addMemory: '盘问了调查员' }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰', addMemory: '收下了贿赂', isPresent: false }]);
    expect(useNpcStore.getState().getPresent()).toHaveLength(0);
    const absent = useNpcStore.getState().getAbsent();
    expect(absent).toHaveLength(1);
    expect(absent[0].memories).toEqual(['盘问了调查员', '收下了贿赂']);
  });

  it('buildContextInjection 只含在场 NPC', () => {
    useNpcStore.getState().applyUpdates([
      { name: '在场甲', identity: '医生', isPresent: true },
      { name: '离场乙', identity: '记者', isPresent: false },
    ]);
    const ctx = useNpcStore.getState().buildContextInjection();
    expect(ctx).toContain('在场甲');
    expect(ctx).not.toContain('离场乙');
  });

  it('新建 NPC 自动获得 8 项基础属性（确定性，同 id 稳定）', () => {
    useNpcStore.getState().applyUpdates([{ name: '陌生人' }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    const c = p.characteristics!;
    expect(Object.keys(c).sort()).toEqual(['APP', 'CON', 'DEX', 'EDU', 'INT', 'POW', 'SIZ', 'STR']);
    expect(Object.values(c).every((v) => typeof v === 'number' && v >= 15 && v <= 90)).toBe(true);
  });

  it('LLM 提供的 characteristics 优先，不被默认值覆盖', () => {
    useNpcStore.getState().applyUpdates([{ name: '教授', characteristics: { STR: 35, INT: 80 } }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.characteristics!.STR).toBe(35);
    expect(p.characteristics!.INT).toBe(80);
  });

  it('调查员不入名册：同名 npcUpdate 被忽略', () => {
    useChatSheetName('杰米');
    useNpcStore.getState().applyUpdates([{ name: '杰米', identity: '调查员' }, { name: '路人', identity: '小贩' }]);
    const names = Object.values(useNpcStore.getState().profiles).map((p) => p.name);
    expect(names).not.toContain('杰米');
    expect(names).toContain('路人');
    useChatSheetName('');
  });
});

import { MEMORY_HARD_CAP } from './useNpcStore';

describe('NPC 记忆折叠', () => {
  beforeEach(() => { useNpcStore.getState().clearAll(); });

  it('收到 memorySummary 后写入梗概并把记忆裁到 npcMemoryKeep（默认6）', () => {
    const store = useNpcStore.getState();
    // 先累积 9 条互动记忆
    for (let i = 1; i <= 9; i++) store.applyUpdates([{ name: '老者', addMemory: `互动${i}` }]);
    // 再给一次梗概
    store.applyUpdates([{ name: '老者', memorySummary: '与调查员多次交谈，渐生信任。' }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.memorySummary).toBe('与调查员多次交谈，渐生信任。');
    expect(p.memories.length).toBe(6);
    expect(p.memories[5]).toBe('互动9'); // 保留最近的
  });

  it('仅追加记忆、无梗概时也绝不超过 MEMORY_HARD_CAP（兜底）', () => {
    const store = useNpcStore.getState();
    for (let i = 1; i <= 20; i++) store.applyUpdates([{ name: '怪客', addMemory: `m${i}` }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.memories.length).toBe(MEMORY_HARD_CAP);
    expect(p.memories[p.memories.length - 1]).toBe('m20');
  });

  it('在场 NPC 注入：含记忆梗概，且记忆较多时附折叠提示', () => {
    const store = useNpcStore.getState();
    store.applyUpdates([{ name: '管家', identity: '宅邸管家', isPresent: true, memorySummary: '忠诚但隐瞒了地窖的事。' }]);
    for (let i = 1; i <= 10; i++) store.applyUpdates([{ name: '管家', addMemory: `事件${i}` }]);
    const inj = useNpcStore.getState().buildContextInjection();
    expect(inj).toContain('记忆梗概：忠诚但隐瞒了地窖的事。');
    expect(inj).toContain('memorySummary');
  });
});

describe('NPC 当前 HP/SAN/MP 追踪', () => {
  beforeEach(reset);
  // CON60+SIZ60→HP=12；POW50→SAN=50、MP=10
  const chars = { CON: 60, SIZ: 60, POW: 50 };

  it('hpDelta 钳制到 [0, 推算最大值]（缺省当前值=最大值）', () => {
    const st = useNpcStore.getState();
    st.applyUpdates([{ name: '伤兵', characteristics: chars }]);
    st.applyUpdates([{ name: '伤兵', hpDelta: -5 }]);
    expect(Object.values(useNpcStore.getState().profiles)[0].hpCurrent).toBe(7); // 12-5
    st.applyUpdates([{ name: '伤兵', hpDelta: -100 }]);
    expect(Object.values(useNpcStore.getState().profiles)[0].hpCurrent).toBe(0); // 钳到 0
    st.applyUpdates([{ name: '伤兵', hpDelta: 100 }]);
    expect(Object.values(useNpcStore.getState().profiles)[0].hpCurrent).toBe(12); // 钳到 max
  });

  it('sanDelta/mpDelta 各自按最大值钳制', () => {
    const st = useNpcStore.getState();
    st.applyUpdates([{ name: '学者', characteristics: chars }]);
    st.applyUpdates([{ name: '学者', sanDelta: -8, mpDelta: -3 }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.sanCurrent).toBe(42); // 50-8
    expect(p.mpCurrent).toBe(7);  // 10-3
  });

  it('applyCombatResult 按 npc-<id> 回写终值HP+状态', () => {
    const st = useNpcStore.getState();
    st.applyUpdates([{ name: '匪徒', characteristics: chars }]);
    const id = Object.keys(useNpcStore.getState().profiles)[0];
    st.applyCombatResult([{ id: `npc-${id}`, hp: 3, maxHp: 12, flags: { majorWound: true } }]);
    let p = useNpcStore.getState().profiles[id];
    expect(p.hpCurrent).toBe(3);
    expect(p.status).toBe('重伤');
    st.applyCombatResult([{ id: `npc-${id}`, hp: 0, maxHp: 12, flags: { dead: true } }]);
    p = useNpcStore.getState().profiles[id];
    expect(p.hpCurrent).toBe(0);
    expect(p.status).toBe('已死亡');
  });

  it('applyCombatResult 忽略非 npc-<id>（LLM建场的通用敌人）与不存在的档案', () => {
    const st = useNpcStore.getState();
    st.applyUpdates([{ name: '路人', characteristics: chars }]);
    const before = useNpcStore.getState().profiles;
    st.applyCombatResult([{ id: 'enemy-0-邪教徒', hp: 1, maxHp: 10 }, { id: 'npc-不存在', hp: 1, maxHp: 10 }]);
    expect(useNpcStore.getState().profiles).toEqual(before); // 无变化
  });
});
