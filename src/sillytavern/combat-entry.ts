import type { Encounter, Combatant, NpcProfile } from '../types';
import { detectAndBuildEncounter, buildPlayerCombatant, buildCombatantFromNpc } from './combat-detector';
import { nextTurnOrder, successLevel } from './combat-engine';
import { playerAttack, type OpeningPreset } from './combat-controller';
import { useCombatStore } from '../stores/useCombatStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useBookStore } from '../stores/useBookStore';
import { useChatStore } from '../stores/useChatStore';
import { useStatusToastStore } from '../stores/useStatusToastStore';
import { saveConversation } from '../stores/sessionLifecycle';

/** 选项里那次对抗掷骰（复用作进面板的开场判定）。 */
export interface OpposedSeed {
  playerRoll: number; playerTarget: number;
  oppRoll: number; oppTarget: number;
  outcome: 'win' | 'lose' | 'draw';
}

export interface EnterCombatOpts {
  /** 喂 LLM 建场的场景上下文（最近叙事 + 触发动作 + 在场 NPC 等）。 */
  contextText: string;
  /** 触发本场战斗的选项/动作文本——并入脱战生成正文的输入。 */
  opener?: string;
  /** 战斗所属页 id（缺省取当前最新页）。 */
  anchorPageId?: string;
  /** 战斗类对抗选项那次掷骰，复用作开场。 */
  opposed?: OpposedSeed;
  /** NPC 互动攻击的目标（LLM 失败时本地建场用）。 */
  npcTarget?: NpcProfile;
}

const NO_FLAGS = { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false };
let entering = false; // 防并发双触发(LLM 建场期间重复点选项)

function mkRoll(n: number) { return { tens: [Math.floor(n / 10) * 10], ones: n % 10, finalRoll: n }; }

/** 据选项那次对抗结果构造开场预设（对手以格斗对抗→视为反击：玩家胜则伤敌，败则被反击致伤）。 */
function buildPreset(o: OpposedSeed): OpeningPreset {
  const winner: OpposedResultWinner = o.outcome === 'win' ? 'attacker' : o.outcome === 'lose' ? 'defender' : 'none';
  return {
    op: {
      winner,
      attackerRoll: mkRoll(o.playerRoll), attackerLevel: successLevel(o.playerRoll, o.playerTarget),
      defenderRoll: mkRoll(o.oppRoll), defenderLevel: successLevel(o.oppRoll, o.oppTarget),
    },
    defenderValue: o.oppTarget,
    defense: 'fightback',
  };
}
type OpposedResultWinner = OpeningPreset['op']['winner'];

/** LLM 不可用/失败时的本地兜底建场：玩家 + 单个对手（NPC 或据对抗目标值造）。 */
function buildLocalEncounter(opts: EnterCombatOpts): Encounter {
  const sheet = useCharSheetStore.getState().sheet;
  const inventory = useInventoryStore.getState().items;
  const player = buildPlayerCombatant(sheet, inventory);
  let enemy: Combatant;
  if (opts.npcTarget) {
    enemy = buildCombatantFromNpc(opts.npcTarget);
  } else {
    const ft = opts.opposed?.oppTarget ?? 45;
    enemy = {
      id: 'enemy-0-对手', name: '对手', faction: 'enemy', controlledBy: 'ai',
      dex: 50, str: 50, siz: 50, con: 50, mov: 8,
      fighting: ft, dodge: Math.floor(ft / 2), damageBonus: '0',
      hp: 12, maxHp: 12, armor: 0,
      weapons: [{ name: '徒手', skill: ft, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
      flags: { ...NO_FLAGS }, tendency: { attack: 70, flee: 20 }, roundDefenses: 0,
    };
  }
  const combatants = [player, enemy];
  return {
    active: true, round: 1, turnOrder: nextTurnOrder(combatants), currentIdx: 0,
    combatants, bystanders: [], playerTargetId: enemy.id,
    log: [{ kind: 'narrative', text: opts.opener || '战斗爆发！' }],
    diceRecords: [], status: 'active',
  };
}

/**
 * 统一战斗入口：优先 LLM 建场（算对手倾向 + 在场其他 NPC 是否参战/旁观），失败回退本地 1v1。
 * 锚定战斗所属页、记录触发文本(opener)；带 opposed 时复用选项那次掷骰跑一次开场攻击。
 */
export async function enterCombat(opts: EnterCombatOpts): Promise<void> {
  if (entering || useCombatStore.getState().encounter) return; // 防并发双触发 / 已在战斗中
  entering = true;
  const toast = useStatusToastStore.getState();
  toast.showProcessing('正在进入战斗…');
  const aidStart = useChatStore.getState().activeId;
  try {
    const s = useSettingsStore.getState();
    const useMvu = !!(s.mvuUseIndependentApi && s.mvuApiKey?.trim());
    const base = (useMvu ? s.mvuApiBaseUrl : s.apiBaseUrl) ?? '';
    const key = (useMvu ? s.mvuApiKey : s.apiKey) ?? '';
    const model = (useMvu ? s.mvuApiModel : s.apiModel) ?? '';

    let enc: Encounter | null = null;
    if (base.trim() && key.trim() && model.trim()) {
      try {
        enc = await detectAndBuildEncounter(opts.contextText, useCharSheetStore.getState().sheet, useInventoryStore.getState().items, base, key, model);
      } catch { enc = null; }
    }
    // 切换会话则放弃
    if (useChatStore.getState().activeId !== aidStart || useCombatStore.getState().encounter) { toast.hide(); return; }
    if (!enc) enc = buildLocalEncounter(opts); // LLM 未判进战/失败 → 本地兜底

    const pages = useBookStore.getState().pages;
    enc.anchorPageId = opts.anchorPageId ?? pages[pages.length - 1]?.id;
    if (opts.opener) { enc.opener = opts.opener; enc.log = [{ kind: 'narrative', text: opts.opener }, ...enc.log.filter((l) => l.text !== '战斗爆发！')]; }
    if (!enc.playerTargetId) enc.playerTargetId = enc.combatants.find((c) => c.faction === 'enemy')?.id ?? null;

    // 战斗类对抗选项：复用那次掷骰跑开场攻击（徒手/格斗，weaponIdx 0）
    if (opts.opposed && enc.playerTargetId) {
      enc = playerAttack(enc, 0, Math.random, buildPreset(opts.opposed));
    }

    useCombatStore.getState().start(enc);
    const aid = useChatStore.getState().activeId;
    if (aid) void saveConversation(aid);
    toast.markDone('战斗开始');
  } finally {
    entering = false;
  }
}
