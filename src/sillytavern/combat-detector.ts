import { callDsSubagent } from './subagent-call';
import { nextTurnOrder, buildAndDamageBonus } from './combat-engine';
import { matchWeaponTemplate } from './coc-weapons';
import { parseNpcDerived } from './npc-derived';
import type { TokenUsage } from './stream-parser';
import type {
  CharacterSheet, InventoryItem, Combatant, CombatWeapon, CombatBystander, Encounter, CombatFaction, NpcProfile,
} from '../types';

// —— 护甲自动检测：据背包物品名匹配 COC7e 常见护甲，取最高值 ——
const ARMOR_TABLE: { test: RegExp; armor: number }[] = [
  { test: /防弹衣|防弹背心/, armor: 8 },
  { test: /铠甲|板甲|重甲/, armor: 7 },
  { test: /锁子甲|链甲/, armor: 5 },
  { test: /皮甲|厚皮甲/, armor: 3 },
  { test: /头盔|钢盔/, armor: 2 },
  { test: /厚衣|厚外套|棉甲/, armor: 1 },
];

function detectArmorFromInventory(items: InventoryItem[]): number {
  let maxArmor = 0;
  for (const item of items) {
    for (const tmpl of ARMOR_TABLE) {
      if (tmpl.test.test(item.name)) {
        maxArmor = Math.max(maxArmor, tmpl.armor);
        break;
      }
    }
  }
  return maxArmor;
}

/** 触发战斗检测的廉价启发式：叙事含暴力/冲突线索才值得调 LLM（省 token，宁漏检不误检）。 */
const COMBAT_CUES = [
  '攻击', '袭击', '扑', '扑向', '冲向', '挥', '拔枪', '开枪', '射击', '扣动扳机', '开火',
  '咬', '撕咬', '抓住', '掐', '拳', '踢', '刺', '砍', '搏斗', '厮打', '交手', '反抗',
  '怒吼着冲', '亮出', '举起武器', '战斗', '动手', '杀', '血光', '挣扎',
];
export function shouldDetectCombat(narrative: string): boolean {
  if (!narrative) return false;
  return COMBAT_CUES.some((c) => narrative.includes(c));
}

/** 取技能值：优先精确键，再裸名兜底，最后默认值。 */
function skill(sheet: CharacterSheet, keys: string[], fallback: number): number {
  for (const k of keys) {
    const s = sheet.skills[k];
    if (s && typeof s.current === 'number') return s.current;
  }
  return fallback;
}

/** 把随身物品里的武器映射成 CombatWeapon：先按 COC7e 武器表(matchWeaponTemplate)取准确伤害+治理技能(命中按角色卡该技能值)，无匹配再回落粗略启发式。 */
export function mapInventoryToWeapons(items: InventoryItem[], sheet: CharacterSheet): CombatWeapon[] {
  const out: CombatWeapon[] = [];
  for (const it of items) {
    if (it.category !== 'weapon') continue;
    const tpl = matchWeaponTemplate(it.name);
    if (tpl) {
      out.push({
        name: it.name,
        skill: skill(sheet, tpl.skillKeys, tpl.ranged ? 20 : 25),
        damage: tpl.damage,
        impaling: tpl.impaling,
        crushing: tpl.crushing,
        ranged: tpl.ranged,
        baseRange: tpl.baseRange,
        attacksPerRound: tpl.attacksPerRound,
        loadedAmmo: tpl.ranged ? tpl.magazine : undefined,
        magazine: tpl.ranged ? tpl.magazine : undefined,
        ammoItemName: tpl.ranged ? '子弹' : undefined,
      });
      continue;
    }
    // 无表匹配：粗略启发式兜底。
    const isGun = /枪|铳/.test(it.name);
    if (isGun) {
      out.push({ name: it.name, skill: skill(sheet, ['射击(手枪)'], 20), damage: '1D8', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 1, loadedAmmo: 6, magazine: 6, ammoItemName: '子弹' });
    } else {
      out.push({ name: it.name, skill: skill(sheet, ['格斗(斗殴)'], 25), damage: '1D6', impaling: false, ranged: false, attacksPerRound: 1 });
    }
  }
  return out;
}

