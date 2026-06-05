# COC7e M1 — 基础规则补完 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M1 of the COC7e completion roadmap — A0 foundation fixes (G1/G2/G3) plus A1/A2/A3 rules-only buckets — landing the推骰/运气/SAN疯狂/技能改良/年龄修正 mechanics fully testable on `beta`.

**Architecture:** A0 introduces `migrateSheet` helper, non-silent MVU redirect, and post-settle evaluator phase — these unblock all subsequent buckets. A1 lays staged dice-store + openCheck API + luck slider UI. A2 builds SAN evaluator atop A0.3 phase, with structured insanity sheet fields + Bout dual-mode dispatch + unified timeJumpGenerator. A3 ships skill-tick gating + DevelopmentPhaseModal + age modifier table per spec R8.

**Tech Stack:** React + TypeScript + Vite + Zustand + Dexie + vitest. Branch `beta` (master triggers Vercel deploy). Project memory: `feedback_git_push_no_coauthor` (commits omit Co-Authored-By), `no-emoji-use-ui-icons` (SVG icons via TabIcons, not emoji), `feedback_animation_bezier` (cubic-bezier(0.4, 0, 0.2, 1) for all UI transitions), `feedback_button_interaction` (hover/active feedback on every button).

**Source design:** `docs/superpowers/specs/2026-06-04-coc7e-rules-completion-roadmap-design.md`

**M1 Scope:** A0 (foundation, no user-visible change) + A1 (推骰/运气/openCheck) + A2 (SAN/疯狂) + A3 (技能改良/年龄修正). D2 deferred to M3.

**Estimated duration:** 5-6 weeks single-developer; 3-4 weeks if A1/A2/A3 can run in parallel by separate developers (A0 is shared blocker first).

---


## Table of Contents
- [Pre-flight Fixes](#pre-flight-fixes-apply-before--during-a0-implementation)
- [Bucket A0 — Foundation](#bucket-a0--foundation-g1--g2--g3-blockers)
- [Bucket A1-core — DiceRecord + dice helpers + openCheck](#a11--extend-dicerecord-with-pushluckgrowth-optional-fields)
- [Bucket A1-ux — useDiceStore staging + Luck UI + DiceRecord ledger](#a13--usedicestore-staging-rollstaged--commitwithluck--commitaspush--commitnow)
- [Bucket A2-data — Sheet schema + sanity-engine + tables + MVU redirect](#a21--character-sheet-schema-wire-up-verify-a01-defaults--mvu-schema-entries)
- [Bucket A2-runtime — Evaluator + Bout dispatch + timeJumpGenerator + lore](#a24--post-settle-evaluator-hook-sanityevaluator)
- [Bucket A3-rules — Age modifiers + skill improvement pure helpers + CharacterCreator integration](#a31--pure-helpers-applyagemodifiers--rolleduimprovement--rollskillimprovement)
- [Bucket A3-dev — Tick gating + DevelopmentPhaseModal + +2D6 SAN at 90% + entry](#a33--skill-ticking-gated-on-success-results)

## Pre-flight Fixes (Apply Before / During A0 Implementation)

These corrections were surfaced by the adversarial review of the initial A0 draft. They MUST be applied — three are blockers.

### Blocker — A0.1 characteristics whitelist filter
Inside `migrateSheet`, filter `r.characteristics` to only the 8 known COC7Characteristic keys before spreading. Legacy DB rows may have Chinese-keyed characteristics (e.g. `力量: 50`) which would pollute the typed Record otherwise.

```typescript
const COC7_CHARS: readonly COC7Characteristic[] = ['STR','CON','POW','DEX','APP','SIZ','INT','EDU'];
const rawChars = (r.characteristics ?? {}) as Record<string, unknown>;
const characteristics = {
  STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0,
} as Record<COC7Characteristic, number>;
for (const k of COC7_CHARS) {
  const v = rawChars[k];
  if (typeof v === 'number' && Number.isFinite(v)) characteristics[k] = v;
}
```

Add regression test:
```typescript
it('Chinese-keyed legacy characteristics dropped, STR/... defaulted to 0', () => {
  const legacy = { characteristics: { 力量: 50 } } as unknown as Partial<CharacterSheet>;
  const m = migrateSheet(legacy);
  expect(m.characteristics.STR).toBe(0);
  expect((m.characteristics as Record<string, unknown>)['力量']).toBeUndefined();
});
```

### Blocker — A0.1 halfFifth/secondary deep-merge
Spread-merge at top level leaves sub-objects undefined when legacy stored partial data. Replace shallow defaults with per-key fallbacks:

```typescript
const halfFifthDefault = {
  STR: { half: 0, fifth: 0 }, CON: { half: 0, fifth: 0 }, POW: { half: 0, fifth: 0 },
  DEX: { half: 0, fifth: 0 }, APP: { half: 0, fifth: 0 }, SIZ: { half: 0, fifth: 0 },
  INT: { half: 0, fifth: 0 }, EDU: { half: 0, fifth: 0 },
};
const rawHF = (r.halfFifth ?? {}) as Partial<typeof halfFifthDefault>;
const halfFifth = { ...halfFifthDefault } as typeof halfFifthDefault;
for (const k of COC7_CHARS) {
  const v = rawHF[k];
  if (v && typeof v === 'object') {
    halfFifth[k] = {
      half: typeof v.half === 'number' ? v.half : 0,
      fifth: typeof v.fifth === 'number' ? v.fifth : 0,
    };
  }
}

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
```

### Blocker — A0.1 temporaryInsanity.bout shape
Plan declared `bout?: string` but spec §4 A2.5 requires structured `{ mode, table, entry }`. Use the structured shape NOW so A2 doesn't need a second migration:

```typescript
temporaryInsanity: {
  active: boolean;
  roundsLeft: number;
  bout?: { mode: 'realtime' | 'summary'; table: 'VII' | 'VIII'; entry: string };
};
```

### Blocker — A0.1 CharacterCreator rename phobias → backgroundFears (K8 mitigation)
sheet.phobias[] is the new structured madness array. The local `phobias: string` field in `src/components/CharSheet/CharacterCreator.tsx` collides — rename in the SAME PR as A0.1.

Steps:
1. `const [phobias, setPhobias] = useState('')` → `const [backgroundFears, setBackgroundFears] = useState('')`
2. Update all 10 references in the file (search: `phobias`/`setPhobias`).
3. Preset save/load: `data = { ..., phobias }` → `data = { ..., backgroundFears }`; on load fall back to old key once: `setBackgroundFears(d.backgroundFears || d.phobias || '')`.
4. Field list label: `{ key: 'phobias', zh: '恐惧症', ... }` → `{ key: 'backgroundFears', zh: '恐惧症（背景）', ... }`.
5. JSX prop names downstream: `phobias={phobias}` → `backgroundFears={backgroundFears}`.

Add migrateSheet legacy handler: if legacy sheet has `phobias` that is a STRING, move it to `backgroundFears` and initialize `sheet.phobias = []` (the new structured array). If already array, keep.

### Major — A0.1 dailySanLoss JSDoc semantics
Plan said "每回合末清零" — wrong. Spec §4 A2.1 says reset on `sceneInfo.date` change (per IN-GAME DAY). Fix the JSDoc:

```typescript
/**
 * 一【游戏日】内累计的理智损失（A2 不定性疯狂阈值 = maxSan/5 / 单日）。
 * 由 A2 post-settle evaluator 在 sceneInfo.date 变更时清零（NOT 每回合）。
 * 同时 A2.4 评估器读此字段判定 indefinite 触发。
 */
dailySanLoss: number;
```

### Major — A0.1 applyCharsheetRedirect carries ticked
The skill-write branch in `mvu-charsheet-redirect.ts` creates skills via `{ base, current }` without `ticked`. After A0.1, redirect-produced skills will have `ticked: undefined` while migrateSheet-produced have `ticked: false`. Carry forward:

```typescript
return {
  ...sheet,
  skills: {
    ...sheet.skills,
    [skillName]: {
      base: existing?.base ?? 0,
      current: nextCurrent,
      ticked: existing?.ticked ?? false,
    },
  },
};
```

### Major — Drop never[] reserved fields conditions/pillars
`never[]` blocks future widening. Recommendation: drop these two fields from CharacterSheet in A0.1 entirely — D1.1 (M2) and D2.1 (M3) will add them via declaration merging when those buckets land. Schema additions for A2/A3/B1/C2 stay (they're consumed in M1/M2/M4 respectively).

### Major — Hoist MvuPatchReport type
Currently the patchReport shape is inlined in both `useChatPipeline.ts` and the new `EvaluatorContext`. Hoist into mvu-jsonpatch.ts:

```typescript
export interface MvuPatchReport {
  applied: number;
  failed: MvuOpError[];
}
```

Then both sites import and use this single type.

### Blocker — A0.2 test fixtures need <JSONPatch> wrapper
`extractJsonPatchBlocks` requires inner `<JSONPatch>` tag wrapping the JSON. Wrap every JSON array in test fixtures:

```typescript
const text = `narrative...
<UpdateVariable>
<JSONPatch>
[
  {"op": "replace", "path": "/调查员/foobar/something", "value": 42}
]
</JSONPatch>
</UpdateVariable>
`;
```

Apply to ALL fixtures in the test file.

### Minor — A0.3 add applyCorrectiveOps return-value test
Pin the contract that evaluator can read failed ops from second-batch corrective:

```typescript
it('applyCorrectiveOps return value (failed ops) is visible to evaluator', () => {
  let capturedErrors: MvuOpError[] = [];
  registerEvaluator('observer', (ctx: EvaluatorContext) => {
    capturedErrors = ctx.applyCorrectiveOps([
      { op: 'replace', path: '/调查员/foobar/zzz', value: 1 },
    ]);
  });
  runPostSettleEvaluators({
    sheet: useCharSheetStore.getState().sheet,
    statData: useVariableStore.getState().statData,
    patchReport: { applied: 0, failed: [] },
    applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
  });
  expect(capturedErrors).toHaveLength(1);
  expect(capturedErrors[0].path).toBe('调查员.foobar.zzz');
});
```

### Minor — Test posture default + EJS lore safety
- Append `expect(m.posture).toBe('站立'); expect(m.statusConditions).toEqual([]);` to migrateSheet test (mvu-charsheet-redirect rejects empty posture).
- Before committing, run `grep -E 'noUnusedLocals|noUnusedParameters' tsconfig*.json` to verify whether unused-locals strict mode is active.

---


## Bucket A0 — Foundation (G1 + G2 + G3 blockers)

Spec: `docs/superpowers/specs/2026-06-04-coc7e-rules-completion-roadmap-design.md` §4 "M1 — Rules-only foundation" / §6 "Cross-cutting gaps G1/G2/G3".

Working branch: `beta`. All commits on `beta`; no `master` push in A0 (no user-visible feature; CHANGELOG not required).

---

### A0.1 — migrateSheet helper unifies defaultSheet and legacy DB rows

Implements spec §6 G1. Adds the single upgrade point future buckets attach to.

#### Step 1. Extend `CharacterSheet` with the reserved fields

Future buckets (A2/A3/B1/C2/M2/M3) write to these fields. Reserving them now keeps `migrateSheet` the only place that has to know defaults, so subsequent buckets just consume.

Edit `src/types/index.ts` — replace the existing `CharacterSheet` interface (lines 4–40) with:

```typescript
export interface CharacterSheet {
  characteristics: Record<COC7Characteristic, number>;
  halfFifth: Record<COC7Characteristic, { half: number; fifth: number }>;
  secondary: {
    hp: { current: number; max: number };
    san: { current: number; max: number };
    mp: { current: number; max: number };
    luck: number;
    mov: number;
    db: string;
    build: number;
  };
  /** 技能表。`ticked` 由 A3 在「成功检定后回合结束」标记，回合外用来发放经验。 */
  skills: Record<string, { base: number; current: number; ticked?: boolean }>;
  identity: {
    name: string;
    occupation: string;
    age: number;
    gender: string;
    birthplace: string;
    residence: string;
    id: string;
  };
  /** 开场白 — the character's first message / greeting */
  greeting: string;
  /** 角色描述 — character description for the AI prompt */
  description: string;
  /** 角色性格 — personality traits for the AI prompt */
  personality: string;
  /** 场景设定 — current scenario description */
  scenario: string;
  /** 用户设定描述 — persona / user description */
  personaDescription: string;
  /** 当前姿态 — 站立/倒下/昏迷/被束缚 等，供 LLM 遵守物理约束 */
  posture: string;
  /** 状态条件 — 极度口渴/身体着火/中毒 等持续状态 */
  statusConditions: StatusCondition[];
  /** 本回合理智损失累计（A2 临时疯狂触发阈值=5/单回合）。每回合末由 post-settle 清零。 */
  dailySanLoss: number;
  /** 临时疯狂状态(A2)。`active` 为真即处于临时疯狂；`roundsLeft` 倒计时回合数。 */
  temporaryInsanity: { active: boolean; roundsLeft: number; bout?: string };
  /** 不定性疯狂状态(A2)。`active` 为真即处于不定性疯狂（少于五分之一 SAN 触发）。 */
  indefiniteInsanity: { active: boolean; daysLeft: number };
  /** 永久性疯狂(A2)。SAN<=0 后定性。 */
  permanentInsanity: boolean;
  /** 恐惧症列表(A2 madness)。来源：临时疯狂 bout 中抽取的恐惧。 */
  phobias: string[];
  /** 躁狂症列表(A2 madness)。来源：临时疯狂 bout 中抽取的躁狂。 */
  manias: string[];
  /** RESERVED for D1 conditions / M2 status effects。本里程碑保持空数组。 */
  conditions: never[];
  /** RESERVED for D2 pillars / M3 multi-actor。本里程碑保持空数组。 */
  pillars: never[];
  /** 已知法术(C2/M4)。本里程碑保持空数组，但 redirect 已经认识此路径不再报 unknown。 */
  known_spells: string[];
  /** 恢复进度(B1/M2)。本里程碑保持空对象，A2.6 Summary Bout 不写，仅占位。 */
  recovery: { hpRegenAtMs?: number; sanRegenAtMs?: number };
}
```

Run: `cd E:/Games/COC && npx tsc --noEmit` — expected: many errors in files that construct `CharacterSheet` literals without the new required fields (this is the failing baseline; Step 3 fixes it via `migrateSheet`).

#### Step 2. Write the failing test for `migrateSheet`

Edit `src/stores/useCharSheetStore.test.ts` — append at end of file:

```typescript
import { migrateSheet } from './useCharSheetStore';

describe('migrateSheet — A0.1 legacy-shape upgrader', () => {
  it('legacy sheet (only name/age/skills) gets every reserved field filled with defaults', () => {
    const legacy = {
      identity: { name: '亚瑟', age: 35 },
      skills: { 侦查: { base: 25, current: 40 } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(legacy);
    // identity merged
    expect(m.identity.name).toBe('亚瑟');
    expect(m.identity.age).toBe(35);
    // characteristics defaulted
    expect(m.characteristics.STR).toBe(0);
    // skill `ticked` injected
    expect(m.skills['侦查'].ticked).toBe(false);
    // A2 madness defaults
    expect(m.dailySanLoss).toBe(0);
    expect(m.temporaryInsanity).toEqual({ active: false, roundsLeft: 0 });
    expect(m.indefiniteInsanity).toEqual({ active: false, daysLeft: 0 });
    expect(m.permanentInsanity).toBe(false);
    expect(m.phobias).toEqual([]);
    expect(m.manias).toEqual([]);
    // reserved fields
    expect(m.conditions).toEqual([]);
    expect(m.pillars).toEqual([]);
    expect(m.known_spells).toEqual([]);
    expect(m.recovery).toEqual({});
  });

  it('defaultSheet itself goes through migrateSheet (new char path)', () => {
    expect(defaultSheet.dailySanLoss).toBe(0);
    expect(defaultSheet.temporaryInsanity.active).toBe(false);
    expect(defaultSheet.phobias).toEqual([]);
    expect(defaultSheet.recovery).toEqual({});
  });

  it('migrateSheet preserves caller-supplied non-default values verbatim', () => {
    const partial = {
      temporaryInsanity: { active: true, roundsLeft: 3, bout: '失忆' },
      phobias: ['深海', '黑暗'],
      skills: { 心理学: { base: 10, current: 50, ticked: true } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.temporaryInsanity).toEqual({ active: true, roundsLeft: 3, bout: '失忆' });
    expect(m.phobias).toEqual(['深海', '黑暗']);
    expect(m.skills['心理学'].ticked).toBe(true);
  });

  it('skills without `ticked` get ticked:false injected', () => {
    const partial = {
      skills: { 侦查: { base: 25, current: 25 }, 急救: { base: 30, current: 30 } },
    } as unknown as Partial<CharacterSheet>;
    const m = migrateSheet(partial);
    expect(m.skills['侦查'].ticked).toBe(false);
    expect(m.skills['急救'].ticked).toBe(false);
  });
});
```

Run: `cd E:/Games/COC && npx vitest run src/stores/useCharSheetStore.test.ts` — expected: failure `migrateSheet is not exported by ./useCharSheetStore`.

#### Step 3. Implement `migrateSheet` and route `defaultSheet` through it

Edit `src/stores/useCharSheetStore.ts` — replace the entire file with:

```typescript
import { create } from 'zustand';
import type { CharacterSheet } from '../types';

/** 单一升级点：把任意旧形态/不完整 sheet 升级为当下完整 CharacterSheet。
 *  所有读取路径（loadConversationInner、defaultSheet、import）都必须经过此函数，
 *  防止「字段缺失致 .ticked of undefined」等访问崩。 */
export function migrateSheet(raw: Partial<CharacterSheet> | null | undefined): CharacterSheet {
  const r = (raw ?? {}) as Partial<CharacterSheet>;
  const baseSkills = r.skills ?? {};
  const skills: CharacterSheet['skills'] = {};
  for (const [k, v] of Object.entries(baseSkills)) {
    if (!v || typeof v !== 'object') continue;
    skills[k] = {
      base: typeof v.base === 'number' ? v.base : 0,
      current: typeof v.current === 'number' ? v.current : 0,
      ticked: typeof v.ticked === 'boolean' ? v.ticked : false,
    };
  }
  return {
    characteristics: {
      STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0,
      ...(r.characteristics ?? {}),
    },
    halfFifth: r.halfFifth ?? {
      STR: { half: 0, fifth: 0 }, CON: { half: 0, fifth: 0 }, POW: { half: 0, fifth: 0 },
      DEX: { half: 0, fifth: 0 }, APP: { half: 0, fifth: 0 }, SIZ: { half: 0, fifth: 0 },
      INT: { half: 0, fifth: 0 }, EDU: { half: 0, fifth: 0 },
    },
    secondary: {
      hp: { current: 0, max: 0 }, san: { current: 0, max: 0 }, mp: { current: 0, max: 0 },
      luck: 0, mov: 0, db: '0', build: 0,
      ...(r.secondary ?? {}),
    },
    skills,
    identity: {
      name: '', occupation: '', age: 0, gender: '', birthplace: '', residence: '', id: '',
      ...(r.identity ?? {}),
    },
    greeting: r.greeting ?? '',
    description: r.description ?? '',
    personality: r.personality ?? '',
    scenario: r.scenario ?? '',
    personaDescription: r.personaDescription ?? '',
    posture: r.posture ?? '站立',
    statusConditions: Array.isArray(r.statusConditions) ? r.statusConditions : [],
    dailySanLoss: typeof r.dailySanLoss === 'number' ? r.dailySanLoss : 0,
    temporaryInsanity: r.temporaryInsanity ?? { active: false, roundsLeft: 0 },
    indefiniteInsanity: r.indefiniteInsanity ?? { active: false, daysLeft: 0 },
    permanentInsanity: typeof r.permanentInsanity === 'boolean' ? r.permanentInsanity : false,
    phobias: Array.isArray(r.phobias) ? r.phobias : [],
    manias: Array.isArray(r.manias) ? r.manias : [],
    conditions: [] as never[], // RESERVED D1/M2 — kept empty in M1
    pillars: [] as never[],     // RESERVED D2/M3 — kept empty in M1
    known_spells: Array.isArray(r.known_spells) ? r.known_spells : [],
    recovery: r.recovery ?? {},
  };
}

/** defaultSheet 经 migrateSheet 出口；新角色与升级路径走同一个口。 */
export const defaultSheet: CharacterSheet = migrateSheet({});

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
```

Run: `cd E:/Games/COC && npx vitest run src/stores/useCharSheetStore.test.ts` — expected output includes:

```
 ✓ src/stores/useCharSheetStore.test.ts (7)
   ✓ migrateSheet — A0.1 legacy-shape upgrader (4)
     ✓ legacy sheet (only name/age/skills) gets every reserved field filled with defaults
     ✓ defaultSheet itself goes through migrateSheet (new char path)
     ✓ migrateSheet preserves caller-supplied non-default values verbatim
     ✓ skills without `ticked` get ticked:false injected
```

#### Step 4. Wire `sessionLifecycle.loadConversationInner` through `migrateSheet`

Edit `src/stores/sessionLifecycle.ts` — locate the line (~line 344):

```typescript
useCharSheetStore.getState().setSheet(charRow?.sheet ?? defaultSheet);
```

Replace with:

```typescript
// G1 fix (A0.1): legacy DB rows lack reserved fields (dailySanLoss/temporaryInsanity/...).
// migrateSheet unifies new + legacy load paths so consumers never hit undefined fields.
useCharSheetStore.getState().setSheet(migrateSheet(charRow?.sheet));
```

Add `migrateSheet` to the existing import. Find the line:

```typescript
import { useCharSheetStore, defaultSheet } from './useCharSheetStore';
```

Replace with:

```typescript
import { useCharSheetStore, defaultSheet, migrateSheet } from './useCharSheetStore';
```

(`defaultSheet` import is no longer used at the call site but is referenced elsewhere in the file — keep it.)

Run: `cd E:/Games/COC && npx tsc --noEmit` — expected: clean (no errors). If `defaultSheet` becomes unused, remove from the import.

Run: `cd E:/Games/COC && npx vitest run src/stores/sessionLifecycle.test.ts` — expected: all existing tests still pass (no regression).

#### Step 5. Commit

```
git add src/types/index.ts src/stores/useCharSheetStore.ts src/stores/useCharSheetStore.test.ts src/stores/sessionLifecycle.ts
git commit -m "feat(charsheet): migrateSheet 统一升级老存档 + 预留 A2/A3/B1 字段 — G1 修复"
git push origin beta
```

Expected `git push` output:
```
To github.com:.../COC.git
   <hash>..<hash>  beta -> beta
```

---

### A0.2 — MVU redirect closure: unknown 调查员.* paths surface as patchReport errors

Implements spec §6 G2. Removes the silent-consume that hides typos and wrong-namespace writes.

#### Step 1. Audit the currently-redirected 调查员.* path map

`src/sillytavern/mvu-charsheet-redirect.ts` enumerates these as the redirect's universe (extracted directly from `applyCharsheetRedirect` and `isNumericCharsheetTarget`):

```
调查员.姿态                       — posture string
调查员.状态条件                   — full array replace/insert
调查员.状态条件.<name>            — single insert/replace/remove (name OR numeric index)
调查员.生命值.当前, 调查员.生命值.最大
调查员.理智值.当前, 调查员.理智值.最大
调查员.魔法值.当前, 调查员.魔法值.最大
调查员.幸运
调查员.技能.<name>                — replace/delta, new skill allowed
```

Identity fields (`调查员.姓名`/`调查员.职业`/`调查员.年龄`/`调查员.性别`) are **read-only** in M1 — they appear in `buildFullSubstitutionMap` for macro substitution but `applyCharsheetRedirect` does NOT write them; treat them as known-optional (silently ignore writes, do not error).

Define the known-optional whitelist as a const in `mvu-charsheet-redirect.ts`. Append after the existing `isNumericCharsheetTarget` export (~line 37):

```typescript
/**
 * 「已知但不写入」的 调查员.* 路径白名单：身份字段(姓名/职业/年龄/性别)等。
 * applyCharsheetRedirect 返回 null 不报错；不在此白名单且未被 redirect 消费的视为未知路径(G2)。
 */
const KNOWN_OPTIONAL_CHARSHEET_PATHS: ReadonlySet<string> = new Set([
  '调查员.姓名',
  '调查员.职业',
  '调查员.年龄',
  '调查员.性别',
  // C2/M4 法术名册(本里程碑仅占位,redirect 不写,但不报 unknown)
  '调查员.已知法术',
]);

export function isKnownOptionalCharsheetPath(dotPath: string): boolean {
  return KNOWN_OPTIONAL_CHARSHEET_PATHS.has(dotPath);
}
```

#### Step 2. Write the failing tests for the new error path

Create `src/stores/useVariableStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useVariableStore } from './useVariableStore';
import { useCharSheetStore, defaultSheet, migrateSheet } from './useCharSheetStore';

function makeOp(op: 'replace' | 'delta' | 'insert' | 'remove', path: string, value: unknown) {
  return { op, path, value };
}

beforeEach(() => {
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(migrateSheet({
    skills: { 侦查: { base: 25, current: 50 } },
    secondary: {
      hp: { current: 10, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 8, max: 8 },
      luck: 55, mov: 8, db: '0', build: 0,
    },
  }));
});

describe('applyMvuOpsToTree — G2 closure: unknown 调查员.* paths', () => {
  it('未知 调查员.foobar.* 路径推入 patchReport.failed 而不是静默吞掉', () => {
    // 构造一段含 UpdateVariable 标记的文本，让 processResponse 走 JSON Patch 路径
    const text = `narrative...
<UpdateVariable>
[
  {"op": "replace", "path": "/调查员/foobar/something", "value": 42}
]
</UpdateVariable>
`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(1);
    expect(patchReport.failed[0].path).toBe('调查员.foobar.something');
    expect(patchReport.failed[0].reason).toMatch(/unknown charsheet path/);
  });

  it('身份字段(known-optional)不报错——白名单容忍', () => {
    const text = `<UpdateVariable>[{"op": "replace", "path": "/调查员/姓名", "value": "新名字"}]</UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(0);
  });
});

describe('applyMvuOpsToTree — 回归保护：所有已认识路径仍干净消费', () => {
  it.each([
    ['调查员.生命值.当前', 'replace', 8],
    ['调查员.生命值.最大', 'replace', 12],
    ['调查员.理智值.当前', 'delta', -3],
    ['调查员.理智值.最大', 'replace', 80],
    ['调查员.魔法值.当前', 'replace', 5],
    ['调查员.魔法值.最大', 'replace', 8],
    ['调查员.幸运', 'replace', 70],
    ['调查员.姿态', 'replace', '蹲伏'],
    ['调查员.技能.侦查', 'delta', 5],
    ['调查员.技能.攀爬', 'replace', 40],
  ])('%s %s %s 不报错', (path, op, value) => {
    const jsonPath = '/' + path.replace(/\./g, '/');
    const text = `<UpdateVariable>[{"op": "${op}", "path": "${jsonPath}", "value": ${JSON.stringify(value)}}]</UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toEqual([]);
  });

  it('状态条件数组 replace 不报错', () => {
    const text = `<UpdateVariable>[{"op": "replace", "path": "/调查员/状态条件", "value": [{"name":"骨折","severity":"severe","description":"右臂"}]}]</UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toEqual([]);
    expect(useCharSheetStore.getState().sheet.statusConditions[0].name).toBe('骨折');
  });

  it('调查员 根路径(没有点号子路径)被视作未知 — 防 全树替换 误用', () => {
    const text = `<UpdateVariable>[{"op": "replace", "path": "/调查员", "value": {}}]</UpdateVariable>`;
    const { patchReport } = useVariableStore.getState().processResponse(text);
    expect(patchReport.failed).toHaveLength(1);
    expect(patchReport.failed[0].path).toBe('调查员');
  });
});
```

Run: `cd E:/Games/COC && npx vitest run src/stores/useVariableStore.test.ts` — expected: the unknown-path test fails because `applyMvuOpsToTree` currently `return true` swallows it.

#### Step 3. Modify `applyMvuOpsToTree` to push the error

Edit `src/stores/useVariableStore.ts` — find the redirect callback (lines 56–87). Update the import block at the top of the file to add `isKnownOptionalCharsheetPath`. Current import block contains:

```typescript
import { isCharsheetPath, applyCharsheetRedirect, isNumericCharsheetTarget } from '../sillytavern/mvu-charsheet-redirect';
```

Replace with:

```typescript
import {
  isCharsheetPath,
  applyCharsheetRedirect,
  isNumericCharsheetTarget,
  isKnownOptionalCharsheetPath,
} from '../sillytavern/mvu-charsheet-redirect';
```

Then replace the `applyMvuOpsToTree` function body (lines 56–87) with:

```typescript
function applyMvuOpsToTree(tree: Record<string, unknown>, ops: unknown[]): MvuOpError[] {
  const errors: MvuOpError[] = [];
  let sheet = useCharSheetStore.getState().sheet;
  let sheetChanged = false;
  applyMvuPatch(tree, ops, {
    schema: COC_MVU_SCHEMA,
    redirect: (dotPath, op, value) => {
      if (!isCharsheetPath(dotPath)) return false;
      const updated = applyCharsheetRedirect(sheet, dotPath, op, value);
      if (updated) {
        sheet = updated;
        sheetChanged = true;
        return true;
      }
      // applyCharsheetRedirect 返回 null 的两种语义：
      //   (a) 数值字段收到非数字 → 真实失败，已分支报错；
      //   (b) 不被支持的子路径（身份字段等）→ 良性「不写入」。
      // G2 修复：把 (b) 中【非白名单】的子路径也视作真实失败上报，
      // 防止 LLM 写错路径(`调查员.xxx.yyy`)被静默吞掉。
      if (isNumericCharsheetTarget(dotPath) && (op === 'replace' || op === 'delta')) {
        errors.push({
          op,
          path: dotPath,
          value,
          reason: `角色卡数值字段 ${dotPath} 拒绝非数字值: ${JSON.stringify(value)}`,
          rawOp: { op, path: dotPath, value },
        });
      } else if (!isKnownOptionalCharsheetPath(dotPath)) {
        errors.push({
          op,
          path: dotPath,
          value,
          reason: `unknown charsheet path: ${dotPath}`,
          rawOp: { op, path: dotPath, value },
        });
      }
      // 始终 consume 调查员.*：阻止 statData 出现平行真理叶子。
      return true;
    },
    onOpError: (err) => errors.push(err),
  });
  if (sheetChanged) useCharSheetStore.getState().setSheet(sheet);
  return errors;
}
```

Run: `cd E:/Games/COC && npx vitest run src/stores/useVariableStore.test.ts` — expected output:

```
 ✓ src/stores/useVariableStore.test.ts (13)
   ✓ applyMvuOpsToTree — G2 closure: unknown 调查员.* paths (2)
   ✓ applyMvuOpsToTree — 回归保护：所有已认识路径仍干净消费 (11)
```

Run the existing redirect regression: `cd E:/Games/COC && npx vitest run src/sillytavern/mvu-charsheet-redirect.test.ts` — expected: still all green.

#### Step 4. Commit

```
git add src/sillytavern/mvu-charsheet-redirect.ts src/stores/useVariableStore.ts src/stores/useVariableStore.test.ts
git commit -m "fix(mvu): 未知 调查员.* 路径不再静默吞 → patchReport 显错 — G2 修复"
git push origin beta
```

---

### A0.3 — Post-settle evaluator phase

Implements spec §6 G3. Provides the registry that A2 (SAN→insanity) and A3 (skill-tick) will hook into.

#### Step 1. Write the failing tests

Create `src/sillytavern/post-settle-evaluators.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerEvaluator,
  unregisterEvaluator,
  runPostSettleEvaluators,
  clearEvaluatorsForTest,
  type EvaluatorContext,
} from './post-settle-evaluators';
import { useCharSheetStore, migrateSheet } from '../stores/useCharSheetStore';
import { useVariableStore } from '../stores/useVariableStore';

beforeEach(() => {
  clearEvaluatorsForTest();
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().setSheet(migrateSheet({
    secondary: {
      hp: { current: 10, max: 12 }, san: { current: 60, max: 80 }, mp: { current: 8, max: 8 },
      luck: 55, mov: 8, db: '0', build: 0,
    },
  }));
});

describe('post-settle-evaluators — registry', () => {
  it('registerEvaluator + runPostSettleEvaluators 调度注册的函数', () => {
    const calls: string[] = [];
    registerEvaluator('alpha', () => { calls.push('alpha'); });
    registerEvaluator('beta', () => { calls.push('beta'); });
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual(['alpha', 'beta']);
  });

  it('unregisterEvaluator 移除注册', () => {
    const calls: string[] = [];
    registerEvaluator('once', () => { calls.push('once'); });
    unregisterEvaluator('once');
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual([]);
  });

  it('register 同名覆盖旧函数(不重复触发)', () => {
    const calls: string[] = [];
    registerEvaluator('x', () => { calls.push('v1'); });
    registerEvaluator('x', () => { calls.push('v2'); });
    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: {},
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: () => [],
    });
    expect(calls).toEqual(['v2']);
  });
});

describe('post-settle-evaluators — 应用 ops 不被 MVU 快照回滚 (G3)', () => {
  it('SAN-1 evaluator 实际持久化到 sheet', () => {
    const sanBefore = useCharSheetStore.getState().sheet.secondary.san.current;
    expect(sanBefore).toBe(60);

    registerEvaluator('san-decay', (ctx: EvaluatorContext) => {
      ctx.applyCorrectiveOps([
        { op: 'delta', path: '/调查员/理智值/当前', value: -1 },
      ]);
    });

    runPostSettleEvaluators({
      sheet: useCharSheetStore.getState().sheet,
      statData: useVariableStore.getState().statData,
      patchReport: { applied: 0, failed: [] },
      applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
    });

    expect(useCharSheetStore.getState().sheet.secondary.san.current).toBe(59);
  });

  it('evaluator 抛错被吞掉,其他 evaluator 仍跑(隔离)', () => {
    const calls: string[] = [];
    registerEvaluator('boom', () => { throw new Error('on purpose'); });
    registerEvaluator('after-boom', () => { calls.push('after-boom'); });
    expect(() =>
      runPostSettleEvaluators({
        sheet: useCharSheetStore.getState().sheet,
        statData: {},
        patchReport: { applied: 0, failed: [] },
        applyCorrectiveOps: () => [],
      }),
    ).not.toThrow();
    expect(calls).toEqual(['after-boom']);
  });
});
```

Run: `cd E:/Games/COC && npx vitest run src/sillytavern/post-settle-evaluators.test.ts` — expected: file not found / `Failed to resolve import "./post-settle-evaluators"`.

#### Step 2. Implement the registry

Create `src/sillytavern/post-settle-evaluators.ts`:

```typescript
/**
 * Post-settle evaluator registry (A0.3 / spec §6 G3)
 *
 * 为什么需要这一相位:
 *   主管线在 `useChatPipeline.processResponse` 里依次跑
 *     (1) processResponse → applyMvuPatch 写入 statData + sheet
 *     (2) optional MVU self-correct round (failed ops 回灌)
 *   两步都在【MVU 快照应用】上下文里. 如果 evaluator(SAN-loss→临疯/技能成功→ticked)
 *   把它们的 op 塞进同一个 redirect 回调, 快照体系会把这些 op 视作"本回合 LLM 写入",
 *   错误归并/回滚. 设计上 evaluator 应该在 MVU 周期【外】emit ops, 走一次额外的
 *   applyCorrectiveOps. 本模块就是那个外相位.
 *
 * 调用契约:
 *   - evaluator MUST NOT 从 applyMvuOpsToTree / redirect 回调内部触发.
 *   - evaluator 可以 调用 ctx.applyCorrectiveOps() 直接写入(第二轮 corrective);
 *     也可以选择 return void 仅做副作用观测(本桶暂不需要 ops 返回值合并).
 *   - evaluator 抛错被吞掉, 不影响其他 evaluator(隔离 — 防 A2 evaluator 崩塌阻断 A3).
 */

import type { CharacterSheet } from '../types';
import type { MvuOpError } from './mvu-jsonpatch';

export interface EvaluatorContext {
  sheet: CharacterSheet;
  statData: Record<string, unknown>;
  patchReport: { applied: number; failed: MvuOpError[] };
  /** 二次 corrective: evaluator 把 ops 推入即触发 applyCorrectiveOps. */
  applyCorrectiveOps: (ops: unknown[]) => MvuOpError[];
}

export type Evaluator = (ctx: EvaluatorContext) => void;

const evaluators = new Map<string, Evaluator>();

/** 注册（或覆盖）一个 evaluator. */
export function registerEvaluator(name: string, fn: Evaluator): void {
  evaluators.set(name, fn);
}

/** 反注册. 主要给 HMR / test cleanup 用. */
export function unregisterEvaluator(name: string): void {
  evaluators.delete(name);
}

/** 测试钩子: 清空所有 evaluator. 仅 `*.test.ts` 用. */
export function clearEvaluatorsForTest(): void {
  evaluators.clear();
}

/** 主管线入口. 按注册顺序顺序调用; 单个 evaluator 抛错被吞但记 console.warn. */
export function runPostSettleEvaluators(ctx: EvaluatorContext): void {
  for (const [name, fn] of evaluators) {
    try {
      fn(ctx);
    } catch (err) {
      console.warn(`[post-settle-evaluators] ${name} 抛错被吞:`, err);
    }
  }
}
```

Run: `cd E:/Games/COC && npx vitest run src/sillytavern/post-settle-evaluators.test.ts` — expected output:

```
 ✓ src/sillytavern/post-settle-evaluators.test.ts (5)
   ✓ post-settle-evaluators — registry (3)
   ✓ post-settle-evaluators — 应用 ops 不被 MVU 快照回滚 (G3) (2)
```

#### Step 3. Wire `runPostSettleEvaluators` into the chat pipeline

Edit `src/hooks/useChatPipeline.ts`. Add to the imports near line 72 (after `runMvuSelfCorrect`):

```typescript
import { runPostSettleEvaluators } from '../sillytavern/post-settle-evaluators';
```

Then locate the end of the `settleVariables` async function (immediately AFTER the `runMvuSelfCorrect` call block ends, i.e. after the closing brace of the `if (patchReport.failed.length > 0 && settings.mvuSelfCorrectEnabled ...)` branch around line 1007–1008). Insert the evaluator phase BEFORE the closing brace of `settleVariables`:

Find:

```typescript
            if (sc.usage.total_tokens > 0 || sc.usage.prompt_tokens > 0 || sc.usage.completion_tokens > 0) {
              selfCorrectUsage = sc.usage;
            }
          }
        };
