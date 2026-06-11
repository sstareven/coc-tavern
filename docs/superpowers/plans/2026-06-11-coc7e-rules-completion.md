# COC 7e 规则补完 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 15 missing COC 7e rules across 5 sub-projects, raising coverage from 57.6% to ~75%.

**Architecture:** Each sub-project is a self-contained phase. Pure-logic engines (`*-engine.ts`) are TDD'd first, then wired into controllers/stores/UI. Existing patterns (combat-engine → combat-controller → CombatPanel) are replicated for new systems.

**Tech Stack:** TypeScript, React, Zustand, Vitest, COC 7e rulebook as canonical reference.

**Spec:** `docs/superpowers/specs/2026-06-11-coc7e-rules-completion-design.md`

---

## Phase A: 职业变量技能点公式

### Task A1: Add `formula` field to Occupation and implement parser

**Files:**
- Modify: `src/sillytavern/coc-data.ts` (Occupation interface + COC_OCCUPATIONS data + new `calcOccSkillPoints`)
- Create: `src/sillytavern/__tests__/calc-occ-skill-points.test.ts`

- [ ] **Step 1: Write failing tests for `calcOccSkillPoints`**

```ts
// src/sillytavern/__tests__/calc-occ-skill-points.test.ts
import { describe, it, expect } from 'vitest';
import { calcOccSkillPoints } from '../coc-data';

const chars = { STR: 60, CON: 50, SIZ: 65, DEX: 70, APP: 80, INT: 75, POW: 55, EDU: 70 };

describe('calcOccSkillPoints', () => {
  it('defaults to EDU*4 when formula is undefined', () => {
    expect(calcOccSkillPoints(undefined, chars)).toBe(280);
  });
  it('parses EDU*4', () => {
    expect(calcOccSkillPoints('EDU*4', chars)).toBe(280);
  });
  it('parses EDU*2+APP*2', () => {
    expect(calcOccSkillPoints('EDU*2+APP*2', chars)).toBe(300); // 140+160
  });
  it('parses EDU*2+STR*2', () => {
    expect(calcOccSkillPoints('EDU*2+STR*2', chars)).toBe(260); // 140+120
  });
  it('parses EDU*2+DEX*2', () => {
    expect(calcOccSkillPoints('EDU*2+DEX*2', chars)).toBe(280); // 140+140
  });
  it('parses EDU*2+POW*2', () => {
    expect(calcOccSkillPoints('EDU*2+POW*2', chars)).toBe(250); // 140+110
  });
  it('parses EDU*2+BEST*2 (BEST = APP=80)', () => {
    expect(calcOccSkillPoints('EDU*2+BEST*2', chars)).toBe(300); // 140+160, APP is highest non-EDU non-SIZ
  });
  it('returns 0 for empty/garbage formula', () => {
    expect(calcOccSkillPoints('', chars)).toBe(280); // fallback to EDU*4
    expect(calcOccSkillPoints('GARBAGE', chars)).toBe(280);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sillytavern/__tests__/calc-occ-skill-points.test.ts`
Expected: FAIL — `calcOccSkillPoints` is not exported from `../coc-data`

- [ ] **Step 3: Implement `calcOccSkillPoints` in `coc-data.ts`**

Add after the `DEFAULT_CHARS` constant (~line 237):

```ts
/**
 * Parse a COC7e occupation skill-point formula like 'EDU*4', 'EDU*2+APP*2', 'EDU*2+BEST*2'.
 * BEST = highest of STR/CON/DEX/APP/POW/INT (excludes EDU and SIZ per COC7e).
 * Falls back to EDU*4 on undefined/unparseable input.
 */
export function calcOccSkillPoints(
  formula: string | undefined,
  chars: Record<COC7Characteristic, number>,
): number {
  const f = (formula ?? '').trim().toUpperCase() || 'EDU*4';
  const termRe = /([A-Z]+)\*(\d+)/g;
  let m: RegExpExecArray | null;
  let total = 0;
  let matched = false;
  while ((m = termRe.exec(f)) !== null) {
    matched = true;
    const key = m[1];
    const mult = parseInt(m[2], 10);
    if (key === 'BEST') {
      const candidates = (['STR', 'CON', 'DEX', 'APP', 'POW', 'INT'] as const).map((k) => chars[k] ?? 0);
      total += Math.max(...candidates) * mult;
    } else if (key in chars) {
      total += (chars[key as COC7Characteristic] ?? 0) * mult;
    }
  }
  if (!matched) return (chars.EDU ?? 50) * 4;
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sillytavern/__tests__/calc-occ-skill-points.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Add `formula` to all 50 occupations in `COC_OCCUPATIONS`**

Add `formula` field to each occupation in the array. The default `EDU*4` occupations can omit the field (the parser defaults). Only non-default formulas need to be explicit. Key assignments per COC7e rulebook:

```ts
// Add formula to Occupation interface:
export interface Occupation {
  name: string;
  crMin: number; crMax: number;
  skills: string[];
  formula?: string;
}

// Then add formula to these occupations (non-EDU*4 ones):
// EDU*2+APP*2: 演员, 艺人, 服务员
// EDU*2+STR*2: 运动员, 消防员, 矿工, 士兵, 拳击手
// EDU*2+DEX*2: 窃贼, 赌徒, 飞行员, 罪犯
// EDU*2+POW*2: 神职人员, 神秘学家, 精神分析师
// EDU*2+INT*2: 作家, 设计师, 编辑
// EDU*2+CON*2: 探险家, 水手, 流浪者, 农民
// EDU*2+BEST*2: 军官, 警察, 私家侦探, 记者
// All others: EDU*4 (omit formula, parser defaults)
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 7: Wire into CharacterCreator**

