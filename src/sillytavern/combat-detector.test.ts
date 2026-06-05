import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldDetectCombat, buildPlayerCombatant, mapInventoryToWeapons, detectAndBuildEncounter, buildCombatantFromNpc, mapNamesToWeapons } from './combat-detector';
import { defaultSheet } from '../stores/useCharSheetStore';
import type { InventoryItem, NpcProfile } from '../types';

function mockChat(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
}
afterEach(() => vi.unstubAllGlobals());

const item = (name: string, category: InventoryItem['category']): InventoryItem => ({
  id: name, name, category, description: '', quantity: 1, isKeyItem: false, acquiredAt: 0,
});

function npc(over: Partial<NpcProfile>): NpcProfile {
  return {
    id: 'n', name: 'X', identity: '', favorability: 0, appearance: '', personality: '',
    innerThoughts: '', memories: [], experience: '', backstory: '', possessions: [],
    isPresent: true, createdAt: 0, updatedAt: 0, ...over,
  };
}

describe('shouldDetectCombat', () => {
  it('含暴力线索→true，平静叙事→false', () => {
    expect(shouldDetectCombat('邪教徒拔枪向你开火')).toBe(true);
    expect(shouldDetectCombat('那条狗扑向调查员')).toBe(true);
    expect(shouldDetectCombat('你在图书馆安静地翻阅古籍')).toBe(false);
  });
});

describe('mapInventoryToWeapons', () => {
  it('按 COC7e 武器表给准确伤害/射程，命中=角色卡治理技能；非武器忽略', () => {
    const ws = mapInventoryToWeapons([item('左轮手枪', 'weapon'), item('猎刀', 'weapon'), item('怀表', 'misc')], defaultSheet);
    expect(ws).toHaveLength(2);
    const gun = ws.find((w) => w.ranged)!;
    expect(gun.damage).toBe('1D10');           // 左轮 → 1D10
    expect(gun.loadedAmmo).toBe(6);
    expect(typeof gun.skill).toBe('number');   // 命中取角色卡 枪械(手枪)
    const knife = ws.find((w) => !w.ranged)!;
    expect(knife.damage).toBe('1D4');          // 猎刀 → 1D4 贯穿
    expect(knife.impaling).toBe(true);
  });
});

describe('buildPlayerCombatant', () => {
  it('从角色卡建玩家 Combatant，徒手恒在', () => {
    const p = buildPlayerCombatant(defaultSheet, [item('左轮手枪', 'weapon')]);
    expect(p.faction).toBe('player');
    expect(p.controlledBy).toBe('player');
    expect(p.dex).toBe(defaultSheet.characteristics.DEX);
    expect(p.weapons[0].name).toBe('徒手');
    expect(p.weapons.some((w) => w.ranged)).toBe(true);
  });
});

describe('mapNamesToWeapons', () => {
  it('仅识别武器表内的随身物品，命中取解析器；非武器忽略', () => {
    const ws = mapNamesToWeapons(['左轮手枪', '猎刀', '怀表'], (_keys, fb) => fb);
    expect(ws).toHaveLength(2);
    expect(ws.find((w) => w.ranged)!.damage).toBe('1D10');
    const knife = ws.find((w) => !w.ranged)!;
    expect(knife.damage).toBe('1D4');
    expect(knife.impaling).toBe(true);
  });
  it('解析器命中→武器 skill 用 NPC 技能值', () => {
    const ws = mapNamesToWeapons(['左轮手枪'], (keys) => (keys.includes('射击(手枪)') ? 65 : 20));
    expect(ws[0].skill).toBe(65);
  });
});

describe('buildCombatantFromNpc', () => {
  it('据 NPC 建敌方 Combatant：徒手恒在 + 解析衍生/技能/武器', () => {
    const c = buildCombatantFromNpc(npc({
      id: 'cult', name: '邪教徒',
      characteristics: { STR: 60, SIZ: 60, CON: 60, DEX: 55, POW: 50 },
      derived: 'HP 12 / DB +1D4', skills: { '格斗(斗殴)': 55, '闪避': 30 },
      possessions: ['匕首', '怀表'], favorability: -50,
    }));
    expect(c.faction).toBe('enemy');
    expect(c.controlledBy).toBe('ai');
    expect(c.name).toBe('邪教徒');
    expect(c.hp).toBe(12);
    expect(c.fighting).toBe(55);
    expect(c.dodge).toBe(30);
    expect(c.weapons[0].name).toBe('徒手');
    expect(c.weapons.some((w) => w.name === '匕首')).toBe(true);
    expect(c.weapons.some((w) => w.name === '怀表')).toBe(false); // 非武器不计
  });

  it('数据稀疏 → 安全兜底(默认属性/fighting40/dodge25/仅徒手)', () => {
    const c = buildCombatantFromNpc(npc({}));
    expect(c.str).toBe(50);
    expect(c.fighting).toBe(40);
    expect(c.dodge).toBe(25);
    expect(c.hp).toBeGreaterThan(0);
    expect(c.weapons).toHaveLength(1);
    expect(c.weapons[0].name).toBe('徒手');
  });

  it('好感度<=-30 → 好斗倾向；否则中性', () => {
    expect(buildCombatantFromNpc(npc({ favorability: -40 })).tendency).toEqual({ attack: 85, flee: 10 });
    expect(buildCombatantFromNpc(npc({ favorability: 10 })).tendency).toEqual({ attack: 60, flee: 30 });
  });

  it('derived 文本含「HP 0」畸形数据 → 回退推算，maxHp 不为 0（防血条 NaN）', () => {
    const c = buildCombatantFromNpc(npc({ characteristics: { CON: 60, SIZ: 60 }, derived: 'HP 0' }));
    expect(c.hp).toBeGreaterThan(0);
    expect(c.maxHp).toBeGreaterThan(0);
  });
});

describe('detectAndBuildEncounter', () => {
  it('inCombat:true + 敌人 → 建 Encounter(玩家+敌人,turnOrder,playerTarget)', async () => {
    const payload = JSON.stringify({
      inCombat: true,
      combatants: [{ name: '邪教徒', faction: 'enemy', dex: 55, con: 55, fighting: 45, dodge: 27, hp: 11, mov: 8, weapons: [{ name: '匕首', damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 }], tendency: { attack: 80, flee: 15 } }],
      bystanders: [],
    });
    vi.stubGlobal('fetch', vi.fn(async () => mockChat(payload)));
    const enc = await detectAndBuildEncounter('邪教徒拔刀扑向你', defaultSheet, [], 'http://x', 'k', 'm');
    expect(enc).not.toBeNull();
    expect(enc!.combatants.some((c) => c.faction === 'player')).toBe(true);
    expect(enc!.combatants.some((c) => c.faction === 'enemy' && c.name === '邪教徒')).toBe(true);
    expect(enc!.turnOrder.length).toBe(2);
    expect(enc!.playerTargetId).toContain('enemy');
  });

  it('inCombat:false → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChat('{"inCombat": false}')));
    expect(await detectAndBuildEncounter('平静的午后', defaultSheet, [], 'http://x', 'k', 'm')).toBeNull();
  });

  it('inCombat:true 但无敌人 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockChat('{"inCombat": true, "combatants": []}')));
    expect(await detectAndBuildEncounter('对峙', defaultSheet, [], 'http://x', 'k', 'm', undefined, 0.6, 20000, 1)).toBeNull();
  });
});