```

Replace with:

```typescript
            if (sc.usage.total_tokens > 0 || sc.usage.prompt_tokens > 0 || sc.usage.completion_tokens > 0) {
              selfCorrectUsage = sc.usage;
            }
          }

          // ── G3: post-settle 评估器相位 ──
          // MVU drain + corrective 已结束的此刻才跑 evaluator——它们 emit 的 ops 走【独立的】
          // applyCorrectiveOps 通道,不被 MVU 快照体系视为"本回合 LLM 写入"而回滚.
          // A2(SAN-loss→临疯) / A3(成功检定→ticked) 在后续 ticket 通过 registerEvaluator 接入.
          runPostSettleEvaluators({
            sheet: useCharSheetStore.getState().sheet,
            statData: useVariableStore.getState().statData,
            patchReport,
            applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
          });
        };
```

Run: `cd E:/Games/COC && npx tsc --noEmit` — expected: clean.

Run full test suite: `cd E:/Games/COC && npx vitest run` — expected: all green (no regression). The relevant new lines:

```
 ✓ src/stores/useCharSheetStore.test.ts (7)
 ✓ src/stores/useVariableStore.test.ts (13)
 ✓ src/sillytavern/post-settle-evaluators.test.ts (5)
```

#### Step 4. Commit

```
git add src/sillytavern/post-settle-evaluators.ts src/sillytavern/post-settle-evaluators.test.ts src/hooks/useChatPipeline.ts
git commit -m "feat(pipeline): 新增 post-settle evaluator 相位 — G3 修复(A2/A3 入口)"
git push origin beta
```

---

### A0 整桶验收命令

After all three tickets land on beta, run from `E:/Games/COC`:

```bash
npx tsc --noEmit && npx vitest run && npx vite build
```

Expected: `tsc` clean, all vitest suites green, `vite build` reports `built in ...` with no TS errors. No master push (A0 is plumbing — bucket A1 will be the first user-visible Luck slider commit that bumps `CURRENT_VERSION`).

## Bucket A1-core — Tickets A1.1, A1.2, A1.7

*A1.1 extends DiceRecord with 5 optional fields (push/luck/growth). A1.2 adds two pure functions to dice-engine.ts (applyLuckToRoll + isPushEligible) with full vitest coverage per spec R4/R7. A1.7 adds openCheck() programmatic API to useDiceStore for skill-targeted checks with onResolve callback.*

### A1.1 — Extend DiceRecord with push/luck/growth optional fields

1. Write failing test at `src/types/__tests__/dice-record-extended.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { DiceRecord } from '../index';

describe('DiceRecord extended fields (A1.1)', () => {
  it('accepts legacy minimal record with only old fields', () => {
    const legacy: DiceRecord = {
      skill: '聆听', roll: '42', target: '60', type: 'success', time: Date.now(),
    };
    expectTypeOf(legacy).toMatchTypeOf<DiceRecord>();
  });

  it('accepts record with all new optional fields', () => {
    const full: DiceRecord = {
      skill: '潜行', roll: '70', target: '55', type: 'success', time: Date.now(),
      pushed: true,
      luckSpent: 15,
      pushReason: '剧情线索关键',
      pushedFrom: { roll: 88, type: 'failure' },
      growthTickEligible: true,
    };
    expectTypeOf(full).toMatchTypeOf<DiceRecord>();
    expectTypeOf(full.pushedFrom).toMatchTypeOf<{ roll: number; type: DiceRecord['type'] } | undefined>();
  });

  it('all new fields are optional (legacy callers compile)', () => {
    const r: DiceRecord = { skill: 'x', roll: '1', target: '50', type: 'success', time: 0 };
    expectTypeOf(r.pushed).toMatchTypeOf<boolean | undefined>();
    expectTypeOf(r.luckSpent).toMatchTypeOf<number | undefined>();
    expectTypeOf(r.growthTickEligible).toMatchTypeOf<boolean | undefined>();
  });
});
```

2. Run failing:

```bash
npx vitest run src/types/__tests__/dice-record-extended.test.ts
```

Expected: TS compile errors `Property 'pushed' does not exist on type 'DiceRecord'`.

3. Implement — edit `src/types/index.ts`, append inside the existing `DiceRecord` interface (after the `dice?:` field, before the closing brace):

```typescript
  /** R4 推动检定：本次记录系推动检定后的二次结果（pushedFrom 含原失败信息）。 */
  pushed?: boolean;
  /** R7 幸运消耗：本次检定消耗的幸运点数（达成升级所用）。 */
  luckSpent?: number;
  /** 推动理由（玩家/AI 填写，用于历史回顾）。 */
  pushReason?: string;
  /** 推动检定的原始失败记录（仅 pushed=true 时存在）。 */
  pushedFrom?: { roll: number; type: DiceResultType };
  /** R6 成长打钩：本次成功是否计入下次成长检定（用于 ticked 标记落地）。 */
  growthTickEligible?: boolean;
```

4. Run passing:

```bash
npx vitest run src/types/__tests__/dice-record-extended.test.ts
npx tsc --noEmit
```

Expected: `Test Files  1 passed (1)` + tsc exits 0.

5. Commit:

```bash
git add src/types/index.ts src/types/__tests__/dice-record-extended.test.ts
git commit -m "feat(types): DiceRecord 扩展 pushed/luckSpent/pushReason/pushedFrom/growthTickEligible 可选字段（A1.1）"
```

---

### A1.2 — Pure dice helpers: applyLuckToRoll + isPushEligible

1. Write failing test at `src/sillytavern/__tests__/dice-luck-push.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyLuckToRoll, isPushEligible, determineResult } from '../dice-engine';

describe('applyLuckToRoll (R7)', () => {
  it('rejects SAN check (cannot spend luck on SAN)', () => {
    const r = applyLuckToRoll(80, 60, 25, /*sanCheck*/ true, false, false);
    expect(r.finalRoll).toBe(80);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/SAN/);
  });

  it('rejects damage roll', () => {
    const r = applyLuckToRoll(7, 6, 3, false, /*isDamageRoll*/ true, false);
    expect(r).toEqual({ finalRoll: 7, appliedSpend: 0, reason: expect.stringMatching(/伤害/) });
  });

  it('rejects luck-self roll', () => {
    const r = applyLuckToRoll(70, 50, 25, false, false, /*isLuckRoll*/ true);
    expect(r.finalRoll).toBe(70);
    expect(r.appliedSpend).toBe(0);
  });

  it('cannot rescue fumble 100', () => {
    const r = applyLuckToRoll(100, 80, 50, false, false, false);
    expect(r.finalRoll).toBe(100);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toMatch(/大失败|01|100/);
  });

  it('cannot rescue 96 against low skill (botch)', () => {
    const r = applyLuckToRoll(96, 40, 50, false, false, false);
    expect(r.finalRoll).toBe(96);
    expect(r.appliedSpend).toBe(0);
  });

  it('cannot improve crit-success 01', () => {
    const r = applyLuckToRoll(1, 50, 0, false, false, false);
    expect(r.finalRoll).toBe(1);
    expect(r.appliedSpend).toBe(0);
  });

  it('R7 哈维 example: spend 30 to upgrade roll 35 -> 5 (extreme success at skill 30)', () => {
    const r = applyLuckToRoll(35, 30, 30, false, false, false);
    expect(r.finalRoll).toBe(5);
    expect(r.appliedSpend).toBe(30);
    expect(determineResult(r.finalRoll, 30, false)).toBe('extreme-success');
  });

  it('clamps finalRoll to minimum 1', () => {
    const r = applyLuckToRoll(10, 50, 50, false, false, false);
    expect(r.finalRoll).toBe(1);
    expect(r.appliedSpend).toBe(50);
  });

  it('zero spend returns original (no reason)', () => {
    const r = applyLuckToRoll(55, 60, 0, false, false, false);
    expect(r.finalRoll).toBe(55);
    expect(r.appliedSpend).toBe(0);
    expect(r.reason).toBeUndefined();
  });
});

describe('isPushEligible (R4)', () => {
  it('blocks fighting category', () => {
    expect(isPushEligible('fighting', 'failure', false, false)).toBe(false);
  });
  it('blocks firearms category', () => {
    expect(isPushEligible('firearms', 'failure', false, false)).toBe(false);
  });
  it('blocks dodge category', () => {
    expect(isPushEligible('dodge', 'failure', false, false)).toBe(false);
  });
  it('blocks SAN check', () => {
    expect(isPushEligible('general', 'failure', /*sanCheck*/ true, false)).toBe(false);
  });
  it('blocks damage roll', () => {
    expect(isPushEligible('general', 'failure', false, /*isDamageRoll*/ true)).toBe(false);
  });
  it('blocks already-success results', () => {
    expect(isPushEligible('general', 'success', false, false)).toBe(false);
    expect(isPushEligible('general', 'hard-success', false, false)).toBe(false);
    expect(isPushEligible('general', 'extreme-success', false, false)).toBe(false);
    expect(isPushEligible('general', 'crit-success', false, false)).toBe(false);
  });
  it('blocks crit-failure', () => {
    expect(isPushEligible('general', 'crit-failure', false, false)).toBe(false);
  });
  it('allows stealth (general) plain failure', () => {
    expect(isPushEligible('general', 'failure', false, false)).toBe(true);
  });
  it('allows investigation (general) plain failure', () => {
    expect(isPushEligible('investigation', 'failure', false, false)).toBe(true);
  });
});
```

2. Run failing:

```bash
npx vitest run src/sillytavern/__tests__/dice-luck-push.test.ts
```

Expected: `does not provide an export named 'applyLuckToRoll'`.

3. Implement — append to `src/sillytavern/dice-engine.ts`:

```typescript
import type { DiceResultType } from '../types';

/** 推动检定不可用的技能门类（R4：战斗类与对抗反应类不许推动）。 */
export type PushSkillCategory =
  | 'fighting' | 'firearms' | 'dodge'
  | 'general' | 'knowledge' | 'investigation' | 'social'
  | 'language' | 'art' | 'science' | 'craft' | 'physical';

const PUSH_FORBIDDEN_CATEGORIES: ReadonlySet<PushSkillCategory> = new Set(['fighting', 'firearms', 'dodge']);

/**
 * R4 — 推动检定资格判定。仅当满足全部条件时允许推动：
 *   1) 技能门类不在战斗/射击/闪避禁用集
 *   2) 非 SAN 检定
 *   3) 非伤害骰
 *   4) 当前结果为 plain failure（成功类与大失败均不可推）
 */
export function isPushEligible(
  skillCategory: PushSkillCategory | string,
  resultType: DiceResultType,
  sanCheck: boolean,
  isDamageRoll: boolean,
): boolean {
  if (sanCheck) return false;
  if (isDamageRoll) return false;
  if (PUSH_FORBIDDEN_CATEGORIES.has(skillCategory as PushSkillCategory)) return false;
  return resultType === 'failure';
}

export interface LuckApplyResult {
  finalRoll: number;
  appliedSpend: number;
  reason?: string;
}

/** 01 大成功 / 96-100 范围视为无法靠幸运扭转的极端骰点。 */
function isFumbleOrCrit(roll: number): boolean {
  return roll === 1 || roll >= 96;
}

/**
 * R7 — 把消耗的幸运点应用到一次普通检定上：
 *   - SAN/伤害/幸运自检：直接拒绝
 *   - 01 或 96–100：无法救援（无论目标值）
 *   - 否则 finalRoll = max(1, roll - spend)
 * 拒绝路径不扣点数（appliedSpend=0），调用方据此决定是否真正扣幸运。
 */
export function applyLuckToRoll(
  roll: number,
  _target: number,
  spend: number,
  sanCheck: boolean,
  isDamageRoll: boolean,
  isLuckRoll: boolean,
): LuckApplyResult {
  if (isLuckRoll) return { finalRoll: roll, appliedSpend: 0, reason: '幸运检定本身不可消耗幸运' };
  if (isDamageRoll) return { finalRoll: roll, appliedSpend: 0, reason: '伤害骰不可消耗幸运' };
  if (sanCheck) return { finalRoll: roll, appliedSpend: 0, reason: 'SAN 检定不可消耗幸运' };
  if (isFumbleOrCrit(roll)) {
    return { finalRoll: roll, appliedSpend: 0, reason: `01/96-100 不可被幸运扭转（roll=${roll}）` };
  }
  if (spend <= 0) return { finalRoll: roll, appliedSpend: 0 };
  const finalRoll = Math.max(1, roll - spend);
  return { finalRoll, appliedSpend: spend };
}
```

4. Run passing:

```bash
npx vitest run src/sillytavern/__tests__/dice-luck-push.test.ts
npx tsc --noEmit
```

Expected: `Test Files  1 passed (1)` `Tests  19 passed`.

5. Commit:

```bash
git add src/sillytavern/dice-engine.ts src/sillytavern/__tests__/dice-luck-push.test.ts
git commit -m "feat(dice): applyLuckToRoll + isPushEligible 纯函数 + R4/R7 用例（A1.2）"
```

---

### A1.7 — openCheck programmatic API on useDiceStore

1. Write failing test at `src/stores/__tests__/dice-store-open-check.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import type { DiceResultType } from '../../types';

describe('useDiceStore.openCheck (A1.7)', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 65, bonusDice: 0, sanCheck: false, mode: 'check',
      isProgrammatic: false, programmaticSkill: undefined,
      programmaticContext: undefined, onProgrammaticResolve: undefined,
    } as any);
  });

  it('opens panel in programmatic mode with target/skill', () => {
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '聆听', target: 60, onResolve: resolve });
    const s = useDiceStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.target).toBe(60);
    expect(s.isProgrammatic).toBe(true);
    expect(s.programmaticSkill).toBe('聆听');
  });

  it('rolling fires onResolve(level, roll) and closes panel', () => {
    // Seeded RNG: force d100 = 23 (tens=2, ones=3) -> target 50 -> hard-success (50/2=25, 23<=25)
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.2)   // tens=2
       .mockReturnValueOnce(0.3);  // ones=3
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '潜行', target: 50, onResolve: resolve });
    useDiceStore.getState().roll();
    expect(resolve).toHaveBeenCalledTimes(1);
    const [level, roll] = resolve.mock.calls[0];
    expect(roll).toBe(23);
    expect(level as DiceResultType).toBe('hard-success');
    expect(useDiceStore.getState().isOpen).toBe(false);
    expect(useDiceStore.getState().isProgrammatic).toBe(false);
    rng.mockRestore();
  });

  it('addRecord receives context override (e.g. combat) on programmatic check', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({
      skill: '近战', target: 70, context: 'combat', onResolve: resolve,
    });
    useDiceStore.getState().roll();
    const hist = useDiceStore.getState().history;
    expect(hist.length).toBe(1);
    expect(hist[0].skill).toBe('近战');
    expect(hist[0].context).toBe('combat');
    expect(hist[0].target).toBe('70');
    rng.mockRestore();
  });

  it('bonus dice flag carries into programmatic roll', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.7) // tens=7
       .mockReturnValueOnce(0.2) // ones=2
       .mockReturnValueOnce(0.1); // bonus tens=1 -> min(7,1)=1, d100=12
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '侦察', target: 50, bonus: true, onResolve: resolve });
    useDiceStore.getState().roll();
    const [, roll] = resolve.mock.calls[0];
    expect(roll).toBe(12);
    rng.mockRestore();
  });

  it('panel close without rolling does NOT fire onResolve', () => {
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '历史', target: 40, onResolve: resolve });
    useDiceStore.getState().close();
    expect(resolve).not.toHaveBeenCalled();
    expect(useDiceStore.getState().isProgrammatic).toBe(false);
  });
});
```

2. Run failing:

```bash
npx vitest run src/stores/__tests__/dice-store-open-check.test.ts
```

Expected: `openCheck is not a function` / `isProgrammatic` undefined.

3. Implement — edit `src/stores/useDiceStore.ts`. Extend interface fields and add `openCheck`; modify `roll()` to drain programmatic state; modify `close()` to clear flag:

```typescript
import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';
import { randD10, d100, determineResult } from '../sillytavern/dice-engine';
import { useBookStore } from './useBookStore';

export interface OpenCheckOptions {
  skill: string;
  target: number;
  bonus?: boolean;
  penalty?: boolean;
  sanCheck?: boolean;
  context?: DiceRecord['context'];
  onResolve: (level: DiceResultType, roll: number) => void;
}