In `src/components/CharSheet/CharacterCreator.tsx`, line 264, replace:
```ts
const occPointPool = eduVal * 4;
```
with:
```ts
const selectedOccObj = occupation ? occupationPool.find((o) => o.name === occupation) : null;
const occPointPool = calcOccSkillPoints(selectedOccObj?.formula, charValues);
```

Add import at top: `import { calcOccSkillPoints } from '../../sillytavern/coc-data';`

- [ ] **Step 8: Add formula display in StepSkills UI**

Where the occupation skill point total is shown, display the formula text so the player knows why their points changed. Find the occupation points label and append the formula.

- [ ] **Step 9: Commit**

```bash
git add src/sillytavern/coc-data.ts src/sillytavern/__tests__/calc-occ-skill-points.test.ts src/components/CharSheet/CharacterCreator.tsx
git commit -m "feat(chargen): variable occupation skill-point formulas per COC7e"
```

---

## Phase B: 战斗引擎增强

### Task B1: Dying — round-by-round HP loss

**Files:**
- Modify: `src/types/index.ts` (add `stabilized` to Combatant.flags)
- Modify: `src/sillytavern/combat-engine.ts` (update `applyDamage` to set dying correctly)
- Modify: `src/sillytavern/combat-controller.ts` (add bleeding in `advanceTurn`)
- Modify: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: Add `stabilized` flag to Combatant type**

In `src/types/index.ts`, find `Combatant.flags` definition and add `stabilized: boolean`:
```ts
flags: { majorWound: boolean; dying: boolean; unconscious: boolean; dead: boolean; prone: boolean; weaponJammed: boolean; stabilized: boolean };
```

Grep for all `flags:` object literals that construct Combatant flags and add `stabilized: false` to each.

- [ ] **Step 2: Write failing test for dying bleed**

```ts
// In combat-engine.test.ts, add:
import { advanceTurn } from '../combat-controller';

describe('dying bleed-out', () => {
  it('loses 1 HP per round when dying and not stabilized', () => {
    const enc = makeEncounter({
      combatants: [
        makePlayer({ hp: 0, maxHp: 10, flags: { dying: true, stabilized: false, majorWound: true, unconscious: true, dead: false, prone: true, weaponJammed: false } }),
        makeEnemy({ hp: 5, maxHp: 8 }),
      ],
    });
    // Advance past all turns to trigger new round
    let e = enc;
    for (let i = 0; i < enc.turnOrder.length; i++) e = advanceTurn(e);
    const player = e.combatants.find(c => c.faction === 'player')!;
    expect(player.hp).toBe(-1);
  });

  it('dies when HP reaches -maxHp', () => {
    const enc = makeEncounter({
      combatants: [
        makePlayer({ hp: -9, maxHp: 10, flags: { dying: true, stabilized: false, majorWound: true, unconscious: true, dead: false, prone: true, weaponJammed: false } }),
        makeEnemy({ hp: 5, maxHp: 8 }),
      ],
    });
    let e = enc;
    for (let i = 0; i < enc.turnOrder.length; i++) e = advanceTurn(e);
    const player = e.combatants.find(c => c.faction === 'player')!;
    expect(player.flags.dead).toBe(true);
  });

  it('does not bleed when stabilized', () => {
    const enc = makeEncounter({
      combatants: [
        makePlayer({ hp: 0, maxHp: 10, flags: { dying: true, stabilized: true, majorWound: true, unconscious: true, dead: false, prone: true, weaponJammed: false } }),
        makeEnemy({ hp: 5, maxHp: 8 }),
      ],
    });
    let e = enc;
    for (let i = 0; i < enc.turnOrder.length; i++) e = advanceTurn(e);
    const player = e.combatants.find(c => c.faction === 'player')!;
    expect(player.hp).toBe(0);
  });
});
```

Note: `makeEncounter`, `makePlayer`, `makeEnemy` are test helpers — create them if they don't exist, building a minimal valid `Encounter` structure.

- [ ] **Step 3: Implement dying bleed in `advanceTurn`**

In `combat-controller.ts`, at the start of `advanceTurn()`, before the existing `const next = enc.currentIdx + 1;` check, add round-start bleed processing when a new round begins:

```ts
export function advanceTurn(enc: Encounter): Encounter {
  const next = enc.currentIdx + 1;
  if (next >= enc.turnOrder.length) {
    // — New round: bleed dying combatants —
    let combatants = enc.combatants.map((c) => {
      if (!c.flags.dying || c.flags.dead || c.flags.stabilized) return c;
      const newHp = c.hp - 1;
      if (newHp <= -(c.maxHp)) {
        return { ...c, hp: newHp, flags: { ...c.flags, dead: true } };
      }
      return { ...c, hp: newHp };
    });
    // ... rest of existing new-round logic uses `combatants` instead of `enc.combatants`
```

Also add log entries for each bleed event.

- [ ] **Step 4: Update `performFirstAid` to set `stabilized`**

In combat-controller.ts `playerFirstAid`, on successful first aid, set `stabilized: true` and clear `dying` if hp > 0.

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/sillytavern/combat-engine.test.ts`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(combat): dying combatants bleed 1 HP/round until stabilized (COC7e p101)"
```

### Task B2: Major wound CON check

**Files:**
- Modify: `src/sillytavern/combat-engine.ts` (DamageResult gains `conCheckRequired`)
- Modify: `src/sillytavern/combat-controller.ts` (resolve CON check after damage)
- Modify: `src/sillytavern/combat-engine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe('major wound CON check', () => {
  it('returns conCheckRequired when damage >= maxHp/2', () => {
    const target = makeCombatant({ hp: 10, maxHp: 10 });
    const result = applyDamage(target, 5); // 5 >= ceil(10/2)
    expect(result.conCheckRequired).toBe(true);
  });
  it('does not require CON check for minor damage', () => {
    const target = makeCombatant({ hp: 10, maxHp: 10 });
    const result = applyDamage(target, 3);
    expect(result.conCheckRequired).toBe(false);
  });
});
```