/** 据角色卡 + 随身物品构建玩家 Combatant（玩家操控；徒手恒可用 + 映射的武器）。 */
export function buildPlayerCombatant(sheet: CharacterSheet, items: InventoryItem[]): Combatant {
  const c = sheet.characteristics;
  const fighting = skill(sheet, ['格斗(斗殴)'], 25);
  const dodge = skill(sheet, ['闪避'], Math.floor(c.DEX / 2));
  const firearm = skill(sheet, ['射击(手枪)'], 20);
  const firstAid = skill(sheet, ['急救'], 30);
  const unarmed: CombatWeapon = { name: '徒手', skill: fighting, damage: '1D3', impaling: false, crushing: true, ranged: false, attacksPerRound: 1 };
  return {
    id: 'player',
    name: sheet.identity?.name || '调查员',
    faction: 'player',
    controlledBy: 'player',
    dex: c.DEX, str: c.STR, siz: c.SIZ, con: c.CON, mov: sheet.secondary.mov,
    fighting, dodge, firearm, firstAid,
    damageBonus: sheet.secondary.db || '0',
    hp: sheet.secondary.hp.current, maxHp: sheet.secondary.hp.max,
    armor: detectArmorFromInventory(items),
    weapons: [unarmed, ...mapInventoryToWeapons(items, sheet)],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    roundDefenses: 0,
  };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v.trim() : d);

/** 把 NPC 随身物品名（string[]）映射成 CombatWeapon：仅纳入 COC7e 武器表能识别的（非武器忽略），命中由 resolveSkill 从 NPC 技能取。 */
export function mapNamesToWeapons(names: string[], resolveSkill: (keys: string[], fallback: number) => number): CombatWeapon[] {
  const out: CombatWeapon[] = [];
  for (const name of names) {
    const tpl = matchWeaponTemplate(name);
    if (!tpl) continue; // possessions 含大量非武器，仅识别武器表内条目
    out.push({
      name,
      skill: resolveSkill(tpl.skillKeys, tpl.ranged ? 20 : 25),
      damage: tpl.damage,
      impaling: tpl.impaling,
      crushing: tpl.crushing,
      ranged: tpl.ranged,
      baseRange: tpl.baseRange,
      attacksPerRound: tpl.attacksPerRound,
      loadedAmmo: tpl.ranged ? tpl.magazine : undefined,
      magazine: tpl.ranged ? tpl.magazine : undefined,
      ammoItemName: tpl.ranged ? '子弹' : undefined,
    });
  }
  return out;
}

const FIREARM_KEYS = ['射击(手枪)', '射击(步枪)', '射击(霰弹枪)'];

/**
 * 据名册 NPC 构建【敌方】Combatant（玩家主动攻击/战技时建场用，AI 操控）。
 * 属性缺 50，技能按别名兜底（fighting 40 / dodge 25），HP/DB/MOV 走 parseNpcDerived（解析不到再推算），
 * 武器由 possessions 经武器表映射 + 恒在的徒手。倾向据 favorability：≤-30 好斗，否则中性。
 */
export function buildCombatantFromNpc(npc: NpcProfile, faction: CombatFaction = 'enemy'): Combatant {
  const ch = npc.characteristics ?? {};
  const derived = parseNpcDerived(npc);
  const resolve = (keys: string[], fallback: number): number => {
    for (const k of keys) {
      const v = npc.skills?.[k];
      if (typeof v === 'number') return v;
    }
    return fallback;
  };
  const STR = num(ch.STR, 50), SIZ = num(ch.SIZ, 50), CON = num(ch.CON, 50), DEX = num(ch.DEX, 50);
  const fighting = resolve(['格斗(斗殴)'], 40);
  const dodge = resolve(['闪避'], 25);
  const firearm = FIREARM_KEYS.some((k) => typeof npc.skills?.[k] === 'number') ? resolve(FIREARM_KEYS, 40) : undefined;
  const hp = derived.hp && derived.hp > 0 ? derived.hp : Math.max(1, Math.floor((CON + SIZ) / 10));
  const db = derived.db ?? buildAndDamageBonus(STR, SIZ).db;
  const unarmed: CombatWeapon = { name: '徒手', skill: fighting, damage: '1D3', impaling: false, crushing: true, ranged: false, attacksPerRound: 1 };
  const aggressive = npc.favorability <= -30;
  // ally 队友倾向稳定输出(不会乱跑);enemy 看 favorability
  const tendency = faction === 'ally'
    ? { attack: 75, flee: 15 }
    : (aggressive ? { attack: 85, flee: 10 } : { attack: 60, flee: 30 });
  const idPrefix = faction === 'ally' ? 'ally' : 'npc';
  const firstAid = resolve(['急救', '医学', '草药学'], 30);
  return {
    id: `${idPrefix}-${npc.id}`,
    name: npc.name || (faction === 'ally' ? '同伴' : 'NPC'),
    faction,
    controlledBy: 'ai',
    dex: DEX, str: STR, siz: SIZ, con: CON, mov: derived.mov ?? 8,
    fighting, dodge, firearm, firstAid,
    damageBonus: db,
    hp, maxHp: hp,
    armor: 0,
    weapons: [unarmed, ...mapNamesToWeapons(npc.possessions ?? [], resolve)],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    tendency,
    roundDefenses: 0,
  };
}