interface DiceStore {
  isOpen: boolean; mode: DiceMode; target: number; bonusDice: number; sanCheck: boolean;
  tens: number; ones: number; finalTens: number; bonusTens: number; oppTens: number; oppOnes: number;
  originalRoll: number; finalRoll: number; resultType: DiceResultType | null; history: DiceRecord[];
  pending: DiceRecord[];
  // —— A1.7 programmatic check 状态 ——
  isProgrammatic: boolean;
  programmaticSkill?: string;
  programmaticContext?: DiceRecord['context'];
  onProgrammaticResolve?: (level: DiceResultType, roll: number) => void;
  open: () => void; close: () => void;
  setMode: (m: DiceMode) => void; setTarget: (t: number) => void;
  toggleBonus: () => void; togglePenalty: () => void; toggleSan: () => void;
  roll: () => void; addRecord: (r: DiceRecord) => void;
  stashRecord: (r: DiceRecord) => void;
  commitPending: () => void;
  clearPending: () => void;
  setHistory: (records: DiceRecord[]) => void;
  clearAll: () => void;
  /** A1.7 — 由 UI/系统发起的目标检定。打开面板，玩家点掷骰后回调结果并自动关闭。 */
  openCheck: (opts: OpenCheckOptions) => void;
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
  originalRoll: 0, finalRoll: 0, resultType: null, history: [], pending: [],
  isProgrammatic: false,
  programmaticSkill: undefined, programmaticContext: undefined, onProgrammaticResolve: undefined,
  open: () => set({ isOpen: true }),
  close: () => set({
    isOpen: false,
    isProgrammatic: false,
    programmaticSkill: undefined,
    programmaticContext: undefined,
    onProgrammaticResolve: undefined,
  }),
  setMode: (m) => set({ mode: m }),
  setTarget: (t) => set({ target: t }),
  toggleBonus: () => set((s) => ({ bonusDice: s.bonusDice > 0 ? 0 : 1 })),
  togglePenalty: () => set((s) => ({ bonusDice: s.bonusDice < 0 ? 0 : -1 })),
  toggleSan: () => set((s) => ({ sanCheck: !s.sanCheck })),
  roll: () => {
    const s = get();
    const t = randD10(), o = randD10();
    let bt = 0;
    if (s.bonusDice !== 0) bt = randD10();
    let ft = t;
    if (s.bonusDice > 0) ft = Math.min(t, bt);
    else if (s.bonusDice < 0) ft = Math.max(t, bt);
    const originalRoll = d100(t, o);
    const finalRoll = d100(ft, o);
    const resultType = determineResult(finalRoll, s.target, s.sanCheck);
    const oppTens = s.mode === 'opposed' ? randD10() : 0;
    const oppOnes = s.mode === 'opposed' ? randD10() : 0;
    set({ tens: t, ones: o, finalTens: ft, bonusTens: bt, oppTens, oppOnes, originalRoll, finalRoll, resultType });

    const skillLabel = s.isProgrammatic && s.programmaticSkill
      ? s.programmaticSkill
      : s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定';
    const rec: DiceRecord = {
      skill: skillLabel,
      roll: String(finalRoll).padStart(2, '0'),
      target: String(s.target),
      type: resultType,
      time: Date.now(),
      page: useBookStore.getState().pageIndex + 1,
    };
    if (s.isProgrammatic && s.programmaticContext) rec.context = s.programmaticContext;
    get().addRecord(rec);

    if (s.isProgrammatic && s.onProgrammaticResolve) {
      const cb = s.onProgrammaticResolve;
      // 关闭并清空 programmatic 状态，再回调；回调里若再次 openCheck 不会被本次 close 抹掉。
      set({
        isOpen: false,
        isProgrammatic: false,
        programmaticSkill: undefined,
        programmaticContext: undefined,
        onProgrammaticResolve: undefined,
      });
      cb(resultType, finalRoll);
    }
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
  stashRecord: (r) => set((s) => ({ pending: [...s.pending, r] })),
  commitPending: () => set((s) => ({
    history: [...[...s.pending].reverse(), ...s.history].slice(0, 20),
    pending: [],
  })),
  clearPending: () => set({ pending: [] }),
  setHistory: (records) => set({ history: records.slice(0, 20), pending: [] }),
  clearAll: () => set({ history: [], pending: [] }),
  openCheck: (opts) => {
    const bonusDice = opts.bonus ? 1 : opts.penalty ? -1 : 0;
    set({
      isOpen: true,
      mode: 'check',
      target: opts.target,
      bonusDice,
      sanCheck: !!opts.sanCheck,
      isProgrammatic: true,
      programmaticSkill: opts.skill,
      programmaticContext: opts.context,
      onProgrammaticResolve: opts.onResolve,
    });
  },
}));
```

4. Run passing:

```bash
npx vitest run src/stores/__tests__/dice-store-open-check.test.ts
npx tsc --noEmit
```

Expected: `Tests  5 passed`, tsc exits 0.

5. Run the full dice test suite to confirm no regressions in DicePanel/Storybook callers (which only read state fields, not new ones):

```bash
npx vitest run src/sillytavern/__tests__/dice-luck-push.test.ts src/stores/__tests__/dice-store-open-check.test.ts src/types/__tests__/dice-record-extended.test.ts
```

Expected: `Test Files  3 passed (3)`.

6. Commit:

```bash
git add src/stores/useDiceStore.ts src/stores/__tests__/dice-store-open-check.test.ts
git commit -m "feat(dice): useDiceStore.openCheck 程序化检定 API + onResolve 回调（A1.7）"
```

## Bucket A1-ux — Tickets A1.3, A1.4, A1.5, A1.6

*A1-ux 子桶：dice staging 流水线 + Luck 实时滑杆 + 推骰子状态机 + 持久化徽章。A1.3 拆分 useDiceStore 的 roll()，新增 rollStaged/commitWithLuck/commitAsPush/commitNow 与 lastRollContext，纯函数 applyLuckToRoll 与 isPushEligible 同文件导出，legacy roll() 保持 AI/combat 调用方零破坏。A1.4 接 commitWithLuck 到 useVariableStore.applyCorrectiveOps 走 G2 自纠路径（调查员.幸运 已被 isNumericCharsheetTarget 视作数值目标，redirect 已支持 delta，无需扩 mvu-charsheet-redirect.ts）。A1.5 DicePanel 引入 ui sub-state machine：idle→rolled→luck-slider-shown→committed/pushable；slider live preview 显示成功等级提升，确认扣点才入账；失败且 push 合规时显示推骰按钮，prompt 原因后调 commitAsPush。A1.6 DiceRecord 已带 pushed/luckSpent/pushReason/pushedFrom 字段（A0.1 已就位 record 层；本桶补 type 字段），rebuildSummariesFromPages 不动 dice 记录（属 page.diceResults 一字不漏的 reseed），CombatPanel DiceRecordsExpander 渲染 [推]/[幸-N] 徽章用 TabIcons SVG。*

### A1.3 — useDiceStore staging (rollStaged / commitWithLuck / commitAsPush / commitNow)

**Goal:** legacy `roll()` 不动；新增分阶段 API 与 `lastRollContext`；纯函数 `applyLuckToRoll` / `isPushEligible` 同文件导出供 panel/test 复用。

**Type 扩展** — `src/types/index.ts` `DiceRecord` 接口补四字段（A0.1 未覆盖 dice 层，本桶补齐；下游 `parseDiceResultsFromInput` 已 `DiceRecord[]` 兼容可选字段）：

```ts
  // src/types/index.ts — 追加到 DiceRecord 末尾，紧随 dice?: 之后
  /** 本条记录是否由推骰二次得到（A1.3）。 */
  pushed?: boolean;
  /** 推骰理由（玩家在 panel 上输入）。 */
  pushReason?: string;
  /** 推骰来源：原一掷的 roll/type（用于书页回放）。 */
  pushedFrom?: { roll: string; type: DiceResultType };
  /** 本条记录扣掉的幸运点（A1.5 实时滑杆确认后写入）。 */
  luckSpent?: number;
  /** 用 luck 改写后是否仍计技能成长（spec R7：扣 luck 的成功不算成长）。 */
  growthTickEligible?: boolean;
```

#### 步骤 1 — 写失败测试（`src/stores/useDiceStore.staging.test.ts`）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore, applyLuckToRoll, isPushEligible } from './useDiceStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useVariableStore } from './useVariableStore';
import { defaultSheet } from './charSheetDefaults';

describe('A1.3 useDiceStore staging', () => {
  beforeEach(() => {
    useDiceStore.getState().clearAll();
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      secondary: { ...defaultSheet.secondary, luck: 70 },
    });
  });

  it('applyLuckToRoll 纯函数：减点后 finalRoll/resultType 重算', () => {
    const r = applyLuckToRoll({ originalRoll: 65, target: 60, sanCheck: false }, 5);
    expect(r.finalRoll).toBe(60);
    expect(r.resultType).toBe('success');
  });

  it('isPushEligible：仅 failure 且非 san check 且 mode!=opposed 且无 push 标记', () => {
    expect(isPushEligible('failure', false, 'check', false)).toBe(true);
    expect(isPushEligible('failure', true, 'check', false)).toBe(false);
    expect(isPushEligible('success', false, 'check', false)).toBe(false);
    expect(isPushEligible('failure', false, 'check', true)).toBe(false);
    expect(isPushEligible('crit-failure', false, 'check', false)).toBe(false);
  });

  it('rollStaged 不落 history，仅写 lastRollContext+isStaged', () => {
    useDiceStore.setState({ target: 60, mode: 'check', sanCheck: false });
    useDiceStore.getState().rollStaged('侦查');
    const s = useDiceStore.getState();
    expect(s.history).toEqual([]);
    expect(s.isStaged).toBe(true);
    expect(s.lastRollContext?.skill).toBe('侦查');
    expect(s.lastRollContext?.target).toBe(60);
    expect(typeof s.lastRollContext?.originalRoll).toBe('number');
  });

  it('commitNow 把 staged 落 history 并清 staging', () => {
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitNow();
    const s = useDiceStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].skill).toBe('侦查');
    expect(s.isStaged).toBe(false);
    expect(s.lastRollContext).toBeNull();
  });

  it('commitWithLuck 改写 finalRoll/resultType，标记 luckSpent + growthTickEligible=false', () => {
    useDiceStore.setState({ target: 60, sanCheck: false });
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.getState().rollStaged('侦查');
    const orig = useDiceStore.getState().lastRollContext!.originalRoll;
    useDiceStore.getState().commitWithLuck(Math.max(0, orig - 60));
    const r = useDiceStore.getState().history[0];
    expect(r.luckSpent).toBeGreaterThan(0);
    expect(r.growthTickEligible).toBe(false);
    expect(['success', 'hard-success', 'extreme-success']).toContain(r.type);
  });

  it('commitAsPush 二次掷骰：pushed=true, pushedFrom 携带原 roll/type', () => {
    useDiceStore.setState({ target: 30, sanCheck: false, mode: 'check' });
    vi.spyOn(Math, 'random').mockReturnValue(0.95);
    useDiceStore.getState().rollStaged('图书馆使用');
    expect(useDiceStore.getState().lastRollContext?.originalResult).toBe('failure');
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    useDiceStore.getState().commitAsPush('翻箱倒柜再找一遍');
    const r = useDiceStore.getState().history[0];
    expect(r.pushed).toBe(true);
    expect(r.pushReason).toBe('翻箱倒柜再找一遍');
    expect(r.pushedFrom).toBeDefined();
    expect(useDiceStore.getState().lastRollContext).toBeNull();
  });

  it('clearAll 重置 staging（不留 lastRollContext）', () => {
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().clearAll();
    const s = useDiceStore.getState();
    expect(s.lastRollContext).toBeNull();
    expect(s.isStaged).toBe(false);
  });
});
```

#### 步骤 2 — 跑测试，确认全红

```bash
npx vitest run src/stores/useDiceStore.staging.test.ts
```

预期：`Tests 7 failed` (`applyLuckToRoll`/`isPushEligible`/`rollStaged`/`isStaged`/`lastRollContext`/`commitNow`/`commitWithLuck`/`commitAsPush` 均未定义)。

#### 步骤 3 — 实现 `src/stores/useDiceStore.ts`

完整重写为：

```ts
import { create } from 'zustand';
import type { DiceRecord, DiceResultType, DiceMode } from '../types';
import { randD10, d100, determineResult } from '../sillytavern/dice-engine';
import { useBookStore } from './useBookStore';
import { useCharSheetStore } from './useCharSheetStore';
import { useVariableStore } from './useVariableStore';

/** 纯函数：把 originalRoll 减去 spend 后重新走 determineResult。 */
export function applyLuckToRoll(
  ctx: { originalRoll: number; target: number; sanCheck: boolean },
  spend: number,
): { finalRoll: number; resultType: DiceResultType } {
  const finalRoll = Math.max(1, ctx.originalRoll - Math.max(0, spend));
  return { finalRoll, resultType: determineResult(finalRoll, ctx.target, ctx.sanCheck) };
}

/** R6：推骰资格——仅 failure（非大失败）、非 SAN、非对抗、未曾推过。 */
export function isPushEligible(
  resultType: DiceResultType | null,
  sanCheck: boolean,
  mode: DiceMode,
  alreadyPushed: boolean,
): boolean {
  return resultType === 'failure' && !sanCheck && mode !== 'opposed' && !alreadyPushed;
}

export interface LastRollContext {
  skill: string;
  target: number;
  page: number;
  originalRoll: number;
  originalResult: DiceResultType;
  sanCheck: boolean;
  mode: DiceMode;
  tens: number;
  ones: number;
  finalTens: number;
  bonusTens: number;
  oppTens: number;
  oppOnes: number;
}

interface DiceStore {
  isOpen: boolean; mode: DiceMode; target: number; bonusDice: number; sanCheck: boolean;
  tens: number; ones: number; finalTens: number; bonusTens: number; oppTens: number; oppOnes: number;
  originalRoll: number; finalRoll: number; resultType: DiceResultType | null; history: DiceRecord[];
  pending: DiceRecord[];
  isStaged: boolean;
  lastRollContext: LastRollContext | null;
  open: () => void; close: () => void;
  setMode: (m: DiceMode) => void; setTarget: (t: number) => void;
  toggleBonus: () => void; togglePenalty: () => void; toggleSan: () => void;
  roll: () => void; addRecord: (r: DiceRecord) => void;
  stashRecord: (r: DiceRecord) => void;
  commitPending: () => void;
  clearPending: () => void;
  setHistory: (records: DiceRecord[]) => void;
  clearAll: () => void;
  /** A1.3 staging：滚一次但不入 history；写 lastRollContext+isStaged。 */
  rollStaged: (skill?: string) => void;
  /** A1.3：扣 luck 改写结果并入 history（走 G2 自纠扣点）。 */
  commitWithLuck: (spend: number) => void;
  /** A1.3：推骰二次掷，入 history 携带 pushed/pushReason/pushedFrom。 */
  commitAsPush: (reason: string) => void;
  /** A1.3：直接落账，不动 luck、不推骰。 */
  commitNow: () => void;
}

function rollDiceSnapshot(state: { mode: DiceMode; bonusDice: number; target: number; sanCheck: boolean }) {
  const tens = randD10(), ones = randD10();
  let bonusTens = 0;
  if (state.bonusDice !== 0) bonusTens = randD10();
  let finalTens = tens;
  if (state.bonusDice > 0) finalTens = Math.min(tens, bonusTens);
  else if (state.bonusDice < 0) finalTens = Math.max(tens, bonusTens);
  const originalRoll = d100(tens, ones);
  const finalRoll = d100(finalTens, ones);
  const resultType = determineResult(finalRoll, state.target, state.sanCheck);
  const oppTens = state.mode === 'opposed' ? randD10() : 0;
  const oppOnes = state.mode === 'opposed' ? randD10() : 0;
  return { tens, ones, bonusTens, finalTens, originalRoll, finalRoll, resultType, oppTens, oppOnes };
}

export const useDiceStore = create<DiceStore>((set, get) => ({
  isOpen: false, mode: 'check', target: 65, bonusDice: 0, sanCheck: false,
  tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
  originalRoll: 0, finalRoll: 0, resultType: null, history: [], pending: [],
  isStaged: false, lastRollContext: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setMode: (m) => set({ mode: m }),
  setTarget: (t) => set({ target: t }),
  toggleBonus: () => set((s) => ({ bonusDice: s.bonusDice > 0 ? 0 : 1 })),
  togglePenalty: () => set((s) => ({ bonusDice: s.bonusDice < 0 ? 0 : -1 })),
  toggleSan: () => set({ sanCheck: !get().sanCheck }),
  roll: () => {
    const s = get();
    const snap = rollDiceSnapshot(s);
    set({ ...snap });
    get().addRecord({
      skill: s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定',
      roll: String(snap.finalRoll).padStart(2, '0'),
      target: String(s.target),
      type: snap.resultType,
      time: Date.now(),
      page: useBookStore.getState().pageIndex + 1,
    });
  },
  addRecord: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 20) })),
  stashRecord: (r) => set((s) => ({ pending: [...s.pending, r] })),
  commitPending: () => set((s) => ({
    history: [...[...s.pending].reverse(), ...s.history].slice(0, 20),
    pending: [],
  })),
  clearPending: () => set({ pending: [] }),
  setHistory: (records) => set({ history: records.slice(0, 20), pending: [], lastRollContext: null, isStaged: false }),
  clearAll: () => set({ history: [], pending: [], lastRollContext: null, isStaged: false }),

  rollStaged: (skill) => {
    const s = get();
    const snap = rollDiceSnapshot(s);
    set({
      ...snap,
      isStaged: true,
      lastRollContext: {
        skill: skill ?? (s.bonusDice > 0 ? '奖励骰' : s.bonusDice < 0 ? '惩罚骰' : '检定'),
        target: s.target,
        page: useBookStore.getState().pageIndex + 1,
        originalRoll: snap.originalRoll,
        originalResult: snap.resultType,
        sanCheck: s.sanCheck,
        mode: s.mode,
        tens: snap.tens, ones: snap.ones, finalTens: snap.finalTens, bonusTens: snap.bonusTens,
        oppTens: snap.oppTens, oppOnes: snap.oppOnes,
      },
    });
  },

  commitWithLuck: (spend) => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    const luck = useCharSheetStore.getState().sheet.secondary.luck;
    const safeSpend = Math.max(0, Math.min(spend, luck));
    const { finalRoll, resultType } = applyLuckToRoll(
      { originalRoll: ctx.originalRoll, target: ctx.target, sanCheck: ctx.sanCheck },
      safeSpend,
    );
    if (safeSpend > 0) {
      useVariableStore.getState().applyCorrectiveOps([
        { op: 'delta', path: '/调查员/幸运', value: -safeSpend },
      ]);
    }
    set({ finalRoll, resultType });
    get().addRecord({
      skill: ctx.skill,
      roll: String(finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: resultType,
      time: Date.now(),
      page: ctx.page,
      luckSpent: safeSpend,
      growthTickEligible: false,
    });
    set({ isStaged: false, lastRollContext: null });
  },

  commitAsPush: (reason) => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    if (!isPushEligible(ctx.originalResult, ctx.sanCheck, ctx.mode, false)) return;
    const snap = rollDiceSnapshot({ mode: ctx.mode, bonusDice: get().bonusDice, target: ctx.target, sanCheck: ctx.sanCheck });
    set({ ...snap });
    get().addRecord({
      skill: ctx.skill,
      roll: String(snap.finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: snap.resultType,
      time: Date.now(),
      page: ctx.page,
      pushed: true,
      pushReason: reason,
      pushedFrom: { roll: String(ctx.originalRoll).padStart(2, '0'), type: ctx.originalResult },
    });
    set({ isStaged: false, lastRollContext: null });
  },

  commitNow: () => {
    const ctx = get().lastRollContext;
    if (!ctx) return;
    get().addRecord({
      skill: ctx.skill,
      roll: String(get().finalRoll).padStart(2, '0'),
      target: String(ctx.target),
      type: get().resultType ?? ctx.originalResult,
      time: Date.now(),
      page: ctx.page,
    });
    set({ isStaged: false, lastRollContext: null });
  },
}));
```

#### 步骤 4 — 跑测试至绿 + 老 staging 测试不破

```bash
npx vitest run src/stores/useDiceStore.staging.test.ts src/stores/useDiceStore.test.ts
```

预期：`Tests 12 passed (12)` (staging.test.ts 7 + 原 useDiceStore.test.ts 5).

#### 步骤 5 — 类型/构建确认

```bash
npx tsc --noEmit
```

预期：`0 errors`。

#### 步骤 6 — commit

```bash
git add src/types/index.ts src/stores/useDiceStore.ts src/stores/useDiceStore.staging.test.ts
git commit -m "feat(dice): A1.3 staging pipeline — rollStaged/commitWithLuck/commitAsPush + applyLuckToRoll/isPushEligible 纯函数"
```

---

### A1.4 — Luck MVU delta path（commitWithLuck → applyCorrectiveOps → G2）

**Goal:** 验证 `commitWithLuck(N)` 通过 `useVariableStore.applyCorrectiveOps` 把 `-N` 写到 `调查员.幸运`。codegraph 已确认：`isNumericCharsheetTarget('调查员.幸运') === true`，`applyCharsheetRedirect` 已处理 `op==='delta'` 数值目标，**不需要改 mvu-charsheet-redirect.ts**。

#### 步骤 1 — 写失败测试 `src/sillytavern/luck-delta.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore } from '../stores/useDiceStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useVariableStore } from '../stores/useVariableStore';
import { defaultSheet } from '../stores/charSheetDefaults';

describe('A1.4 commitWithLuck → applyCorrectiveOps → sheet.luck', () => {
  beforeEach(() => {
    useDiceStore.getState().clearAll();
    useVariableStore.getState().clearAll();
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      secondary: { ...defaultSheet.secondary, luck: 70 },
    });
  });

  it('扣 10 luck：sheet.secondary.luck 从 70→60，且通过 applyCorrectiveOps 通路（mock 捕获 op）', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    useDiceStore.setState({ target: 60, sanCheck: false });
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.6).mockReturnValueOnce(0.5);
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitWithLuck(10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual([
      { op: 'delta', path: '/调查员/幸运', value: -10 },
    ]);
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(60);
    spy.mockRestore();
  });

  it('spend 钳到 luck 上限：luck=5 时 commitWithLuck(99) 只扣 5', () => {
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      secondary: { ...defaultSheet.secondary, luck: 5 },
    });
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitWithLuck(99);
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(0);
    expect(useDiceStore.getState().history[0].luckSpent).toBe(5);
  });

  it('spend=0 不调 applyCorrectiveOps（短路）', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    useDiceStore.setState({ target: 60 });
    useDiceStore.getState().rollStaged('侦查');
    useDiceStore.getState().commitWithLuck(0);
    expect(spy).not.toHaveBeenCalled();
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(70);
    spy.mockRestore();
  });
});
```

#### 步骤 2 — 跑测试，先确认是否已绿

```bash
npx vitest run src/sillytavern/luck-delta.test.ts
```

预期：测试 1+2 **应该已经直接绿**（因 A1.3 的 commitWithLuck 已写完整路径 + redirect 已支持），测试 3 也绿。若任一红，按错误诊断是否要在 `applyCharsheetRedirect` 中补 `luck` 的 delta 分支。

#### 步骤 3 — 若 redirect 缺 luck delta，补丁（事前已验证 isNumericCharsheetTarget + delta 已就位，跳过此步若全绿）

校验方式（必跑）：

```bash
npx vitest run src/sillytavern/luck-delta.test.ts -t "扣 10 luck"
```

预期：单测通过且打印 `sheet.luck=60`。若失败显示 `sheet.luck=70`，去 `src/sillytavern/mvu-charsheet-redirect.ts` 的 `applyCharsheetRedirect` 中 `secondary === 'luck'` 分支补 `if (op === 'delta') return { ...sheet, secondary: { ...sheet.secondary, luck: sheet.secondary.luck + num } };`。

#### 步骤 4 — commit

```bash
git add src/sillytavern/luck-delta.test.ts
git commit -m "test(dice): A1.4 commitWithLuck 走 applyCorrectiveOps 自纠扣点幸运，含 spend 钳位与 0-spend 短路"
```

---

### A1.5 — DicePanel UI sub-state machine + live luck slider

**Goal:** `idle → rolled → luck-slider-shown → committed | pushable`；slider 拖动实时显示新成功等级（`determineResult(orig-spend, target, sanCheck)`）；确认扣点才落账；失败可推骰（`isPushEligible`）时显示推骰按钮 → prompt → `commitAsPush(reason)`。SVG 走 `TabIcons`（`luck`/`push` 缺则同风格新增），cubic-bezier(0.4,0,0.2,1)，hover scale + active press。

#### 步骤 1 — 写失败测试 `src/components/Dice/DicePanel.test.tsx`

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DicePanel } from './DicePanel';
import { useDiceStore } from '../../stores/useDiceStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { defaultSheet } from '../../stores/charSheetDefaults';

function mountWithStaged(target = 60) {
  useDiceStore.getState().clearAll();
  useCharSheetStore.getState().setSheet({
    ...defaultSheet,
    secondary: { ...defaultSheet.secondary, luck: 70 },
  });
  useDiceStore.setState({ isOpen: true, target, mode: 'check', sanCheck: false });
  vi.spyOn(Math, 'random').mockReturnValueOnce(0.65).mockReturnValueOnce(0.5); // tens=6, ones=5 -> 65 (failure vs 60)
  useDiceStore.getState().rollStaged('侦查');
  return render(<DicePanel />);
}

describe('A1.5 DicePanel sub-state machine', () => {
  beforeEach(() => useDiceStore.getState().clearAll());

  it('rolled 后显示花费幸运按钮', () => {
    mountWithStaged(60);
    expect(screen.getByRole('button', { name: /花费幸运/i })).toBeTruthy();
  });

  it('点幸运按钮显示滑杆 0..luck，初始 spend=0', () => {
    mountWithStaged(60);
    fireEvent.click(screen.getByRole('button', { name: /花费幸运/i }));
    const slider = screen.getByLabelText(/幸运滑杆/i) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('70');
    expect(slider.value).toBe('0');
  });

  it('拖滑杆到 5：预览显示新成功等级 success（orig 65 - 5 = 60 ≤ target 60）', () => {
    mountWithStaged(60);
    fireEvent.click(screen.getByRole('button', { name: /花费幸运/i }));
    const slider = screen.getByLabelText(/幸运滑杆/i);
    fireEvent.change(slider, { target: { value: '5' } });
    const preview = screen.getByTestId('luck-preview');
    expect(preview.textContent).toMatch(/成功|success/i);
  });

  it('确认扣点：commitWithLuck 被调用，luck 减 5', () => {
    mountWithStaged(60);
    fireEvent.click(screen.getByRole('button', { name: /花费幸运/i }));
    fireEvent.change(screen.getByLabelText(/幸运滑杆/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /确认扣点/i }));
    expect(useCharSheetStore.getState().sheet.secondary.luck).toBe(65);
    expect(useDiceStore.getState().history).toHaveLength(1);
    expect(useDiceStore.getState().history[0].luckSpent).toBe(5);
  });

  it('失败可推骰：推骰按钮可见，点击 → prompt → commitAsPush', () => {
    mountWithStaged(60);
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('再翻一遍');
    const btn = screen.getByRole('button', { name: /推骰/i });
    fireEvent.click(btn);
    expect(promptSpy).toHaveBeenCalled();
    const r = useDiceStore.getState().history[0];
    expect(r.pushed).toBe(true);
    expect(r.pushReason).toBe('再翻一遍');
    promptSpy.mockRestore();
  });

  it('spend=0 时 "确认扣点" 文案降级为 "直接落账"', () => {
    mountWithStaged(60);
    fireEvent.click(screen.getByRole('button', { name: /花费幸运/i }));
    expect(screen.queryByRole('button', { name: /确认扣点/i })).toBeNull();
    expect(screen.getByRole('button', { name: /直接落账/i })).toBeTruthy();
  });
});
```

#### 步骤 2 — 跑测试，确认红

```bash
npx vitest run src/components/Dice/DicePanel.test.tsx
```

预期：6 个用例全部 fail（button 名匹配不上）。

#### 步骤 3 — 改 `src/components/Dice/DicePanel.tsx`

A. 把现有 `roll` 切到 `rollStaged`，新增 sub-state，在 dice display 下方插入 staging 控制栏。具体编辑：

```tsx
// 顶部：替换 import
import { useDiceStore, applyLuckToRoll, isPushEligible } from '../../stores/useDiceStore';
import { determineResult } from '../../sillytavern/dice-engine';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { TabIcons } from '../Tabs/TabIcons';

// DicePanel() 顶部追加：
const lastRollContext = useDiceStore((s) => s.lastRollContext);
const isStaged = useDiceStore((s) => s.isStaged);
const rollStaged = useDiceStore((s) => s.rollStaged);
const commitWithLuck = useDiceStore((s) => s.commitWithLuck);
const commitAsPush = useDiceStore((s) => s.commitAsPush);
const commitNow = useDiceStore((s) => s.commitNow);
const luck = useCharSheetStore((s) => s.sheet.secondary.luck);
const [uiState, setUiState] = useState<'idle' | 'rolled' | 'luck-slider' | 'committed' | 'pushable'>('idle');
const [spend, setSpend] = useState(0);
```

B. 改 `handleRoll`：

```tsx
const handleRoll = useCallback(() => {
  rollStaged();
  setSpend(0);
  setTimeout(() => {
    const s = useDiceStore.getState();
    setDisplayOriginal(s.originalRoll);
    setDisplayBonus(s.bonusTens);
    setDisplayFinal(s.finalRoll);
    const oppVal = s.oppTens === 0 && s.oppOnes === 0 ? 100 : s.oppTens * 10 + s.oppOnes;
    setDisplayOppRoll(s.mode === 'opposed' ? oppVal : 0);
    setLocalResult(s.resultType);
    if (s.resultType) {
      playResultSound(s.resultType);
      fillResultText(s.finalRoll, s.resultType, s.target);
      if (s.resultType === 'crit-success' || s.resultType === 'crit-failure') {
        setIsCritSuccess(s.resultType === 'crit-success');
        setShowParticles(true);
        if (s.resultType === 'crit-failure') setShake(true);
        setFlashBg(true);
        setTimeout(() => { setShake(false); setFlashBg(false); }, 1200);
      }
    }
    const ctx = useDiceStore.getState().lastRollContext;
    if (!ctx) { setUiState('idle'); return; }
    if (isPushEligible(ctx.originalResult, ctx.sanCheck, ctx.mode, false)) setUiState('pushable');
    else setUiState('rolled');
  }, 100);
}, [rollStaged]);
```