- [ ] **Step 2: Add `conCheckRequired` to `DamageResult`**

```ts
export interface DamageResult { combatant: Combatant; dealt: number; majorWound: boolean; conCheckRequired: boolean; }
```

In `applyDamage`, set `conCheckRequired = majorWound && !flags.dead`.

- [ ] **Step 3: Resolve CON check in controller**

In `performAttack` and `runAiTurn`, after `applyDamage` returns with `conCheckRequired: true`, roll d100 vs target CON. On failure, set `flags.unconscious = true`. Add log and dice record.

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(combat): CON check after major wound — fail means unconscious (COC7e p101)"
```

### Task B3: Aiming action

**Files:**
- Modify: `src/types/index.ts` (add `aimingAt` to Combatant.flags)
- Modify: `src/sillytavern/combat-controller.ts` (new `playerAim`, modify ranged attack bonus)
- Modify: `src/sillytavern/combat-engine.ts` (aiming bonus in `resolveRanged`)
- Modify: `src/components/Combat/CombatPanel.tsx` (aim button)

- [ ] **Step 1: Add `aimingAt?: string` to Combatant.flags in types**

- [ ] **Step 2: Write test for aim → ranged bonus**

```ts
describe('aiming', () => {
  it('grants +1 bonus die on next ranged shot at aimed target', () => {
    let enc = makeEncounter({ /* player with ranged weapon, aimingAt: enemy.id */ });
    enc = playerAttack(enc, 0); // ranged attack
    // Verify resolveRanged was called with bonus +1 (check via mock or result)
  });
  it('clears aimingAt after attacking', () => {
    // After attack, player.flags.aimingAt should be undefined
  });
});
```

- [ ] **Step 3: Implement `playerAim` in combat-controller.ts**

```ts
export function playerAim(enc: Encounter, targetId: string): Encounter {
  const player = enc.combatants.find((c) => c.faction === 'player');
  if (!player) return enc;
  let e = patchCombatant(enc, player.id, { flags: { ...player.flags, aimingAt: targetId } });
  const target = byId(e, targetId);
  e = log(e, `${player.name} 瞄准 ${target?.name ?? '目标'}`, 'narrative');
  // Consume turn
  const end = checkEndReason(e);
  if (end) return { ...e, status: 'resolving', endReason: end };
  return advanceUntilPlayerOrEnd(e);
}
```

- [ ] **Step 4: Modify ranged attack to check aimingAt**

In `performAttack`, before `resolveRanged` call, check `attacker.flags.aimingAt === targetId`. If true, pass `bonus + 1`. After attack, clear `aimingAt`.

- [ ] **Step 5: Add "瞄准" button to CombatPanel**

In the action bar, add between weapon attacks and tactical actions:
```tsx
{rangedIdx >= 0 && <ActionBtn label="瞄准" disabled={!canAct} onClick={() => act(false, () => setEncounter(playerAim(enc, enc.playerTargetId!)))} />}
```

- [ ] **Step 6: Run tests, commit**

```bash
git commit -m "feat(combat): aiming action — spend round for +1 bonus die on next shot (COC7e p98)"
```

### Task B4: Cover modifiers

**Files:**
- Modify: `src/types/index.ts` (add `coverMap` to Encounter)
- Modify: `src/sillytavern/combat-detector.ts` (request cover in LLM prompt)
- Modify: `src/sillytavern/combat-controller.ts` (apply cover penalties)
- Modify: `src/components/Combat/CombatPanel.tsx` (cover icons)

- [ ] **Step 1: Add `coverMap` to Encounter type**

```ts
coverMap?: Record<string, 'none' | 'half' | 'full'>;
```

- [ ] **Step 2: Write test for cover penalty on ranged**

```ts
describe('cover', () => {
  it('adds 1 penalty die for half cover', () => {
    const enc = makeEncounter({ coverMap: { 'enemy-1': 'half' } });
    // Attack enemy-1 with ranged → verify penalty +1
  });
  it('blocks ranged attack against full cover', () => {
    const enc = makeEncounter({ coverMap: { 'enemy-1': 'full' } });
    // Attack enemy-1 → log says "目标处于全掩护"
  });
});
```

- [ ] **Step 3: Apply cover in `performAttack` ranged path**

In the ranged section of `performAttack`, before `resolveRanged`:
```ts
const cover = enc.coverMap?.[targetId] ?? 'none';
if (cover === 'full') {
  return log(enc, `${attacker.name} 无法射击 ${target.name}（全掩护）`, 'narrative');
}
const coverPenalty = cover === 'half' ? 1 : 0;
// pass coverPenalty into resolveRanged penalty parameter
```

- [ ] **Step 4: Add cover to LLM combat-detection prompt**

In `combat-detector.ts`, in the LLM system prompt for `detectAndBuildEncounter`, add request for `coverMap` in the expected JSON output.

- [ ] **Step 5: Show cover icon in CombatPanel enemy rows**

Add a small shield icon next to enemy name when `enc.coverMap?.[e.id]` is `'half'` or `'full'`.

- [ ] **Step 6: Run tests, commit**

```bash
git commit -m "feat(combat): cover modifiers — half cover +1 penalty, full cover blocks fire (COC7e p99)"
```

### Task B5: Tiered healing (medical care + natural recovery)

**Files:**
- Modify: `src/sillytavern/time-engine.ts` (rework `executeRest`, add `executeMedicalCare`)
- Modify: `src/sillytavern/time-engine.test.ts`
- Modify: `src/components/Book/RestHint.tsx` (medical care button)

- [ ] **Step 1: Write tests for tiered healing**

```ts
describe('tiered healing', () => {
  it('executeRest 8h gives 0 HP (only fatigue reset)', () => {
    const result = executeRest(1000, 8);
    expect(result.hpRecovered).toBe(0);
  });
  it('executeRest 168h (7 days) gives 1D3 HP natural recovery', () => {
    const result = executeRest(1000, 168, () => 0.5);
    expect(result.hpRecovered).toBe(2); // 1D3 with rng=0.5 → 2
  });
  it('executeMedicalCare success recovers 1D3', () => {
    const result = executeMedicalCare(60, 80, () => 0.1, () => 0.5); // roll=11 vs 60, success → 1D3=2
    expect(result.success).toBe(true);
    expect(result.hpRecovered).toBe(2);
  });
  it('executeMedicalCare failure recovers 0', () => {
    const result = executeMedicalCare(60, 80, () => 0.9); // roll=91 vs 60, fail
    expect(result.success).toBe(false);
    expect(result.hpRecovered).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

Modify `executeRest` signature to accept `restHours` and optional `rng`:
```ts
export function executeRest(epochMinutes: number, restHours: number = 8, rng: () => number = Math.random): { newEpoch: number; hpRecovered: number } {
  const newEpoch = epochMinutes + restHours * 60;
  const hpRecovered = restHours >= 168 ? Math.floor(rng() * 3) + 1 : 0;
  return { newEpoch, hpRecovered };
}
```

Add `executeMedicalCare`:
```ts
export interface MedicalCareResult { success: boolean; roll: number; hpRecovered: number; }

export function executeMedicalCare(
  medicineSkill: number, maxHp: number,
  rng: () => number = Math.random, hpRng: () => number = Math.random,
): MedicalCareResult {
  const roll = Math.floor(rng() * 100) + 1;
  const success = roll <= medicineSkill;
  const hpRecovered = success ? Math.floor(hpRng() * 3) + 1 : 0;
  return { success, roll, hpRecovered };
}
```

- [ ] **Step 3: Update RestHint.tsx callers**

Update `handleRest` to pass `8` (hours) to `executeRest`. Add "接受治疗" button that calls `executeMedicalCare` when party NPC has 医学 skill.

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(healing): tiered healing — first aid / medical care / natural recovery (COC7e p102)"
```

---

## Phase C: 理智系统增强

### Task C1: Psychoanalysis SAN recovery

**Files:**
- Create: `src/sillytavern/__tests__/sanity-recovery.test.ts`
- Modify: `src/sillytavern/sanity-engine.ts` (add `rollPsychoanalysis`)
- Modify: `src/components/Book/RestHint.tsx` (therapy button)

- [ ] **Step 1: Write tests**

```ts
describe('rollPsychoanalysis', () => {
  it('success recovers 1D3 SAN', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.1, () => 0.5); // roll=11 vs 60 → success, d3=2
    expect(r.success).toBe(true);
    expect(r.recovered).toBe(2);
  });
  it('failure recovers 0', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.9);
    expect(r.success).toBe(false);
    expect(r.recovered).toBe(0);
  });
  it('caps at sanMax', () => {
    const r = rollPsychoanalysis(60, 79, 80, () => 0.1, () => 0.9); // d3=3, but cap at 80-79=1
    expect(r.recovered).toBe(1);
  });
  it('self-therapy uses hard difficulty (skill/2)', () => {
    const r = rollPsychoanalysis(60, 40, 80, () => 0.4, undefined, true); // roll=41, 41 > 30 (60/2) → fail
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `rollPsychoanalysis`**

Add to `sanity-engine.ts`:
```ts
export function rollPsychoanalysis(
  analystSkill: number, currentSan: number, sanMax: number,
  rng: () => number = Math.random, hpRng: () => number = Math.random,
  selfTherapy: boolean = false,
): { recovered: number; roll: number; success: boolean } {
  const effectiveSkill = selfTherapy ? Math.floor(analystSkill / 2) : analystSkill;
  const roll = Math.floor(rng() * 100) + 1;
  const success = roll <= effectiveSkill;
  if (!success || currentSan >= sanMax) return { recovered: 0, roll, success };
  const d3 = Math.floor(hpRng() * 3) + 1;
  return { recovered: Math.min(d3, sanMax - currentSan), roll, success };
}
```

- [ ] **Step 3: Wire into RestHint**

In `RestHint.tsx`, check if any party NPC has 精神分析 skill > 0. If yes and 7+ game days since last therapy, show "心理治疗" button. On click: call `rollPsychoanalysis`, apply SAN change to sheet.

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(sanity): psychoanalysis SAN recovery +1D3 (COC7e p140)"
```

### Task C2: Milestone SAN recovery

**Files:**
- Modify: `src/sillytavern/post-settle-evaluators.ts` (new evaluator)
- Create: `src/sillytavern/__tests__/milestone-san-recovery.test.ts`

- [ ] **Step 1: Write test for milestone detection**

```ts
describe('milestoneSanRecovery', () => {
  it('awards 1D6 SAN when anchor node completes', () => {
    // Mock context with anchor store showing a newly completed node
    // Verify applyCorrectiveOps called with SAN increase
  });
  it('does nothing when no nodes completed this turn', () => {
    // No completed nodes → no ops
  });
});
```

- [ ] **Step 2: Implement evaluator**

Add `milestoneSanRecoveryEvaluator` to the evaluator chain in `post-settle-evaluators.ts`. It checks `useAnchorStore` for nodes that transitioned to `completed` this turn. On first such node, roll 1D6, cap at sanMax, emit corrective op to `/调查员/SAN`.

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat(sanity): milestone SAN recovery +1D6 on plot anchor completion (COC7e p180)"
```

### Task C3: Latent insanity phase

**Files:**
- Modify: `src/types/index.ts` (add `latentInsanity` to CharacterSheet secondary)
- Modify: `src/sillytavern/bout-dispatch.ts` (set latent after bout ends)
- Modify: `src/sillytavern/sanity-engine.ts` (check latent before INT check)
- Create: `src/sillytavern/__tests__/latent-insanity.test.ts`

- [ ] **Step 1: Add `latentInsanity` to types**

Find `secondary` in CharacterSheet definition. Add:
```ts
latentInsanity?: { active: boolean; expiresAtEpoch: number; };
```

- [ ] **Step 2: Write tests**

```ts
describe('latent insanity', () => {
  it('any SAN loss during latent phase triggers immediate bout', () => {
    // Set latentInsanity.active=true, expiresAtEpoch=future
    // Apply 1 point SAN loss → should trigger bout without INT check
  });
  it('latent expires after epoch passes', () => {
    // Set latentInsanity.active=true, expiresAtEpoch=past
    // Apply SAN loss → normal flow (INT check as usual)
  });
});
```

- [ ] **Step 3: Implement latent state transitions**

In `bout-dispatch.ts` `triggerBout()`, after writing bout ops, also write latent insanity activation (will activate when bout `roundsLeft` reaches 0):
```ts
// After bout resolution, set latent period = 1D10 hours
const latentHours = rollD10();
ctx.applyCorrectiveOps([
  { op: 'replace', path: '/调查员/latentInsanity/active', value: true },
  { op: 'replace', path: '/调查员/latentInsanity/expiresAtEpoch', value: currentEpoch + latentHours * 60 },
]);
```

In `sanity-engine.ts`, before the INT check gate, add:
```ts
if (sheet.secondary.san.latentInsanity?.active && epochNow < sheet.secondary.san.latentInsanity.expiresAtEpoch && sanLoss >= 1) {
  // Skip INT check, directly trigger new bout
  return triggerBout(ctx, mode);
}
```

- [ ] **Step 4: Clear latent on time advance**

In the time-advance evaluator or `time-engine.ts`, check if epoch has passed `expiresAtEpoch`. If so, clear `latentInsanity`.

- [ ] **Step 5: Run tests, commit**

```bash
git commit -m "feat(sanity): latent insanity phase — any SAN loss re-triggers bout (COC7e p132)"
```

### Task C4: Reality checks (LLM-guided)

**Files:**
- Modify: `src/sillytavern/sanity-prompt-engine.ts` (inject reality-check guidance)

- [ ] **Step 1: Add conditional lorebook entry for reality checks**

In `sanity-prompt-engine.ts`, when building sanity-state injection, if the investigator has active temporary/indefinite insanity or latent insanity, inject a constant lorebook entry:

```ts
const REALITY_CHECK_GUIDANCE = `调查员正处于疯狂状态。你可以在叙事中加入虚假感知（幻觉、幻听、不存在的人物）。
当调查员试图辨别真假时，在选项中使用检定标签让玩家投 INT 困难检定：
成功则告知幻觉，失败则维持幻象不提示。`;
```

This is LLM-guided, no engine code needed. The existing `<check>` tag parsing in `RightPage.tsx` handles the dice roll.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(sanity): reality check guidance injection during insanity (COC7e p133)"
```

### Task C5: Phobia/mania penalty dice

**Files:**
- Create: `src/sillytavern/__tests__/phobia-penalty.test.ts`
- Modify: `src/sillytavern/dice-engine.ts` (add `checkPhobiaPenalty`)
- Modify: `src/stores/useDiceStore.ts` (auto-apply penalty)

- [ ] **Step 1: Write tests**

```ts
describe('checkPhobiaPenalty', () => {
  it('returns 1 penalty die when context matches phobia keyword', () => {
    expect(checkPhobiaPenalty('侦查', '面对深海黑暗', ['深海恐惧症'], [])).toBe(1);
  });
  it('returns 0 when no match', () => {
    expect(checkPhobiaPenalty('侦查', '检查书架', ['深海恐惧症'], [])).toBe(0);
  });
  it('matches mania keywords too', () => {
    expect(checkPhobiaPenalty('话术', '谈论火焰', [], ['纵火狂'])).toBe(1);
  });
  it('returns 0 without context', () => {
    expect(checkPhobiaPenalty('侦查', undefined, ['深海恐惧症'], [])).toBe(0);
  });
});
```

- [ ] **Step 2: Implement `checkPhobiaPenalty`**

Add to `dice-engine.ts`:
```ts
export function checkPhobiaPenalty(
  _skillName: string,
  context: string | undefined,
  phobias: string[],
  manias: string[],
): number {
  if (!context) return 0;
  const ctx = context.toLowerCase();
  const allKeywords = [...phobias, ...manias];
  for (const kw of allKeywords) {
    const clean = kw.replace(/恐惧症|狂$/, '').toLowerCase();
    if (clean && ctx.includes(clean)) return 1;
  }
  return 0;
}
```

- [ ] **Step 3: Wire into useDiceStore.rollStaged / openCheck**

In `useDiceStore.ts`, in the `roll` and `rollStaged` functions, after computing `bonusDice`, check `checkPhobiaPenalty` against `useCharSheetStore.getState().sheet.phobias` and `sheet.manias`. If penalty returned, adjust `bonusDice` by -1 (adding penalty).

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(sanity): phobia/mania penalty dice on matching check context (COC7e p133)"
```

---

## Phase D: 魔法机制化

### Task D1: Magic engine — POW contest spell casting

**Files:**
- Create: `src/sillytavern/magic-engine.ts`
- Create: `src/sillytavern/__tests__/magic-engine.test.ts`
- Modify: `src/sillytavern/coc-spells.ts` (add `requiresPowContest` to CocSpell)

- [ ] **Step 1: Write tests**

```ts
describe('resolveSpellCast', () => {
  it('caster wins when caster level > target level', () => {
    // rng sequence: caster rolls low (success), target rolls high (fail)
    const r = resolveSpellCast(60, 40, spell, 10, 12, false, seqRng([0.1, 0.1, 0.9, 0.1]));
    expect(r.success).toBe(true);
    expect(r.mpSpent).toBe(spell.mpCost);
  });
  it('caster loses on tie (defender advantage)', () => {
    // Both succeed at same level → caster fails
  });
  it('deducts full MP on success, 1 MP on failure', () => {
    // Check mpSpent values
  });
  it('HP sacrifice when MP insufficient and allowed', () => {
    const r = resolveSpellCast(60, 40, spell, 2, 12, true, seqRng([0.1, 0.1, 0.9, 0.1]));
    expect(r.hpSacrificed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `magic-engine.ts`**

```ts
import { d100WithDice, successLevel, type SuccessLevel, type Rng } from './combat-engine';
import type { CocSpell } from './coc-spells';

const LEVEL_RANK: Record<SuccessLevel, number> = { fumble: 0, fail: 1, success: 2, hard: 3, extreme: 4, critical: 5 };

export interface SpellCastResult {
  success: boolean;
  casterRoll: number;
  casterLevel: SuccessLevel;
  targetRoll: number;
  targetLevel: SuccessLevel;
  mpSpent: number;
  sanLost: number;
  hpSacrificed: number;
}

export function resolveSpellCast(
  casterPow: number, targetPow: number, spell: CocSpell,
  casterMp: number, casterHp: number, allowHpSacrifice: boolean,
  rng: Rng = Math.random,
): SpellCastResult {
  const cRoll = d100WithDice(0, 0, rng);
  const cLevel = successLevel(cRoll.finalRoll, casterPow);
  const tRoll = d100WithDice(0, 0, rng);
  const tLevel = successLevel(tRoll.finalRoll, targetPow);
  const cR = LEVEL_RANK[cLevel], tR = LEVEL_RANK[tLevel];
  const success = cR > tR; // tie → defender wins
  const mpNeeded = success ? spell.mpCost : 1;
  let mpSpent = Math.min(mpNeeded, casterMp);
  let hpSacrificed = 0;
  if (mpSpent < mpNeeded && allowHpSacrifice) {
    hpSacrificed = Math.min(mpNeeded - mpSpent, casterHp - 1);
    mpSpent += hpSacrificed; // HP→MP conversion 1:1
  }
  return {
    success, casterRoll: cRoll.finalRoll, casterLevel: cLevel,
    targetRoll: tRoll.finalRoll, targetLevel: tLevel,
    mpSpent, sanLost: spell.sanCost, hpSacrificed,
  };
}
```

- [ ] **Step 3: Add `requiresPowContest` to CocSpell**

In `coc-spells.ts`, add optional field: `requiresPowContest?: boolean;`. Set it to `true` for offensive spells.

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(magic): POW contest spell casting engine (COC7e p148)"
```

### Task D2: MP recovery

**Files:**
- Modify: `src/sillytavern/time-engine.ts` (MP recovery in rest)
- Modify: `src/components/Book/RestHint.tsx` (display MP recovery)
- Modify: `src/sillytavern/time-engine.test.ts`

- [ ] **Step 1: Write tests**

```ts
describe('MP recovery', () => {
  it('recovers proportional MP during 8h rest', () => {
    // 8h/24h of maxMp=11 → floor(11 * 8/24) = 3
    const result = computeMpRecovery(11, 5, 8);
    expect(result).toBe(3); // min(3, 11-5=6) → 3
  });
  it('caps at maxMp', () => {
    const result = computeMpRecovery(11, 10, 24);
    expect(result).toBe(1); // 11-10=1
  });
});
```

- [ ] **Step 2: Implement `computeMpRecovery` in time-engine.ts**

```ts
export function computeMpRecovery(maxMp: number, currentMp: number, restHours: number): number {
  const recovery = Math.floor(maxMp * (restHours / 24));
  return Math.min(recovery, Math.max(0, maxMp - currentMp));
}
```

- [ ] **Step 3: Wire into RestHint.tsx**

In `handleRest`, after HP recovery, compute MP recovery and apply to sheet:
```ts
const mpMax = Math.floor(pow / 5);
const mpCurrent = newSheet.secondary.mp.current;
const mpRecovery = computeMpRecovery(mpMax, mpCurrent, 8);
if (mpRecovery > 0) {
  newSheet.secondary.mp.current = mpCurrent + mpRecovery;
  sheetChanged = true;
}
```

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(magic): MP recovery during rest — proportional to rest time (COC7e p148)"
```

### Task D3: Creature stat block templates

**Files:**
- Create: `src/sillytavern/creature-data.ts`
- Create: `src/sillytavern/__tests__/creature-data.test.ts`
- Modify: `src/sillytavern/combat-detector.ts` (use templates in encounter building)

- [ ] **Step 1: Write tests**

```ts
describe('matchCreature', () => {
  it('matches "深潜者" to Deep One template', () => {
    const c = matchCreature('深潜者');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('深潜者');
    expect(c!.hp).toBe(14);
  });
  it('matches English alias "deep one"', () => {
    expect(matchCreature('Deep One')).not.toBeNull();
  });
  it('returns null for unknown creature', () => {
    expect(matchCreature('普通人')).toBeNull();
  });
  it('matches partial name "食尸鬼" in "一只食尸鬼"', () => {
    expect(matchCreature('一只食尸鬼')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Implement creature-data.ts**

Create the file with `CreatureTemplate` interface, `CREATURE_TEMPLATES` array (20 creatures per spec), and `matchCreature` function that does case-insensitive substring matching against `name` and `aliases`.

Key creatures with COC7e-accurate stats:
```ts
export interface CreatureTemplate {
  name: string;
  aliases: string[];
  str: number; con: number; siz: number; pow: number; dex: number; int: number;
  hp: number; armor: number; mov: number;
  db: string; build: number;
  attacks: { name: string; skill: number; damage: string; attacksPerRound: number; }[];
  sanLoss: { success: string; fail: string };
}

export const CREATURE_TEMPLATES: CreatureTemplate[] = [
  {
    name: '深潜者', aliases: ['Deep One', 'deep one', '鱼人'],
    str: 80, con: 65, siz: 75, pow: 55, dex: 50, int: 65,
    hp: 14, armor: 1, mov: 8, db: '+1D4', build: 1,
    attacks: [{ name: '爪击', skill: 45, damage: '1D6+1D4', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // ... 19 more creatures
];
```

- [ ] **Step 3: Wire into combat-detector.ts**

In `detectAndBuildEncounter`, after LLM returns enemy names, try `matchCreature(name)` first. If matched, build `Combatant` from template instead of LLM-provided stats.

- [ ] **Step 4: Run tests, commit**

```bash
git commit -m "feat(creatures): 20 Mythos creature stat-block templates for combat (COC7e ch14)"
```

---

## Phase E: 追逐系统

### Task E1: Chase engine — core functions

**Files:**
- Create: `src/sillytavern/chase-engine.ts`
- Create: `src/sillytavern/__tests__/chase-engine.test.ts`

- [ ] **Step 1: Write tests for movement and gap**

```ts
describe('chase movement', () => {
  it('calculates movement = 1 base for MOV 8', () => {
    expect(calcMovement({ mov: 8 } as ChaseParticipant, false)).toBe(1);
  });
  it('sprint adds 1 to movement', () => {
    expect(calcMovement({ mov: 8 } as ChaseParticipant, true)).toBe(2);
  });
  it('MOV advantage: higher MOV gets extra distance', () => {
    expect(calcMovement({ mov: 10 } as ChaseParticipant, false)).toBe(3); // 1 + (10-8)
  });
});

describe('getGap', () => {
  it('returns distance between pursuer and quarry', () => {
    const chase = makeChase({ participants: [
      { id: 'p', role: 'pursuer', position: 2 },
      { id: 'q', role: 'quarry', position: 5 },
    ]});
    expect(getGap(chase)).toBe(3);
  });
});
```

- [ ] **Step 2: Implement core engine**

```ts
// src/sillytavern/chase-engine.ts
import type { Chase, ChaseParticipant, ChaseLocation } from '../types';
import { successLevel, d100WithDice, type Rng } from './combat-engine';

const BASE_MOV = 8;

export function calcMovement(p: ChaseParticipant, sprinting: boolean): number {
  const base = 1 + Math.max(0, p.mov - BASE_MOV);
  return sprinting ? base + 1 : base;
}

export function getGap(chase: Chase): number {
  const pursuers = chase.participants.filter(p => p.role === 'pursuer');
  const quarries = chase.participants.filter(p => p.role === 'quarry');
  if (!pursuers.length || !quarries.length) return 0;
  const pMax = Math.max(...pursuers.map(p => p.position));
  const qMin = Math.min(...quarries.map(p => p.position));
  return Math.max(0, qMin - pMax);
}

export function checkChaseEnd(chase: Chase): { ended: boolean; reason?: Chase['endReason'] } {
  if (getGap(chase) <= 0) return { ended: true, reason: 'caught' };
  const maxPos = chase.locations.length - 1;
  const quarryEscaped = chase.participants.some(p => p.role === 'quarry' && p.position >= maxPos);
  if (quarryEscaped) return { ended: true, reason: 'escaped' };
  const allExhausted = chase.participants
    .filter(p => p.role === 'pursuer')
    .every(p => p.flags.exhausted);
  if (allExhausted) return { ended: true, reason: 'exhausted' };
  return { ended: false };
}
```

- [ ] **Step 3: Write tests for sprint + CON check**

```ts
describe('sprint', () => {
  it('increments sprintCount', () => {
    const chase = performSprint(makeChase(), 'player', rng);
    expect(chase.participants[0].sprintCount).toBe(1);
  });
  it('requires CON check every 5 sprints — fail reduces MOV', () => {
    const p = { ...makeParticipant(), sprintCount: 4, con: 50 };
    const chase = makeChase({ participants: [p, makeQuarry()] });
    // rng makes CON check fail
    const result = performSprint(chase, p.id, failRng);
    expect(result.participants[0].mov).toBe(p.mov - 1);
  });
});
```

- [ ] **Step 4: Implement sprint, shortcut, barricade**

```ts
export function performSprint(chase: Chase, participantId: string, rng: Rng = Math.random): Chase {
  // Move + 1, increment sprintCount, CON check every 5th sprint
}

export function attemptShortcut(chase: Chase, participantId: string, skillName: string, rng: Rng = Math.random): Chase {
  // Skill check → success: quarry position -1 (or pursuer position +1)
}

export function createBarricade(chase: Chase, participantId: string, rng: Rng = Math.random): Chase {
  // Adds a barrier to the location behind the participant
}

export function resolveHazard(chase: Chase, participantId: string, rng: Rng = Math.random): Chase {
  // Resolve hazard/barrier at current location
}
```

- [ ] **Step 5: Run tests, commit**

```bash
git commit -m "feat(chase): core chase engine — movement, sprint, shortcut, barrier, end conditions"
```

### Task E2: Chase controller

**Files:**
- Create: `src/sillytavern/chase-controller.ts`
- Create: `src/sillytavern/__tests__/chase-controller.test.ts`

- [ ] **Step 1: Write test for turn advance**

```ts
describe('advanceChaseTurn', () => {
  it('advances to next participant', () => {
    const chase = makeChase({ currentIdx: 0, turnOrder: ['p', 'q'] });
    const next = advanceChaseTurn(chase);
    expect(next.currentIdx).toBe(1);
  });
  it('wraps to new round', () => {
    const chase = makeChase({ currentIdx: 1, turnOrder: ['p', 'q'] });
    const next = advanceChaseTurn(chase);
    expect(next.round).toBe(2);
    expect(next.currentIdx).toBe(0);
  });
});
```

- [ ] **Step 2: Implement controller**

```ts
export type ChaseAction = 'move' | 'sprint' | 'shortcut' | 'barricade' | 'attack' | 'hide';

export function advanceChaseTurn(chase: Chase, rng?: Rng): Chase { /* ... */ }
export function playerChaseAction(chase: Chase, action: ChaseAction, skillName?: string): Chase { /* ... */ }
export function runAiChaseTurn(chase: Chase, participantId: string, rng?: Rng): Chase { /* ... */ }
```

AI decision: quarry prefers sprint (if CON > 40), else move. Pursuer mirrors.

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat(chase): chase controller — turn management and AI decisions"
```

### Task E3: Chase store + persistence

**Files:**
- Create: `src/stores/useChaseStore.ts`
- Modify: `src/db/db.ts` (DB migration for chase table)
- Modify: `src/db/session-lifecycle.ts` (clear/save/load/delete for chase)

- [ ] **Step 1: Create useChaseStore**

```ts
import { create } from 'zustand';
import type { Chase } from '../types';

interface ChaseStore {
  chase: Chase | null;
  setChase: (c: Chase | null) => void;
  clearChase: () => void;
  seenLogLen: number;
  markSeen: (n: number) => void;
}

export const useChaseStore = create<ChaseStore>((set) => ({
  chase: null,
  setChase: (chase) => set({ chase }),
  clearChase: () => set({ chase: null, seenLogLen: 0 }),
  seenLogLen: 0,
  markSeen: (n) => set({ seenLogLen: n }),
}));
```

- [ ] **Step 2: DB migration**

Add `chase` table to Dexie schema in `db.ts`, bump version. Follow the exact pattern used for the `combat` table.

- [ ] **Step 3: Wire session lifecycle**

In `session-lifecycle.ts`, add chase to the clear/save/load/delete operations, mirroring combat.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(chase): chase store + DB persistence + session lifecycle"
```

### Task E4: Chase detector

**Files:**
- Create: `src/sillytavern/chase-detector.ts`

- [ ] **Step 1: Implement keyword heuristic + LLM builder**

```ts
const CHASE_CUES = ['追', '逃跑', '跑', '赶', '奔跑', '逃离', '追赶', '追逐', '撤退', '狂奔', '飞奔', '夺路', '拔腿'];

export function shouldDetectChase(narrative: string): boolean {
  if (!narrative) return false;
  return CHASE_CUES.some((c) => narrative.includes(c));
}

export async function detectAndBuildChase(
  narrative: string, sheet: CharacterSheet, statData: Record<string, unknown>,
  /* LLM config params */
): Promise<Chase | null> {
  // LLM sub-call: generate 5-10 locations, participants, initial gap
  // Build Chase object from response
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(chase): chase detector — keyword heuristic + LLM location-chain builder"
```

### Task E5: Chase panel UI

**Files:**
- Create: `src/components/Chase/ChasePanel.tsx`
- Modify: `src/components/Book/Storybook.tsx` (render ChasePanel when chase active)

- [ ] **Step 1: Create ChasePanel**

Follow CombatPanel patterns: read from `useChaseStore`, display location chain visualization, action buttons, log with typewriter reveal, dice animations.

Layout:
```
Header: "追逐 · 第 N 轮" | "距离: M 地点"
Location chain: horizontal strip with position markers
Log: scrolling area with typewriter reveal
Status bar: MOV | CON | 冲刺 N/5
Action bar: [移动][冲刺][捷径][设障][攻击]
```

- [ ] **Step 2: Integrate into Storybook.tsx**

In the right-page render logic, add chase check alongside combat check:
```tsx
const chase = useChaseStore((s) => s.chase);
// If chase active and viewing anchor page, render ChasePanel instead of right page
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(chase): ChasePanel UI — location chain, actions, dice animations"
```

### Task E6: Chase pipeline integration

**Files:**
- Modify: `src/sillytavern/useChatPipeline.ts` (fire-and-forget chase detection)
- Modify: `src/components/Combat/CombatPanel.tsx` (mutual exclusion with chase)

- [ ] **Step 1: Add chase detection in pipeline**

After main turn settles, add chase detection (mirroring combat detection):
```ts
if (!encounter && !chase && shouldDetectChase(lastNarrative)) {
  detectAndBuildChase(lastNarrative, sheet, statData, ...).then((c) => {
    if (c) useChaseStore.getState().setChase(c);
  });
}
```

- [ ] **Step 2: Chase exit → narrative generation**

When chase ends (`status === 'resolving'`), dispatch `pipeline.submit(chaseSummary)` to generate the next right page, then `clearChase()`.

- [ ] **Step 3: Mutual exclusion**

Assert: cannot enter chase while combat is active, and vice versa.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(chase): pipeline integration — detection, exit-to-narrative, combat mutual exclusion"
```

---

## Final: Type check + full test suite

- [ ] **Run `npx tsc --noEmit`** — fix any type errors across all phases
- [ ] **Run `npx vitest run`** — all tests pass
- [ ] **Run `npm run build`** — production build succeeds
- [ ] **Final commit**

```bash
git commit -m "chore: COC 7e rules completion — all 15 gaps implemented"
```

Push:
```bash
git push origin beta
```