function normalizeWeapon(raw: Record<string, unknown>, defaultSkill: number): CombatWeapon {
  const ranged = raw.ranged === true;
  return {
    name: str(raw.name, ranged ? '枪械' : '利爪'),
    skill: num(raw.skill, defaultSkill),
    damage: str(raw.damage, '1D6'),
    impaling: raw.impaling === true || ranged,
    crushing: raw.crushing === true,
    ranged,
    baseRange: typeof raw.baseRange === 'number' ? raw.baseRange : undefined,
    attacksPerRound: Math.max(1, num(raw.attacksPerRound, 1)),
    loadedAmmo: ranged ? num(raw.loadedAmmo, num(raw.magazine, 6)) : undefined,
    magazine: ranged ? num(raw.magazine, 6) : undefined,
    reserveAmmo: ranged ? num(raw.reserveAmmo, 0) : undefined,
  };
}

function normalizeCombatant(raw: Record<string, unknown>, faction: CombatFaction, idx: number): Combatant {
  const fighting = num(raw.fighting, 40);
  const firearm = typeof raw.firearm === 'number' ? raw.firearm : undefined;
  const weaponsRaw = Array.isArray(raw.weapons) ? (raw.weapons as Record<string, unknown>[]) : [];
  const weapons = weaponsRaw.map((w) => normalizeWeapon(w, w.ranged === true ? (firearm ?? 40) : fighting));
  if (weapons.length === 0) weapons.push({ name: '利爪', skill: fighting, damage: '1D6', impaling: false, ranged: false, attacksPerRound: 1 });
  const maxHp = num(raw.hp, 10);
  return {
    id: `${faction}-${idx}-${str(raw.name, 'X')}`,
    name: str(raw.name, faction === 'enemy' ? '敌人' : '同伴'),
    faction,
    controlledBy: 'ai',
    dex: num(raw.dex, 50), str: num(raw.str, 50), siz: num(raw.siz, 50), con: num(raw.con, 50),
    mov: num(raw.mov, 8),
    fighting, dodge: num(raw.dodge, 25), firearm,
    damageBonus: str(raw.db, '0'),
    hp: maxHp, maxHp,
    armor: num(raw.armor, 0),
    weapons,
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    tendency: { attack: num((raw.tendency as Record<string, unknown> | undefined)?.attack, 70), flee: num((raw.tendency as Record<string, unknown> | undefined)?.flee, 20) },
    roundDefenses: 0,
  };
}

function normalizeBystander(raw: Record<string, unknown>, idx: number): CombatBystander {
  const combatantRaw = (raw.combatant ?? raw) as Record<string, unknown>;
  return {
    id: `bystander-${idx}`,
    name: str(raw.name, '旁观者'),
    friendly: raw.friendly === true,
    joinChance: Math.max(0, Math.min(100, num(raw.joinChance, 50))),
    combatant: normalizeCombatant(combatantRaw, 'ally', idx),
  };
}