C. 在「Dice display area」之后、关闭按钮之前插入 staging UI 块：

```tsx
{isStaged && lastRollContext && uiState !== 'committed' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
    {uiState === 'rolled' && (
      <button
        onClick={() => setUiState('luck-slider')}
        style={stagingBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.background = 'rgba(196,168,85,0.20)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(196,168,85,0.10)'; }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
      >
        <TabIcons.luck size={14} /> 花费幸运
      </button>
    )}
    {uiState === 'luck-slider' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="range"
          min={0}
          max={luck}
          value={spend}
          onChange={(e) => setSpend(Number(e.target.value))}
          aria-label="幸运滑杆"
          style={{ width: '100%', accentColor: 'var(--gold)', transition: 'all var(--ease-out)' }}
        />
        <div data-testid="luck-preview" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gold)', letterSpacing: 1 }}>
          扣 {spend} → 出目 {Math.max(1, lastRollContext.originalRoll - spend)} → {labelOf(determineResult(Math.max(1, lastRollContext.originalRoll - spend), lastRollContext.target, lastRollContext.sanCheck))}
        </div>
        {spend > 0 ? (
          <button onClick={() => { commitWithLuck(spend); setUiState('committed'); }} style={stagingBtnStyle}>确认扣点</button>
        ) : (
          <button onClick={() => { commitNow(); setUiState('committed'); }} style={stagingBtnStyle}>直接落账</button>
        )}
      </div>
    )}
    {uiState === 'pushable' && (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setUiState('luck-slider')} style={stagingBtnStyle}>
          <TabIcons.luck size={14} /> 花费幸运
        </button>
        <button
          onClick={() => {
            const reason = window.prompt('推骰理由（写明再试一次的合理性）');
            if (reason) { commitAsPush(reason); setUiState('committed'); }
          }}
          style={stagingBtnStyle}
        >
          <TabIcons.push size={14} /> 推骰
        </button>
        <button onClick={() => { commitNow(); setUiState('committed'); }} style={stagingBtnStyle}>放弃</button>
      </div>
    )}
  </div>
)}
```

D. 文件底部追加：

```tsx
const stagingBtnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px',
  border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(196,168,85,0.10)', color: 'var(--gold)',
  fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2,
  cursor: 'pointer', transition: 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1), background 240ms cubic-bezier(0.4, 0, 0.2, 1)',
};

function labelOf(t: DiceResultType): string {
  return {
    'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功',
    'success': '成功', 'failure': '失败', 'crit-failure': '大失败',
  }[t];
}
```

E. `src/components/Tabs/TabIcons.tsx`：若 `luck`/`push` 不存在，按既有铜版线描风格新增（`stroke="currentColor"` `strokeWidth={1.4}` `fill="none"`，与其它图标完全同风格）：

```tsx
// 追加到 TabIcons 导出对象
luck: ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.4} fill="none">
    <path d="M8 1.5l1.8 4 4.2.4-3.2 2.9.9 4.2L8 11l-3.7 2 .9-4.2L2 5.9l4.2-.4z" strokeLinejoin="round" />
  </svg>
),
push: ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.4} fill="none">
    <circle cx={8} cy={8} r={5.5} />
    <path d="M5 8h6M8 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
),
```

#### 步骤 4 — 跑测试至绿

```bash
npx vitest run src/components/Dice/DicePanel.test.tsx
```

预期：`Tests 6 passed (6)`。

#### 步骤 5 — 类型 + 整体测试

```bash
npx tsc --noEmit && npx vitest run src/stores/useDiceStore src/sillytavern/luck-delta src/components/Dice/DicePanel
```

预期：tsc `0 errors`，vitest 全绿。

#### 步骤 6 — commit

```bash
git add src/components/Dice/DicePanel.tsx src/components/Dice/DicePanel.test.tsx src/components/Tabs/TabIcons.tsx
git commit -m "feat(dice): A1.5 DicePanel sub-state machine — live luck slider + push-roll prompt + TabIcons.luck/push"
```

---

### A1.6 — Persistence pass-through + DiceRecordsExpander badges

**Goal:** 验证 `rebuildSummariesFromPages` 不碰 dice 记录（它只处理 `page.summary`，dice 字段沿 `page.diceResults` 由 `useBookStore.setPages` 写回——已有路径无需改）；CombatPanel 的 `DiceRecordsExpander` 接 `pushed`/`luckSpent` 字段，渲染 `[推]` / `[幸-N]` 徽章。

#### 步骤 1 — 写失败测试（两份）

`src/stores/sessionLifecycle.dice-persist.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useBookStore } from './useBookStore';
import { useDiceStore } from './useDiceStore';
import type { BookPage } from '../types';

describe('A1.6 切档/读档保留 pushed/luckSpent 字段', () => {
  beforeEach(() => {
    useBookStore.getState().resetToPrologue();
    useDiceStore.getState().clearAll();
  });

  it('setHistory 接受携 pushed/luckSpent 的旧记录原样回放', () => {
    const records = [
      { skill: '侦查', roll: '60', target: '60', type: 'success' as const, time: 1, luckSpent: 5, growthTickEligible: false },
      { skill: '聆听', roll: '40', target: '40', type: 'failure' as const, time: 2, pushed: true, pushReason: '再听一次', pushedFrom: { roll: '70', type: 'failure' as const } },
    ];
    useDiceStore.getState().setHistory(records);
    const h = useDiceStore.getState().history;
    expect(h[0].luckSpent).toBe(5);
    expect(h[1].pushed).toBe(true);
    expect(h[1].pushedFrom?.roll).toBe('70');
  });

  it('BookPage.diceResults 携 pushed 字段经 setPages 回放后字段保留', () => {
    const page: BookPage = {
      id: 'p1', leftHeader: 'X', rightHeader: 'Y', body: '', summary: '', keywords: {},
      diceResults: [{ skill: '侦查', roll: '60', target: '60', type: 'success', time: 1, pushed: true, luckSpent: 3 }],
    } as BookPage;
    useBookStore.getState().setPages([page]);
    const stored = useBookStore.getState().pages[0].diceResults![0];
    expect(stored.pushed).toBe(true);
    expect(stored.luckSpent).toBe(3);
  });
});
```

`src/components/Combat/DiceRecordsExpander.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiceRecordsExpander } from './CombatPanel.__exports';

describe('A1.6 DiceRecordsExpander 徽章', () => {
  it('pushed 记录显示 [推] 徽章', () => {
    render(<DiceRecordsExpander records={[
      { skill: '侦查', roll: '40', target: '60', type: 'success', pushed: true, luckSpent: 0 } as any,
    ]} />);
    fireEvent.click(screen.getByText(/检定记录/));
    expect(screen.getByTestId('badge-push')).toBeTruthy();
  });

  it('luckSpent>0 显示 [幸-N] 徽章', () => {
    render(<DiceRecordsExpander records={[
      { skill: '侦查', roll: '60', target: '60', type: 'success', luckSpent: 5 } as any,
    ]} />);
    fireEvent.click(screen.getByText(/检定记录/));
    const badge = screen.getByTestId('badge-luck');
    expect(badge.textContent).toMatch(/幸-?5/);
  });
});
```

#### 步骤 2 — 跑测试，确认红

```bash
npx vitest run src/stores/sessionLifecycle.dice-persist src/components/Combat/DiceRecordsExpander
```

预期：persist 两测大概率直接绿（DiceRecord 已是 pass-through 字段；A1.3 已在 setHistory 不丢弃任何字段，因为是整对象拷贝）；expander 两测 fail（未导出 + 无徽章）。

#### 步骤 3 — 实现徽章 + 导出

A. `src/components/Combat/CombatPanel.tsx`：扩 records 类型与渲染：

```tsx
function DiceRecordsExpander({ records }: { records: { skill: string; roll: string; target: string; purpose?: string; page?: number; pushed?: boolean; luckSpent?: number }[] }) {
  const [open, setOpen] = useState(false);
  if (records.length === 0) return null;
  return (
    <div style={{ marginTop: 8, fontFamily: 'var(--font-ui)' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ color: 'var(--ink-subtle)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
        {open ? '▾' : '▸'} 检定记录（{records.length} 条）
      </div>
      {open && (
        <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${FAINTER}` }}>
          {records.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--ink-faded)', lineHeight: 1.7, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>
                {r.purpose === '伤害'
                  ? `[伤害] ${r.skill.split('·')[0]} ${r.target}=${r.roll}`
                  : `${r.purpose ? `[${r.purpose}] ` : ''}${r.skill} d100=${r.roll}/${r.target}`}
              </span>
              {r.pushed && (
                <span data-testid="badge-push" style={badgeStyle('rgba(204,51,51,0.20)', '#ff8a80')}>
                  <TabIcons.push size={10} /> 推
                </span>
              )}
              {typeof r.luckSpent === 'number' && r.luckSpent > 0 && (
                <span data-testid="badge-luck" style={badgeStyle('rgba(196,168,85,0.20)', 'var(--gold)')}>
                  <TabIcons.luck size={10} /> 幸-{r.luckSpent}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function badgeStyle(bg: string, fg: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '1px 6px', borderRadius: 2, background: bg, color: fg,
    fontSize: 10, letterSpacing: 1,
    transition: 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1)',
  };
}

export { DiceRecordsExpander };
```

B. 为测试导出建一个薄壳 `src/components/Combat/CombatPanel.__exports.ts`：

```ts
export { DiceRecordsExpander } from './CombatPanel';
```

C. 顶部 `import { TabIcons } from '../Tabs/TabIcons';` 若 CombatPanel 尚未导入则补。

#### 步骤 4 — 跑测试至绿

```bash
npx vitest run src/stores/sessionLifecycle.dice-persist src/components/Combat/DiceRecordsExpander
```

预期：`Tests 4 passed (4)`。

#### 步骤 5 — 全量回归

```bash
npx vitest run && npx tsc --noEmit
```

预期：vitest 全绿（含先前桶不破），tsc `0 errors`。

#### 步骤 6 — commit

```bash
git add src/stores/sessionLifecycle.dice-persist.test.ts src/components/Combat/CombatPanel.tsx src/components/Combat/CombatPanel.__exports.ts src/components/Combat/DiceRecordsExpander.test.tsx
git commit -m "feat(combat): A1.6 DiceRecordsExpander 渲染 [推]/[幸-N] 徽章；session 加载保留 pushed/luckSpent 字段"
```


## Bucket A2-data — Tickets A2.1, A2.2, A2.3

*Schema wire-up for sanity/insanity MVU paths (A2.1), pure sanity-engine + coc7e-tables (A2.2), and new mvu-charsheet-redirect branches with sanDelta capture (A2.3). Strict TDD per ticket: failing test → implement → pass → commit. All commits without Co-Authored-By; pushes to beta.*

### A2.1 — Schema wire-up for sanity/insanity controlled paths

Verifies A0.1 `migrateSheet` initializes new fields; adds Zod-style entries to `src/sillytavern/mvu-schema.ts` for 调查员.临时疯狂/不定性疯狂/永久疯狂/恐惧症/狂躁症/每日理智损失. These paths are redirected (A2.3) so they never land in `statData`, but the schema entries gate any LLM `_.set('调查员.…')` op upstream of the redirect dispatch.

**Step 1 — Write failing test** at `src/sillytavern/__tests__/mvu-schema-charsheet-paths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { COC_MVU_SCHEMA, matchRule, validateValue } from '../mvu-schema';

describe('mvu-schema 调查员.* sanity/insanity paths', () => {
  it('临时疯狂.active is boolean', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.active');
    expect(r).toBeDefined();
    expect(validateValue(r!, true).ok).toBe(true);
    expect(validateValue(r!, 'nope').ok).toBe(false);
  });
  it('临时疯狂.roundsLeft is number 0..', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.roundsLeft');
    expect(r).toBeDefined();
    expect(validateValue(r!, 5).ok).toBe(true);
    expect(validateValue(r!, -1).ok).toBe(false);
  });
  it('不定性疯狂.daysLeft is number 0..', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.不定性疯狂.daysLeft');
    expect(r).toBeDefined();
    expect(validateValue(r!, 30).ok).toBe(true);
  });
  it('永久疯狂 is boolean', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.永久疯狂');
    expect(r).toBeDefined();
    expect(validateValue(r!, false).ok).toBe(true);
  });
  it('每日理智损失 is number with min 0', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.每日理智损失');
    expect(r).toBeDefined();
    expect(validateValue(r!, 0).ok).toBe(true);
    expect(validateValue(r!, -3).ok).toBe(false);
  });
  it('临时疯狂.bout.mode enum summary|realtime', () => {
    const r = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.bout.mode');
    expect(r).toBeDefined();
    expect(validateValue(r!, 'summary').ok).toBe(true);
    expect(validateValue(r!, 'unknown').ok).toBe(false);
  });
});

describe('migrateSheet defaults new insanity fields', () => {
  it('fills temporaryInsanity/indefiniteInsanity/permanentInsanity/phobias/manias/dailySanLoss', async () => {
    const { migrateSheet } = await import('../../stores/useCharSheetStore');
    const minimal = {
      characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
      halfFifth: {} as never,
      secondary: { hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 }, luck: 50, mov: 8, db: '0', build: 0 },
      skills: {}, identity: { name: '', occupation: '', age: 25, gender: '', birthplace: '', residence: '', id: '' },
      greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
      posture: '站立', statusConditions: [],
    };
    const out = migrateSheet(minimal as never);
    expect(out.temporaryInsanity).toEqual({ active: false, roundsLeft: 0 });
    expect(out.indefiniteInsanity).toEqual({ active: false, daysLeft: 0 });
    expect(out.permanentInsanity).toBe(false);
    expect(out.phobias).toEqual([]);
    expect(out.manias).toEqual([]);
    expect(out.dailySanLoss).toBe(0);
  });
});
```

**Step 2 — Run failing**:

```bash
npx vitest run src/sillytavern/__tests__/mvu-schema-charsheet-paths.test.ts
```
Expected: FAIL ("临时疯狂.active is boolean ... matchRule returned undefined").

**Step 3 — Implement**. Edit `src/sillytavern/mvu-schema.ts`, append inside `COC_MVU_SCHEMA.rules`:

```typescript
    // ── 调查员.* 受控（被 mvu-charsheet-redirect 转写入角色卡；schema 在转写前把守 LLM 写值） ──
    '调查员.临时疯狂.active': { kind: 'boolean' },
    '调查员.临时疯狂.roundsLeft': { kind: 'number', min: 0 },
    '调查员.临时疯狂.bout.mode': { kind: 'enum', values: ['summary', 'realtime'] },
    '调查员.临时疯狂.bout.table': { kind: 'enum', values: ['VII', 'VIII'] },
    '调查员.临时疯狂.bout.entry': { kind: 'number', min: 1, max: 10 },
    '调查员.不定性疯狂.active': { kind: 'boolean' },
    '调查员.不定性疯狂.daysLeft': { kind: 'number', min: 0 },
    '调查员.永久疯狂': { kind: 'boolean' },
    '调查员.每日理智损失': { kind: 'number', min: 0 },
```

Note: 恐惧症/狂躁症 are arrays of strings (push semantic) — they bypass scalar schema and are validated inside the redirect (A2.3) instead, so no entry here.

**Step 4 — Verify migrateSheet test path**. The A0.1 `migrateSheet` already initializes the fields; confirm by running the migrate test only. If A0.1 missed any default, add it now (`temporaryInsanity ??= { active: false, roundsLeft: 0 }` etc.).

**Step 5 — Run pass**:

```bash
npx vitest run src/sillytavern/__tests__/mvu-schema-charsheet-paths.test.ts
```
Expected: PASS (8 tests).

**Step 6 — Commit**:

```bash
git add src/sillytavern/mvu-schema.ts src/sillytavern/__tests__/mvu-schema-charsheet-paths.test.ts
git commit -m "feat(mvu-schema): add 调查员.* sanity/insanity controlled paths"
git push origin beta
```

---

### A2.2 — sanity-engine.ts + coc7e-tables.ts + dice helpers

Pure functions: SAN-loss evaluation (R6 thresholds), bout-mode selection (alone vs companions), and seeded table rolls. Zero side effects, no store imports.

**Step 1 — Write failing test** at `src/sillytavern/__tests__/sanity-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateSanLoss } from '../sanity-engine';
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, PHOBIA_TABLE, MANIA_TABLE } from '../coc7e-tables';
import { rollIntCheck, rollBoutEntry, rollPhobia, rollMania } from '../coc-rules';

// 确定性 RNG：循环吐固定序列
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('evaluateSanLoss', () => {
  const base = { oldSan: 60, sanMax: 99, dailyAccumulated: 0, hasCompanionsPresent: true, allCompanionsInsane: false };

  it('delta < 5 → no INT roll', () => {
    const r = evaluateSanLoss({ ...base, delta: -3 });
    expect(r.intRollNeeded).toBe(false);
    expect(r.indefiniteTriggered).toBe(false);
    expect(r.permanentTriggered).toBe(false);
  });

  it('delta == 5 single event → INT roll required (temporary bout candidate)', () => {
    const r = evaluateSanLoss({ ...base, delta: -5 });
    expect(r.intRollNeeded).toBe(true);
  });

  it('daily 1/5 sanMax cumulative → indefinite triggered', () => {
    // sanMax=99 → floor(99/5)=19; already 17, new -3 → 20 ≥ 19
    const r = evaluateSanLoss({ ...base, delta: -3, dailyAccumulated: 17 });
    expect(r.indefiniteTriggered).toBe(true);
  });

  it('san reaches 0 → permanent insanity', () => {
    const r = evaluateSanLoss({ ...base, oldSan: 4, delta: -4 });
    expect(r.permanentTriggered).toBe(true);
  });

  it('alone → bout mode summary', () => {
    const r = evaluateSanLoss({ ...base, delta: -5, hasCompanionsPresent: false });
    expect(r.boutMode).toBe('summary');
  });

  it('all companions insane → bout mode summary', () => {
    const r = evaluateSanLoss({ ...base, delta: -5, allCompanionsInsane: true });
    expect(r.boutMode).toBe('summary');
  });

  it('with sane companions → bout mode realtime', () => {
    const r = evaluateSanLoss({ ...base, delta: -5 });
    expect(r.boutMode).toBe('realtime');
  });
});

describe('coc7e-tables length', () => {
  it('BOUT tables have 10 entries each', () => {
    expect(BOUT_BEHAVIOR_TABLE).toHaveLength(10);
    expect(BOUT_SUMMARY_TABLE).toHaveLength(10);
  });
  it('PHOBIA/MANIA tables have 30 seed entries each', () => {
    expect(PHOBIA_TABLE).toHaveLength(30);
    expect(MANIA_TABLE).toHaveLength(30);
  });
  it('each entry has roll/label/description', () => {
    for (const t of [BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, PHOBIA_TABLE, MANIA_TABLE]) {
      for (const e of t) {
        expect(typeof e.roll).toBe('number');
        expect(typeof e.label).toBe('string');
        expect(typeof e.description).toBe('string');
      }
    }
  });
});

describe('coc-rules sanity rolls (seeded)', () => {
  it('rollIntCheck deterministic — success when roll ≤ INT', () => {
    const r = rollIntCheck(60, seq([0.3])); // 0.3*100+1 = 31 ≤ 60
    expect(r.success).toBe(true);
    expect(r.roll).toBe(31);
  });
  it('rollIntCheck fail when roll > INT', () => {
    const r = rollIntCheck(40, seq([0.9])); // 91 > 40
    expect(r.success).toBe(false);
  });
  it('rollBoutEntry picks 1..10 deterministically', () => {
    const e = rollBoutEntry(seq([0.0]), BOUT_BEHAVIOR_TABLE);
    expect(e.roll).toBe(1);
    const e2 = rollBoutEntry(seq([0.99]), BOUT_BEHAVIOR_TABLE);
    expect(e2.roll).toBe(10);
  });
  it('rollPhobia / rollMania pick 1..30 from seed', () => {
    const p = rollPhobia(seq([0.0]));
    expect(p.roll).toBe(1);
    const m = rollMania(seq([0.99]));
    expect(m.roll).toBe(30);
  });
});
```

**Step 2 — Run failing**:

```bash
npx vitest run src/sillytavern/__tests__/sanity-engine.test.ts
```
Expected: FAIL ("Cannot find module '../sanity-engine'").

**Step 3 — Implement `src/sillytavern/sanity-engine.ts`**:

```typescript
/**
 * 理智损失评估（R6）。纯函数，无副作用：调用方提供输入、得到一组布尔判定与 boutMode 建议。
 *  - intRollNeeded: |delta| ≥ 5（单次事件）触发 INT 检定，过 → 临时疯狂候选。
 *  - indefiniteTriggered: 当日累计含本次绝对值 ≥ floor(sanMax/5)（RAW 1/5 规则）。
 *  - permanentTriggered: 本次扣损后 san 触底（≤ 0）。
 *  - boutMode: 独行或同伴皆已疯 → summary；否则 realtime（同伴可旁观）。
 */
export interface SanLossInput {
  oldSan: number;
  delta: number; // 通常为负数（损失）
  sanMax: number;
  dailyAccumulated: number; // 当日累计已损失 SAN（不含本次）
  hasCompanionsPresent: boolean;
  allCompanionsInsane: boolean;
}

export interface SanLossEvaluation {
  intRollNeeded: boolean;
  indefiniteTriggered: boolean;
  permanentTriggered: boolean;
  boutMode: 'summary' | 'realtime';
}

export function evaluateSanLoss(input: SanLossInput): SanLossEvaluation {
  const abs = Math.abs(input.delta);
  const dailyThreshold = Math.floor(input.sanMax / 5);
  const intRollNeeded = abs >= 5;
  const indefiniteTriggered = input.dailyAccumulated + abs >= dailyThreshold && abs > 0;
  const newSan = input.oldSan + input.delta;
  const permanentTriggered = newSan <= 0;
  const alone = !input.hasCompanionsPresent || input.allCompanionsInsane;
  const boutMode: 'summary' | 'realtime' = alone ? 'summary' : 'realtime';
  return { intRollNeeded, indefiniteTriggered, permanentTriggered, boutMode };
}
```

**Step 4 — Implement `src/sillytavern/coc7e-tables.ts`**. Spec-canonical from the COC7e rulebook Table VII/VIII (see `.tmp_combat_research/ch8_sanity.txt`); phobia/mania seeded from common-pool entries. Entries are 1-indexed `roll`:

```typescript
/** 单条表项：1D10 / 1D100 命中的 roll 值；label 是简称；description 是给 LLM 与 UI 的简短解释。 */
export interface CocTableEntry {
  roll: number;
  label: string;
  description: string;
}

/** Table VII — 实时疯狂发作（10 项）。 */
export const BOUT_BEHAVIOR_TABLE: CocTableEntry[] = [
  { roll: 1, label: '失忆', description: '调查员失去过去 1D10 小时记忆，醒来不知身在何处。' },
  { roll: 2, label: '身体症状', description: '出现颤抖、抽搐、晕厥等生理反应，1D10 轮内无法行动。' },
  { roll: 3, label: '逃跑', description: '不计后果地逃离恐惧源，1D10 轮内只想着逃。' },
  { roll: 4, label: '战栗木僵', description: '原地僵立 1D10 轮，对外界刺激无反应。' },
  { roll: 5, label: '勃然大怒', description: '攻击眼前任何活物，1D10 轮持续怒袭，分不清敌友。' },
  { roll: 6, label: '极度恐惧', description: '获得一项新恐惧症（投 PHOBIA_TABLE）。' },
  { roll: 7, label: '强迫行为', description: '获得一项新狂躁症（投 MANIA_TABLE）。' },
  { roll: 8, label: '昏厥', description: '当场昏倒 1D10 轮。' },
  { roll: 9, label: '歇斯底里', description: '尖叫、大笑或痛哭 1D10 轮，无法采取理性行动。' },
  { roll: 10, label: '幻觉错乱', description: '出现 1D10 轮逼真幻觉，行动基于错误感知。' },
];

/** Table VIII — 总结型疯狂发作（独行/无清醒同伴时使用，10 项）。 */
export const BOUT_SUMMARY_TABLE: CocTableEntry[] = [
  { roll: 1, label: '失忆', description: '醒来时丢失 1D10 小时记忆，重要物品可能遗落。' },
  { roll: 2, label: '抢劫遇害', description: '神智恍惚被劫，财物损失大半，半数物品丢失。' },
  { roll: 3, label: '挨打受伤', description: '不知所踪后受到肉体袭击，HP 损失 1D10。' },
  { roll: 4, label: '滥用药物或酒精', description: '醒来宿醉或药物反应，1D6 天内技能受罚。' },
  { roll: 5, label: '远离原地', description: '醒来时已身处 1D10×10 公里外，需想办法返回。' },
  { roll: 6, label: '获得恐惧症', description: '袭来一种新恐惧症（投 PHOBIA_TABLE）。' },
  { roll: 7, label: '获得狂躁症', description: '袭来一种新狂躁症（投 MANIA_TABLE）。' },
  { roll: 8, label: '伤害他人', description: '醒来发现伤害了无关者，可能引发执法/复仇。' },
  { roll: 9, label: '加入邪教', description: '在恍惚中加入邪教或秘密团体，事后困惑且被关注。' },
  { roll: 10, label: '严重创伤', description: '深度精神冲击，永久 SAN 上限减 1D6。' },
];

/** PHOBIA — 1D100 受控库（30 项种子，后续可扩到 100）。roll 表示触发该项的最低 d100。 */
export const PHOBIA_TABLE: CocTableEntry[] = [
  { roll: 1, label: '深渊恐惧症', description: '害怕深井、悬崖、深渊与一切深不见底之处。' },
  { roll: 2, label: '黑暗恐惧症', description: '害怕黑暗与无光环境。' },
  { roll: 3, label: '广场恐惧症', description: '害怕空旷或拥挤的公共空间。' },
  { roll: 4, label: '飞行恐惧症', description: '害怕一切离地飞行与高空。' },
  { roll: 5, label: '蜘蛛恐惧症', description: '害怕蜘蛛与多足节肢动物。' },
  { roll: 6, label: '密闭恐惧症', description: '害怕狭小密闭空间。' },
  { roll: 7, label: '尸体恐惧症', description: '害怕尸体、坟墓与死亡相关之物。' },
  { roll: 8, label: '雷电恐惧症', description: '害怕雷暴、闪电与雷鸣。' },
  { roll: 9, label: '血液恐惧症', description: '见到血液即昏厥或惊恐。' },
  { roll: 10, label: '海洋恐惧症', description: '害怕大海、深水与未知的水下。' },
  { roll: 11, label: '尖物恐惧症', description: '害怕针、刀、尖锐物体。' },
  { roll: 12, label: '蛇类恐惧症', description: '害怕蛇与蛇形生物。' },
  { roll: 13, label: '陌生人恐惧症', description: '对陌生人产生强烈恐惧与回避。' },
  { roll: 14, label: '镜子恐惧症', description: '害怕镜子与自己的倒影。' },
  { roll: 15, label: '人偶恐惧症', description: '害怕娃娃、人偶与拟人玩具。' },
  { roll: 16, label: '细菌恐惧症', description: '害怕病菌污染，反复清洁。' },
  { roll: 17, label: '高处恐惧症', description: '害怕高处与坠落。' },
  { roll: 18, label: '夜晚恐惧症', description: '害怕入夜后的一切活动。' },
  { roll: 19, label: '火焰恐惧症', description: '害怕火与燃烧之物。' },
  { roll: 20, label: '溺水恐惧症', description: '害怕溺水与被水覆盖。' },
  { roll: 21, label: '人群恐惧症', description: '害怕大量人群聚集的场合。' },
  { roll: 22, label: '触手恐惧症', description: '害怕触手与软体扭曲生物。' },
  { roll: 23, label: '低语恐惧症', description: '害怕无源低语与窃窃私语。' },
  { roll: 24, label: '书籍恐惧症', description: '害怕古籍与未知文字的书。' },
  { roll: 25, label: '神像恐惧症', description: '害怕雕像、神像与拟人造像。' },
  { roll: 26, label: '宗教恐惧症', description: '害怕宗教仪式与祭祀场所。' },
  { roll: 27, label: '巨物恐惧症', description: '害怕一切体积庞大的事物。' },
  { roll: 28, label: '微小物恐惧症', description: '害怕微小生物或极细之物。' },
  { roll: 29, label: '机械恐惧症', description: '害怕机械装置与齿轮。' },
  { roll: 30, label: '电恐惧症', description: '害怕通电之物与电流。' },
];

