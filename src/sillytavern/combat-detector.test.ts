import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldDetectCombat, buildPlayerCombatant, mapInventoryToWeapons, detectAndBuildEncounter } from './combat-detector';
import { defaultSheet } from '../stores/useCharSheetStore';
import type { InventoryItem } from '../types';

function mockChat(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: {} }) };
}
afterEach(() => vi.unstubAllGlobals());

const item = (name: string, category: InventoryItem['category']): InventoryItem => ({
  id: name, name, category, description: '', quantity: 1, isKeyItem: false, acquiredAt: 0,
});

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
