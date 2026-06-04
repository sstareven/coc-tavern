import { create } from 'zustand';
import type { CharacterSheet, COC7Characteristic } from '../types';

/** COC7e 8 项基础属性的英文键白名单——用于过滤老存档里残留的中文键。 */
const COC7_CHARS: readonly COC7Characteristic[] = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];

export const defaultSheet: CharacterSheet = {
  characteristics: { STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0 },
  halfFifth: {
    STR: { half: 0, fifth: 0 }, CON: { half: 0, fifth: 0 }, POW: { half: 0, fifth: 0 },
    DEX: { half: 0, fifth: 0 }, APP: { half: 0, fifth: 0 }, SIZ: { half: 0, fifth: 0 },
    INT: { half: 0, fifth: 0 }, EDU: { half: 0, fifth: 0 },
  },
  secondary: { hp: { current: 0, max: 0 }, san: { current: 0, max: 0 }, mp: { current: 0, max: 0 }, luck: 0, mov: 0, db: '0', build: 0 },
  skills: {},
  identity: { name: '', occupation: '', age: 0, gender: '', birthplace: '', residence: '', id: '' },
  greeting: '',
  description: '',
  personality: '',
  scenario: '',
  personaDescription: '',
  posture: '站立',
  statusConditions: [],
  dailySanLoss: 0,
  temporaryInsanity: { active: false, roundsLeft: 0 },
  indefiniteInsanity: { active: false },
  permanentInsanity: { active: false },
  phobias: [],
  manias: [],
  known_spells: [],
  recovery: { hp: 0, san: 0 },
};

/**
 * 把任意来源（老存档行 / 旧版本默认 sheet / undefined）升级为最新 CharacterSheet。
 *
 * 唯一升级口：所有从 DB / per-conversation 行加载角色卡的地方都应经此通道，
 * 而非自行 `?? defaultSheet`。后续 A2/A3/B1/C2/M2/M3 新增字段只在此一处补默认。
 *
 * 关键防御点：
 * 1. characteristics 走 COC7_CHARS 白名单——老存档可能把属性以中文键存（「力量: 50」），
 *    直接展开会污染 Record<COC7Characteristic, number> 的类型契约。
 * 2. halfFifth / secondary 走 per-key 深合并——浅展开会让缺省子对象保持 undefined，
 *    后续读 secondary.san.max 时直接崩。
 * 3. phobias/manias/known_spells 始终是数组——老存档里 CharacterCreator 把 phobias 当字符串状态用，
 *    若误持久化进角色卡需丢弃。
 * 4. temporaryInsanity.bout 是结构化对象（mode/table/entry），不接受裸字符串。
 */