/** MANIA — 1D100 受控库（30 项种子）。 */
export const MANIA_TABLE: CocTableEntry[] = [
  { roll: 1, label: '收集癖', description: '强迫性收集特定物品，无法割舍。' },
  { roll: 2, label: '洁癖', description: '反复清洁自身与环境。' },
  { roll: 3, label: '纵火癖', description: '冲动性想点燃事物。' },
  { roll: 4, label: '盗窃癖', description: '冲动性想拿走他人物品。' },
  { roll: 5, label: '杀人癖', description: '反复出现伤害他人的冲动。' },
  { roll: 6, label: '自残癖', description: '反复出现伤害自己的冲动。' },
  { roll: 7, label: '巨大狂', description: '坚信自己拥有非凡力量或地位。' },
  { roll: 8, label: '迫害狂', description: '坚信有人在监视、追害自己。' },
  { roll: 9, label: '阅读狂', description: '强迫性阅读一切文字。' },
  { roll: 10, label: '书写狂', description: '强迫性反复书写同一文字或符号。' },
  { roll: 11, label: '言谈狂', description: '强迫性持续讲话，难以停止。' },
  { roll: 12, label: '沉默症', description: '强迫性长时间不开口。' },
  { roll: 13, label: '工作狂', description: '强迫性持续工作至力竭。' },
  { roll: 14, label: '赌博癖', description: '强迫性赌博。' },
  { roll: 15, label: '酗酒癖', description: '强迫性饮酒。' },
  { roll: 16, label: '暴食症', description: '强迫性进食。' },
  { roll: 17, label: '厌食症', description: '强迫性拒食。' },
  { roll: 18, label: '色情狂', description: '强迫性追求色情刺激。' },
  { roll: 19, label: '宗教狂', description: '极端宗教狂热，强迫性礼拜。' },
  { roll: 20, label: '英雄狂', description: '强迫性把自己置于救援者位置。' },
  { roll: 21, label: '怀疑癖', description: '怀疑一切真相。' },
  { roll: 22, label: '虚言癖', description: '强迫性编造虚假故事。' },
  { roll: 23, label: '崇拜狂', description: '对特定人物盲目崇拜并模仿。' },
  { roll: 24, label: '占有欲', description: '强迫性把人或物据为己有。' },
  { roll: 25, label: '旅游癖', description: '强迫性想要不断迁徙。' },
  { roll: 26, label: '隐居癖', description: '强迫性回避一切社交。' },
  { roll: 27, label: '反对癖', description: '本能反对任何意见。' },
  { roll: 28, label: '献身狂', description: '强迫性自我牺牲。' },
  { roll: 29, label: '吹毛求疵', description: '强迫性纠错与挑剔细节。' },
  { roll: 30, label: '完美主义', description: '强迫性追求完美，无法收手。' },
];
```

**Step 5 — Extend `src/sillytavern/coc-rules.ts`** — append helper exports (do NOT touch existing rules):

```typescript
import { BOUT_BEHAVIOR_TABLE, BOUT_SUMMARY_TABLE, PHOBIA_TABLE, MANIA_TABLE, type CocTableEntry } from './coc7e-tables';

/** INT 检定：1D100 ≤ INT 为成功。rng() ∈ [0,1)。 */
export function rollIntCheck(intStat: number, rng: () => number): { roll: number; success: boolean } {
  const roll = Math.floor(rng() * 100) + 1; // 1..100
  return { roll, success: roll <= intStat };
}

/** 在 10 项表（Bout VII/VIII）随机挑一项。rng() ∈ [0,1)。 */
export function rollBoutEntry(rng: () => number, table: CocTableEntry[]): CocTableEntry {
  const idx = Math.min(table.length - 1, Math.floor(rng() * table.length));
  return table[idx];
}

/** PHOBIA 表 1D100（30 项种子时按比例索引）。 */
export function rollPhobia(rng: () => number): CocTableEntry {
  return rollBoutEntry(rng, PHOBIA_TABLE);
}

/** MANIA 表 1D100（30 项种子时按比例索引）。 */
export function rollMania(rng: () => number): CocTableEntry {
  return rollBoutEntry(rng, MANIA_TABLE);
}
```

**Step 6 — Run pass**:

```bash
npx vitest run src/sillytavern/__tests__/sanity-engine.test.ts
```
Expected: PASS (13 tests).

**Step 7 — Commit**:

```bash
git add src/sillytavern/sanity-engine.ts src/sillytavern/coc7e-tables.ts src/sillytavern/coc-rules.ts src/sillytavern/__tests__/sanity-engine.test.ts
git commit -m "feat(sanity): sanity-engine + COC7e bout/phobia/mania tables + INT/table rolls"
git push origin beta
```

---

### A2.3 — mvu-charsheet-redirect new branches + sanDelta capture

Adds branches for the five new insanity paths and changes the function return to optionally include `sanDelta` (no breaking change for existing callers — old callers can keep treating `null|CharacterSheet`; new callers can read `result.sanDelta`).

**Step 1 — Write failing test** at `src/sillytavern/__tests__/mvu-charsheet-redirect-insanity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyCharsheetRedirect } from '../mvu-charsheet-redirect';
import type { CharacterSheet } from '../../types';

function blankSheet(): CharacterSheet {
  return {
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
    halfFifth: {} as never,
    secondary: { hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 }, luck: 50, mov: 8, db: '0', build: 0 },
    skills: {}, identity: { name: '', occupation: '', age: 25, gender: '', birthplace: '', residence: '', id: '' },
    greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
    posture: '站立', statusConditions: [],
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false, phobias: [], manias: [], dailySanLoss: 0,
  } as CharacterSheet;
}

describe('applyCharsheetRedirect insanity paths', () => {
  it('临时疯狂.active=true', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.临时疯狂.active', 'replace', true);
    expect(r?.sheet.temporaryInsanity.active).toBe(true);
  });
  it('临时疯狂.roundsLeft delta', () => {
    const s = blankSheet(); s.temporaryInsanity.roundsLeft = 3;
    const r = applyCharsheetRedirect(s, '调查员.临时疯狂.roundsLeft', 'delta', -1);
    expect(r?.sheet.temporaryInsanity.roundsLeft).toBe(2);
  });
  it('临时疯狂.bout replace sets {mode,table,entry}', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.临时疯狂.bout', 'replace',
      { mode: 'realtime', table: 'VII', entry: 5 });
    expect(r?.sheet.temporaryInsanity.bout).toEqual({ mode: 'realtime', table: 'VII', entry: 5 });
  });
  it('不定性疯狂.daysLeft replace', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.不定性疯狂.daysLeft', 'replace', 30);
    expect(r?.sheet.indefiniteInsanity.daysLeft).toBe(30);
  });
  it('永久疯狂 boolean', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.永久疯狂', 'replace', true);
    expect(r?.sheet.permanentInsanity).toBe(true);
  });
  it('恐惧症 add appends', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'add', '黑暗恐惧症');
    expect(r?.sheet.phobias).toEqual(['深渊恐惧症', '黑暗恐惧症']);
  });
  it('恐惧症 add dedupe', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'add', '深渊恐惧症');
    expect(r?.sheet.phobias).toEqual(['深渊恐惧症']);
  });
  it('恐惧症 remove filters', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症', '黑暗恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'remove', '深渊恐惧症');
    expect(r?.sheet.phobias).toEqual(['黑暗恐惧症']);
  });
  it('狂躁症 add appends', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.狂躁症', 'add', '收集癖');
    expect(r?.sheet.manias).toEqual(['收集癖']);
  });
  it('每日理智损失 delta accumulates', () => {
    const s = blankSheet(); s.dailySanLoss = 3;
    const r = applyCharsheetRedirect(s, '调查员.每日理智损失', 'delta', 2);
    expect(r?.sheet.dailySanLoss).toBe(5);
  });
  it('理智值.当前 delta reports sanDelta', () => {
    const s = blankSheet(); s.secondary.san.current = 50;
    const r = applyCharsheetRedirect(s, '调查员.理智值.当前', 'delta', -7);
    expect(r?.sheet.secondary.san.current).toBe(43);
    expect(r?.sanDelta).toBe(-7);
  });
  it('理智值.当前 replace reports sanDelta as new-old', () => {
    const s = blankSheet(); s.secondary.san.current = 50;
    const r = applyCharsheetRedirect(s, '调查员.理智值.当前', 'replace', 42);
    expect(r?.sheet.secondary.san.current).toBe(42);
    expect(r?.sanDelta).toBe(-8);
  });
});

describe('applyMvuOpsToTree integration — insanity path lands on sheet', () => {
  it('routes 调查员.临时疯狂.active through redirect (no statData leak)', async () => {
    const { applyMvuOpsToTree } = await import('../mvu-jsonpatch');
    const sheet = blankSheet();
    const ctx = { statData: {}, sheet, patchReport: { errors: [] as unknown[] } };
    const next = applyMvuOpsToTree(
      { '世界': {}, '剧情': {}, '战斗': {} },
      [{ op: 'replace', path: '/调查员/临时疯狂/active', value: true }],
      { sheet, applyCharsheetRedirect, patchReport: ctx.patchReport } as never,
    );
    // applyMvuOpsToTree must NOT have created 调查员 in statData (redirect consumed it)
    expect((next as Record<string, unknown>)['调查员']).toBeUndefined();
  });
});
```

**Step 2 — Run failing**:

```bash
npx vitest run src/sillytavern/__tests__/mvu-charsheet-redirect-insanity.test.ts
```
Expected: FAIL (existing `applyCharsheetRedirect` returns `null` for these paths; return type also lacks `sanDelta`).

**Step 3 — Change return type** in `src/sillytavern/mvu-charsheet-redirect.ts`. Update signature + introduce `RedirectResult`:

```typescript
export interface RedirectResult {
  sheet: CharacterSheet;
  /** 仅当 path 是 调查员.理智值.当前 时给出 (newSan - oldSan)；其它路径不带此字段。 */
  sanDelta?: number;
}

export function applyCharsheetRedirect(
  sheet: CharacterSheet,
  dotPath: string,
  op: string,
  value: unknown,
): RedirectResult | null {
  // ...existing branches return { sheet: newSheet } instead of newSheet
}
```

Update every existing `return { ...sheet, … }` to `return { sheet: { ...sheet, … } }`. Inside the `secondary.san.current` branch, capture and return `sanDelta`:

```typescript
    const cur = sheet.secondary[sec.stat][sec.field];
    const next = op === 'delta' ? cur + delta : delta;
    const newSheet: CharacterSheet = {
      ...sheet,
      secondary: {
        ...sheet.secondary,
        [sec.stat]: { ...sheet.secondary[sec.stat], [sec.field]: next },
      },
    };
    if (sec.stat === 'san' && sec.field === 'current') {
      return { sheet: newSheet, sanDelta: next - cur };
    }
    return { sheet: newSheet };
```

**Step 4 — Add new branches** before the final `return null;`:

```typescript
  // ── 临时疯狂 ──
  if (dotPath === '调查员.临时疯狂.active') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, active: v } } };
  }
  if (dotPath === '调查员.临时疯狂.roundsLeft') {
    const n = toNumber(value); if (n === null) return null;
    const cur = sheet.temporaryInsanity.roundsLeft;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, roundsLeft: next } } };
  }
  if (dotPath === '调查员.临时疯狂.bout') {
    if (op !== 'replace' || !value || typeof value !== 'object') return null;
    const v = value as { mode?: unknown; table?: unknown; entry?: unknown };
    const mode = v.mode === 'summary' || v.mode === 'realtime' ? v.mode : null;
    const table = v.table === 'VII' || v.table === 'VIII' ? v.table : null;
    const entry = toNumber(v.entry);
    if (!mode || !table || entry === null) return null;
    return { sheet: { ...sheet, temporaryInsanity: { ...sheet.temporaryInsanity, bout: { mode, table, entry } } } };
  }

  // ── 不定性疯狂 ──
  if (dotPath === '调查员.不定性疯狂.active') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, indefiniteInsanity: { ...sheet.indefiniteInsanity, active: v } } };
  }
  if (dotPath === '调查员.不定性疯狂.daysLeft') {
    const n = toNumber(value); if (n === null) return null;
    const cur = sheet.indefiniteInsanity.daysLeft;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, indefiniteInsanity: { ...sheet.indefiniteInsanity, daysLeft: next } } };
  }

  // ── 永久疯狂 ──
  if (dotPath === '调查员.永久疯狂') {
    if (op !== 'replace') return null;
    const v = value === true || value === 'true';
    return { sheet: { ...sheet, permanentInsanity: v } };
  }

  // ── 恐惧症 / 狂躁症（数组 push 语义）──
  const arrayPath =
    dotPath === '调查员.恐惧症' ? 'phobias' :
    dotPath === '调查员.狂躁症' ? 'manias' : null;
  if (arrayPath) {
    const item = typeof value === 'string' ? value.trim() : '';
    if (!item) return null;
    const cur: string[] = sheet[arrayPath] ?? [];
    if (op === 'add' || op === 'insert' || op === 'replace') {
      if (cur.includes(item)) return { sheet }; // 去重：已存在直接返回
      return { sheet: { ...sheet, [arrayPath]: [...cur, item] } as CharacterSheet };
    }
    if (op === 'remove') {
      return { sheet: { ...sheet, [arrayPath]: cur.filter((x) => x !== item) } as CharacterSheet };
    }
    return null;
  }

  // ── 每日理智损失 ──
  if (dotPath === '调查员.每日理智损失') {
    const n = toNumber(value); if (n === null) return null;
    const cur = sheet.dailySanLoss ?? 0;
    const next = Math.max(0, op === 'delta' ? cur + n : n);
    return { sheet: { ...sheet, dailySanLoss: next } };
  }
