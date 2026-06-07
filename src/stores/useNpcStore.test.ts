import { describe, it, expect, beforeEach } from 'vitest';
import { useNpcStore, dedupeProfilesByName, mergeAliases } from './useNpcStore';
import { useCharSheetStore } from './useCharSheetStore';
import type { NpcProfile } from '../types';

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

  it('应用更新两次同名（trim 后等长）→ 仍只创建 1 条', () => {
    useNpcStore.getState().applyUpdates([{ name: '老约翰', identity: '看门人' }]);
    useNpcStore.getState().applyUpdates([{ name: '老约翰  ', identity: '看门人B' }]); // 尾随空白
    const all = Object.values(useNpcStore.getState().profiles);
    expect(all).toHaveLength(1);
    expect(all[0].identity).toBe('看门人B'); // 后一次覆盖
  });

  it('不再宽松 includes 归并：新登场「霍尔姆斯先生」不会被并到既有「霍尔姆斯」（BUG2 Part 1）', () => {
    useNpcStore.getState().applyUpdates([{ name: '霍尔姆斯', identity: '侦探' }]);
    useNpcStore.getState().applyUpdates([{ name: '霍尔姆斯先生', identity: '同名长辈' }]);
    const all = Object.values(useNpcStore.getState().profiles);
    expect(all).toHaveLength(2);
    const names = all.map((p) => p.name).sort();
    expect(names).toEqual(['霍尔姆斯', '霍尔姆斯先生']);
  });

  it('剧本预设 NPC 安装后 isScenarioPreset/scenarioHiddenBio 保留（fix #1）', () => {
    useNpcStore.getState().applyUpdates([{
      name: '镇长哈尔德',
      identity: '镇长',
      backstory: 'KP 暗线核心：教派首脑',
      innerThoughts: '隐藏祭祀地点的真相',
      isScenarioPreset: true,
      scenarioHiddenBio: 'KP 暗线核心：教派首脑',
    }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.isScenarioPreset).toBe(true);
    expect(p.scenarioHiddenBio).toBe('KP 暗线核心：教派首脑');
  });

  it('预设 NPC backstory/innerThoughts 非空 → 主回合覆盖被挡（fix #1 保护链生效）', () => {
    useNpcStore.getState().applyUpdates([{
      name: '镇长哈尔德', identity: '镇长',
      backstory: 'KP 暗线骨架', innerThoughts: '隐藏祭祀地点',
      isScenarioPreset: true,
    }]);
    useNpcStore.getState().applyUpdates([{
      name: '镇长哈尔德', backstory: '他是个普通镇长', innerThoughts: '没什么秘密',
    }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.backstory).toBe('KP 暗线骨架');
    expect(p.innerThoughts).toBe('隐藏祭祀地点');
  });

  it('预设 NPC backstory 留空 → 首次 npcUpdate 允许填入（fix #12 空值不锁死）', () => {
    useNpcStore.getState().applyUpdates([{
      name: '神秘陌生人', identity: '路过的旅人',
      backstory: '', innerThoughts: '', isScenarioPreset: true,
    }]);
    useNpcStore.getState().applyUpdates([{
      name: '神秘陌生人',
      backstory: '他来自远方港口,见过深海异象。',
      innerThoughts: '试探调查员是否值得信赖。',
    }]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.backstory).toBe('他来自远方港口,见过深海异象。');
    expect(p.innerThoughts).toBe('试探调查员是否值得信赖。');
    expect(p.isScenarioPreset).toBe(true);
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

function makeProfile(over: Partial<NpcProfile>): NpcProfile {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: over.name ?? '佚名',
    identity: over.identity ?? '',
    favorability: over.favorability ?? 0,
    appearance: over.appearance ?? '',
    personality: over.personality ?? '',
    innerThoughts: over.innerThoughts ?? '',
    memories: over.memories ?? [],
    experience: over.experience ?? '',
    backstory: over.backstory ?? '',
    possessions: over.possessions ?? [],
    isPresent: over.isPresent ?? true,
    createdAt: over.createdAt ?? 0,
    updatedAt: over.updatedAt ?? 0,
    ...over,
  };
}

describe('dedupeProfilesByName — 老档同名条目合并迁移（BUG2 Part 1）', () => {
  it('同名两条 → 按 createdAt 早者保留；memories 去重并入早者', () => {
    const a = makeProfile({ id: 'A', name: '霍尔姆斯', identity: '侦探', memories: ['m1', 'm2'], createdAt: 100, updatedAt: 100 });
    const b = makeProfile({ id: 'B', name: '霍尔姆斯', identity: '后档', memories: ['m2', 'm3'], createdAt: 200, updatedAt: 200 });
    const out = dedupeProfilesByName([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('A');
    expect(out[0].identity).toBe('侦探');
    expect(out[0].memories).toEqual(['m1', 'm2', 'm3']);
    expect(out[0].updatedAt).toBe(200);
  });

  it('非同名（含「先生」后缀）→ 视为不同人，不被合并', () => {
    const a = makeProfile({ id: 'A', name: '霍尔姆斯', createdAt: 100 });
    const b = makeProfile({ id: 'B', name: '霍尔姆斯先生', createdAt: 200 });
    const out = dedupeProfilesByName([a, b]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.name).sort()).toEqual(['霍尔姆斯', '霍尔姆斯先生']);
  });

  it('replaceAll 把老档同名条目合并到早者', () => {
    const a = makeProfile({ id: 'A', name: '管家', identity: '宅邸管家', memories: ['事件1'], createdAt: 100 });
    const b = makeProfile({ id: 'B', name: '管家', identity: '复制条目', memories: ['事件2'], createdAt: 999 });
    useNpcStore.getState().replaceAll([a, b]);
    const all = Object.values(useNpcStore.getState().profiles);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('A');
    expect(all[0].identity).toBe('宅邸管家');
    expect(all[0].memories).toEqual(['事件1', '事件2']);
  });
});

describe('mergeAliases — 显式别名归并（不在 applyUpdates 自动触发）', () => {
  beforeEach(() => useNpcStore.getState().clearAll());

  it('把 src 名 NPC 合到 target 名 NPC：memories 追加并删 src', () => {
    useNpcStore.getState().applyUpdates([
      { name: '霍尔姆斯', addMemory: 'A1' },
      { name: '霍尔姆斯先生', addMemory: 'B1' },
    ]);
    const before = useNpcStore.getState().profiles;
    const after = mergeAliases(before, '霍尔姆斯', '霍尔姆斯先生');
    expect(Object.keys(after)).toHaveLength(1);
    const remain = Object.values(after)[0];
    expect(remain.name).toBe('霍尔姆斯');
    expect(remain.memories).toEqual(['A1', 'B1']);
  });

  it('target 或 src 不存在 → 原样返回', () => {
    useNpcStore.getState().applyUpdates([{ name: 'X' }]);
    const before = useNpcStore.getState().profiles;
    expect(mergeAliases(before, 'X', 'Y')).toBe(before);
    expect(mergeAliases(before, 'Z', 'X')).toBe(before);
  });
});

describe('useNpcStore.joinParty / leaveParty / getParty', () => {
  beforeEach(() => { useNpcStore.getState().clearAll(); });

  it('joinParty 把 inParty 设为 true,不改 isPresent', () => {
    useNpcStore.getState().applyUpdates([{ name: '同行者' }]);
    const id = Object.keys(useNpcStore.getState().profiles)[0];

    useNpcStore.getState().joinParty(id);

    const p = useNpcStore.getState().profiles[id];
    expect(p.inParty).toBe(true);
    expect(p.isPresent).toBe(true);
  });

  it('leaveParty 把 inParty 设为 false', () => {
    useNpcStore.getState().applyUpdates([{ name: '叛逃者' }]);
    const id = Object.keys(useNpcStore.getState().profiles)[0];
    useNpcStore.getState().joinParty(id);
    useNpcStore.getState().leaveParty(id);

    expect(useNpcStore.getState().profiles[id].inParty).toBe(false);
  });

  it('joinParty/leaveParty 对不存在的 id 静默返回,不抛错', () => {
    expect(() => useNpcStore.getState().joinParty('ghost')).not.toThrow();
    expect(() => useNpcStore.getState().leaveParty('ghost')).not.toThrow();
    expect(useNpcStore.getState().profiles).toEqual({});
  });

  it('getParty 只返回 isPresent && inParty', () => {
    useNpcStore.getState().applyUpdates([
      { name: '队友A' },
      { name: '队友B' },
      { name: '在场陌生人' },
      { name: '离场旧友', isPresent: false },
    ]);
    const ids = Object.fromEntries(
      Object.values(useNpcStore.getState().profiles).map(p => [p.name, p.id]),
    );
    useNpcStore.getState().joinParty(ids['队友A']);
    useNpcStore.getState().joinParty(ids['队友B']);
    useNpcStore.getState().joinParty(ids['离场旧友']); // inParty=true 但 isPresent=false → 不算队伍

    const party = useNpcStore.getState().getParty();
    expect(party.map(p => p.name).sort()).toEqual(['队友A', '队友B']);
  });

  it('applyUpdates 拒绝 LLM 写 inParty(防 LLM 抢权)', () => {
    useNpcStore.getState().applyUpdates([{ name: '小队候选' }]);
    const id = Object.keys(useNpcStore.getState().profiles)[0];
    useNpcStore.getState().joinParty(id);

    // 模拟 LLM 试图把同名 NPC 踢出小队
    useNpcStore.getState().applyUpdates([
      { name: '小队候选', isPresent: true, inParty: false } as never,
    ]);

    expect(useNpcStore.getState().profiles[id].inParty).toBe(true);
  });

  it('applyUpdates 不会反向引入 inParty 字段(从未 joinParty 的 NPC 仍 inParty 缺省)', () => {
    useNpcStore.getState().applyUpdates([
      { name: '路人', inParty: true } as never,
    ]);
    const p = Object.values(useNpcStore.getState().profiles)[0];
    expect(p.inParty).toBeFalsy();
  });
});