export function migrateSheet(raw: Partial<CharacterSheet> | undefined | null): CharacterSheet {
  const r = (raw ?? {}) as Partial<CharacterSheet>;

  // ── characteristics：英文键白名单过滤 ──
  const rawChars = (r.characteristics ?? {}) as Record<string, unknown>;
  const characteristics = {
    STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0,
  } as Record<COC7Characteristic, number>;
  for (const k of COC7_CHARS) {
    const v = rawChars[k];
    if (typeof v === 'number' && Number.isFinite(v)) characteristics[k] = v;
  }

  // ── halfFifth：per-key 深合并 ──
  const halfFifthDefault: Record<COC7Characteristic, { half: number; fifth: number }> = {
    STR: { half: 0, fifth: 0 }, CON: { half: 0, fifth: 0 }, POW: { half: 0, fifth: 0 },
    DEX: { half: 0, fifth: 0 }, APP: { half: 0, fifth: 0 }, SIZ: { half: 0, fifth: 0 },
    INT: { half: 0, fifth: 0 }, EDU: { half: 0, fifth: 0 },
  };
  const rawHF = (r.halfFifth ?? {}) as Partial<typeof halfFifthDefault>;
  const halfFifth = { ...halfFifthDefault };
  for (const k of COC7_CHARS) {
    const v = rawHF[k];
    if (v && typeof v === 'object') {
      halfFifth[k] = {
        half: typeof v.half === 'number' ? v.half : 0,
        fifth: typeof v.fifth === 'number' ? v.fifth : 0,
      };
    }
  }

  // ── secondary：per-stat 深合并 ──
  const rawSec = (r.secondary ?? {}) as Partial<CharacterSheet['secondary']>;
  const secondary: CharacterSheet['secondary'] = {
    hp: { current: rawSec.hp?.current ?? 0, max: rawSec.hp?.max ?? 0 },
    san: { current: rawSec.san?.current ?? 0, max: rawSec.san?.max ?? 0 },
    mp: { current: rawSec.mp?.current ?? 0, max: rawSec.mp?.max ?? 0 },
    luck: typeof rawSec.luck === 'number' ? rawSec.luck : 0,
    mov: typeof rawSec.mov === 'number' ? rawSec.mov : 0,
    db: typeof rawSec.db === 'string' ? rawSec.db : '0',
    build: typeof rawSec.build === 'number' ? rawSec.build : 0,
  };

  // ── identity：浅合并 + per-field fallback ──
  const rawId = (r.identity ?? {}) as Partial<CharacterSheet['identity']>;
  const identity: CharacterSheet['identity'] = {
    name: rawId.name ?? '',
    occupation: rawId.occupation ?? '',
    age: typeof rawId.age === 'number' ? rawId.age : 0,
    gender: rawId.gender ?? '',
    birthplace: rawId.birthplace ?? '',
    residence: rawId.residence ?? '',
    id: rawId.id ?? '',
  };

  // ── temporaryInsanity：bout 强制结构化对象 ──
  const rawTI = (r.temporaryInsanity ?? {}) as Partial<CharacterSheet['temporaryInsanity']>;
  const tiBoutRaw = rawTI.bout as unknown;
  const temporaryInsanity: CharacterSheet['temporaryInsanity'] = {
    active: rawTI.active === true,
    roundsLeft: typeof rawTI.roundsLeft === 'number' ? rawTI.roundsLeft : 0,
  };
  if (tiBoutRaw && typeof tiBoutRaw === 'object') {
    const bo = tiBoutRaw as Record<string, unknown>;
    const mode = bo.mode === 'realtime' || bo.mode === 'summary' ? bo.mode : undefined;
    const table = bo.table === 'VII' || bo.table === 'VIII' ? bo.table : undefined;
    const entry = typeof bo.entry === 'string' ? bo.entry : undefined;
    if (mode && table && entry !== undefined) {
      temporaryInsanity.bout = { mode, table, entry };
    }
  }

  const rawII = (r.indefiniteInsanity ?? {}) as Partial<CharacterSheet['indefiniteInsanity']>;
  const indefiniteInsanity: CharacterSheet['indefiniteInsanity'] = { active: rawII.active === true };
  if (typeof rawII.cause === 'string') indefiniteInsanity.cause = rawII.cause;
  if (typeof rawII.triggeredAt === 'number') indefiniteInsanity.triggeredAt = rawII.triggeredAt;

  const rawPI = (r.permanentInsanity ?? {}) as Partial<CharacterSheet['permanentInsanity']>;
  const permanentInsanity: CharacterSheet['permanentInsanity'] = { active: rawPI.active === true };
  if (typeof rawPI.triggeredAt === 'number') permanentInsanity.triggeredAt = rawPI.triggeredAt;

  // ── phobias / manias / known_spells：必须为 string[]，老存档可能误存字符串 ──
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const rawRec = (r.recovery ?? {}) as Partial<CharacterSheet['recovery']>;
  const recovery: CharacterSheet['recovery'] = {
    hp: typeof rawRec.hp === 'number' ? rawRec.hp : 0,
    san: typeof rawRec.san === 'number' ? rawRec.san : 0,
  };

  return {
    characteristics,
    halfFifth,
    secondary,
    skills: r.skills ?? {},
    identity,
    greeting: r.greeting ?? '',
    description: r.description ?? '',
    personality: r.personality ?? '',
    scenario: r.scenario ?? '',
    personaDescription: r.personaDescription ?? '',
    posture: typeof r.posture === 'string' && r.posture ? r.posture : '站立',
    statusConditions: Array.isArray(r.statusConditions) ? r.statusConditions : [],
    dailySanLoss: typeof r.dailySanLoss === 'number' ? r.dailySanLoss : 0,
    temporaryInsanity,
    indefiniteInsanity,
    permanentInsanity,
    phobias: asStringArray(r.phobias),
    manias: asStringArray(r.manias),
    known_spells: asStringArray(r.known_spells),
    recovery,
  };
}

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  setSheet: (sheet: CharacterSheet) => void;
  reset: () => void;
}

/**
 * 是否为「默认/空白」角色卡（用廉价标记判定，非深比较）：
 * 名字为空 + STR/CON 为 0 + 无任何技能。用于跳过持久化空卡。
 */
export function isDefaultSheet(sheet: CharacterSheet): boolean {
  return (
    sheet.identity.name === '' &&
    sheet.characteristics.STR === 0 &&
    sheet.characteristics.CON === 0 &&
    Object.keys(sheet.skills).length === 0
  );
}

export const useCharSheetStore = create<CharSheetStore>()((set) => ({
  sheet: defaultSheet,
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  setSheet: (sheet: CharacterSheet) => set({ sheet }),
  reset: () => set({ sheet: defaultSheet }),
}));