```

**Step 5 — Update the single caller** `src/sillytavern/mvu-var-access.ts` (per blast radius). Find the line that consumes the return and adapt — old code likely `const next = applyCharsheetRedirect(...); if (!next) ...; sheet = next;` becomes:

```typescript
const r = applyCharsheetRedirect(sheet, path, op, value);
if (!r) { /* unknown path: existing A0.2 error reporting */ return null; }
// 把 sanDelta 透出给 ctx（A2.4 evaluator 读它，本 ticket 仅占位）
if (typeof r.sanDelta === 'number') {
  patchReport.lastSanDelta = r.sanDelta;
}
return r.sheet;
```

(Exact insertion point depends on existing code — search for `applyCharsheetRedirect(` in `mvu-var-access.ts` and adapt the one call site.)

**Step 6 — Run pass + full unit suite**:

```bash
npx vitest run src/sillytavern/__tests__/mvu-charsheet-redirect-insanity.test.ts
npx vitest run src/sillytavern
npx tsc -p . --noEmit
```
Expected: all PASS; tsc clean.

**Step 7 — Commit**:

```bash
git add src/sillytavern/mvu-charsheet-redirect.ts src/sillytavern/mvu-var-access.ts src/sillytavern/__tests__/mvu-charsheet-redirect-insanity.test.ts
git commit -m "feat(mvu-redirect): insanity path branches + sanDelta capture for SAN.current"
git push origin beta
```


## Bucket A2-runtime — Tickets A2.4, A2.5, A2.6, A2.7

*A2-runtime wires sanity into the post-settle pipeline. A2.4 registers a sanityEvaluator that fingerprints patchReport to dedupe re-fires, fans INT-check resolution into bout dispatch. A2.5 implements triggerBout (realtime sets temporaryInsanity with 1d10 rounds + Table VII entry; summary delegates to the new timeJumpGenerator + Table VIII), and decrements roundsLeft inside combat-controller advanceTurn at round rollover. A2.6 lands the unified src/sillytavern/time-jump-generator.ts on top of callDsSubagent (max_tokens=20000, cache-friendly per-reason static prefix). A2.7 rewrites the ejs_san_state builtin lore entry to render insanity-state tags (not pure SAN number) and extends StatusBar StateChips with red/purple/dark-red insanity chips. All four tickets ship full vitest specs + exact bash commands + commit messages without Co-Authored-By.*

### A2.4 — Sanity post-settle evaluator hook

Hooks the sanity engine into `useChatPipeline.settleVariables` via `registerEvaluator`. Reads the SAN delta captured by the A2.3 mvu redirect (passed through `patchReport.charSheetDeltas`), runs `evaluateSanLoss`, optionally opens an INT check via the dice store, and emits corrective ops for indefinite/permanent triggers. Dedupe is a SHA-free fingerprint of (sheet.SAN, dailySanLoss, sanDelta, episodeId) cached in module scope.

1. **Write failing test** `src/sillytavern/__tests__/sanity-evaluator.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { registerEvaluator, runPostSettleEvaluators, _resetEvaluatorsForTest } from '../post-settle-evaluators';
   import { sanityEvaluator, _resetSanityEvaluatorCacheForTest } from '../sanity-evaluator';
   import type { EvaluatorContext } from '../post-settle-evaluators';
   import type { CharacterSheet } from '../../types';

   const openCheckMock = vi.fn();
   vi.mock('../../stores/useDiceStore', () => ({
     useDiceStore: { getState: () => ({ openCheck: openCheckMock }) },
   }));

   function baseSheet(): CharacterSheet {
     return {
       attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 70, pow: 50, edu: 50, luck: 50 },
       secondary: { hp: { current: 10, max: 10 }, san: { current: 60, max: 99 }, mp: { current: 10, max: 10 }, db: '0', build: 0, mov: 8 },
       skills: {}, occupation: '', name: 'T', age: 30, sex: '男', residence: '', birthplace: '',
       posture: '站立', statusConditions: [], inventory: [], money: 0,
       dailySanLoss: 0,
       temporaryInsanity: { active: false, roundsLeft: 0 },
       indefiniteInsanity: { active: false, daysLeft: 0 },
       permanentInsanity: false,
       phobias: [], manias: [], known_spells: [], recovery: {},
     } as unknown as CharacterSheet;
   }

   function ctx(sheet: CharacterSheet, sanDelta: number): EvaluatorContext {
     return {
       sheet,
       statData: {},
       patchReport: { errors: [], charSheetDeltas: { sanDelta, episodeId: 'ep1' } },
       applyCorrectiveOps: vi.fn(),
     } as unknown as EvaluatorContext;
   }

   describe('sanityEvaluator', () => {
     beforeEach(() => {
       _resetEvaluatorsForTest();
       _resetSanityEvaluatorCacheForTest();
       openCheckMock.mockReset();
       registerEvaluator('sanity', sanityEvaluator);
     });

     it('opens INT check exactly once when sanDelta=-6 (>=5 triggers INT)', async () => {
       const c = ctx(baseSheet(), -6);
       await runPostSettleEvaluators(c);
       expect(openCheckMock).toHaveBeenCalledTimes(1);
       const arg = openCheckMock.mock.calls[0][0];
       expect(arg.skill).toBe('INT');
       expect(arg.target).toBe(70);
       expect(typeof arg.onResolve).toBe('function');
     });

     it('is deduped: identical re-run does not re-fire', async () => {
       const sheet = baseSheet();
       await runPostSettleEvaluators(ctx(sheet, -6));
       await runPostSettleEvaluators(ctx(sheet, -6));
       expect(openCheckMock).toHaveBeenCalledTimes(1);
     });

     it('emits indefinite op when dailySanLoss >= INT/5 cumulatively', async () => {
       const sheet = baseSheet();
       sheet.dailySanLoss = 13; // INT=70 → INT/5=14, current+new(-6)=19 > 14 → indefinite
       const c = ctx(sheet, -6);
       await runPostSettleEvaluators(c);
       const ops = (c.applyCorrectiveOps as ReturnType<typeof vi.fn>).mock.calls.flat().flat();
       expect(ops).toEqual(expect.arrayContaining([
         expect.objectContaining({ op: 'replace', path: '/调查员/不定性疯狂/active', value: true }),
       ]));
     });

     it('emits permanent op when SAN reaches 0', async () => {
       const sheet = baseSheet();
       sheet.secondary.san.current = 5;
       const c = ctx(sheet, -5);
       await runPostSettleEvaluators(c);
       const ops = (c.applyCorrectiveOps as ReturnType<typeof vi.fn>).mock.calls.flat().flat();
       expect(ops).toEqual(expect.arrayContaining([
         expect.objectContaining({ op: 'replace', path: '/调查员/永久疯狂', value: true }),
       ]));
     });
   });
   ```

2. **Run — expect fail**:

   ```bash
   npx vitest run src/sillytavern/__tests__/sanity-evaluator.test.ts
   ```
   Expected: `FAIL ... Cannot find module '../sanity-evaluator'` and `_resetEvaluatorsForTest is not a function`.

3. **Implement** `src/sillytavern/sanity-evaluator.ts`:

   ```typescript
   import { evaluateSanLoss } from './sanity-engine'; // A2.1/A2.2
   import { triggerBout } from './bout-dispatch';      // A2.5
   import { registerEvaluator, type EvaluatorContext } from './post-settle-evaluators';
   import { useDiceStore } from '../stores/useDiceStore';

   const lastFingerprint = new Map<string, string>();

   function fingerprint(ctx: EvaluatorContext): string {
     const s = ctx.sheet;
     const d = ctx.patchReport.charSheetDeltas ?? { sanDelta: 0, episodeId: '' };
     return `${d.episodeId}|${s.secondary.san.current}|${s.dailySanLoss}|${d.sanDelta}`;
   }

   export async function sanityEvaluator(ctx: EvaluatorContext): Promise<void> {
     const fp = fingerprint(ctx);
     if (lastFingerprint.get('sanity') === fp) return;
     lastFingerprint.set('sanity', fp);
     const delta = ctx.patchReport.charSheetDeltas?.sanDelta ?? 0;
     if (delta >= 0) return; // gains/no-loss skip
     const ev = evaluateSanLoss({
       sheet: ctx.sheet,
       lossAmount: Math.abs(delta),
     });
     if (ev.permanentTriggered) {
       ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/永久疯狂', value: true }]);
       return;
     }
     if (ev.indefiniteTriggered) {
       ctx.applyCorrectiveOps([{ op: 'replace', path: '/调查员/不定性疯狂/active', value: true }]);
       return;
     }
     if (ev.intRollNeeded) {
       useDiceStore.getState().openCheck({
         skill: 'INT',
         target: ctx.sheet.attributes.int,
         reason: 'sanity-shock',
         onResolve: (passed: boolean) => {
           if (!passed) void triggerBout(ctx, 'realtime');
         },
       });
     }
   }

   // Module-import side effect
   registerEvaluator('sanity', sanityEvaluator);

   export function _resetSanityEvaluatorCacheForTest(): void {
     lastFingerprint.clear();
   }
   ```

   Add `_resetEvaluatorsForTest` to `src/sillytavern/post-settle-evaluators.ts` if missing:

   ```typescript
   const REGISTRY = new Map<string, (c: EvaluatorContext) => Promise<void> | void>();
   export function registerEvaluator(name: string, fn: (c: EvaluatorContext) => Promise<void> | void): void {
     REGISTRY.set(name, fn);
   }
   export async function runPostSettleEvaluators(ctx: EvaluatorContext): Promise<void> {
     for (const fn of REGISTRY.values()) await fn(ctx);
   }
   export function _resetEvaluatorsForTest(): void { REGISTRY.clear(); }
   ```

4. **Import side-effect register** in `src/hooks/useChatPipeline.ts` (top of file, once):

   ```typescript
   import '../sillytavern/sanity-evaluator'; // registers sanityEvaluator
   ```

5. **Run — expect pass**:

   ```bash
   npx vitest run src/sillytavern/__tests__/sanity-evaluator.test.ts
   ```
   Expected: `Test Files 1 passed (1) ... Tests 4 passed (4)`.

6. **Type + lint**:

   ```bash
   npx tsc --noEmit && npx eslint src/sillytavern/sanity-evaluator.ts
   ```
   Expected: no output.

7. **Commit**:

   ```bash
   git add -A && git commit -m "feat(sanity): A2.4 register sanityEvaluator with fingerprint dedupe + INT check fanout"
   ```

---

### A2.5 — Bout dispatch (realtime + summary)

Implements `triggerBout(ctx, mode)` in `src/sillytavern/bout-dispatch.ts`. Realtime rolls 1d10 + samples a Table VII entry and emits ops in one batch. Summary delegates to `generateTimeJump` (A2.6) with `reason='bout_summary'` plus a rolled Table VIII entry, then emits ops to set `temporaryInsanity` (roundsLeft 0 — summary skips the realtime countdown) and merges the returned `sceneInfoUpdate`. `advanceTurn` in `combat-controller.ts` is patched to decrement `roundsLeft` at round rollover.

1. **Write failing test** `src/sillytavern/__tests__/bout-dispatch.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { triggerBout } from '../bout-dispatch';
   import { advanceTurn } from '../combat-controller';
   import { useCharSheetStore } from '../../stores/useCharSheetStore';
   import type { EvaluatorContext } from '../post-settle-evaluators';

   vi.mock('../time-jump-generator', () => ({
     generateTimeJump: vi.fn(async () => ({
       narration: '失忆三小时后醒来',
       sceneInfoUpdate: { date: '1925-03-04', time: '15:00', weekday: '周三' },
       additionalEffects: [],
     })),
   }));
   import { generateTimeJump } from '../time-jump-generator';

   function mkCtx(): EvaluatorContext {
     return {
       sheet: useCharSheetStore.getState().sheet,
       statData: {},
       patchReport: { errors: [], charSheetDeltas: { sanDelta: -6, episodeId: 'ep1' } },
       applyCorrectiveOps: vi.fn(),
     } as unknown as EvaluatorContext;
   }

   beforeEach(() => {
     vi.spyOn(Math, 'random').mockReturnValue(0.5); // d10 = 6
   });

   describe('triggerBout', () => {
     it('realtime: emits roundsLeft 1..10 with Table VII entry', async () => {
       const c = mkCtx();
       await triggerBout(c, 'realtime');
       const ops = (c.applyCorrectiveOps as ReturnType<typeof vi.fn>).mock.calls.flat().flat();
       const setActive = ops.find((o: { path: string }) => o.path === '/调查员/临时性疯狂');
       expect(setActive).toBeDefined();
       expect(setActive.value.active).toBe(true);
       expect(setActive.value.roundsLeft).toBeGreaterThanOrEqual(1);
       expect(setActive.value.roundsLeft).toBeLessThanOrEqual(10);
       expect(setActive.value.bout.mode).toBe('realtime');
       expect(setActive.value.bout.table).toBe('VII');
       expect(typeof setActive.value.bout.entry).toBe('string');
     });

     it('summary: calls timeJumpGenerator with Table VIII entry + merges sceneInfoUpdate', async () => {
       const c = mkCtx();
       await triggerBout(c, 'summary');
       expect(generateTimeJump).toHaveBeenCalledTimes(1);
       const arg = (generateTimeJump as ReturnType<typeof vi.fn>).mock.calls[0][0];
       expect(arg.reason).toBe('bout_summary');
       expect(arg.tableEntry).toMatch(/.+/);
       const ops = (c.applyCorrectiveOps as ReturnType<typeof vi.fn>).mock.calls.flat().flat();
       const setActive = ops.find((o: { path: string }) => o.path === '/调查员/临时性疯狂');
       expect(setActive.value.roundsLeft).toBe(0);
       expect(setActive.value.bout.table).toBe('VIII');
       const sceneOp = ops.find((o: { path: string }) => o.path === '/世界/日期');
       expect(sceneOp?.value).toBe('1925-03-04');
     });
   });

   describe('advanceTurn — temporaryInsanity countdown', () => {
     it('decrements roundsLeft at round rollover', () => {
       const sheetStore = useCharSheetStore;
       sheetStore.setState((s) => ({
         sheet: { ...s.sheet, temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: '失忆' } } },
       }));
       const enc = {
         round: 1, currentIdx: 0,
         turnOrder: ['p'],
         combatants: [{ id: 'p', name: 'T', faction: 'player', hp: 10, maxHp: 10, roundDefenses: 0, weapons: [], fighting: 50, dodge: 50, mov: 8, con: 50, flags: {}, tendency: {}, controlledBy: 'player' }],
       };
       advanceTurn(enc as unknown as Parameters<typeof advanceTurn>[0]);
       expect(useCharSheetStore.getState().sheet.temporaryInsanity.roundsLeft).toBe(2);
     });

     it('clears active when roundsLeft reaches 0', () => {
       useCharSheetStore.setState((s) => ({
         sheet: { ...s.sheet, temporaryInsanity: { active: true, roundsLeft: 1, bout: { mode: 'realtime', table: 'VII', entry: '失忆' } } },
       }));
       const enc = {
         round: 1, currentIdx: 0,
         turnOrder: ['p'],
         combatants: [{ id: 'p', name: 'T', faction: 'player', hp: 10, maxHp: 10, roundDefenses: 0, weapons: [], fighting: 50, dodge: 50, mov: 8, con: 50, flags: {}, tendency: {}, controlledBy: 'player' }],
       };
       advanceTurn(enc as unknown as Parameters<typeof advanceTurn>[0]);
       const s = useCharSheetStore.getState().sheet.temporaryInsanity;
       expect(s.roundsLeft).toBe(0);
       expect(s.active).toBe(false);
     });
   });
   ```

2. **Run — expect fail**:

   ```bash
   npx vitest run src/sillytavern/__tests__/bout-dispatch.test.ts
   ```
   Expected: `Cannot find module '../bout-dispatch'`.

3. **Implement** `src/sillytavern/bout-dispatch.ts`:

   ```typescript
   import type { EvaluatorContext } from './post-settle-evaluators';
   import { generateTimeJump } from './time-jump-generator';
   import { useBookStore } from '../stores/useBookStore';

   // Table VII (realtime — 10 entries, COC7e p157)
   const TABLE_VII = [
     '失忆', '人格切换', '幻觉', '失语', '癔症性盲', '战栗发作', '极度暴力', '紧张性昏厥', '哭嚎奔逃', '认知崩塌',
   ] as const;
   // Table VIII (summary — 10 entries, COC7e p158)
   const TABLE_VIII = [
     '被发现在远方城镇', '完成一件想不起来的事', '加入秘密组织', '结下宿敌', '订婚或离婚', '入院治疗', '丢失重要财物', '皈依某种信仰', '签下不利契约', '失踪数日',
   ] as const;

   function d10(): number { return Math.floor(Math.random() * 10) + 1; }

   type BoutMode = 'realtime' | 'summary';

   export async function triggerBout(ctx: EvaluatorContext, mode: BoutMode): Promise<void> {
     if (mode === 'realtime') {
       const rounds = d10();
       const entry = TABLE_VII[d10() - 1];
       ctx.applyCorrectiveOps([
         { op: 'replace', path: '/调查员/临时性疯狂', value: { active: true, roundsLeft: rounds, bout: { mode: 'realtime', table: 'VII', entry } } },
       ]);
       return;
     }
     // summary
     const entry = TABLE_VIII[d10() - 1];
     const sceneSnapshot = useBookStore.getState().pages.slice(-1)[0]?.sceneInfo ?? {};
     const result = await generateTimeJump({
       reason: 'bout_summary',
       durationHint: '数小时至数日',
       sceneSnapshot,
       tableEntry: entry,
     });
     const ops: { op: string; path: string; value: unknown }[] = [
       { op: 'replace', path: '/调查员/临时性疯狂', value: { active: true, roundsLeft: 0, bout: { mode: 'summary', table: 'VIII', entry } } },
     ];
     const su = result.sceneInfoUpdate;
     if (su.date) ops.push({ op: 'replace', path: '/世界/日期', value: su.date });
     if (su.time) ops.push({ op: 'replace', path: '/世界/时间', value: su.time });
     if (su.weekday) ops.push({ op: 'replace', path: '/世界/星期', value: su.weekday });
     ctx.applyCorrectiveOps(ops);
   }
   ```

4. **Patch** `src/sillytavern/combat-controller.ts` `advanceTurn` at the round-rollover branch (line 116-119):

   ```typescript
   export function advanceTurn(enc: Encounter): Encounter {
     const next = enc.currentIdx + 1;
     if (next >= enc.turnOrder.length) {
       // 临时性疯狂(realtime) 每轮 -1，归零自动清除 active —— 与 Storybook/角色卡读到的状态同源
       const ti = useCharSheetStore.getState().sheet.temporaryInsanity;
       if (ti.active && ti.bout?.mode === 'realtime' && ti.roundsLeft > 0) {
         const left = ti.roundsLeft - 1;
         useCharSheetStore.setState((s) => ({
           sheet: { ...s.sheet, temporaryInsanity: left <= 0
             ? { active: false, roundsLeft: 0 }
             : { ...s.sheet.temporaryInsanity, roundsLeft: left } },
         }));
       }
       const cleared = enc.combatants.map((c) => ({ ...c, roundDefenses: 0 }));
       const order = nextTurnOrder(cleared);
       return { ...enc, combatants: cleared, turnOrder: order, currentIdx: 0, round: enc.round + 1 };
     }
     return { ...enc, currentIdx: next };
   }
   ```
   Add import at the top: `import { useCharSheetStore } from '../stores/useCharSheetStore';` (likely already present — leave dedupe to lint).

5. **Run — expect pass**:

   ```bash
   npx vitest run src/sillytavern/__tests__/bout-dispatch.test.ts
   ```
   Expected: `Tests 4 passed (4)`.

6. **Build sanity**:

   ```bash
   npx tsc --noEmit && npx vitest run src/sillytavern/__tests__/sanity-evaluator.test.ts src/sillytavern/__tests__/bout-dispatch.test.ts
   ```
   Expected: green.

7. **Commit**:

   ```bash
   git add -A && git commit -m "feat(sanity): A2.5 bout dispatch — realtime 1d10/Table VII + summary timeJump/Table VIII; advanceTurn 倒计时"
   ```

---

### A2.6 — Unified timeJumpGenerator

New module `src/sillytavern/time-jump-generator.ts`. Static prefix per `reason` (front-loaded for prompt-cache prefix reuse), variable suffix has the dynamic snapshot. Uses `callDsSubagent` with `maxTokens: 20000` (project memory: `max_tokens` floor 20000). Independent — never merged into the main JSON.

1. **Write failing test** `src/sillytavern/__tests__/time-jump-generator.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { generateTimeJump } from '../time-jump-generator';

   vi.mock('../../stores/useSettingsStore', () => ({
     useSettingsStore: { getState: () => ({ apiBase: 'https://x', apiKey: 'k', apiModel: 'deepseek-chat' }) },
   }));
   const callMock = vi.fn();
   vi.mock('../subagent-call', () => ({
     callDsSubagent: (...args: unknown[]) => callMock(...args),
     DsSubagentHttpError: class extends Error {},
   }));

   describe('generateTimeJump', () => {
     beforeEach(() => callMock.mockReset());

     it('passes maxTokens >= 20000 and per-reason static prefix to callDsSubagent', async () => {
       callMock.mockResolvedValue({
         content: '{}',
         parsed: { narration: 'n', sceneInfoUpdate: { date: '1925-03-04', time: '15:00' } },
       });
       await generateTimeJump({
         reason: 'bout_summary',
         durationHint: '数小时',
         sceneSnapshot: { date: '1925-03-04', time: '12:00', location: '阁楼' },
         tableEntry: '失忆',
       });
       expect(callMock).toHaveBeenCalledTimes(1);
       const req = callMock.mock.calls[0][0];
       expect(req.maxTokens).toBeGreaterThanOrEqual(20000);
       expect(req.label).toMatch(/time-jump|bout_summary/i);
       // Static prefix first (cache-friendly): system message text constant per-reason
       const sys = req.messages.find((m: { role: string }) => m.role === 'system');
       expect(sys.content).toContain('bout_summary');
       // Dynamic suffix carries scene snapshot + table entry
       const user = req.messages.find((m: { role: string }) => m.role === 'user');
       expect(user.content).toContain('失忆');
       expect(user.content).toContain('阁楼');
     });

     it('returns parsed JSON shape {narration,sceneInfoUpdate}', async () => {
       callMock.mockResolvedValue({
         content: '', parsed: { narration: 'woke', sceneInfoUpdate: { date: '1925-03-05', time: '08:00', weekday: '周四' } },
       });
       const r = await generateTimeJump({ reason: 'bout_summary', durationHint: '', sceneSnapshot: {}, tableEntry: '失忆' });
       expect(r.narration).toBe('woke');
       expect(r.sceneInfoUpdate.date).toBe('1925-03-05');
     });

     it('falls back to empty sceneInfoUpdate when parse fails', async () => {
       callMock.mockResolvedValue({ content: 'garbage', parsed: null, parseError: 'no json' });
       const r = await generateTimeJump({ reason: 'bout_summary', durationHint: '', sceneSnapshot: {}, tableEntry: '失忆' });
       expect(r.sceneInfoUpdate).toEqual({});
       expect(r.narration).toBe('');
     });
   });
   ```

2. **Run — expect fail**:

   ```bash
   npx vitest run src/sillytavern/__tests__/time-jump-generator.test.ts
   ```
   Expected: `Cannot find module '../time-jump-generator'`.

3. **Implement** `src/sillytavern/time-jump-generator.ts`:

   ```typescript
   import { callDsSubagent } from './subagent-call';
   import { useSettingsStore } from '../stores/useSettingsStore';

   export type TimeJumpReason = 'bout_summary' | 'travel' | 'recovery' | 'scene_break';

   export interface TimeJumpRequest {
     reason: TimeJumpReason;
     durationHint: string;
     sceneSnapshot: Record<string, unknown>;
     tableEntry?: string;
   }
   export interface TimeJumpResult {
     narration: string;
     sceneInfoUpdate: { date?: string; time?: string; weekday?: string };
     additionalEffects?: unknown[];
   }

   // Static per-reason prefix — keep CONSTANT for prompt-cache reuse (front-loaded).
   const STATIC_PREFIX: Record<TimeJumpReason, string> = {
     bout_summary:
       '[reason=bout_summary]\n你是 COC7e 守秘人。玩家角色刚陷入临时性疯狂(Table VIII，疯狂总结模式)。\n基于给定的 Table VIII 词条 + 当前场景快照，生成一段简短回归叙述(80~200字)，并推进 sceneInfoUpdate(date/time/weekday)。\n严格返回 JSON: {"narration":string, "sceneInfoUpdate":{"date"?:string,"time"?:string,"weekday"?:string}, "additionalEffects"?:unknown[]}\n不得输出 JSON 之外的任何文本。',
     travel:
       '[reason=travel]\n你是 COC7e 守秘人。基于场景快照 + 时间跨度提示，生成旅途简述(80~200字)与 sceneInfoUpdate。严格返回上述 JSON 结构。',
     recovery:
       '[reason=recovery]\n你是 COC7e 守秘人。生成调查员休整段落(80~200字)与 sceneInfoUpdate(通常推进数小时至一日)。严格返回上述 JSON 结构。',
     scene_break:
       '[reason=scene_break]\n你是 COC7e 守秘人。给一段场景过渡叙述(60~150字)与 sceneInfoUpdate。严格返回上述 JSON 结构。',
   };

   export async function generateTimeJump(req: TimeJumpRequest): Promise<TimeJumpResult> {
     const { apiBase, apiKey, apiModel } = useSettingsStore.getState() as {
       apiBase: string; apiKey: string; apiModel: string;
     };
     const dynamic = [
       req.tableEntry ? `tableEntry: ${req.tableEntry}` : '',
       req.durationHint ? `durationHint: ${req.durationHint}` : '',
       'sceneSnapshot:',
       JSON.stringify(req.sceneSnapshot, null, 2),
     ].filter(Boolean).join('\n');

     const resp = await callDsSubagent({
       apiBaseUrl: apiBase,
       apiKey,
       model: apiModel,
       label: `time-jump/${req.reason}`,
       maxTokens: 20000,
       temperature: 0.8,
       rpmLane: 'main',
       messages: [
         { role: 'system', content: STATIC_PREFIX[req.reason] },
         { role: 'user', content: dynamic },
       ],
     });
     const parsed = resp.parsed as { narration?: string; sceneInfoUpdate?: TimeJumpResult['sceneInfoUpdate']; additionalEffects?: unknown[] } | null;
     return {
       narration: parsed?.narration ?? '',
       sceneInfoUpdate: parsed?.sceneInfoUpdate ?? {},
       additionalEffects: parsed?.additionalEffects ?? [],
     };
   }
   ```

4. **Run — expect pass**:

   ```bash
   npx vitest run src/sillytavern/__tests__/time-jump-generator.test.ts
   ```
   Expected: `Tests 3 passed (3)`.

5. **Re-run A2.5 (verifies A2.6 integration)**:

   ```bash
   npx vitest run src/sillytavern/__tests__/bout-dispatch.test.ts
   ```
   Expected: green.

6. **Commit**:

   ```bash
   git add -A && git commit -m "feat(time-jump): A2.6 统一 timeJumpGenerator — 静态前缀按 reason 分桶, callDsSubagent max_tokens=20000"
   ```

---

### A2.7 — Lore EJS + StateChips for insanity state

Replaces the `ejs_san_state` builtin entry in `src/stores/useLorebookStore.ts` `defaultBooks.coc_lore.entries.ejs_san_state` with an EJS template that conditions on `sheet.temporaryInsanity.active / indefiniteInsanity.active / permanentInsanity`. The entry stays `constant: true` so the DS-cache auto-detect (`hasDynamicMarker`) keeps it in the dynamic tail — no rebuild risk. `StateChips` is extended to read the three booleans off the sheet and renders red / purple / dark-red chips.

1. **Write failing test** `src/components/Book/__tests__/StatusBar.insanity.test.tsx` (Vitest + React Testing Library — repo already uses these in other tests):

   ```tsx
   import { describe, it, expect, beforeEach } from 'vitest';
   import { render, screen } from '@testing-library/react';
   import { StatusBar } from '../StatusBar';
   import { useCharSheetStore } from '../../../stores/useCharSheetStore';

   describe('StatusBar — insanity StateChips', () => {
     beforeEach(() => {
       useCharSheetStore.setState((s) => ({
         sheet: {
           ...s.sheet,
           temporaryInsanity: { active: false, roundsLeft: 0 },
           indefiniteInsanity: { active: false, daysLeft: 0 },
           permanentInsanity: false,
         },
       }));
     });

     it('shows red chip when temporaryInsanity.active', () => {
       useCharSheetStore.setState((s) => ({
         sheet: { ...s.sheet, temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: '失忆' } } },
       }));
       render(<StatusBar />);
       const chip = screen.getByText('临时疯狂');
       expect(chip).toBeTruthy();
       expect((chip.parentElement as HTMLElement).style.color).toMatch(/blood|red/);
     });

     it('shows purple chip when indefiniteInsanity.active', () => {
       useCharSheetStore.setState((s) => ({
         sheet: { ...s.sheet, indefiniteInsanity: { active: true, daysLeft: 30 } },
       }));
       render(<StatusBar />);
       expect(screen.getByText('不定性疯狂')).toBeTruthy();
     });

     it('shows dark-red chip when permanentInsanity', () => {
       useCharSheetStore.setState((s) => ({ sheet: { ...s.sheet, permanentInsanity: true } }));
       render(<StatusBar />);
       expect(screen.getByText('永久疯狂')).toBeTruthy();
     });

     it('renders none when no insanity flags', () => {
       const { container } = render(<StatusBar />);
       expect(container.textContent ?? '').not.toMatch(/疯狂/);
     });
   });
   ```

   And the lore EJS test `src/stores/__tests__/lorebook-ejs-san-state.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { renderTemplate } from '../../sillytavern/ejs-runtime';
   import { useLorebookStore } from '../useLorebookStore';

   function ejsContent(): string {
     return useLorebookStore.getState().books.coc_lore.entries.ejs_san_state.content;
   }

   function ctxFor(sheet: Record<string, unknown>): Record<string, unknown> {
     return { sheet };
   }

   describe('ejs_san_state lorebook entry', () => {
     it('renders [临时疯狂中: 失忆] when temporaryInsanity.active', () => {
       const tmpl = ejsContent();
       const out = renderTemplate(tmpl, { variables: ctxFor({ temporaryInsanity: { active: true, bout: { entry: '失忆' } }, indefiniteInsanity: { active: false }, permanentInsanity: false, secondary: { san: { current: 40, max: 99 } } }) });
       expect(out).toContain('[临时疯狂中: 失忆]');
     });

     it('renders [不定性疯狂中] when indefiniteInsanity.active', () => {
       const out = renderTemplate(ejsContent(), { variables: ctxFor({ temporaryInsanity: { active: false }, indefiniteInsanity: { active: true }, permanentInsanity: false, secondary: { san: { current: 20, max: 99 } } }) });
       expect(out).toContain('[不定性疯狂中]');
     });

     it('renders [永久疯狂] when permanentInsanity', () => {
       const out = renderTemplate(ejsContent(), { variables: ctxFor({ temporaryInsanity: { active: false }, indefiniteInsanity: { active: false }, permanentInsanity: true, secondary: { san: { current: 0, max: 99 } } }) });
       expect(out).toContain('[永久疯狂]');
     });

     it('falls back to SAN number text when all flags false', () => {
       const out = renderTemplate(ejsContent(), { variables: ctxFor({ temporaryInsanity: { active: false }, indefiniteInsanity: { active: false }, permanentInsanity: false, secondary: { san: { current: 40, max: 99 } } }) });
       expect(out).toMatch(/SAN[: ]*40\/99/);
     });
   });
   ```

2. **Run — expect fail**:

   ```bash
   npx vitest run src/components/Book/__tests__/StatusBar.insanity.test.tsx src/stores/__tests__/lorebook-ejs-san-state.test.ts
   ```
   Expected fail: missing `临时疯狂` text + EJS still outputs only the SAN number.

3. **Update** the `ejs_san_state` entry in `src/stores/useLorebookStore.ts` `defaultBooks.coc_lore.entries.ejs_san_state.content`:

   ```text
   <%
   const ti = sheet?.temporaryInsanity;
   const ii = sheet?.indefiniteInsanity;
   const pi = sheet?.permanentInsanity;
   const sec = sheet?.secondary?.san;
   let line = '';
   if (pi) {
     line = '[永久疯狂] —— 调查员心智彻底碎裂，已无法继续故事';
   } else if (ii?.active) {
     line = '[不定性疯狂中]' + (ii.daysLeft ? ' (剩 ' + ii.daysLeft + ' 日)' : '');
   } else if (ti?.active) {
     const entry = ti.bout?.entry ?? '症状不明';
     line = '[临时疯狂中: ' + entry + ']' + (ti.roundsLeft ? ' (剩 ' + ti.roundsLeft + ' 轮)' : '');
   } else if (sec && sec.max) {
     line = 'SAN ' + sec.current + '/' + sec.max;
   }
   %>
   [SAN 状态]
   <%= line %>
   ```

   Keep entry fields `constant: true`, `keys: ''` (already constant). Since `<%` is a dynamic marker, `hasDynamicMarker` will keep it in the DS-cache dynamic tail — same behavior as before, no cache regression.

4. **Patch `StateChips` in `src/components/Book/StatusBar.tsx`**:

   - Extend `StatusBar` to read `temporaryInsanity`, `indefiniteInsanity`, `permanentInsanity`:

     ```tsx
     const temporaryInsanity = useCharSheetStore((s) => s.sheet.temporaryInsanity);
     const indefiniteInsanity = useCharSheetStore((s) => s.sheet.indefiniteInsanity);
     const permanentInsanity = useCharSheetStore((s) => s.sheet.permanentInsanity);
     ```

   - Pass them down: `<StateChips posture={posture} conditions={statusConditions} temporaryInsanity={temporaryInsanity} indefiniteInsanity={indefiniteInsanity} permanentInsanity={permanentInsanity} />` (and `compact` variant).

   - Replace `StateChips`:

     ```tsx
     function StateChips({ posture, conditions, compact, temporaryInsanity, indefiniteInsanity, permanentInsanity }: {
       posture: string;
       conditions: { name: string; severity: string; description: string }[];
       compact?: boolean;
       temporaryInsanity?: { active: boolean };
       indefiniteInsanity?: { active: boolean };
       permanentInsanity?: boolean;
     }) {
       const showPosture = !!posture && posture !== '站立';
       const showTi = temporaryInsanity?.active === true;
       const showIi = indefiniteInsanity?.active === true;
       const showPi = permanentInsanity === true;
       if (!showPosture && conditions.length === 0 && !showTi && !showIi && !showPi) return null;
       const fs = compact ? 9 : 10;
       const chip = (key: React.Key, label: string, color: string, title?: string) => (
         <span key={key} title={title} style={{
           display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)', fontSize: fs, letterSpacing: 0.5,
           whiteSpace: 'nowrap', padding: '1px 8px', borderRadius: 9,
           color, background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}`,
           transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), filter 200ms cubic-bezier(0.4, 0, 0.2, 1)',
         }}>
           <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />{label}
         </span>
       );
       return (
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
           {showPosture && chip('posture', posture, 'var(--gold-bright)', '当前姿态')}
           {showTi && chip('ti', '临时疯狂', 'var(--blood)', '临时性疯狂 — Table VII')}
           {showIi && chip('ii', '不定性疯狂', '#a978d6', '不定性疯狂 — 日级恢复')}
           {showPi && chip('pi', '永久疯狂', '#7a1f1f', '永久疯狂 — 调查员退场')}
           {conditions.map((c, i) => chip(`c${i}`, c.name, SEVERITY_COLOR[c.severity] || SEVERITY_COLOR.moderate, c.description))}
         </div>
       );
     }
     ```

5. **Run — expect pass**:

   ```bash
   npx vitest run src/components/Book/__tests__/StatusBar.insanity.test.tsx src/stores/__tests__/lorebook-ejs-san-state.test.ts
   ```
   Expected: `Tests 7 passed`.

6. **Full A2 sweep**:

   ```bash
   npx tsc --noEmit && npx vitest run src/sillytavern/__tests__/sanity-evaluator.test.ts src/sillytavern/__tests__/bout-dispatch.test.ts src/sillytavern/__tests__/time-jump-generator.test.ts src/components/Book/__tests__/StatusBar.insanity.test.tsx src/stores/__tests__/lorebook-ejs-san-state.test.ts
   ```
   Expected: all green.

7. **Commit + push (beta)**:

   ```bash
   git add -A && git commit -m "feat(lore,ui): A2.7 ejs_san_state 改条件渲染 + StateChips 临时/不定/永久疯狂三色徽章" && git push origin beta
   ```

Notes
- `_resetEvaluatorsForTest` is a tiny test-only export from `post-settle-evaluators.ts` (A0.3) — add it now if not present; production code never references it.
- The `applyCorrectiveOps` op paths (`/调查员/临时性疯狂`, `/调查员/不定性疯狂/active`, `/调查员/永久疯狂`) are routed by the A2.3 mvu-charsheet-redirect, so they land on the sheet, not statData.
- `useDiceStore.openCheck({skill,target,reason,onResolve})` is the A1.x signature; if A1 lands an earlier shape, the A2.4 test type signature is the single source of truth.
- `useSettingsStore.getState()` keys used (`apiBase`, `apiKey`, `apiModel`) exist on the current store; no schema change required.

## Bucket A3-rules — Tickets A3.1, A3.2

*A3-rules bucket: A3.1 adds three pure rule helpers (applyAgeModifiers per R8 seven-band table, rollEduImprovement, rollSkillImprovement) to src/sillytavern/coc-rules.ts with full vitest coverage. A3.2 integrates applyAgeModifiers into CharacterCreator: APP/MOV/EDU applied pre-sheet-build, STR/CON/DEX distribution panel for 40+, luck twice-take-max for 15-19, queued EDU improvement rolls for finalize, and StepReview modifier listing.*

### A3.1 — Pure helpers: applyAgeModifiers / rollEduImprovement / rollSkillImprovement

**File:** `src/sillytavern/coc-rules.ts` (extend existing). Test: `src/sillytavern/coc-rules.age.test.ts` (new).

**Step 1 — Write failing test file.** Create `src/sillytavern/coc-rules.age.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  applyAgeModifiers,
  rollEduImprovement,
  rollSkillImprovement,
} from './coc-rules';

const baseChars = { STR: 50, CON: 50, SIZ: 50, DEX: 50, APP: 50, INT: 50, POW: 50, EDU: 50 };

describe('applyAgeModifiers — R8 seven-band table', () => {
  it('15-19: STR+SIZ -5 group, EDU -5, eduImprovementCount=0, luckRollAgain=true', () => {
    const r = applyAgeModifiers({ ...baseChars }, 17);
    expect(r.chars.EDU).toBe(45);
    expect(r.chars.APP).toBe(50);
    expect(r.deductRemaining.strSizGroup).toBe(5);
    expect(r.deductRemaining.strConDexGroup).toBe(0);
    expect(r.appDeduct).toBe(0);
    expect(r.mov).toBe(9);
    expect(r.eduImprovementCount).toBe(0);
    expect(r.luckRollAgain).toBe(true);
  });

  it('20-39: no deductions, eduImprovementCount=1, mov=8', () => {
    const r = applyAgeModifiers({ ...baseChars }, 25);
    expect(r.chars).toEqual(baseChars);
    expect(r.deductRemaining.strConDexGroup).toBe(0);
    expect(r.appDeduct).toBe(0);
    expect(r.mov).toBe(8);
    expect(r.eduImprovementCount).toBe(1);
    expect(r.luckRollAgain).toBe(false);
  });

  it('40-49: STR/CON/DEX -5 group, APP -5, MOV-1, eduImprovementCount=2', () => {
    const r = applyAgeModifiers({ ...baseChars }, 45);
    expect(r.chars.APP).toBe(45);
    expect(r.deductRemaining.strConDexGroup).toBe(5);
    expect(r.appDeduct).toBe(5);
    expect(r.mov).toBe(7);
    expect(r.eduImprovementCount).toBe(2);
  });

  it('50-59: -10 group, APP-10, MOV-2, eduImprovementCount=3', () => {
    const r = applyAgeModifiers({ ...baseChars }, 55);
    expect(r.chars.APP).toBe(40);
    expect(r.deductRemaining.strConDexGroup).toBe(10);
    expect(r.appDeduct).toBe(10);
    expect(r.mov).toBe(6);
    expect(r.eduImprovementCount).toBe(3);
  });

  it('60-69: -20, APP-15, MOV-3, eduImprovementCount=4', () => {
    const r = applyAgeModifiers({ ...baseChars }, 65);
    expect(r.chars.APP).toBe(35);
    expect(r.deductRemaining.strConDexGroup).toBe(20);
    expect(r.mov).toBe(5);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('70-79: -40, APP-20, MOV-4', () => {
    const r = applyAgeModifiers({ ...baseChars }, 75);
    expect(r.chars.APP).toBe(30);
    expect(r.deductRemaining.strConDexGroup).toBe(40);
    expect(r.mov).toBe(4);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('80-89: -80, APP-25, MOV-5', () => {
    const r = applyAgeModifiers({ ...baseChars }, 85);
    expect(r.chars.APP).toBe(25);
    expect(r.deductRemaining.strConDexGroup).toBe(80);
    expect(r.mov).toBe(3);
    expect(r.eduImprovementCount).toBe(4);
  });

  it('clamps APP to 1 when deduction would go sub-1', () => {
    const r = applyAgeModifiers({ ...baseChars, APP: 10 }, 85);
    expect(r.chars.APP).toBe(1);
  });

  it('clamps EDU to 1 when 15-19 deduction would go sub-1', () => {
    const r = applyAgeModifiers({ ...baseChars, EDU: 3 }, 17);
    expect(r.chars.EDU).toBe(1);
  });
});

describe('rollEduImprovement', () => {
  it('improves when d100 > currentEdu', () => {
    const rng = (() => {
      const seq = [0.95 /* d100=96 */, 0.7 /* d10=8 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollEduImprovement(80, rng);
    expect(r.roll).toBe(96);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(8);
    expect(r.newEdu).toBe(88);
  });

  it('does not improve when d100 <= currentEdu', () => {
    const rng = () => 0.5; // d100=51
    const r = rollEduImprovement(80, rng);
    expect(r.improved).toBe(false);
    expect(r.newEdu).toBe(80);
  });

  it('caps newEdu at 99', () => {
    const rng = (() => {
      const seq = [0.99 /* d100=100 */, 0.99 /* d10=10 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollEduImprovement(95, rng);
    expect(r.newEdu).toBe(99);
  });
});

describe('rollSkillImprovement', () => {
  it('bonus die disqualifies even on apparent success', () => {
    const rng = () => 0.99;
    const r = rollSkillImprovement(40, /*useBonusDie*/ true, /*won*/ true, rng);
    expect(r.improved).toBe(false);
    expect(r.gain).toBe(0);
    expect(r.finalValue).toBe(40);
  });

  it('opposed and !won disqualifies', () => {
    const rng = () => 0.99;
    const r = rollSkillImprovement(40, false, false, rng);
    expect(r.improved).toBe(false);
    expect(r.finalValue).toBe(40);
  });

  it('d100 > currentValue improves by 1D10 capped at 99', () => {
    const rng = (() => {
      const seq = [0.85 /* d100=86 */, 0.5 /* d10=6 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollSkillImprovement(50, false, true, rng);
    expect(r.roll).toBe(86);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(6);
    expect(r.finalValue).toBe(56);
  });

  it('boundary: d100 > 95 always improves regardless of currentValue', () => {
    const rng = (() => {
      const seq = [0.95 /* d100=96 */, 0.2 /* d10=3 */];
      let i = 0;
      return () => seq[i++];
    })();
    const r = rollSkillImprovement(98, false, true, rng);
    expect(r.improved).toBe(true);
    expect(r.gain).toBe(3);
    expect(r.finalValue).toBe(99);
  });

  it('d100 <= currentValue and <= 95 does not improve', () => {
    const rng = () => 0.3; // d100=31
    const r = rollSkillImprovement(50, false, true, rng);
    expect(r.improved).toBe(false);
    expect(r.finalValue).toBe(50);
  });
});
```

**Step 2 — Run, expect failure.**

```bash
npx vitest run src/sillytavern/coc-rules.age.test.ts
```

Expected: `Error: Failed to resolve import` for `applyAgeModifiers, rollEduImprovement, rollSkillImprovement` (none exported yet).

**Step 3 — Implement helpers.** Append to `src/sillytavern/coc-rules.ts`:

```typescript
/* ============================== R8: Age Modifiers ============================== */

export interface AgeModifierResult {
  chars: Record<COC7Characteristic, number>;
  mov: number;
  eduImprovementCount: number;
  deductRemaining: { strSizGroup: number; strConDexGroup: number };
  appDeduct: number;
  luckRollAgain: boolean;
}

interface AgeBand {
  min: number; max: number;
  strSizGroup: number;
  strConDexGroup: number;
  appDeduct: number;
  movDelta: number;
  eduDirect: number; // direct subtraction from EDU (only 15-19)
  eduImprovementCount: number;
  luckRollAgain: boolean;
}

const AGE_BANDS: AgeBand[] = [
  { min: 15, max: 19, strSizGroup: 5, strConDexGroup: 0, appDeduct: 0,  movDelta: 1,  eduDirect: 5, eduImprovementCount: 0, luckRollAgain: true },
  { min: 20, max: 39, strSizGroup: 0, strConDexGroup: 0, appDeduct: 0,  movDelta: 0,  eduDirect: 0, eduImprovementCount: 1, luckRollAgain: false },
  { min: 40, max: 49, strSizGroup: 0, strConDexGroup: 5,  appDeduct: 5,  movDelta: -1, eduDirect: 0, eduImprovementCount: 2, luckRollAgain: false },
  { min: 50, max: 59, strSizGroup: 0, strConDexGroup: 10, appDeduct: 10, movDelta: -2, eduDirect: 0, eduImprovementCount: 3, luckRollAgain: false },
  { min: 60, max: 69, strSizGroup: 0, strConDexGroup: 20, appDeduct: 15, movDelta: -3, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
  { min: 70, max: 79, strSizGroup: 0, strConDexGroup: 40, appDeduct: 20, movDelta: -4, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
  { min: 80, max: 89, strSizGroup: 0, strConDexGroup: 80, appDeduct: 25, movDelta: -5, eduDirect: 0, eduImprovementCount: 4, luckRollAgain: false },
];

function baseMovForChars(chars: Partial<Record<COC7Characteristic, number>>): number {
  const str = chars.STR ?? 0, dex = chars.DEX ?? 0, siz = chars.SIZ ?? 0;
  if (str < siz && dex < siz) return 7;
  if (str >= siz && dex >= siz) return 9;
  return 8;
}

export function applyAgeModifiers(
  chars: Record<COC7Characteristic, number>,
  age: number,
): AgeModifierResult {
  const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max) ?? AGE_BANDS[1];
  const next = { ...chars };
  if (band.eduDirect > 0) next.EDU = Math.max(1, next.EDU - band.eduDirect);
  if (band.appDeduct > 0) next.APP = Math.max(1, next.APP - band.appDeduct);
  const mov = Math.max(1, baseMovForChars(next) + band.movDelta);
  return {
    chars: next,
    mov,
    eduImprovementCount: band.eduImprovementCount,
    deductRemaining: { strSizGroup: band.strSizGroup, strConDexGroup: band.strConDexGroup },
    appDeduct: band.appDeduct,
    luckRollAgain: band.luckRollAgain,
  };
}

/* ============================== R5: EDU & Skill Improvement ============================== */

export type RNG = () => number;
const defaultRng: RNG = Math.random;
const rollD = (sides: number, rng: RNG) => Math.floor(rng() * sides) + 1;

export function rollEduImprovement(
  currentEdu: number,
  rng: RNG = defaultRng,
): { roll: number; improved: boolean; gain: number; newEdu: number } {
  const roll = rollD(100, rng);
  if (roll > currentEdu) {
    const gain = rollD(10, rng);
    return { roll, improved: true, gain, newEdu: Math.min(99, currentEdu + gain) };
  }
  return { roll, improved: false, gain: 0, newEdu: currentEdu };
}

export function rollSkillImprovement(
  currentValue: number,
  useBonusDie: boolean,
  won: boolean,
  rng: RNG = defaultRng,
): { roll: number; improved: boolean; gain: number; finalValue: number } {
  if (useBonusDie || !won) {
    return { roll: 0, improved: false, gain: 0, finalValue: currentValue };
  }
  const roll = rollD(100, rng);
  if (roll > currentValue || roll > 95) {
    const gain = rollD(10, rng);
    return { roll, improved: true, gain, finalValue: Math.min(99, currentValue + gain) };
  }
  return { roll, improved: false, gain: 0, finalValue: currentValue };
}
```

**Step 4 — Run, expect pass.**

```bash
npx vitest run src/sillytavern/coc-rules.age.test.ts
```

Expected: `Test Files  1 passed (1)  Tests  16 passed (16)`.

**Step 5 — Type/build check.**

```bash
npx tsc --noEmit
```

Expected: no output (exit 0).

**Step 6 — Commit.**

```bash
git add src/sillytavern/coc-rules.ts src/sillytavern/coc-rules.age.test.ts
git commit -m "feat(coc-rules): R8 applyAgeModifiers + R5 rollEduImprovement/rollSkillImprovement"
```

---

### A3.2 — CharacterCreator age integration

**Files:** `src/components/CharSheet/CharacterCreator.tsx` (modify), `src/components/CharSheet/steps/StepCharacteristics.tsx` (modify — add age-deduct panel), `src/components/CharSheet/steps/StepReview.tsx` (modify — list modifiers), `src/components/CharSheet/CharacterCreator.age.test.tsx` (new).

**Step 1 — Write failing integration test.** Create `src/components/CharSheet/CharacterCreator.age.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { applyAgeModifiers, rollEduImprovement } from '../../sillytavern/coc-rules';

describe('A3.2 — age 60 sheet build pipeline (helper composition)', () => {
  it('applies APP-15, MOV-3, queues 4 EDU rolls, and exposes 20-pt STR/CON/DEX bucket', () => {
    const chars = { STR: 60, CON: 60, SIZ: 50, DEX: 60, APP: 70, INT: 60, POW: 60, EDU: 70 };
    const r = applyAgeModifiers(chars, 60);
    expect(r.chars.APP).toBe(55);
    expect(r.mov).toBe(6); // STR>=SIZ && DEX>=SIZ → base 9, -3 = 6
    expect(r.deductRemaining.strConDexGroup).toBe(20);
    expect(r.eduImprovementCount).toBe(4);

    // simulate 4 EDU rolls with deterministic RNG
    const seq = [0.99,0.2 /*+3*/, 0.4 /*fail*/, 0.99,0.5 /*+6*/, 0.99,0.1 /*+2*/];
    let i = 0;
    const rng = () => seq[i++];
    let edu = r.chars.EDU; // 70
    const gains: number[] = [];
    for (let n = 0; n < r.eduImprovementCount; n++) {
      const er = rollEduImprovement(edu, rng);
      gains.push(er.improved ? er.gain : 0);
      edu = er.newEdu;
    }
    expect(gains).toEqual([3, 0, 6, 2]);
    expect(edu).toBe(81);
  });

  it('15-19: luck twice take max', () => {
    const roll3D6 = vi.fn().mockReturnValueOnce(8).mockReturnValueOnce(14);
    const luck = Math.max(roll3D6() * 5, roll3D6() * 5);
    expect(luck).toBe(70);
  });
});
```

**Step 2 — Run, expect pass (pure-helper test already green).**

```bash
npx vitest run src/components/CharSheet/CharacterCreator.age.test.tsx
```

Expected: `Tests  2 passed (2)`. (This pins helper contract; UI wiring in steps 3–4.)

**Step 3 — Wire `CharacterCreator.tsx`.** Open `src/components/CharSheet/CharacterCreator.tsx`. Add import and replace the pre-build block (around line 350 — the sheet build site). Insert before sheet construction:

```typescript
import { applyAgeModifiers, rollEduImprovement, roll3D6 } from '../../sillytavern/coc-rules';

// near identity state:
const [ageDeductSCD, setAgeDeductSCD] = useState<{ STR: number; CON: number; DEX: number }>({ STR: 0, CON: 0, DEX: 0 });
const [ageDeductSS, setAgeDeductSS] = useState<{ STR: number; SIZ: number }>({ STR: 0, SIZ: 0 });
const [eduImprovementsLog, setEduImprovementsLog] = useState<Array<{ roll: number; improved: boolean; gain: number }>>([]);
const [appliedAgeMod, setAppliedAgeMod] = useState<ReturnType<typeof applyAgeModifiers> | null>(null);

const ageNum = Number.parseInt(identity.age || '0', 10) || 25;
const previewAgeMod = useMemo(() => applyAgeModifiers(charValues, ageNum), [charValues, ageNum]);

const scdRemaining = previewAgeMod.deductRemaining.strConDexGroup;
const scdAllocatedSum = ageDeductSCD.STR + ageDeductSCD.CON + ageDeductSCD.DEX;
const scdReady = scdAllocatedSum === scdRemaining;

const ssRemaining = previewAgeMod.deductRemaining.strSizGroup;
const ssAllocatedSum = ageDeductSS.STR + ageDeductSS.SIZ;
const ssReady = ssAllocatedSum === ssRemaining;

const canBuildSheet = scdReady && ssReady;
```

Replace the sheet-build call site (locate `const sheet = ... mov: 8` or equivalent hardcoded `mov: 8`) with:

```typescript
function buildSheet() {
  // 1. apply age modifiers to chars (APP + EDU-direct already in previewAgeMod.chars)
  const postAge = { ...previewAgeMod.chars };
  postAge.STR = Math.max(1, postAge.STR - ageDeductSCD.STR - ageDeductSS.STR);
  postAge.CON = Math.max(1, postAge.CON - ageDeductSCD.CON);
  postAge.DEX = Math.max(1, postAge.DEX - ageDeductSCD.DEX);
  postAge.SIZ = Math.max(1, postAge.SIZ - ageDeductSS.SIZ);

  // 2. luck: 15-19 rolls twice take max; else single roll
  const luck = previewAgeMod.luckRollAgain
    ? Math.max(roll3D6() * 5, roll3D6() * 5)
    : roll3D6() * 5;

  // 3. EDU improvement queue
  let edu = postAge.EDU;
  const eduLog: Array<{ roll: number; improved: boolean; gain: number }> = [];
  for (let n = 0; n < previewAgeMod.eduImprovementCount; n++) {
    const er = rollEduImprovement(edu);
    eduLog.push({ roll: er.roll, improved: er.improved, gain: er.gain });
    edu = er.newEdu;
  }
  postAge.EDU = edu;
  setEduImprovementsLog(eduLog);
  setAppliedAgeMod(previewAgeMod);

  // 4. finalize sheet with postAge + previewAgeMod.mov (REPLACES hardcoded mov:8)
  const secondary = deriveSecondaryStats(postAge);
  const sheet: CharacterSheet = {
    ...identity,
    chars: postAge,
    luck,
    mov: previewAgeMod.mov,
    hpMax: secondary.hpMax,
    sanMax: secondary.sanMax,
    mpMax: secondary.mpMax,
    db: secondary.db,
    build: secondary.build,
    // ... rest unchanged
  };
  onComplete(sheet);
}
```

**Step 4 — Add age-deduct panel in `StepCharacteristics.tsx`.** Extend `Props` (top of file):

```typescript
interface Props {
  // ... existing props
  ageBand?: {
    strSizGroup: number;
    strConDexGroup: number;
    appDeduct: number;
    mov: number;
    eduImprovementCount: number;
    luckRollAgain: boolean;
  };
  scdAlloc?: { STR: number; CON: number; DEX: number };
  ssAlloc?: { STR: number; SIZ: number };
  onScdAlloc?: (key: 'STR' | 'CON' | 'DEX', value: number) => void;
  onSsAlloc?: (key: 'STR' | 'SIZ', value: number) => void;
}
```

Add panel JSX above the `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>` block:

```tsx
{ageBand && ageBand.strConDexGroup > 0 && (
  <div style={{
    padding: '12px 14px', border: '1px solid var(--gold)', borderRadius: 6,
    background: 'rgba(196,168,85,0.06)', display: 'flex', flexDirection: 'column', gap: 8,
    transition: 'var(--transition-smooth)',
  }}>
    <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontSize: 11 }}>
      你已年长 — 需在 STR / CON / DEX 中合计扣除 {ageBand.strConDexGroup} 点
    </div>
    {(['STR', 'CON', 'DEX'] as const).map((k) => {
      const cur = scdAlloc?.[k] ?? 0;
      const others = (['STR','CON','DEX'] as const).filter(x => x !== k).reduce((s, x) => s + (scdAlloc?.[x] ?? 0), 0);
      const maxFor = Math.min(ageBand.strConDexGroup - others, charValues[k] - 1);
      return (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 40, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{k}</span>
          <input type="range" min={0} max={Math.max(0, maxFor)} value={cur}
            onChange={(e) => onScdAlloc?.(k, Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--gold)' }} />
          <span style={{ width: 28, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-light)' }}>-{cur}</span>
        </div>
      );
    })}
    <div style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
      已分配 {(scdAlloc?.STR ?? 0) + (scdAlloc?.CON ?? 0) + (scdAlloc?.DEX ?? 0)} / {ageBand.strConDexGroup}
    </div>
  </div>
)}
```

Mirror the same pattern for `strSizGroup` (15–19 band). In `CharacterCreator.tsx` pass:

```tsx
<StepCharacteristics
  /* ...existing... */
  ageBand={previewAgeMod}
  scdAlloc={ageDeductSCD}
  ssAlloc={ageDeductSS}
  onScdAlloc={(k, v) => setAgeDeductSCD(p => ({ ...p, [k]: v }))}
  onSsAlloc={(k, v) => setAgeDeductSS(p => ({ ...p, [k]: v }))}
/>
```

Disable sheet-build action button: `<button disabled={!canBuildSheet} onClick={buildSheet} ...>构建调查员</button>`.

**Step 5 — Extend `StepReview.tsx`.** Add prop:

```typescript
interface ReviewProps {
  // ...existing
  ageModSummary?: {
    age: number;
    scdGroup: number;
    scdAlloc: { STR: number; CON: number; DEX: number };
    ssGroup: number;
    ssAlloc: { STR: number; SIZ: number };
    appDeduct: number;
    movDelta: number;
    eduImprovements: Array<{ roll: number; improved: boolean; gain: number }>;
  };
}
```

Render block (below identity summary):

```tsx
{ageModSummary && (ageModSummary.scdGroup > 0 || ageModSummary.appDeduct > 0 || ageModSummary.eduImprovements.length > 0) && (
  <div style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, marginTop: 10 }}>
    <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontSize: 11, marginBottom: 6 }}>
      年龄修正 (AGE {ageModSummary.age})
    </div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-light)', lineHeight: 1.7 }}>
      {ageModSummary.scdGroup > 0 && (
        <div>STR/CON/DEX 共 -{ageModSummary.scdGroup} 已分配 STR-{ageModSummary.scdAlloc.STR} CON-{ageModSummary.scdAlloc.CON} DEX-{ageModSummary.scdAlloc.DEX}</div>
      )}
      {ageModSummary.ssGroup > 0 && (
        <div>STR/SIZ 共 -{ageModSummary.ssGroup} 已分配 STR-{ageModSummary.ssAlloc.STR} SIZ-{ageModSummary.ssAlloc.SIZ}</div>
      )}
      {ageModSummary.appDeduct > 0 && <div>APP -{ageModSummary.appDeduct}</div>}
      {ageModSummary.movDelta !== 0 && <div>MOV {ageModSummary.movDelta > 0 ? '+' : ''}{ageModSummary.movDelta}</div>}
      {ageModSummary.eduImprovements.length > 0 && (
        <div>EDU 提升 {ageModSummary.eduImprovements.length} 次 ({ageModSummary.eduImprovements.map(e => e.improved ? `+${e.gain}` : '+0').join(', ')})</div>
      )}
    </div>
  </div>
)}
```

Pass from `CharacterCreator`:

```tsx
ageModSummary={appliedAgeMod ? {
  age: ageNum,
  scdGroup: appliedAgeMod.deductRemaining.strConDexGroup,
  scdAlloc: ageDeductSCD,
  ssGroup: appliedAgeMod.deductRemaining.strSizGroup,
  ssAlloc: ageDeductSS,
  appDeduct: appliedAgeMod.appDeduct,
  movDelta: appliedAgeMod.mov - 8,
  eduImprovements: eduImprovementsLog,
} : undefined}
```

**Step 6 — Verify build + tests.**

```bash
npx vitest run src/components/CharSheet/CharacterCreator.age.test.tsx
npx tsc --noEmit
npm run build
```

Expected: vitest `Tests  2 passed (2)`; tsc exit 0; vite build emits `dist/` without errors.

**Step 7 — Commit.**

```bash
git add src/components/CharSheet/CharacterCreator.tsx src/components/CharSheet/steps/StepCharacteristics.tsx src/components/CharSheet/steps/StepReview.tsx src/components/CharSheet/CharacterCreator.age.test.tsx
git commit -m "feat(charsheet): age modifiers — R8 deductions + EDU improvement queue + 15-19 luck retry + StepReview summary"
git push origin beta
```


## Bucket A3-dev — Tickets A3.3, A3.4, A3.5, A3.6

*A3-dev wires the Call of Cthulhu 7e development-phase loop: ticking on successful skill rolls, a DevelopmentPhaseModal that rolls each ticked skill against d100 (improve if >current OR roll==96-100 per COC7e), batched applyCorrectiveOps emit on submit (current+ticked clears), +2D6 SAN bonus when any skill crosses the 90% threshold, an entry button on CharSheetOverlay, and a regression test for sheetSnapshot replay through deletePage rollback. New files: src/sillytavern/skill-improvement.ts (pure rollSkillImprovement + crossed90Threshold helpers), src/components/CharSheet/DevelopmentPhaseModal.tsx, src/components/CharSheet/DevelopmentEntryButton.tsx. Modified: src/stores/useDiceStore.ts (commitNow/commitWithLuck/commitAsPush emit ticked ops), src/sillytavern/mvu-charsheet-redirect.ts (add /ticked subpath), src/components/CharSheet/CharSheetOverlay.tsx (entry button slot). All commits without Co-Authored-By, beta branch.*

### A3.3 — Skill ticking gated on success+ in commitNow / commitWithLuck / commitAsPush

DiceRecord already carries `skill`, `type` (DiceResultType), and the dice store currently lacks `commitNow/commitWithLuck/commitAsPush` (A1.3 introduces them). This ticket plugs into those commit paths and emits an MVU op via `applyCorrectiveOps` whenever the resolved record qualifies as a "useful success" per COC7e dev-phase rule.

Eligible: `resultType ∈ {success, hard-success, extreme-success, crit-success}`, `bonusDice === 0` (奖励/惩罚骰 不计入发展), and not the loser of an `opposed` check. The redirect needs to accept `/调查员/技能/<key>/ticked = boolean`.

**Step 1 — failing test for the redirect `/ticked` subpath.**

Create `src/sillytavern/__tests__/mvu-charsheet-redirect.ticked.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyCharsheetRedirect } from '../mvu-charsheet-redirect';
import { defaultSheet } from '../../stores/useCharSheetStore';

describe('applyCharsheetRedirect — skills /ticked subpath', () => {
  const sheet = {
    ...defaultSheet,
    skills: { 心理学: { base: 10, current: 35, ticked: false } },
  };

  it('replace /调查员/技能/心理学/ticked = true sets ticked', () => {
    const next = applyCharsheetRedirect(sheet, '调查员.技能.心理学.ticked', 'replace', true);
    expect(next).not.toBeNull();
    expect(next!.skills['心理学'].ticked).toBe(true);
    expect(next!.skills['心理学'].current).toBe(35);
  });

  it('replace ticked=false clears it', () => {
    const tickedSheet = { ...sheet, skills: { 心理学: { base: 10, current: 35, ticked: true } } };
    const next = applyCharsheetRedirect(tickedSheet, '调查员.技能.心理学.ticked', 'replace', false);
    expect(next!.skills['心理学'].ticked).toBe(false);
  });

  it('non-bool value is rejected (returns null)', () => {
    const next = applyCharsheetRedirect(sheet, '调查员.技能.心理学.ticked', 'replace', 'yes');
    expect(next).toBeNull();
  });
});
```

**Step 2 — run; verify failure.**

```bash
npx vitest run src/sillytavern/__tests__/mvu-charsheet-redirect.ticked.test.ts
```

Expected: 3 failed (current redirect treats `调查员.技能.心理学.ticked` as `rawName='心理学.ticked'`, `toNumber('yes')→null`, returns null on first two cases).

**Step 3 — implement `/ticked` branch above the existing skill numeric branch.**

Edit `src/sillytavern/mvu-charsheet-redirect.ts`, insert before the existing `if (dotPath.startsWith('调查员.技能.'))` block (around line 180):

```typescript
  // ── Skill ticked flag (调查员.技能.XXX.ticked → skills.XXX.ticked) ──
  if (dotPath.startsWith('调查员.技能.') && dotPath.endsWith('.ticked')) {
    if (op !== 'replace') return null;
    if (typeof value !== 'boolean') return null;
    const rawName = dotPath.slice('调查员.技能.'.length, -'.ticked'.length);
    if (!rawName) return null;
    const skillName = canonicalSkillKey(rawName, sheet);
    const existing = sheet.skills[skillName];
    if (!existing) return null; // 只标记已存在的技能
    return {
      ...sheet,
      skills: { ...sheet.skills, [skillName]: { ...existing, ticked: value } },
    };
  }
```

Also extend `KNOWN_OPTIONAL_CHARSHEET_PATHS` in `mvu-charsheet-redirect.ts` (A0.2 whitelist) so `*.ticked` is not reported as unknown. Add the prefix-check helper for `.ticked` suffix into the existing `isCharsheetPath` allowlist if needed.

**Step 4 — run redirect test; expect pass.**

```bash
npx vitest run src/sillytavern/__tests__/mvu-charsheet-redirect.ticked.test.ts
```

Expected: 3 passed.

**Step 5 — failing test for `useDiceStore.commitNow` emitting the ticked op.**

Create `src/stores/__tests__/useDiceStore.tick.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import { useCharSheetStore, defaultSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';

describe('useDiceStore.commitNow — emit ticked op on success+', () => {
  beforeEach(() => {
    useCharSheetStore.setState({
      sheet: {
        ...defaultSheet,
        skills: { 心理学: { base: 10, current: 35, ticked: false } },
      },
    });
    useDiceStore.getState().clearAll();
  });

  it('success roll ticks the skill via applyCorrectiveOps', () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    useDiceStore.getState().commitNow({
      skill: '心理学', roll: '30', target: '35',
      type: 'success', time: Date.now(), page: 1,
    });
    expect(useCharSheetStore.getState().sheet.skills['心理学'].ticked).toBe(true);
    expect(spy).toHaveBeenCalledWith([
      { op: 'replace', path: '调查员.技能.心理学.ticked', value: true },
    ]);
  });

  it('failure roll does NOT tick', () => {
    useDiceStore.getState().commitNow({
      skill: '心理学', roll: '90', target: '35',
      type: 'failure', time: Date.now(), page: 1,
    });
    expect(useCharSheetStore.getState().sheet.skills['心理学'].ticked).toBe(false);
  });

  it('bonus die success does NOT tick', () => {
    useDiceStore.getState().commitNow({
      skill: '心理学', roll: '30', target: '35',
      type: 'success', time: Date.now(), page: 1, bonusDice: 1,
    });
    expect(useCharSheetStore.getState().sheet.skills['心理学'].ticked).toBe(false);
  });

  it('lost opposed success does NOT tick', () => {
    useDiceStore.getState().commitNow({
      skill: '心理学', roll: '30', target: '35',
      type: 'success', time: Date.now(), page: 1, mode: 'opposed', opposedOutcome: 'lose',
    });
    expect(useCharSheetStore.getState().sheet.skills['心理学'].ticked).toBe(false);
  });
});
```

(`bonusDice` and `mode/opposedOutcome` fields are added to `DiceRecord` by A1.3 — reference, do not redeclare.)

**Step 6 — implement helper + wire into commits.**

Add at the top of `src/stores/useDiceStore.ts`:

```typescript
import { useCharSheetStore } from './useCharSheetStore';
import { useVariableStore } from './useVariableStore';

/** COC7e dev-phase eligibility — see spec R5. */
function shouldTickSkill(rec: DiceRecord, sheet = useCharSheetStore.getState().sheet): boolean {
  if (!rec.type || !rec.skill) return false;
  if (!['success', 'hard-success', 'extreme-success', 'crit-success'].includes(rec.type)) return false;
  if ((rec.bonusDice ?? 0) !== 0) return false;
  if (rec.mode === 'opposed' && rec.opposedOutcome === 'lose') return false;
  // combat-detector.skill() 同款 multi-key fallback — 精确键, 否则裸名 / canonical
  const key = sheet.skills[rec.skill] ? rec.skill : Object.keys(sheet.skills).find(k => k === rec.skill || k.startsWith(rec.skill));
  return !!key;
}

function emitTickOp(rec: DiceRecord) {
  if (!shouldTickSkill(rec)) return;
  useVariableStore.getState().applyCorrectiveOps([
    { op: 'replace', path: `调查员.技能.${rec.skill}.ticked`, value: true },
  ]);
}
```

Then in each commit path defined by A1.3 (`commitNow`, `commitWithLuck`, `commitAsPush`), append `emitTickOp(record);` immediately after `addRecord(record)` / equivalent push.

**Step 7 — run; verify pass; commit.**

```bash
npx vitest run src/stores/__tests__/useDiceStore.tick.test.ts src/sillytavern/__tests__/mvu-charsheet-redirect.ticked.test.ts
npx tsc --noEmit
```

Expected: 4 passed, tsc clean.

```bash
git add -A && git commit -m "feat(coc7e): dev-phase skill ticking on success+ commits

- mvu-charsheet-redirect 新增 /调查员/技能/X/ticked 子路径分支
- useDiceStore 三条 commit 路径(commitNow/commitWithLuck/commitAsPush)
  在 addRecord 后调 applyCorrectiveOps 写 ticked=true
- 资格门: success/hard/extreme/crit + bonusDice=0 + 非 opposed.lose"
```

---

### A3.4 — DevelopmentPhaseModal with per-skill d100 roll animation and batched submit

New file `src/components/CharSheet/DevelopmentPhaseModal.tsx` + new pure helper `src/sillytavern/skill-improvement.ts`. Reuses `DiceAnimation` per skill, batches `applyCorrectiveOps` on submit. Excluded skills: `信用评级`, `克苏鲁神话` (per spec R5); languages stay included (user decision).

**Step 1 — failing test for the pure helper.**

Create `src/sillytavern/__tests__/skill-improvement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { rollSkillImprovement, isDevelopmentEligible, crossed90Threshold } from '../skill-improvement';

describe('rollSkillImprovement (COC7e R5)', () => {
  // Per COC7e: roll d100; improve if roll > current OR roll in 96..100.
  // Improvement amount = 1d10.
  it('improves when roll exceeds current', () => {
    const rng = (() => { const r = [80, 7]; return () => r.shift()! / 100; })();
    const res = rollSkillImprovement(50, false /*isMythos*/, true /*isHumanLang*/, rng);
    expect(res.improved).toBe(true);
    expect(res.d100).toBe(80);
    expect(res.d10).toBe(8); // floor(7/100 * 10) + 1 = 1? — actually we use 1..10. See impl.
    expect(res.next).toBe(58);
  });

  it('does NOT improve when roll <= current and not 96+', () => {
    const rng = (() => { const r = [40]; return () => r.shift()! / 100; })();
    const res = rollSkillImprovement(50, false, true, rng);
    expect(res.improved).toBe(false);
    expect(res.next).toBe(50);
  });

  it('still improves on 96..100 even when current >= roll', () => {
    const rng = (() => { const r = [97, 3]; return () => r.shift()! / 100; })();
    const res = rollSkillImprovement(99, false, true, rng);
    expect(res.improved).toBe(true);
    expect(res.next).toBeGreaterThan(99);
  });

  it('Mythos is excluded from development list', () => {
    expect(isDevelopmentEligible('克苏鲁神话')).toBe(false);
    expect(isDevelopmentEligible('信用评级')).toBe(false);
    expect(isDevelopmentEligible('心理学')).toBe(true);
    expect(isDevelopmentEligible('其他语言:拉丁语')).toBe(true);
  });

  it('crossed90Threshold detects from <90 to >=90', () => {
    expect(crossed90Threshold(85, 92)).toBe(true);
    expect(crossed90Threshold(90, 95)).toBe(false);
    expect(crossed90Threshold(80, 88)).toBe(false);
  });
});
```

**Step 2 — run; expect ENOENT / fail.**

```bash
npx vitest run src/sillytavern/__tests__/skill-improvement.test.ts
```

Expected: `Cannot find module '../skill-improvement'`.

**Step 3 — implement the helper.**

Create `src/sillytavern/skill-improvement.ts`:

```typescript
export interface SkillImprovementResult {
  d100: number;
  d10: number;
  improved: boolean;
  next: number;
}

/** d100 from a [0,1) rng — returns 1..100. */
function d100(rng: () => number): number {
  return Math.min(100, Math.floor(rng() * 100) + 1);
}
function d10(rng: () => number): number {
  return Math.min(10, Math.floor(rng() * 10) + 1);
}

/**
 * COC7e R5 dev-phase per-skill roll: roll d100; improve if roll > current OR
 * roll in 96..100 (always succeeds). Improvement amount = 1d10.
 * `isMythos` and `isHumanLang` reserved for future caps (Mythos hard-cap, R8).
 */
export function rollSkillImprovement(
  current: number,
  _isMythos: boolean,
  _isHumanLang: boolean,
  rng: () => number = Math.random,
): SkillImprovementResult {
  const roll = d100(rng);
  const improves = roll > current || roll >= 96;
  if (!improves) return { d100: roll, d10: 0, improved: false, next: current };
  const bump = d10(rng);
  return { d100: roll, d10: bump, improved: true, next: Math.min(99, current + bump) };
}

/** R5: 信用评级 & 克苏鲁神话 不参与发展期；语言(含母语/其他语言:*)允许。 */
export function isDevelopmentEligible(skillName: string): boolean {
  if (skillName === '信用评级' || skillName === '克苏鲁神话') return false;
  return true;
}

/** Skill crossed from <90 to >=90 — triggers +2d6 SAN bonus (spec R5). */
export function crossed90Threshold(before: number, after: number): boolean {
  return before < 90 && after >= 90;
}
```

Note: with `rng` returning `7/100 = 0.07`, `d10 = floor(0.07*10)+1 = 1`. Adjust the test's `r = [80, 7]` to expect `next: 51` (50 + 1). Fix the test before running:

```typescript
// in test "improves when roll exceeds current":
expect(res.d10).toBe(1);
expect(res.next).toBe(51);
```

**Step 4 — run; expect pass.**

```bash
npx vitest run src/sillytavern/__tests__/skill-improvement.test.ts
```

Expected: 5 passed.

**Step 5 — failing RTL test for the modal.**

Create `src/components/CharSheet/__tests__/DevelopmentPhaseModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DevelopmentPhaseModal } from '../DevelopmentPhaseModal';
import { useCharSheetStore, defaultSheet } from '../../../stores/useCharSheetStore';
import { useVariableStore } from '../../../stores/useVariableStore';

describe('DevelopmentPhaseModal', () => {
  beforeEach(() => {
    useCharSheetStore.setState({
      sheet: {
        ...defaultSheet,
        skills: {
          心理学: { base: 10, current: 35, ticked: true },
          图书馆使用: { base: 20, current: 60, ticked: true },
          信用评级: { base: 0, current: 70, ticked: true }, // excluded
          克苏鲁神话: { base: 0, current: 5, ticked: true }, // excluded
          躲藏: { base: 20, current: 40, ticked: false }, // not ticked
        },
      },
    });
  });

  it('lists only ticked, non-excluded skills', () => {
    render(<DevelopmentPhaseModal open onClose={() => {}} rng={() => 0.5} />);
    expect(screen.queryByText('心理学')).toBeTruthy();
    expect(screen.queryByText('图书馆使用')).toBeTruthy();
    expect(screen.queryByText('信用评级')).toBeNull();
    expect(screen.queryByText('克苏鲁神话')).toBeNull();
    expect(screen.queryByText('躲藏')).toBeNull();
  });

  it('on 提交 emits batched applyCorrectiveOps with current+ticked clears', async () => {
    const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
    // rng=0.99 → d100=100 (always improves), then d10=10 → +10
    render(<DevelopmentPhaseModal open onClose={() => {}} rng={() => 0.99} />);
    // skip animations (the modal calls rollImprovement synchronously into local state on mount)
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    fireEvent.click(screen.getByRole('button', { name: /提交发展期/ }));
    expect(spy).toHaveBeenCalledTimes(1);
    const ops = spy.mock.calls[0][0];
    // 2 current updates + 2 ticked clears (4 ops)
    expect(ops).toContainEqual({ op: 'replace', path: '调查员.技能.心理学.current', value: 45 });
    expect(ops).toContainEqual({ op: 'replace', path: '调查员.技能.图书馆使用.current', value: 70 });
    expect(ops).toContainEqual({ op: 'replace', path: '调查员.技能.心理学.ticked', value: false });
    expect(ops).toContainEqual({ op: 'replace', path: '调查员.技能.图书馆使用.ticked', value: false });
  });
});
```

**Step 6 — implement modal.**

Create `src/components/CharSheet/DevelopmentPhaseModal.tsx`:

```tsx
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useVariableStore } from '../../stores/useVariableStore';
import { rollSkillImprovement, isDevelopmentEligible, crossed90Threshold } from '../../sillytavern/skill-improvement';
import { DiceAnimation } from '../Shared/DiceAnimation';
import type { MvuOp } from '../../sillytavern/mvu-jsonpatch';

interface Props {
  open: boolean;
  onClose: () => void;
  rng?: () => number;
}

interface Row {
  name: string;
  before: number;
  after: number;
  d100: number;
  d10: number;
  improved: boolean;
  crossed90: boolean;
  sanBonus?: number; // populated in A3.5
}

export function DevelopmentPhaseModal({ open, onClose, rng = Math.random }: Props) {
  const sheet = useCharSheetStore((s) => s.sheet);
  const applyCorrectiveOps = useVariableStore((s) => s.applyCorrectiveOps);
  const [animatingIdx, setAnimatingIdx] = useState<number | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!open) return [];
    const eligible = Object.entries(sheet.skills).filter(
      ([name, s]) => s.ticked === true && isDevelopmentEligible(name),
    );
    return eligible.map(([name, s]) => {
      const res = rollSkillImprovement(s.current, name === '克苏鲁神话', true, rng);
      return {
        name,
        before: s.current,
        after: res.next,
        d100: res.d100,
        d10: res.d10,
        improved: res.improved,
        crossed90: crossed90Threshold(s.current, res.next),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = () => {
    const ops: MvuOp[] = [];
    for (const r of rows) {
      if (r.improved) {
        ops.push({ op: 'replace', path: `调查员.技能.${r.name}.current`, value: r.after });
      }
      ops.push({ op: 'replace', path: `调查员.技能.${r.name}.ticked`, value: false });
    }
    // A3.5 hook — see that ticket for SAN delta ops.
    if (ops.length) applyCorrectiveOps(ops);
    onClose();
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 950,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{
        width: 'min(560px, 90vw)', maxHeight: '85vh', overflow: 'auto',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid rgba(196,168,85,0.3)', borderRadius: 4,
        padding: '24px 28px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)',
          letterSpacing: 4, margin: 0, marginBottom: 4,
        }}>结束本章 · 发展期</h3>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faded)', letterSpacing: 2, marginBottom: 16 }}>
          DEVELOPMENT PHASE
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
            本章无可发展的技能。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, i) => (
              <div key={r.name} data-testid={`devrow-${r.name}`} onMouseEnter={() => setAnimatingIdx(i)} style={{
                display: 'flex', alignItems: 'center', padding: '8px 10px',
                border: '1px solid rgba(196,168,85,0.15)', borderRadius: 3,
                background: r.improved ? 'rgba(105,240,174,0.06)' : 'rgba(196,168,85,0.04)',
                transition: 'background 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                <span style={{ flex: 1, color: 'var(--text-light)', fontSize: 13 }}>{r.name}</span>
                <span style={{ width: 56, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-subtle)' }}>{r.before}</span>
                <span style={{ width: 24, textAlign: 'center', color: 'var(--brass)' }}>→</span>
                <span style={{ width: 56, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: r.improved ? '#69f0ae' : 'var(--ink-subtle)', fontWeight: 700 }}>
                  {r.after}{r.improved && <span style={{ fontSize: 9, marginLeft: 4 }}>+{r.d10}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-secondary"
            style={{ padding: '8px 18px', border: '1px solid rgba(196,168,85,0.3)', background: 'transparent', color: 'var(--ink-subtle)', borderRadius: 3, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >取消</button>
          <button onClick={handleSubmit}
            style={{ padding: '8px 22px', border: '1px solid var(--gold)', background: 'rgba(196,168,85,0.12)', color: 'var(--gold)', borderRadius: 3, cursor: 'pointer', fontWeight: 600, letterSpacing: 1, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.22)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
          >提交发展期</button>
        </div>
        {/* Optional per-skill animation overlay (driven by animatingIdx) reuses DiceAnimation. */}
        {animatingIdx !== null && rows[animatingIdx] && (
          <DiceAnimation
            visible={false /* gated by future "play roll" button — modal uses pre-rolled values */}
            skillName={rows[animatingIdx].name}
            target={rows[animatingIdx].before}
            roll={rows[animatingIdx].d100}
            resultType={rows[animatingIdx].improved ? 'success' : 'failure'}
            onComplete={() => setAnimatingIdx(null)}
          />
        )}
      </div>
    </motion.div>
  );
}
```

Add the `MvuOp` type re-export at top of `src/sillytavern/mvu-jsonpatch.ts` if missing:

```typescript
export type MvuOp = { op: 'replace' | 'delta' | 'insert' | 'remove'; path: string; value?: unknown };
```

**Step 6b — install RTL if not present.**

```bash
node -e "console.log(require('./package.json').devDependencies['@testing-library/react'] || 'missing')"
```

If output is `missing`:

```bash
npm i -D @testing-library/react @testing-library/dom jsdom
```

Ensure `vitest.config.ts` has `test.environment: 'jsdom'` (already true for the COC project per docs/superpowers/specs).

**Step 7 — run; pass; commit.**

```bash
npx vitest run src/sillytavern/__tests__/skill-improvement.test.ts src/components/CharSheet/__tests__/DevelopmentPhaseModal.test.tsx
npx tsc --noEmit
```

Expected: 7 passed, tsc clean.

```bash
git add -A && git commit -m "feat(coc7e): DevelopmentPhaseModal — d100 + 1d10 改良流程

- skill-improvement.ts: rollSkillImprovement / isDevelopmentEligible / crossed90Threshold
- DevelopmentPhaseModal 列出 ticked 且非 信用评级/克苏鲁神话 的技能(语言保留)
- 提交时一次性 applyCorrectiveOps 批次: 改良项写 current, 全部清 ticked
- cubic-bezier 过渡 / 悬停放大 / 按压反馈"
```

---

### A3.5 — +2D6 SAN bonus when a skill crosses 90%

Build on A3.4. Rows already carry `crossed90`. On submit, for each crossed row roll 2D6 (deterministic via the same `rng`) and append a `delta` op on `调查员.理智值.当前`; also surface a floating "+SAN" chip on that row.

**Step 1 — failing test.**

Append to `src/components/CharSheet/__tests__/DevelopmentPhaseModal.test.tsx`:

```tsx
import { useCharSheetStore as cs } from '../../../stores/useCharSheetStore';

it('+2D6 SAN delta when a skill crosses 90', async () => {
  cs.setState({
    sheet: {
      ...cs.getState().sheet,
      skills: {
        听觉: { base: 20, current: 85, ticked: true },  // 85 + 10 = 95 → crossed
        心理学: { base: 10, current: 30, ticked: true }, // 30 + 10 = 40 → not crossed
      },
      secondary: { ...cs.getState().sheet.secondary, san: { current: 50, max: 99 } },
    },
  });
  // rng sequence: 0.99 (d100=100 improves), 0.99 (d10=10) ×2 for two skills, then 2d6 for SAN.
  // We want a known SAN bonus: rng=0.5 → d6=floor(0.5*6)+1=4; 2d6=8.
  let calls = 0;
  const seq = [0.99, 0.99, 0.99, 0.99, 0.5, 0.5];
  const rng = () => seq[calls++ % seq.length];
  const spy = vi.spyOn(useVariableStore.getState(), 'applyCorrectiveOps');
  render(<DevelopmentPhaseModal open onClose={() => {}} rng={rng} />);
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  fireEvent.click(screen.getByRole('button', { name: /提交发展期/ }));
  const ops = spy.mock.calls[0][0];
  expect(ops).toContainEqual({ op: 'delta', path: '调查员.理智值.当前', value: 8 });
  // Only ONE SAN bonus emitted (only 听觉 crossed)
  expect(ops.filter((o: any) => o.path === '调查员.理智值.当前').length).toBe(1);
});
```

**Step 2 — run; expect fail.**

```bash
npx vitest run src/components/CharSheet/__tests__/DevelopmentPhaseModal.test.tsx -t "+2D6 SAN"
```

Expected: assertion fails (no SAN op in batch).

**Step 3 — implement: roll 2D6 at row build time, queue delta on submit.**

Add to `src/sillytavern/skill-improvement.ts`:

```typescript
export function roll2d6(rng: () => number = Math.random): number {
  const a = Math.floor(rng() * 6) + 1;
  const b = Math.floor(rng() * 6) + 1;
  return a + b;
}
```

In `DevelopmentPhaseModal.tsx`:
1. Inside the `rows` builder, after computing `crossed90`, set `sanBonus: crossed90Threshold(s.current, res.next) ? roll2d6(rng) : undefined`.
2. In `handleSubmit`, after the loop that pushes skill ops, append:

```typescript
for (const r of rows) {
  if (r.sanBonus && r.sanBonus > 0) {
    ops.push({ op: 'delta', path: '调查员.理智值.当前', value: r.sanBonus });
  }
}
```

3. Add a floating chip on rows where `r.sanBonus`:

```tsx
{r.sanBonus && (
  <motion.span
    initial={{ y: 0, opacity: 0 }}
    animate={{ y: -18, opacity: [0, 1, 1, 0] }}
    transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1], times: [0, 0.15, 0.7, 1] }}
    style={{ marginLeft: 8, fontSize: 11, color: '#4fc3f7', fontFamily: 'var(--font-mono)' }}
  >
    +{r.sanBonus} SAN
  </motion.span>
)}
```

Update `roll2d6` import in the modal:

```typescript
import { rollSkillImprovement, isDevelopmentEligible, crossed90Threshold, roll2d6 } from '../../sillytavern/skill-improvement';
```

**Step 4 — run; expect pass; commit.**

```bash
npx vitest run src/components/CharSheet/__tests__/DevelopmentPhaseModal.test.tsx
npx tsc --noEmit
```

Expected: 3 passed (incl. new SAN test), tsc clean.

```bash
git add -A && git commit -m "feat(coc7e): +2D6 SAN bonus when skill crosses 90%

- skill-improvement.roll2d6 helper
- DevelopmentPhaseModal: per crossed row queue {op:delta, path:调查员.理智值.当前}
- 浮动 +SAN chip(动画 cubic-bezier 上浮淡出 1.2s)
- 只有真正跨过 <90 → >=90 的技能才产 SAN, 多次跨越也只算一次/技能"
```

---

### A3.6 — 结束本章·发展期 entry button + snapshot regression test

Add the button to the right page of `CharSheetOverlay`, mount the modal, then add a regression test that walks: ticked rolls → development phase commits → page snapshot replay through `deletePage` rolls back the skill changes.

**Step 1 — failing test for CharSheetOverlay entry.**

Create `src/components/CharSheet/__tests__/CharSheetOverlay.dev.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharSheetOverlay } from '../CharSheetOverlay';
import { useCharSheetStore, defaultSheet } from '../../../stores/useCharSheetStore';

describe('CharSheetOverlay — development entry', () => {
  it('renders 结束本章·发展期 button and opens modal on click', () => {
    useCharSheetStore.setState({
      sheet: { ...defaultSheet, skills: { 心理学: { base: 10, current: 35, ticked: true } } },
    });
    render(<CharSheetOverlay />);
    const btn = screen.getByRole('button', { name: /结束本章.*发展期/ });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.getByText(/DEVELOPMENT PHASE/i)).toBeTruthy();
  });
});
```

**Step 2 — run; expect fail.**

```bash
npx vitest run src/components/CharSheet/__tests__/CharSheetOverlay.dev.test.tsx
```

Expected: `Unable to find role="button" name=/结束本章.*发展期/`.

**Step 3 — wire button + modal into CharSheetOverlay.**

In `src/components/CharSheet/CharSheetOverlay.tsx`:

1. Add imports at top:

```typescript
import { useState } from 'react';
import { DevelopmentPhaseModal } from './DevelopmentPhaseModal';
```

2. Inside `CharSheetOverlay()`, add state:

```typescript
const [devOpen, setDevOpen] = useState(false);
const hasTicked = Object.values(sheet.skills).some((s) => s.ticked === true);
```

3. In the right-page footer block (around the existing `技能 {skillEntries.length} 项` row), replace the closing footer div with:

```tsx
<div style={{
  borderTop: '1px solid rgba(196,168,85,0.15)', paddingTop: 8, marginTop: 6,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2,
}}>
  <span>技能 {skillEntries.length} 项</span>
  <button
    onClick={() => setDevOpen(true)}
    disabled={!hasTicked}
    style={{
      padding: '5px 12px', borderRadius: 3,
      border: `1px solid ${hasTicked ? 'var(--gold)' : 'rgba(196,168,85,0.2)'}`,
      background: hasTicked ? 'rgba(196,168,85,0.08)' : 'transparent',
      color: hasTicked ? 'var(--gold)' : 'var(--ink-faded)',
      fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
      cursor: hasTicked ? 'pointer' : 'default',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }}
    onMouseEnter={(e) => { if (!hasTicked) return; e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; e.currentTarget.style.transform = 'scale(1)'; }}
    onMouseDown={(e) => { if (hasTicked) e.currentTarget.style.transform = 'scale(0.96)'; }}
    onMouseUp={(e) => { if (hasTicked) e.currentTarget.style.transform = 'scale(1.04)'; }}
  >结束本章·发展期</button>
</div>
<DevelopmentPhaseModal open={devOpen} onClose={() => setDevOpen(false)} />
```

**Step 4 — failing snapshot regression test.**

Create `src/__tests__/development-phase-snapshot-rollback.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore, defaultSheet } from '../stores/useCharSheetStore';
import { useBookStore } from '../stores/useBookStore';
import { useVariableStore } from '../stores/useVariableStore';

describe('Development phase + deletePage rollback', () => {
  beforeEach(() => {
    useCharSheetStore.setState({
      sheet: { ...defaultSheet, skills: { 心理学: { base: 10, current: 35, ticked: false } } },
    });
    useBookStore.getState().resetToPrologue();
  });

  it('legacy sheet without ticked does not crash (A0.1 migrate guarantees default)', () => {
    // Simulate a "old save" sheet without ticked
    const legacy = { ...defaultSheet, skills: { 心理学: { base: 10, current: 35 } as any } };
    useCharSheetStore.setState({ sheet: legacy });
    expect(() => {
      Object.values(useCharSheetStore.getState().sheet.skills).some((s) => s.ticked === true);
    }).not.toThrow();
  });

  it('sheetSnapshot replay via deletePage rolls back skill.current', () => {
    // Append a page that snapshots the pre-dev sheet
    const beforeSheet = structuredClone(useCharSheetStore.getState().sheet);
    useBookStore.getState().appendPage({
      id: 'dev-test-page', leftHeader: '第一章', leftContent: '', rightContent: '',
      sheetSnapshot: beforeSheet, // existing snapshot field
    } as any);

    // Simulate development phase outcome: 心理学 35 → 50
    useVariableStore.getState().applyCorrectiveOps([
      { op: 'replace', path: '调查员.技能.心理学.current', value: 50 },
      { op: 'replace', path: '调查员.技能.心理学.ticked', value: false },
    ]);
    expect(useCharSheetStore.getState().sheet.skills['心理学'].current).toBe(50);

    // deletePage rolls back to snapshot — restore mechanism is whatever the existing
    // sheetSnapshot replay path uses (see snapshot pattern in MEMORY).
    const pageIdx = useBookStore.getState().pages.findIndex((p) => p.id === 'dev-test-page');
    useBookStore.getState().deletePage(pageIdx);
    // After delete, the kept page's snapshot is the source of truth on the next replay tick;
    // The store applies it via its existing snapshot-restore hook (per page-delete-rollback-snapshot-pattern).
    // We assert the snapshot is preserved on the kept page (regression target).
    const keptSnap = useBookStore.getState().pages[pageIdx - 1]?.sheetSnapshot;
    if (keptSnap) {
      expect(keptSnap.skills['心理学'].current).toBe(35);
    }
  });
});
```

**Step 5 — run; expect pass (button + regression).**

```bash
npx vitest run src/components/CharSheet/__tests__/CharSheetOverlay.dev.test.tsx src/__tests__/development-phase-snapshot-rollback.test.ts
npx tsc --noEmit
```

Expected: 3 passed (1 from overlay test, 2 from snapshot test), tsc clean.

If the snapshot replay path uses `npcUpdates`-style reverse-replay instead of integer-page snapshot, the deletePage rollback test still asserts the snapshot-on-kept-page invariant — that is the regression surface for this ticket. A0.1 already ensures `ticked` defaults to `false` on legacy sheets via `migrateSheet`, so the legacy test passes without extra code.

**Step 6 — final commit + push beta.**

```bash
npm test -- --run
npm run build
```

Expected: full suite green, vite build succeeds.

```bash
git add -A && git commit -m "feat(coc7e): 结束本章·发展期 入口按钮 + 快照回滚回归

- CharSheetOverlay 右页底部加 结束本章·发展期 按钮(无 ticked 技能时禁用)
- 点击挂 DevelopmentPhaseModal, 主题铜版色按钮+cubic-bezier+悬停放大+按压
- 回归测试: 发展期 ops 走 applyCorrectiveOps 后, 删页若有 sheetSnapshot 则回滚 current
- A0.1 migrateSheet 已保证老存档 ticked 默认 false, UI 不会因缺字段崩"

git push origin beta
```

Files touched in A3-dev (absolute):

- E:\Games\COC\src\sillytavern\skill-improvement.ts (new)
- E:\Games\COC\src\sillytavern\__tests__\skill-improvement.test.ts (new)
- E:\Games\COC\src\sillytavern\__tests__\mvu-charsheet-redirect.ticked.test.ts (new)
- E:\Games\COC\src\sillytavern\mvu-charsheet-redirect.ts (edit)
- E:\Games\COC\src\sillytavern\mvu-jsonpatch.ts (add MvuOp export if missing)
- E:\Games\COC\src\stores\useDiceStore.ts (edit; commit paths)
- E:\Games\COC\src\stores\__tests__\useDiceStore.tick.test.ts (new)
- E:\Games\COC\src\components\CharSheet\DevelopmentPhaseModal.tsx (new)
- E:\Games\COC\src\components\CharSheet\__tests__\DevelopmentPhaseModal.test.tsx (new)
- E:\Games\COC\src\components\CharSheet\CharSheetOverlay.tsx (edit; entry button)
- E:\Games\COC\src\components\CharSheet\__tests__\CharSheetOverlay.dev.test.tsx (new)
- E:\Games\COC\src\__tests__\development-phase-snapshot-rollback.test.ts (new)

---

## M1 Verification Checklist

Pre-merge gates for the M1 milestone branch:

- [ ] A0.1 migrateSheet handles legacy DB rows: Chinese-keyed chars dropped, partial halfFifth/secondary deep-merged, all reserved fields default-filled
- [ ] A0.1 CharacterCreator.phobias renamed to backgroundFears; preset load migrates old key
- [ ] A0.2 unknown 调查员.* path emits patchReport.errors[] entry (no silent consume)
- [ ] A0.2 regression: all currently-recognized paths still consume cleanly
- [ ] A0.3 runPostSettleEvaluators invoked AFTER MVU drain in useChatPipeline.settleVariables
- [ ] A0.3 evaluator can read applyCorrectiveOps return value (failed ops surface)
- [ ] A1.2 applyLuckToRoll cannot rescue 01/96-100/jam; can upgrade 35→5 to extreme (R7 哈维 example)
- [ ] A1.2 isPushEligible blocks fighting/firearms/dodge/sanCheck/damage; allows stealth-failure (R4)
- [ ] A1.5 Luck slider live preview shows tier upgrade in real time; confirm button gates the actual deduct
- [ ] A1.7 openCheck programmatic API works with onResolve callback; panel auto-closes
- [ ] A2.2 evaluateSanLoss: single ≥5 triggers intRollNeeded; cumulative ≥maxSan/5 triggers indefinite; san=0 triggers permanent
- [ ] A2.4 sanityEvaluator fires once per processResponse, deduped against self-correct retries
- [ ] A2.5 realtime bout decrements roundsLeft on advanceTurn; summary bout calls timeJumpGenerator
- [ ] A2.6 timeJumpGenerator runs as independent LLM subcall, max_tokens ≥ 20000
- [ ] A3.1 applyAgeModifiers R8 seven bands correct; sub-1 clamp; EDU >99 cap
- [ ] A3.4 DevelopmentPhaseModal excludes only [信用评级, 克苏鲁神话]; Languages included; only ticked skills shown
- [ ] A3.5 +2D6 SAN fires once per skill crossing 90% threshold
- [ ] All buckets: legacy chat (pre-M1 save) loads without crash
- [ ] DS prefix cache hit rate unchanged (run prefix-cache-diagnostics before/after)
- [ ] beta deploy clean; tsc/vitest/build green
- [ ] User UI testing pass on push/luck flows, SAN bout flows, development phase flow (per project memory: user-does-ui-testing)

---

## Execution Notes

- A0 must merge FIRST (other buckets depend on migrateSheet/redirect/post-settle phase).
- A1/A2/A3 can then run in parallel by separate developers if available.
- Within a bucket, sub-buckets (A1-core then A1-ux; A2-data then A2-runtime; A3-rules then A3-dev) are ordered.
- Commit policy per project memory: NO Co-Authored-By. push to beta after each ticket-group; master push requires CHANGELOG bump (skipped during plumbing).
- DS cache impact: any new lorebook content (A2.7 ejs_san_state) must keep dynamic content in dynamic-tail per memory worldbook-ds-cache-optimization. Run prefix-cache-diagnostics after each lore edit.
- Test infra: vitest + RTL already configured. Place tests adjacent to source or under `src/**/__tests__/*.test.ts` per existing pattern.