const DETECT_PROMPT = `你是 COC7e 跑团守秘人的战斗裁判。下面给出本回合叙事与调查员信息。判断本回合是否【进入了需要逐回合结算的战斗】（有人对调查员或其同伴动手/调查员动手/双方拔枪相向等）。

若进入战斗，列出所有【已参战】的敌方与在场友方 NPC（不含调查员本人，调查员由系统单独构建）；并列出【在场但尚未参战、可被调查员呼救拉入】的旁观者。每个参战者给 statblock：dex,con,fighting(格斗),dodge(闪避),firearm(射击,可省),hp,armor,build,db(如 "1D4"/"0"/"-1"),mov,weapons[{name,damage,impaling,ranged,attacksPerRound,baseRange?,magazine?,loadedAmmo?,reserveAmmo?}],tendency{attack:1-100,flee:1-100}(攻击/逃跑倾向阈值)。旁观者另给 friendly(bool) 与 joinChance(1-100，呼救时 d100≤此值则加入)。

另外根据叙事场景判断交战距离 rangeTier："close"=室内狭小空间/贴身肉搏、"normal"=室内一般房间、"far"=室外/大厅/远距离、"extreme"=旷野/跨越大片区域。缺省为"normal"。

若叙事中一方对另一方进行了埋伏/偷袭/突然袭击，则设 "surpriseRound": true，"surprisedFaction" 设为被突袭的阵营（"player"=调查员一方被突袭，"enemy"=敌方被突袭）。突袭轮中被突袭方不能行动。若无突袭则不输出这两个字段。

只输出严格 JSON，不要任何额外文字或代码围栏：
{
  "inCombat": true,
  "rangeTier": "normal",
  "surpriseRound": false,
  "surprisedFaction": null,
  "combatants": [
    {"name":"邪教徒","faction":"enemy","dex":55,"con":55,"fighting":45,"dodge":27,"hp":11,"armor":0,"mov":8,"db":"0","weapons":[{"name":"匕首","damage":"1D4","impaling":true,"ranged":false,"attacksPerRound":1}],"tendency":{"attack":80,"flee":15}}
  ],
  "bystanders": [
    {"name":"巡夜警员","friendly":true,"joinChance":60,"combatant":{"dex":60,"con":60,"fighting":50,"dodge":30,"firearm":50,"hp":12,"armor":0,"mov":8,"db":"0","weapons":[{"name":"警用左轮","damage":"1D10","impaling":true,"ranged":true,"magazine":6,"loadedAmmo":6}],"tendency":{"attack":70,"flee":20}}]
}
若【未进入战斗】，只输出：{"inCombat": false}`;

export interface DetectResult { encounter: Encounter | null; raw?: unknown; }

/** 独立 LLM 调用：检测是否进战并建场（敌/友/旁观者）。优先 MVU 独立 API 由调用方择 base/key/model。 */
export async function detectAndBuildEncounter(
  narrative: string,
  sheet: CharacterSheet,
  inventory: InventoryItem[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.6,
  maxTokens = 20000,
  retries = 2,
): Promise<(Encounter & { usage?: TokenUsage }) | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) return null;
    const { parsed, usage } = await callDsSubagent({
      apiBaseUrl, apiKey, model, signal, temperature, maxTokens, rpmLane: 'mvu',
      label: '战斗检测',
      messages: [
        { role: 'system', content: DETECT_PROMPT },
        { role: 'user', content: `调查员：${sheet.identity?.name || '无名'}（${sheet.identity?.occupation || '职业不详'}）\n本回合叙事：\n${narrative}` },
      ],
    });
    const p = parsed;
    if (!p) continue; // 解析失败 → 重试
    if (p.inCombat !== true) return null; // 明确未进战
    const rawCombatants = Array.isArray(p.combatants) ? (p.combatants as Record<string, unknown>[]) : [];
    const enemies = rawCombatants.filter((c) => c.faction !== 'ally').map((c, i) => normalizeCombatant(c, 'enemy', i));
    const allies = rawCombatants.filter((c) => c.faction === 'ally').map((c, i) => normalizeCombatant(c, 'ally', i));
    if (enemies.length === 0) return null; // 进战必须至少一个敌人
    const player = buildPlayerCombatant(sheet, inventory);
    const bystanders = (Array.isArray(p.bystanders) ? (p.bystanders as Record<string, unknown>[]) : []).map(normalizeBystander);
    const combatants = [player, ...allies, ...enemies];
    const VALID_RANGE_TIERS = ['close', 'normal', 'far', 'extreme'] as const;
    const rangeTier = VALID_RANGE_TIERS.includes(p.rangeTier as typeof VALID_RANGE_TIERS[number]) ? (p.rangeTier as typeof VALID_RANGE_TIERS[number]) : 'normal';
    const surpriseRound = p.surpriseRound === true;
    const VALID_FACTIONS = ['player', 'enemy'] as const;
    const surprisedFaction = surpriseRound && VALID_FACTIONS.includes(p.surprisedFaction as typeof VALID_FACTIONS[number])
      ? (p.surprisedFaction as 'player' | 'enemy') : undefined;
    return {
      active: true,
      round: 1,
      turnOrder: nextTurnOrder(combatants),
      currentIdx: 0,
      combatants,
      bystanders,
      playerTargetId: enemies[0].id,
      log: [{ kind: 'narrative', text: surpriseRound ? (surprisedFaction === 'player' ? '突袭！敌方先发制人！' : '突袭！你率先出手！') : '战斗爆发！' }],
      diceRecords: [],
      status: 'active',
      rangeTier,
      ...(surpriseRound && surprisedFaction ? { surpriseRound, surprisedFaction } : {}),
      usage,
    };
  }
  return null;
}
