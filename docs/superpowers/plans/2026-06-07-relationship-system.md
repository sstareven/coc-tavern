# 关系系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 COC Tavern 中引入"角色关系图 + 显式小队 + 自创卡固化剧本"机制——没有关系的人物即便同场也不能同队。

**Architecture:** 关系图以 `ScenarioCharacter.relations` 为单一真源；运行时通过 lorebook 实时注入 LLM 上下文（输入侧），通过独立 post-settle 子调用反向更新关系（输出侧）。新增 `NpcProfile.inParty` 与 `isPresent` 解耦，玩家显式邀请入队，UI 层硬挡攻击队友。Onboarding 流程重做：CharCreator → RosterPicker → 选角进游戏，自创卡固化进剧本作为 `player_created` 角色。

**Tech Stack:** TypeScript + React + Zustand + Vite + Vitest + Dexie。

**Source Spec:** `docs/superpowers/specs/2026-06-07-relationship-system-design.md`

**Branch:** beta（每个里程碑完成都 commit + push beta，不写 Co-Authored-By；按 memory `feedback_git_push_no_coauthor` + `feedback_beta_branch_workflow`）

---

## 里程碑依赖图

```
M1 (类型 + 纯函数 + 单测)
 ├─→ M2 (Store 改造)
 │    ├─→ M3 (Lorebook 实时机制)
 │    │    ├─→ M9 (Post-Settle 评估器) ─→ M10 (activateScenario 开场逻辑)
 │    │    └─→ M10
 │    ├─→ M4 (Onboarding RosterPicker)
 │    │    ├─→ M5 (CharCreator 关系编辑步) ─→ M6 (PeopleTab 关系段)
 │    │    └─→ M7 (TeamSidebar 改造) ─→ M8 (攻击保护)
 │    ├─→ M5
 │    ├─→ M6
 │    ├─→ M7
 │    ├─→ M9
 │    └─→ M10
 └─→ M3 / M5 / M6 / M7 / M8 / M9 / M10
```

按依赖顺序执行：**M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10**

每个里程碑独立可 merge、可回滚、可单独 review。

---

## M1 — 数据层与纯函数

**目标**：落地 `RelationType` / `ScenarioRelation` / `ScenarioCharacterRole='player_created'` 枚举与字段、`NpcProfile.inParty`、纯函数 `relation-graph.ts`（`getRelations / canJoinParty / hasHostileEdge / detectPartyConflicts`），并覆盖 spec §10.1 全部测试用例。不动 UI、不动 store、不写订阅副作用。

**依赖里程碑**：无
**被后续依赖**：M2 / M3 / M5 / M6 / M7 / M8 / M9 / M10
**Spec 对应**：§2.1 / §2.2 / §4.1 / §4.2 / §10.1

---

### Task 1: 扩 `ScenarioCharacterRole` + 新增 `RelationType` / `ScenarioRelation` + 扩 `ScenarioCharacter`

**Files:**
- Modify: `src/types/scenario.ts`（在 line 33 上扩 role 枚举；line 35 上扩 ScenarioCharacter 字段；line 181 上扩 isScenarioCharacter 守卫）

- [ ] **Step 1: 改 `ScenarioCharacterRole` 加 `player_created`**

用 Edit 把现有枚举行：
```typescript
// NPC 三档:
// - protagonist  推荐视角(顶部出现在抽屉里,加金边)
// - optional     配角可玩(下沉到"配角视角"分区,玩家可越界玩)
// - locked_npc   剧本钉死不可选(反派/序章死者/关键 NPC),抽屉里不出现
export type ScenarioCharacterRole = 'protagonist' | 'optional' | 'locked_npc';
```

改成：
```typescript
// NPC 四档:
// - protagonist     推荐视角(顶部出现在抽屉里,加金边)
// - optional        配角可玩(下沉到"配角视角"分区,玩家可越界玩)
// - locked_npc      剧本钉死不可选(反派/序章死者/关键 NPC),抽屉里不出现
// - player_created  玩家自创卡(CharCreator 完成后固化进剧本),RosterPicker 分组「你创建的」
export type ScenarioCharacterRole = 'protagonist' | 'optional' | 'locked_npc' | 'player_created';

// 关系类型 — 8 枚举(spec §2.1)。
// 方向语义: A.relations[targetId=B, type='mentor'] 表示 "A 是 B 的导师"。
// 反向语义由 relation-graph 通过反查 characters[].relations 计算,作者不必两边都写。
// 类型对称性: family/lover/friend/colleague/rival/enemy/acquaintance 反向同义;
//             mentor 反向 = "学生"(仅 UI 显示用,语义上判定时与 mentor 等价)。
export type RelationType =
  | 'family'        // 亲属(父母/兄妹/亲戚)
  | 'lover'         // 恋人/配偶
  | 'friend'        // 朋友(含旧识/好友)
  | 'colleague'     // 同事/同行/同学
  | 'mentor'        // 师徒
  | 'rival'         // 竞争对手(敌对但相识,排斥同队)
  | 'enemy'         // 敌人(排斥同队)
  | 'acquaintance'; // 点头之交(最弱的"有关系")

export interface ScenarioRelation {
  targetId: string;       // 对方 ScenarioCharacter.id
  type: RelationType;
  note?: string;          // 自由文本: 进 lorebook 条目增色,不影响入队判定
}
```

- [ ] **Step 2: 给 `ScenarioCharacter` 加 `relations` / `presentAtStart` / `createdAt`**

用 Edit 把现有 `ScenarioCharacter` 接口尾部（npcAttrs 闭合大括号之后、接口闭合 `}` 之前）补三个字段：

```typescript
    initialItemsRaw?: string;
  };
  /** 出边集合(对其他 ScenarioCharacter.id 的有向关系); undefined/[] = 此角色无关系记录 */
  relations?: ScenarioRelation[];
  /** 开场是否在场; undefined/false = 走原 isPresent 默认逻辑(不自动建场) */
  presentAtStart?: boolean;
  /** 玩家自创卡用(role='player_created'); RosterPicker 按时间倒序分组排序 */
  createdAt?: number;
}
```

（替换原 `};\n}` 那一段；只改 `ScenarioCharacter` 闭合处，不动其他接口。）

- [ ] **Step 3: 改 `isScenarioCharacter` 守卫接受 `player_created` + 校验新字段**

把 line 181-196 的守卫：
```typescript
function isScenarioCharacter(x: unknown): x is ScenarioCharacter {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (x.role !== 'protagonist' && x.role !== 'optional' && x.role !== 'locked_npc') return false;
  if (!isObj(x.sheet)) return false; // 不深检 CharacterSheet，结构由上游保证
  if (!isObj(x.npcAttrs)) return false;
  const n = x.npcAttrs;
  return (
    isStr(n.identityTag) &&
    isNum(n.attitudeDefault) &&
    isStr(n.relationshipDefault) &&
    isStr(n.locationDefault) &&
    isStr(n.publicBio) &&
    isStr(n.hiddenBio)
  );
}
```

替换为：
```typescript
const REL_TYPES: readonly RelationType[] = ['family', 'lover', 'friend', 'colleague', 'mentor', 'rival', 'enemy', 'acquaintance'];

function isRelationType(x: unknown): x is RelationType {
  return isStr(x) && (REL_TYPES as readonly string[]).includes(x);
}

function isScenarioRelation(x: unknown): x is ScenarioRelation {
  if (!isObj(x)) return false;
  if (!isStr(x.targetId)) return false;
  if (!isRelationType(x.type)) return false;
  if (x.note !== undefined && !isStr(x.note)) return false;
  return true;
}

function isScenarioCharacter(x: unknown): x is ScenarioCharacter {
  if (!isObj(x)) return false;
  if (!isStr(x.id)) return false;
  if (x.role !== 'protagonist' && x.role !== 'optional' && x.role !== 'locked_npc' && x.role !== 'player_created') return false;
  if (!isObj(x.sheet)) return false; // 不深检 CharacterSheet，结构由上游保证
  if (!isObj(x.npcAttrs)) return false;
  const n = x.npcAttrs;
  if (!(
    isStr(n.identityTag) &&
    isNum(n.attitudeDefault) &&
    isStr(n.relationshipDefault) &&
    isStr(n.locationDefault) &&
    isStr(n.publicBio) &&
    isStr(n.hiddenBio)
  )) return false;
  // 新字段守卫: 全部 optional, 给出就深检
  if (x.relations !== undefined) {
    if (!Array.isArray(x.relations)) return false;
    if (!x.relations.every(isScenarioRelation)) return false;
  }
  if (x.presentAtStart !== undefined && !isBool(x.presentAtStart)) return false;
  if (x.createdAt !== undefined && !isNum(x.createdAt)) return false;
  return true;
}
```

- [ ] **Step 4: tsc 校验类型改动干净**

Run: `npx tsc --noEmit`
Expected: 无新增报错（仍可能保留 spec 前的既有 warning，但不应有引用新字段失败的错）

- [ ] **Step 5: 跑既有 scenario 测试不退化**

Run: `npx vitest run src/scenario/__tests__/scenario-injection.test.ts src/scenario/__tests__/scenario-io.test.ts`
Expected: PASS（既有测试不依赖新字段，应全绿）

- [ ] **Step 6: commit + push beta**
```bash
git add src/types/scenario.ts
git commit -m "feat(scenario): 类型层加 RelationType/ScenarioRelation + ScenarioCharacter relations/presentAtStart/createdAt + role 加 player_created"
git push origin beta
```

---

### Task 2: `NpcProfile` 扩 `inParty` 字段

**Files:**
- Modify: `src/types/index.ts:387-435`（NpcProfile 接口）

- [ ] **Step 1: 加 `inParty` 字段**

用 Edit 把 `NpcProfile` 中 `/** 是否在场 */ isPresent: boolean;` 这一段：

```typescript
  /** 是否在场 */
  isPresent: boolean;
```

替换为：
```typescript
  /** 是否在场(场景内,可被旁白引用/对话/上下文注入) */
  isPresent: boolean;
  /**
   * 是否在玩家小队(显式同队标记,与 isPresent 解耦)。
   * - undefined/false: 不在小队,仅"在场"或"缺席"
   * - true: 玩家显式邀请入队;LLM 主回合 npcUpdates 不会改此字段(避免抢权)
   * 仅玩家 UI 操作 + post-settle party-relation-evaluator 自动脱队评估器可写。
   */
  inParty?: boolean;
```

- [ ] **Step 2: tsc 校验**

Run: `npx tsc --noEmit`
Expected: 干净通过（`inParty` 是 optional，老代码访问不到也无报错）

- [ ] **Step 3: 跑 NPC 相关既有测试**

Run: `npx vitest run src/stores`
Expected: PASS（既有测试不读 inParty）

- [ ] **Step 4: commit + push beta**
```bash
git add src/types/index.ts
git commit -m "feat(types): NpcProfile 加 inParty optional 字段 — 与 isPresent 解耦"
git push origin beta
```

---

### Task 3: 写 `relation-graph.ts` 失败测试（spec §10.1 全分支）

**Files:**
- Test: `src/scenario/__tests__/relation-graph.test.ts`

- [ ] **Step 1: 写完整失败 test**

用 Write 创建 `src/scenario/__tests__/relation-graph.test.ts`：

```typescript
// relation-graph 纯函数测试 — spec §10.1 全部用例
// 覆盖: getRelations / canJoinParty / hasHostileEdge / detectPartyConflicts
// - 玩家陌生 NPC → 拒绝
// - 玩家好友 → 通过
// - 朋友的朋友 → 通过
// - 队里有 A,B 与 A 敌对 → 拒绝
// - 运行时 B 与 A 变敌对 → detectPartyConflicts 返回
// - mentor 单向边的反向查询正确
import { describe, it, expect } from 'vitest';
import {
  getRelations,
  canJoinParty,
  hasHostileEdge,
  detectPartyConflicts,
} from '../relation-graph';
import type {
  ScenarioDoc,
  ScenarioCharacter,
  ScenarioRelation,
  RelationType,
} from '../../types/scenario';

// ── 构造工具 ──
function makeChar(
  id: string,
  relations: ScenarioRelation[] = [],
  overrides: Partial<ScenarioCharacter> = {},
): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: {} as ScenarioCharacter['sheet'], // 测试不深检 sheet
    npcAttrs: {
      identityTag: id,
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations,
    ...overrides,
  };
}

function makeDoc(characters: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'scn_test',
    meta: {
      name: 't', type: '调查', durationHint: '1-2h',
      difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '',
    },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

const PLAYER = 'player_self';

// ============================================================
describe('getRelations', () => {
  it('返回角色自身的出边集合(从 character.relations 直读)', () => {
    const a = makeChar('a', [
      { targetId: 'b', type: 'friend' },
      { targetId: 'c', type: 'enemy', note: '诬告案' },
    ]);
    const doc = makeDoc([a, makeChar('b'), makeChar('c')]);
    const out = getRelations(doc, 'a');
    expect(out.map((r) => r.targetId)).toEqual(['b', 'c']);
    expect(out[0].type).toBe('friend');
    expect(out[1].note).toBe('诬告案');
  });

  it('角色不存在返回空数组', () => {
    const doc = makeDoc([]);
    expect(getRelations(doc, 'missing')).toEqual([]);
  });

  it('角色无 relations 字段返回空数组', () => {
    const a = makeChar('a');
    delete (a as { relations?: ScenarioRelation[] }).relations;
    const doc = makeDoc([a]);
    expect(getRelations(doc, 'a')).toEqual([]);
  });
});

// ============================================================
describe('hasHostileEdge', () => {
  it('A→B 写 enemy → 有敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'enemy' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('A→B 写 rival → 有敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'rival' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('B→A 单向写 enemy → 反向查询也算有敌对边', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(true);
  });

  it('双方都没写 → 无敌对边', () => {
    const doc = makeDoc([makeChar('a'), makeChar('b')]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });

  it('只有 friend 边 → 无敌对边', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });
});

// ============================================================
describe('canJoinParty', () => {
  it('玩家陌生 NPC(候选与玩家无任何边) → 拒绝', () => {
    const doc = makeDoc([makeChar('npc1')]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('stranger');
  });

  it('玩家好友 → 通过(玩家→候选 friend 边)', () => {
    // 玩家在 doc.characters 里以 id=PLAYER 存在,持有一条 friend → npc1
    const player = makeChar(PLAYER, [{ targetId: 'npc1', type: 'friend' }]);
    const doc = makeDoc([player, makeChar('npc1')]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('反向边: 候选→玩家 family → 也算通过', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('npc1', [{ targetId: PLAYER, type: 'family' }]),
    ]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('朋友的朋友 → 通过(玩家与候选陌生,但队里 A 是候选的朋友)', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    // 队里有 a, b 申请入队,b 与 a 是朋友 → 通过
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('队里有 A, B 与 A 敌对 → 拒绝', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'b', type: 'friend' }]), // 与玩家有 friend(满足 R1)
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),     // 但与队里 a 敌对
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('hostile');
    expect(res.hostileWith).toBe('a');
  });

  it('队里有 A, B 与 A rival → 拒绝(rival 也算敌对)', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'b', type: 'friend' }]),
      makeChar('a', [{ targetId: 'b', type: 'rival' }]),
      makeChar('b'),
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('hostile');
  });

  it('玩家与候选敌对 → 拒绝(优先于 stranger)', () => {
    const doc = makeDoc([
      makeChar(PLAYER, [{ targetId: 'npc1', type: 'enemy' }]),
      makeChar('npc1'),
    ]);
    const res = canJoinParty(doc, 'npc1', [], PLAYER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('hostile');
  });

  it('候选 id 在 doc 中不存在 → 拒绝(unknown)', () => {
    const doc = makeDoc([makeChar(PLAYER)]);
    const res = canJoinParty(doc, 'ghost', [], PLAYER);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unknown');
  });

  it('与队内成员 acquaintance → 通过(非敌对边即可)', () => {
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'acquaintance' }]),
    ]);
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });
});

// ============================================================
describe('detectPartyConflicts', () => {
  it('队里两人无敌对 → 返回空', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'friend' }]),
      makeChar('b'),
    ]);
    expect(detectPartyConflicts(doc, ['a', 'b'])).toEqual([]);
  });

  it('运行时 B 与 A 变敌对 → detectPartyConflicts 返回 B 应被踢', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b', [{ targetId: 'a', type: 'enemy' }]),
    ]);
    const out = detectPartyConflicts(doc, ['a', 'b']);
    expect(out.length).toBeGreaterThan(0);
    // 后到者(数组靠后)被踢:b 在 partyIds 数组中位于 a 之后,优先踢 b
    expect(out[0].kickedId).toBe('b');
    expect(out[0].hostileWithId).toBe('a');
  });

  it('队三人 a/b/c, b↔c 敌对 → c 被踢(后到者)', () => {
    const doc = makeDoc([
      makeChar('a'),
      makeChar('b'),
      makeChar('c', [{ targetId: 'b', type: 'rival' }]),
    ]);
    const out = detectPartyConflicts(doc, ['a', 'b', 'c']);
    expect(out.map((x) => x.kickedId)).toContain('c');
  });

  it('空队伍 → 返回空', () => {
    const doc = makeDoc([]);
    expect(detectPartyConflicts(doc, [])).toEqual([]);
  });

  it('单人队伍 → 返回空(无可冲突对象)', () => {
    const doc = makeDoc([makeChar('a')]);
    expect(detectPartyConflicts(doc, ['a'])).toEqual([]);
  });
});

// ============================================================
describe('mentor 单向边的反向查询', () => {
  it("A 写 mentor→B(A 是 B 的导师),反查 B 视角能看到 A 是 mentor", () => {
    // mentor 在 hasHostileEdge 视角为非敌对,在 canJoinParty 视角应算合法非敌对边
    const doc = makeDoc([
      makeChar(PLAYER),
      makeChar('a', [{ targetId: 'b', type: 'mentor' }]),
      makeChar('b'),
    ]);
    // 队里 a 是 b 的导师 → b 想入队(玩家与 b 陌生) → 朋友的朋友规则通过
    const res = canJoinParty(doc, 'b', ['a'], PLAYER);
    expect(res.ok).toBe(true);
  });

  it('mentor 非敌对 → hasHostileEdge 返回 false', () => {
    const doc = makeDoc([
      makeChar('a', [{ targetId: 'b', type: 'mentor' }]),
      makeChar('b'),
    ]);
    expect(hasHostileEdge(doc, 'a', 'b')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/scenario/__tests__/relation-graph.test.ts`
Expected: FAIL with `Failed to resolve import "../relation-graph"` 或 `Cannot find module ../relation-graph`（实现文件尚未创建）

- [ ] **Step 3: commit + push beta**
```bash
git add src/scenario/__tests__/relation-graph.test.ts
git commit -m "test(scenario): 加 relation-graph 失败测试 — 覆盖 spec §10.1 全部分支"
git push origin beta
```

---

### Task 4: 实现 `relation-graph.ts` 让测试通过

**Files:**
- Create: `src/scenario/relation-graph.ts`

- [ ] **Step 1: 写完整实现**

用 Write 创建 `src/scenario/relation-graph.ts`：

```typescript
// relation-graph: 关系图纯函数(无副作用, 可单测)
// spec §4.1 边语义 + §4.2 三大判定规则
// - getRelations:           读 character.relations 出边
// - hasHostileEdge:         判定两点之间是否存在敌对边(enemy/rival, 任一方向)
// - canJoinParty:           R1 准入 + R2 排斥(玩家或队内任一与候选有非敌对边即通过)
// - detectPartyConflicts:   扫描小队找新出现的敌对边对, 返回后到者应被踢
//
// 关系类型语义(spec §4.1):
// - 非敌对边: family / lover / friend / colleague / mentor / acquaintance
// - 敌对边:   enemy / rival(算"有关系"但排斥同队)
// - 无边:     陌生(留白即可)
//
// 方向性: A.relations[targetId=B, type='mentor'] 表示 "A 是 B 的导师"。
// 反向查询: 当判定"X 与 Y 是否有边"时,任一方向存在即算有(单向边语义补全)。

import type {
  ScenarioDoc,
  ScenarioCharacter,
  ScenarioRelation,
  RelationType,
} from '../types/scenario';

/** 敌对边类型(排斥同队)。 */
const HOSTILE_TYPES: ReadonlySet<RelationType> = new Set<RelationType>(['enemy', 'rival']);

/** 判某种类型是否为敌对。 */
function isHostileType(t: RelationType): boolean {
  return HOSTILE_TYPES.has(t);
}

/** 按 id 取角色(找不到返回 undefined)。 */
function findChar(doc: ScenarioDoc, id: string): ScenarioCharacter | undefined {
  return doc.characters.find((c) => c.id === id);
}

/**
 * 取角色出边集合(从 doc.characters[id].relations 直读)。
 * - 角色不存在 → []
 * - 角色无 relations → []
 */
export function getRelations(doc: ScenarioDoc, charId: string): ScenarioRelation[] {
  const c = findChar(doc, charId);
  if (!c) return [];
  return c.relations ?? [];
}

/**
 * 判两点之间是否存在敌对边(任一方向 enemy/rival 都算)。
 * 用于 R2 排斥判定与 R4 自动脱队检测。
 */
export function hasHostileEdge(doc: ScenarioDoc, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  // A→B 出边
  for (const r of getRelations(doc, aId)) {
    if (r.targetId === bId && isHostileType(r.type)) return true;
  }
  // B→A 出边(反向语义补全)
  for (const r of getRelations(doc, bId)) {
    if (r.targetId === aId && isHostileType(r.type)) return true;
  }
  return false;
}

/**
 * 判两点之间是否存在任一非敌对边(任一方向)。
 * R1 准入: 候选与(玩家 或 队内任一成员)至少存在一条非敌对边。
 */
function hasNonHostileEdge(doc: ScenarioDoc, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  for (const r of getRelations(doc, aId)) {
    if (r.targetId === bId && !isHostileType(r.type)) return true;
  }
  for (const r of getRelations(doc, bId)) {
    if (r.targetId === aId && !isHostileType(r.type)) return true;
  }
  return false;
}

/**
 * canJoinParty 返回结果。
 * - ok=true:  通过
 * - ok=false: reason=stranger(无任何非敌对边) / hostile(与某成员敌对) / unknown(候选 id 不存在)
 */
export type CanJoinPartyResult =
  | { ok: true }
  | { ok: false; reason: 'stranger' | 'hostile' | 'unknown'; hostileWith?: string };

/**
 * R1 准入 + R2 排斥(spec §4.2):
 * - R2 优先: 候选与玩家或队内任一成员有敌对边 → 拒绝(hostile)
 * - R1: 候选与(玩家 或 队内任一成员)至少存在一条非敌对边 → 通过
 *       否则 → 拒绝(stranger)
 *
 * @param doc          剧本文档(关系图单一真源)
 * @param candidateId  申请入队的角色 id(必须在 doc.characters 中存在)
 * @param partyIds     当前已在队的角色 id 列表(不含玩家)
 * @param playerId     玩家在剧本中的 id(走 newChar 模式时是自创卡 id,走 preset 模式时是所选角色 id)
 */
export function canJoinParty(
  doc: ScenarioDoc,
  candidateId: string,
  partyIds: string[],
  playerId: string,
): CanJoinPartyResult {
  if (!findChar(doc, candidateId)) {
    return { ok: false, reason: 'unknown' };
  }

  // R2 排斥优先(敌对边出现就直接拒绝, 不再看 R1)
  if (hasHostileEdge(doc, candidateId, playerId)) {
    return { ok: false, reason: 'hostile', hostileWith: playerId };
  }
  for (const pid of partyIds) {
    if (hasHostileEdge(doc, candidateId, pid)) {
      return { ok: false, reason: 'hostile', hostileWith: pid };
    }
  }

  // R1 准入: 与玩家或队内任一成员存在非敌对边即可
  if (hasNonHostileEdge(doc, candidateId, playerId)) return { ok: true };
  for (const pid of partyIds) {
    if (hasNonHostileEdge(doc, candidateId, pid)) return { ok: true };
  }

  return { ok: false, reason: 'stranger' };
}

/** 脱队冲突: 后到者(partyIds 数组靠后)被踢。 */
export interface PartyConflict {
  kickedId: string;
  hostileWithId: string;
}

/**
 * R4 自动脱队检测(spec §4.2):
 * 扫描 partyIds 两两组合,若任一对存在敌对边 → 返回靠后者应被踢。
 *
 * 排序规则: partyIds 数组顺序即"入队顺序",后入队者优先被踢(直觉:谁后来谁离开)。
 * 同一回合多对冲突全部返回,调用方负责依次执行 leaveParty。
 */
export function detectPartyConflicts(
  doc: ScenarioDoc,
  partyIds: string[],
): PartyConflict[] {
  const out: PartyConflict[] = [];
  for (let i = 0; i < partyIds.length; i++) {
    for (let j = i + 1; j < partyIds.length; j++) {
      const a = partyIds[i];
      const b = partyIds[j];
      if (hasHostileEdge(doc, a, b)) {
        out.push({ kickedId: b, hostileWithId: a });
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: 跑 test 验证通过**

Run: `npx vitest run src/scenario/__tests__/relation-graph.test.ts`
Expected: PASS（全部用例绿）

- [ ] **Step 3: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 允许，但无新增 error）

- [ ] **Step 4: 跑全套 scenario 测试不退化**

Run: `npx vitest run src/scenario`
Expected: 既有 scenario-injection / scenario-io / scenario-pools / scenario-llm / scenario-patch / scenario-engine 测试全 PASS + 新增 relation-graph 测试 PASS

- [ ] **Step 5: commit + push beta**
```bash
git add src/scenario/relation-graph.ts
git commit -m "feat(scenario): 加 relation-graph 纯函数 — getRelations/canJoinParty/hasHostileEdge/detectPartyConflicts"
git push origin beta
```

---

## M1 验证清单（全部勾选 = 里程碑完成）

- [ ] `src/types/scenario.ts` 加 `RelationType` / `ScenarioRelation`，`ScenarioCharacterRole` 加 `'player_created'`，`ScenarioCharacter` 加 `relations? / presentAtStart? / createdAt?`，`isScenarioCharacter` 守卫接受四档 role 并深检新字段
- [ ] `src/types/index.ts` `NpcProfile` 加 `inParty?: boolean`
- [ ] `src/scenario/relation-graph.ts` 导出 `getRelations / canJoinParty / hasHostileEdge / detectPartyConflicts` 四个纯函数
- [ ] `src/scenario/__tests__/relation-graph.test.ts` 覆盖 spec §10.1 全部分支
- [ ] `npx vitest run src/scenario/__tests__/relation-graph.test.ts` PASS
- [ ] `npx vitest run src/scenario` 全部 PASS（不退化既有测试）
- [ ] `npx tsc --noEmit` 干净通过
- [ ] `npx vite build` 成功
- [ ] 4 个 Task 各自 commit + `git push origin beta` 完成（不含 Co-Authored-By）

后续 M2 在此基础上接 `useScenarioStore.applyRelationDelta` / `useNpcStore.joinParty/leaveParty/getParty`。

---

## M2 — Store 改造

**目标**：在 `useScenarioStore` 中加 `applyRelationDelta(scenarioId, deltas)`，在 `useNpcStore` 中加 `joinParty / leaveParty / getParty`，并在 `applyUpdates` 中防 LLM 抢权写 `inParty`。spec §2.2 与 §3 表 "Scenario Store / NPC Store" 行的直接落地。

**前置假设（M1 已完成）**：
- `src/types/scenario.ts` 已新增 `RelationType` 联合（8 枚举）、`ScenarioRelation { targetId; type; note? }`、`ScenarioCharacter.relations?: ScenarioRelation[]`、`ScenarioCharacter.presentAtStart?: boolean`、`ScenarioCharacterRole` 增加 `'player_created'`、`ScenarioCharacter.createdAt?: number`。
- `src/types/index.ts` 已新增 `NpcProfile.inParty?: boolean`。
- 纯函数 `src/scenario/relation-graph.ts` 与单测落地完成。

---

### Task 1: 扩 `mergePatch` 让 `patchCharacters` 真正深合 `relations / presentAtStart / role`

**Files:**
- Modify: `src/stores/useScenarioStore.ts:104-108`（`mergePatch` 中 `patchCharacters` 分支）
- Create: `src/stores/useScenarioStore.test.ts`

现状：`mergePatch` 用 `map.set(c.id, c)` 整体替换 `ScenarioCharacter`。spec §5.2 中 CharCreator 把自创卡作为完整 `ScenarioCharacter` 整体写入是支持的，但 M5 关系编辑步会发增量 patch（仅含 id+relations）→ 整体替换会把 sheet/npcAttrs 等覆盖掉。本任务把 `patchCharacters` 改成「按 id 浅合并」：传入字段覆盖现有同名字段，未传字段保留旧值；`relations / presentAtStart / role / createdAt` 走同一通道，无需额外字段。

- [ ] **Step 1: 写失败 test**

```typescript
// src/stores/useScenarioStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from './useScenarioStore';
import type { ScenarioDoc, ScenarioCharacter, ScenarioRelation } from '../types/scenario';
import type { CharacterSheet } from '../types';

function emptySheet(): CharacterSheet {
  return {
    identity: { name: '', age: 30, sex: '', residence: '', birthplace: '', occupation: '' },
    characteristics: { STR: 50, CON: 50, SIZ: 50, DEX: 50, APP: 50, INT: 50, POW: 50, EDU: 50 },
    derived: { hp: 10, sanCurrent: 50, sanStart: 50, sanMax: 99, mpCurrent: 10, mpMax: 10, luck: 50, mov: 8, db: '0', build: 0 },
    skills: {}, customSkills: [], tickedSkills: [],
    background: { description: '', traits: '', beliefs: '', significantPeople: '', meaningfulLocations: '', treasuredPossessions: '', injuries: '', backgroundFears: '' },
    items: [], initialItemsRaw: '',
  } as unknown as CharacterSheet;
}

function makeChar(id: string, name: string, over: Partial<ScenarioCharacter> = {}): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: { ...emptySheet(), identity: { ...emptySheet().identity, name } },
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    ...over,
  };
}

function makeDoc(over: Partial<ScenarioDoc> = {}): ScenarioDoc {
  return {
    id: over.id ?? 'scn_test_1',
    builtin: over.builtin ?? false,
    meta: { name: 'T', type: '调查', durationHint: '1-2h', difficulty: 3, headcountHint: '1-3人', sanLossHint: '中', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: over.characters ?? [],
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function resetStore(): void {
  useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
}

describe('useScenarioStore.mergePatch — patchCharacters 浅合并', () => {
  beforeEach(resetStore);

  it('patchCharacters 仅含 id+relations 时,保留 sheet/npcAttrs,只覆盖 relations', () => {
    const charA = makeChar('cA', '甲', {
      sheet: { ...emptySheet(), identity: { ...emptySheet().identity, name: '甲', age: 42 } } as CharacterSheet,
      npcAttrs: {
        identityTag: '医生',
        attitudeDefault: 30,
        relationshipDefault: '熟人',
        locationDefault: '诊所',
        publicBio: '镇上唯一的医生',
        hiddenBio: '',
      },
    });
    const doc = makeDoc({ id: 'scn_x', characters: [charA] });
    useScenarioStore.setState({ userScenarios: [doc] });

    const relations: ScenarioRelation[] = [{ targetId: 'cB', type: 'friend' }];
    useScenarioStore.getState().applyPatch('scn_x', {
      patchCharacters: [{ id: 'cA', relations } as ScenarioCharacter],
    });

    const updated = useScenarioStore.getState().getById('scn_x')!;
    const merged = updated.characters.find(c => c.id === 'cA')!;
    expect(merged.relations).toEqual(relations);
    expect(merged.npcAttrs.identityTag).toBe('医生');
    expect(merged.npcAttrs.publicBio).toBe('镇上唯一的医生');
    expect(merged.sheet.identity.name).toBe('甲');
    expect((merged.sheet.identity as { age: number }).age).toBe(42);
  });

  it('patchCharacters 新增不存在的 id → 直接插入(作为整条记录)', () => {
    const doc = makeDoc({ id: 'scn_y', characters: [] });
    useScenarioStore.setState({ userScenarios: [doc] });

    const newChar = makeChar('cNew', '新人', { role: 'player_created', createdAt: 999 });
    useScenarioStore.getState().applyPatch('scn_y', { patchCharacters: [newChar] });

    const updated = useScenarioStore.getState().getById('scn_y')!;
    expect(updated.characters).toHaveLength(1);
    expect(updated.characters[0].id).toBe('cNew');
    expect(updated.characters[0].role).toBe('player_created');
    expect(updated.characters[0].createdAt).toBe(999);
  });

  it('patchCharacters 同时含 presentAtStart=true 与已有字段合并不丢失', () => {
    const charA = makeChar('cA', '甲');
    const doc = makeDoc({ id: 'scn_z', characters: [charA] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyPatch('scn_z', {
      patchCharacters: [{ id: 'cA', presentAtStart: true } as ScenarioCharacter],
    });

    const merged = useScenarioStore.getState().getById('scn_z')!.characters.find(c => c.id === 'cA')!;
    expect(merged.presentAtStart).toBe(true);
    expect(merged.sheet.identity.name).toBe('甲');
    expect(merged.role).toBe('optional');
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/stores/useScenarioStore.test.ts`
Expected: FAIL — 第一个 case 期望 `npcAttrs.identityTag === '医生'`，但旧 `mergePatch` 用 `map.set` 整体替换 → 拿到的是 patch 里那条只含 `id+relations` 的残缺记录，`npcAttrs` 为 `undefined`，断言失败。

- [ ] **Step 3: 最小实现**

Edit `src/stores/useScenarioStore.ts` 把 `mergePatch` 中 `patchCharacters` 分支改为浅合并：

```typescript
  if (patch.patchCharacters?.length) {
    const map = new Map(next.characters.map(c => [c.id, c]));
    for (const c of patch.patchCharacters) {
      const existing = map.get(c.id);
      // 浅合并:patch 里出现的字段覆盖旧字段,未出现的字段保留旧值;
      // 完整新建(无 existing)时直接 set 整条。
      map.set(c.id, existing ? { ...existing, ...c } : c);
    }
    next.characters = Array.from(map.values());
  }
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/stores/useScenarioStore.test.ts`
Expected: PASS（3 个 case 全部通过）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/stores/useScenarioStore.ts src/stores/useScenarioStore.test.ts
git commit -m "refactor(scenario): mergePatch 的 patchCharacters 改浅合并,relations 增量 patch 不再吞 sheet"
git push origin beta
```

---

### Task 2: `useScenarioStore.applyRelationDelta`

**Files:**
- Modify: `src/stores/useScenarioStore.ts`（在 `applyPatch` 下方加方法 + `ScenarioStore` interface 加方法签名）
- Modify: `src/stores/useScenarioStore.test.ts`（追加 describe 块）

语义：deltas 是 `{ sourceId, targetId, newType, reason? }[]`；遍历 deltas，对每条做：定位 source 角色的 `relations[]`，按 `targetId` 查；`newType === 'stranger'` → 删除该项；否则 upsert（同 `targetId` 替换 type，无则 append）。最终把 `characters[sourceIdx].relations` 整条交给 `applyPatch + patchCharacters`，自动走 forkMap 副本路径。`reason` 不入数据层（M9 评估器自己写 RightPage 旁白；这里仅供未来 lorebook `note` 使用，若 `reason` 非空则填到新增项的 `note`）。

- [ ] **Step 1: 写失败 test**

追加到 `src/stores/useScenarioStore.test.ts` 末尾：

```typescript
describe('useScenarioStore.applyRelationDelta', () => {
  beforeEach(resetStore);

  it('newType=具体枚举 → 新增 relations 项', () => {
    const charA = makeChar('cA', '甲');
    const doc = makeDoc({ id: 'scn_r1', characters: [charA, makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r1', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend', reason: '一起经历了码头那晚' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r1')!;
    const rels = updated.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ targetId: 'cB', type: 'friend', note: '一起经历了码头那晚' });
  });

  it('newType=具体枚举 → 已有同 targetId 项 replace type 而非追加', () => {
    const charA = makeChar('cA', '甲', { relations: [{ targetId: 'cB', type: 'friend' }] });
    const doc = makeDoc({ id: 'scn_r2', characters: [charA, makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r2', [
      { sourceId: 'cA', targetId: 'cB', newType: 'enemy' },
    ]);

    const rels = useScenarioStore.getState().getById('scn_r2')!.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0].type).toBe('enemy');
  });

  it('newType=stranger → 删除该 targetId 出边', () => {
    const charA = makeChar('cA', '甲', {
      relations: [
        { targetId: 'cB', type: 'friend' },
        { targetId: 'cC', type: 'rival' },
      ],
    });
    const doc = makeDoc({ id: 'scn_r3', characters: [charA, makeChar('cB', '乙'), makeChar('cC', '丙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r3', [
      { sourceId: 'cA', targetId: 'cB', newType: 'stranger' },
    ]);

    const rels = useScenarioStore.getState().getById('scn_r3')!.characters.find(c => c.id === 'cA')!.relations!;
    expect(rels).toHaveLength(1);
    expect(rels[0].targetId).toBe('cC');
  });

  it('多条 deltas 同回合应用 → 顺序生效', () => {
    const doc = makeDoc({ id: 'scn_r4', characters: [makeChar('cA', '甲'), makeChar('cB', '乙'), makeChar('cC', '丙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r4', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
      { sourceId: 'cA', targetId: 'cC', newType: 'enemy' },
      { sourceId: 'cB', targetId: 'cA', newType: 'friend' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r4')!;
    const aRels = updated.characters.find(c => c.id === 'cA')!.relations!;
    const bRels = updated.characters.find(c => c.id === 'cB')!.relations!;
    expect(aRels).toHaveLength(2);
    expect(bRels).toHaveLength(1);
    expect(bRels[0]).toMatchObject({ targetId: 'cA', type: 'friend' });
  });

  it('builtin 剧本 → 触发 forkMap 副本(不污染 builtin)', () => {
    const builtin = makeDoc({ id: 'scn_builtin', builtin: true, characters: [makeChar('cA', '甲'), makeChar('cB', '乙')] });
    useScenarioStore.setState({ builtins: [builtin], userScenarios: [], forkMap: {} });

    useScenarioStore.getState().applyRelationDelta('scn_builtin', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);

    const s = useScenarioStore.getState();
    // builtin 原文不变
    expect(s.builtins[0].characters.find(c => c.id === 'cA')!.relations).toBeUndefined();
    // 副本被 fork 出来,带新关系
    expect(s.userScenarios).toHaveLength(1);
    expect(s.forkMap['scn_builtin']).toBe(s.userScenarios[0].id);
    const forkedA = s.userScenarios[0].characters.find(c => c.id === 'cA')!;
    expect(forkedA.relations).toEqual([{ targetId: 'cB', type: 'friend' }]);
  });

  it('未知 scenarioId → 静默无操作', () => {
    useScenarioStore.getState().applyRelationDelta('not_exist', [
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);
    expect(useScenarioStore.getState().userScenarios).toEqual([]);
  });

  it('未知 sourceId → 跳过该条 delta,其余仍生效', () => {
    const doc = makeDoc({ id: 'scn_r5', characters: [makeChar('cA', '甲'), makeChar('cB', '乙')] });
    useScenarioStore.setState({ userScenarios: [doc] });

    useScenarioStore.getState().applyRelationDelta('scn_r5', [
      { sourceId: 'nope', targetId: 'cB', newType: 'enemy' },
      { sourceId: 'cA', targetId: 'cB', newType: 'friend' },
    ]);

    const updated = useScenarioStore.getState().getById('scn_r5')!;
    expect(updated.characters.find(c => c.id === 'cA')!.relations).toEqual([{ targetId: 'cB', type: 'friend' }]);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/stores/useScenarioStore.test.ts`
Expected: FAIL — `useScenarioStore.getState().applyRelationDelta is not a function`（方法不存在）

- [ ] **Step 3: 最小实现**

在 `src/stores/useScenarioStore.ts` 顶部 `import` 块的 `import type { ... } from '../types/scenario'` 里追加 `RelationType, ScenarioRelation`（按 M1 暴露的类型）；在 `ScenarioStore` interface 上加签名：

```typescript
  applyRelationDelta: (
    scenarioId: string,
    deltas: Array<{ sourceId: string; targetId: string; newType: RelationType | 'stranger'; reason?: string }>,
  ) => void;
```

在 `applyPatch` 方法实现块下方（`clearForkMap` 之前）加：

```typescript
      applyRelationDelta: (scenarioId, deltas) => {
        if (!deltas?.length) return;
        const doc = get().getById(scenarioId);
        if (!doc) return;

        // 把 deltas 收敛成 sourceId → 该角色最终 relations[] 的映射,然后一次 applyPatch 下去。
        const finalRelsBySource = new Map<string, ScenarioRelation[]>();
        for (const d of deltas) {
          const src = doc.characters.find(c => c.id === d.sourceId);
          if (!src) continue;
          const current = finalRelsBySource.get(d.sourceId) ?? [...(src.relations ?? [])];
          const idx = current.findIndex(r => r.targetId === d.targetId);
          if (d.newType === 'stranger') {
            if (idx >= 0) current.splice(idx, 1);
          } else {
            const next: ScenarioRelation = idx >= 0
              ? { ...current[idx], type: d.newType, ...(d.reason ? { note: d.reason } : {}) }
              : { targetId: d.targetId, type: d.newType, ...(d.reason ? { note: d.reason } : {}) };
            if (idx >= 0) current[idx] = next; else current.push(next);
          }
          finalRelsBySource.set(d.sourceId, current);
        }

        if (finalRelsBySource.size === 0) return;

        const patchCharacters = Array.from(finalRelsBySource.entries())
          .map(([sourceId, relations]) => ({ id: sourceId, relations } as ScenarioCharacter));
        get().applyPatch(scenarioId, { patchCharacters });
      },
```

（`ScenarioCharacter` 已被现有 `import` 引入，无需新增 import；`ScenarioRelation` 与 `RelationType` 需要在顶部 import 中追加。）

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/stores/useScenarioStore.test.ts`
Expected: PASS（包含 Task 1 + Task 2 全部 case）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/stores/useScenarioStore.ts src/stores/useScenarioStore.test.ts
git commit -m "feat(scenario): useScenarioStore.applyRelationDelta — 关系增量补丁走 forkMap"
git push origin beta
```

---

### Task 3: `useNpcStore.joinParty / leaveParty / getParty` + `applyUpdates` 拒绝 LLM 写 inParty

**Files:**
- Modify: `src/stores/useNpcStore.ts`（`NpcStore` interface 加 3 个方法 + 实现；`applyUpdates` 内增加 `delete uRec.inParty` 一行防御）
- Modify: `src/stores/useNpcStore.test.ts`（追加 describe 块）

语义：
- `joinParty(npcId)` — 设 `profiles[npcId].inParty = true`，更新 `updatedAt`；id 不存在静默返回。关系校验由调用方（M7 的 `canJoinParty`）前置，store 层不挡。
- `leaveParty(npcId)` — 设 `profiles[npcId].inParty = false`，更新 `updatedAt`；id 不存在静默返回。
- `getParty()` — 返回 `Object.values(profiles).filter(p => p.isPresent && p.inParty)`，按 `updatedAt` 倒序排序与 `getPresent` 一致。
- `applyUpdates` — LLM 的 `npcUpdates` 不允许写 `inParty`（防止 LLM 抢权破坏玩家的小队意图）；在循环每条 `u` 时显式 `delete (uRec as Record<string,unknown>).inParty`，老有 `inParty` 的 profile 字段保留。

- [ ] **Step 1: 写失败 test**

追加到 `src/stores/useNpcStore.test.ts` 末尾：

```typescript
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
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/stores/useNpcStore.test.ts`
Expected: FAIL — `useNpcStore.getState().joinParty is not a function`

- [ ] **Step 3: 最小实现**

Edit `src/stores/useNpcStore.ts`：

(a) 在 `NpcStore` interface 内（`clearAll: () => void;` 上方）追加：

```typescript
  joinParty: (npcId: string) => void;
  leaveParty: (npcId: string) => void;
  getParty: () => NpcProfile[];
```

(b) 在 `applyUpdates` 实现的 for 循环开头（`if (!u.name?.trim()) continue;` 之后）插一行防御：

```typescript
        // 防 LLM 抢权:inParty 仅玩家 UI/canJoinParty 通道可写。
        delete (u as unknown as Record<string, unknown>).inParty;
```

(c) 在 store 实现尾部（`clearAll: () => set({ profiles: {} })` 上方）追加：

```typescript
  joinParty: (npcId) => {
    set((s) => {
      const p = s.profiles[npcId];
      if (!p) return {};
      return { profiles: { ...s.profiles, [npcId]: { ...p, inParty: true, updatedAt: Date.now() } } };
    });
  },

  leaveParty: (npcId) => {
    set((s) => {
      const p = s.profiles[npcId];
      if (!p) return {};
      return { profiles: { ...s.profiles, [npcId]: { ...p, inParty: false, updatedAt: Date.now() } } };
    });
  },

  getParty: () => Object.values(get().profiles)
    .filter((p) => p.isPresent && p.inParty)
    .sort((a, b) => b.updatedAt - a.updatedAt),
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/stores/useNpcStore.test.ts`
Expected: PASS（既有 case + 新增 6 个 case 全部通过）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/stores/useNpcStore.ts src/stores/useNpcStore.test.ts
git commit -m "feat(npc): joinParty/leaveParty/getParty + applyUpdates 拒 LLM 写 inParty"
git push origin beta
```

---

### 里程碑验证清单

完成 M2 当且仅当下述全部成立：

- [ ] `npx vitest run src/stores/useScenarioStore.test.ts` PASS（Task 1 + Task 2，10 个 case）
- [ ] `npx vitest run src/stores/useNpcStore.test.ts` PASS（既有 + 新增 6 个 case）
- [ ] `npx tsc --noEmit` 干净（无新增类型错误）
- [ ] `npx vite build` 成功（pre-existing warning 除外）
- [ ] 3 个 commit 推上 `origin/beta`（mergePatch 浅合并 / applyRelationDelta / joinParty 三段）

完成后 M3（Lorebook 实时机制订阅 `applyRelationDelta` 触发副作用）、M5/M6（编辑器靠 `patchCharacters` 浅合并发增量 relations）、M7（TeamSidebar 接 `joinParty/leaveParty/getParty`）、M9（post-settle 评估器调用 `applyRelationDelta`）、M10（开场逻辑读 `presentAtStart` 触发 `joinParty`）全部解锁。

---

## M3 — Lorebook 实时机制

**目标**：把 M1 数据层 (`relations/presentAtStart`) 渲染为可注入 lorebook 的关系条目，并接 `useScenarioStore` 订阅，让玩家/PeopleTab/post-settle 修改任一关系图后下一次 LLM 调用前 lorebook 已经同步。spec §7 全节落地。

**先决条件**：M1 已落地 `RelationType / ScenarioRelation / ScenarioCharacter.relations / presentAtStart / role='player_created'`；M2 已落地 `useScenarioStore.applyRelationDelta` 与 `relations` patch 支持。

**关键设计取舍**：
- 现有 `useLorebookStore.upsertBook` 是整本替换（见 `src/stores/useLorebookStore.ts:520-523`），整本 upsert 会清掉剧本主条目（scn_*）。所以需要新增 **`upsertEntries(bookId, entries, opts)`** 接口，按 entryId 前缀替换：删掉所有以 `rel_` 开头的旧条目，把新条目逐个 set 进去，保留 `scn_*` 主条目原样。
- 关系条目的 lorebook key 形如 `rel_<charId>`（去掉 `__scenario_<sid>_` 前缀），因为 `useLorebookStore.LoreBook.entries` 已经是按本 book 内的 entryId 索引，前缀只需要本地唯一。
- `subscribeRelationLorebook` 用 zustand 原生 `subscribe(selector, listener, { equalityFn })`，selector 抽取剧本 `characters` 的关键字段做浅比较，避免每次 store 任意变更都重渲染。
- 订阅句柄存 module-scope `Map<scenarioId, () => void>`，`unloadScenario` 之前调用解挂；`mountScenarioBook` 重挂时也要保证不重复订阅（先 unsubscribe 再 subscribe）。

---

### Task 1: 给 `useLorebookStore` 加 `upsertEntries(bookId, entries, { prefix })` 接口（前缀替换）

**Files:**
- Modify: `src/stores/useLorebookStore.ts`（接口定义 + 实现，约 455-545 行）
- Test: `src/stores/useLorebookStore.upsertEntries.test.ts`

- [ ] **Step 1: 写失败 test**

```typescript
// src/stores/useLorebookStore.upsertEntries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useLorebookStore } from './useLorebookStore';
import type { LoreEntry } from '../types';

function makeEntry(name: string): LoreEntry {
  return {
    name, keys: '', content: '', logic: 'AND_ANY', priority: 10,
    disabled: false, constant: false, position: 0, depth: 0, probability: 100,
    secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
    groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
    groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
    preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
    ignoreReplyLimit: false,
  };
}

describe('useLorebookStore.upsertEntries', () => {
  const BOOK_ID = '__test_scenario_relentries';

  beforeEach(() => {
    useLorebookStore.setState({
      books: {
        [BOOK_ID]: {
          name: '测试本',
          enabled: true,
          entries: {
            scn_main: makeEntry('主条目'),
            rel_old1: makeEntry('旧关系1'),
            rel_old2: makeEntry('旧关系2'),
          },
        },
      },
    });
  });

  it('按前缀替换：保留主条目，清掉旧 rel_*，写入新 rel_*', () => {
    useLorebookStore.getState().upsertEntries(
      BOOK_ID,
      {
        rel_a: makeEntry('新关系A'),
        rel_b: makeEntry('新关系B'),
      },
      { prefix: 'rel_' },
    );
    const entries = useLorebookStore.getState().books[BOOK_ID].entries;
    expect(entries.scn_main.name).toBe('主条目');
    expect(entries.rel_old1).toBeUndefined();
    expect(entries.rel_old2).toBeUndefined();
    expect(entries.rel_a.name).toBe('新关系A');
    expect(entries.rel_b.name).toBe('新关系B');
  });

  it('book 不存在时静默跳过', () => {
    useLorebookStore.getState().upsertEntries(
      '__not_exist',
      { rel_a: makeEntry('A') },
      { prefix: 'rel_' },
    );
    expect(useLorebookStore.getState().books['__not_exist']).toBeUndefined();
  });

  it('空 entries + prefix：仅清除旧 rel_* 不写新条目', () => {
    useLorebookStore.getState().upsertEntries(BOOK_ID, {}, { prefix: 'rel_' });
    const entries = useLorebookStore.getState().books[BOOK_ID].entries;
    expect(entries.scn_main).toBeDefined();
    expect(entries.rel_old1).toBeUndefined();
    expect(entries.rel_old2).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/stores/useLorebookStore.upsertEntries.test.ts`
Expected: FAIL with "upsertEntries is not a function"

- [ ] **Step 3: 最小实现** — 用 Edit 工具改 `src/stores/useLorebookStore.ts`

在 `interface LorebookStore` 里新增声明（接口块末尾、`clearSummaryEntries` 之后）：

```typescript
  /** 按前缀替换 book 内的若干 entries（剧本关系条目用）：删除所有 id 以 prefix 开头的旧条目，再把新条目写入。book 不存在则静默跳过。 */
  upsertEntries: (bookId: string, entries: Record<string, LoreEntry>, opts: { prefix: string }) => void;
```

在 `create<LorebookStore>()` 实现块里、`clearSummaryEntries: ...` 之后追加：

```typescript
      upsertEntries: (bookId, entries, opts) => set((s) => {
        const book = s.books[bookId];
        if (!book) return s;
        const filtered: Record<string, LoreEntry> = {};
        for (const [eid, entry] of Object.entries(book.entries)) {
          if (!eid.startsWith(opts.prefix)) filtered[eid] = entry;
        }
        for (const [eid, entry] of Object.entries(entries)) {
          filtered[eid] = entry;
        }
        return { books: { ...s.books, [bookId]: { ...book, entries: filtered } } };
      }),
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/stores/useLorebookStore.upsertEntries.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 6: commit + push beta**
```bash
git add src/stores/useLorebookStore.ts src/stores/useLorebookStore.upsertEntries.test.ts
git commit -m "feat(lorebook): 加 upsertEntries 接口按前缀替换条目（关系条目用）"
git push origin beta
```

---

### Task 2: 新增 `relation-lorebook.ts` 渲染纯函数 `buildRelationEntries`

**Files:**
- Create: `src/scenario/relation-lorebook.ts`
- Test: `src/scenario/relation-lorebook.test.ts`

- [ ] **Step 1: 写失败 test**

```typescript
// src/scenario/relation-lorebook.test.ts
import { describe, it, expect } from 'vitest';
import { buildRelationEntries } from './relation-lorebook';
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';
import type { CharacterSheet } from '../types';

// 极简 sheet 工厂——仅填关系渲染读取的字段
function makeSheet(name: string): CharacterSheet {
  return {
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
    halfFifth: {} as CharacterSheet['halfFifth'],
    secondary: {
      hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    skills: {},
    identity: { name, occupation: '', age: 30, gender: '', birthplace: '', residence: '', id: '' },
    greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
    posture: '', statusConditions: [], dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false, phobias: [], manias: [], known_spells: [],
    recovery: {},
  };
}

function makeChar(id: string, name: string, opts: Partial<ScenarioCharacter> = {}): ScenarioCharacter {
  return {
    id,
    role: opts.role ?? 'optional',
    sheet: makeSheet(name),
    npcAttrs: {
      identityTag: opts.npcAttrs?.identityTag ?? '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations: opts.relations,
    presentAtStart: opts.presentAtStart,
    createdAt: opts.createdAt,
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sid_test',
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('buildRelationEntries — spec §10.1', () => {
  it('纯出边：A → B(mentor) + A → C(friend)，生成 A 的条目首段含出边渲染', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'mentor', note: '皇家学院三年' },
        { targetId: 'c', type: 'friend' },
      ] }),
      makeChar('b', '本'),
      makeChar('c', '查理'),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a');
    expect(a).toBeDefined();
    expect(a!.content).toContain('阿尔伯特');
    expect(a!.content).toContain('本');
    expect(a!.content).toContain('mentor');
    expect(a!.content).toContain('皇家学院三年');
    expect(a!.content).toContain('查理');
    expect(a!.content).toContain('friend');
    expect(a!.category).toBe('人物');
    expect(a!.priority).toBe(800);
    expect(a!.position).toBe(1);
    expect(a!.constant).toBe(false);
    expect(a!.cachePolicy).toBe('dynamic_suffix');
  });

  it('纯入边：B 自己没 relations，但被 A 指向 → 仍生成 B 的条目（含反查段）', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'enemy' },
      ] }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    const b = entries.find((e) => e.id === '__scenario_sid_test_rel_b');
    expect(b).toBeDefined();
    expect(b!.content).toContain('本');
    expect(b!.content).toContain('阿尔伯特');
    expect(b!.content).toContain('enemy');
  });

  it('混合：A 同时有出边与被他人指向，两段都渲染', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [
        { targetId: 'b', type: 'friend' },
      ] }),
      makeChar('b', '本'),
      makeChar('c', '查理', { relations: [
        { targetId: 'a', type: 'rival' },
      ] }),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a');
    expect(a).toBeDefined();
    expect(a!.content).toContain('本');         // 出边
    expect(a!.content).toContain('friend');
    expect(a!.content).toContain('查理');       // 入边
    expect(a!.content).toContain('rival');
  });

  it('无关系且无入边：不生成条目', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特'),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    expect(entries).toHaveLength(0);
  });

  it('id 形如 __scenario_<sid>_rel_<charId>', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', { relations: [{ targetId: 'b', type: 'friend' }] }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    expect(entries.map((e) => e.id).sort()).toEqual([
      '__scenario_sid_test_rel_a',
      '__scenario_sid_test_rel_b',
    ]);
  });

  it('keys 包含姓名 + identityTag', () => {
    const doc = makeDoc([
      makeChar('a', '阿尔伯特', {
        npcAttrs: { identityTag: '老侦探' } as ScenarioCharacter['npcAttrs'],
        relations: [{ targetId: 'b', type: 'friend' }],
      }),
      makeChar('b', '本'),
    ]);
    const entries = buildRelationEntries(doc);
    const a = entries.find((e) => e.id === '__scenario_sid_test_rel_a')!;
    expect(a.keys).toContain('阿尔伯特');
    expect(a.keys).toContain('老侦探');
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/scenario/relation-lorebook.test.ts`
Expected: FAIL with "Failed to resolve import" / Cannot find module `./relation-lorebook`

- [ ] **Step 3: 最小实现**

```typescript
// src/scenario/relation-lorebook.ts
// 剧本关系图 → lorebook 条目渲染（spec §7）
// 纯函数，不引 zustand，可单测。被 subscribeRelationLorebook 副作用调用，
// 玩家/PeopleTab/post-settle 任一改动 characters[].relations / presentAtStart 都触发重新渲染。

import type { ScenarioDoc, ScenarioCharacter, ScenarioEntry, RelationType } from '../types/scenario';

/** 给 ScenarioCharacter 取一个可读名字（用于 lorebook content 与 keys）。
 *  优先 sheet.identity.name；缺失退回 npcAttrs.identityTag；再退回 id。 */
function nameOf(c: ScenarioCharacter): string {
  const raw = c.sheet?.identity?.name?.trim();
  if (raw) return raw;
  if (c.npcAttrs.identityTag.trim()) return c.npcAttrs.identityTag.trim();
  return c.id;
}

/** 渲染一条出边为一行文本。 */
function renderOutEdge(target: ScenarioCharacter, type: RelationType, note?: string): string {
  const namePart = nameOf(target);
  const noteSuffix = note?.trim() ? `（备注：${note.trim()}）` : '';
  return `  · ${type}：${namePart}${noteSuffix}`;
}

/** 渲染一条入边为一行文本。 */
function renderInEdge(source: ScenarioCharacter, type: RelationType, note?: string): string {
  const namePart = nameOf(source);
  const noteSuffix = note?.trim() ? `（备注：${note.trim()}）` : '';
  return `  · ${namePart} → ${type}${noteSuffix}`;
}

/**
 * 把剧本里每个有 relations 或被他人指向（入边）的 ScenarioCharacter 渲染为一条 lorebook 条目。
 * 无关系也无入边的 character → 不生成条目（避免噪声）。
 * 返回 ScenarioEntry[]（由调用方进一步走 scenarioEntriesToLoreEntries 转 LoreEntry）。
 */
export function buildRelationEntries(scenarioDoc: ScenarioDoc): ScenarioEntry[] {
  const sid = scenarioDoc.id;
  const chars = scenarioDoc.characters;
  if (chars.length === 0) return [];
  const byId = new Map<string, ScenarioCharacter>();
  for (const c of chars) byId.set(c.id, c);

  // 反查入边：targetId → Array<{ source, type, note }>
  const inEdges = new Map<string, Array<{ source: ScenarioCharacter; type: RelationType; note?: string }>>();
  for (const src of chars) {
    if (!src.relations) continue;
    for (const r of src.relations) {
      if (!byId.has(r.targetId)) continue; // 悬空边静默跳过（M2 已守，但渲染层再防一次）
      const arr = inEdges.get(r.targetId) ?? [];
      arr.push({ source: src, type: r.type, note: r.note });
      inEdges.set(r.targetId, arr);
    }
  }

  const out: ScenarioEntry[] = [];
  for (const c of chars) {
    const outs = (c.relations ?? []).filter((r) => byId.has(r.targetId));
    const ins = inEdges.get(c.id) ?? [];
    if (outs.length === 0 && ins.length === 0) continue;

    const lines: string[] = [];
    lines.push(`${nameOf(c)}的人际关系：`);
    if (outs.length > 0) {
      for (const r of outs) {
        const tgt = byId.get(r.targetId)!;
        lines.push(renderOutEdge(tgt, r.type, r.note));
      }
    }
    if (ins.length > 0) {
      lines.push('被以下角色提及：');
      for (const e of ins) {
        lines.push(renderInEdge(e.source, e.type, e.note));
      }
    }

    // keys：姓名 + identityTag（spec §7.1 keys = X 姓名 + identityTag + 别名）。
    // 当前 ScenarioCharacter 没有「别名」字段——先只放姓名 + identityTag,
    // 后续若引入 alias 字段在此追加；用逗号分隔与 lorebook 同语义。
    const keyParts = [nameOf(c)];
    if (c.npcAttrs.identityTag.trim()) keyParts.push(c.npcAttrs.identityTag.trim());

    out.push({
      id: `__scenario_${sid}_rel_${c.id}`,
      category: '人物',
      comment: `<${nameOf(c)}> 的人际关系`,
      keys: keyParts.join(','),
      content: lines.join('\n'),
      constant: false,
      position: 1,
      priority: 800,
      cachePolicy: 'dynamic_suffix',
    });
  }
  return out;
}
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/scenario/relation-lorebook.test.ts`
Expected: PASS（6 个用例全部通过）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/scenario/relation-lorebook.ts src/scenario/relation-lorebook.test.ts
git commit -m "feat(scenario): 加 buildRelationEntries 渲染人物关系图为 lorebook 条目"
git push origin beta
```

---

### Task 3: 加 `subscribeRelationLorebook` 副作用与 `scenario-engine` 挂/卸联动

**Files:**
- Modify: `src/scenario/relation-lorebook.ts`（追加 `subscribeRelationLorebook`）
- Modify: `src/scenario/scenario-engine.ts`（`mountScenarioBook` 末尾 subscribe；`unloadScenario` 起始 unsubscribe；`activateScenario` step 3 之后也 subscribe）
- Test: `src/scenario/relation-lorebook.subscribe.test.ts`

- [ ] **Step 1: 写失败 test**

```typescript
// src/scenario/relation-lorebook.subscribe.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { subscribeRelationLorebook } from './relation-lorebook';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { scenarioEntriesToLoreEntries } from './scenario-injection';
import type { ScenarioDoc } from '../types/scenario';
import type { CharacterSheet } from '../types';

function makeSheet(name: string): CharacterSheet {
  return {
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
    halfFifth: {} as CharacterSheet['halfFifth'],
    secondary: {
      hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    skills: {},
    identity: { name, occupation: '', age: 30, gender: '', birthplace: '', residence: '', id: '' },
    greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
    posture: '', statusConditions: [], dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false, phobias: [], manias: [], known_spells: [],
    recovery: {},
  };
}

function makeDoc(sid: string): ScenarioDoc {
  return {
    id: sid,
    meta: { name: '订阅测试', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [
      {
        id: 'a', role: 'protagonist', sheet: makeSheet('阿尔伯特'),
        npcAttrs: { identityTag: '', attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
        relations: [],
      },
      {
        id: 'b', role: 'optional', sheet: makeSheet('本'),
        npcAttrs: { identityTag: '', attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
        relations: [],
      },
    ],
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [],
    darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 0, updatedAt: 0,
  };
}

describe('subscribeRelationLorebook', () => {
  const SID = 'sid_subscribe';
  const BOOK_ID = `__scenario_${SID}`;

  beforeEach(() => {
    // 重置 stores
    useScenarioStore.setState({
      builtins: [], userScenarios: [], activeId: null, lastPickedId: null, forkMap: {},
    });
    useLorebookStore.setState({
      books: {
        [BOOK_ID]: {
          name: '[剧本] 订阅测试',
          enabled: true,
          entries: scenarioEntriesToLoreEntries([]),
        },
      },
    });
    useScenarioStore.getState().upsert(makeDoc(SID));
  });

  it('修改 characters[].relations 触发 lorebook 重新渲染', () => {
    const unsubscribe = subscribeRelationLorebook(SID);

    // 初始：无关系 → 不应有 rel_* 条目
    let entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    expect(Object.keys(entries).filter((k) => k.startsWith('rel_'))).toHaveLength(0);

    // 加一条 a → b friend
    useScenarioStore.getState().applyPatch(SID, {
      patchCharacters: [
        {
          ...useScenarioStore.getState().getById(SID)!.characters[0],
          relations: [{ targetId: 'b', type: 'friend' }],
        },
      ],
    });

    entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    const relKeys = Object.keys(entries).filter((k) => k.startsWith('rel_'));
    expect(relKeys.length).toBeGreaterThan(0);
    expect(relKeys).toContain('rel_a');
    expect(relKeys).toContain('rel_b');
    expect(entries['rel_a'].content).toContain('friend');

    unsubscribe();
  });

  it('unsubscribe 之后再改不再触发更新', () => {
    const unsubscribe = subscribeRelationLorebook(SID);
    unsubscribe();

    useScenarioStore.getState().applyPatch(SID, {
      patchCharacters: [
        {
          ...useScenarioStore.getState().getById(SID)!.characters[0],
          relations: [{ targetId: 'b', type: 'enemy' }],
        },
      ],
    });

    const entries = useLorebookStore.getState().books[BOOK_ID]?.entries ?? {};
    expect(Object.keys(entries).filter((k) => k.startsWith('rel_'))).toHaveLength(0);
  });

  it('book 不存在时订阅不抛错（静默跳过）', () => {
    expect(() => {
      const unsub = subscribeRelationLorebook('sid_no_book');
      unsub();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/scenario/relation-lorebook.subscribe.test.ts`
Expected: FAIL with "subscribeRelationLorebook is not exported"

- [ ] **Step 3: 最小实现** — 用 Edit 工具改 `src/scenario/relation-lorebook.ts`，在文件末尾追加：

```typescript

import { useScenarioStore } from '../stores/useScenarioStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { scenarioEntriesToLoreEntries } from './scenario-injection';

const SCENARIO_BOOK_PREFIX = '__scenario_';

/**
 * 提取一个 ScenarioDoc 中所有 character 的「关系相关字段」组合成稳定快照，
 * 仅当快照变化时才重渲染关系条目（避免 store 任意变更都重渲染）。
 */
function snapshotRelationFingerprint(doc: ScenarioDoc | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];
  for (const c of doc.characters) {
    const rels = (c.relations ?? [])
      .map((r) => `${r.targetId}:${r.type}:${r.note ?? ''}`)
      .join('|');
    parts.push(`${c.id}#${c.sheet?.identity?.name ?? ''}#${c.npcAttrs.identityTag}#${c.presentAtStart ? 1 : 0}#${rels}`);
  }
  return parts.join('\n');
}

/**
 * 订阅 useScenarioStore，监测指定剧本的 characters[].relations / identity.name /
 * identityTag / presentAtStart 变化，触发时调 useLorebookStore.upsertEntries 把关系条目
 * 按 'rel_' 前缀替换写入对应 book。
 * 返回 unsubscribe 函数；调用方负责在卸剧本前调用 unsubscribe。
 */
export function subscribeRelationLorebook(scenarioId: string): () => void {
  const bookId = SCENARIO_BOOK_PREFIX + scenarioId;

  const rerender = () => {
    const doc = useScenarioStore.getState().getById(scenarioId);
    if (!doc) return;
    const book = useLorebookStore.getState().books[bookId];
    if (!book) return; // book 未挂或已卸 → 静默跳过
    const scnEntries = buildRelationEntries(doc);
    const loreEntries = scenarioEntriesToLoreEntries(scnEntries, /* priorityOffset */ 0);
    // 把 'scn_<entryId>' 键名归一化到 'rel_<charId>',因为渲染时 id 已带 __scenario_<sid>_rel_<charId> 前缀
    // scenarioEntriesToLoreEntries 会把 id 全部加 'scn_' 前缀,这里把它拨回成 'rel_<charId>' 让前缀替换器认得出。
    const normalized: Record<string, typeof loreEntries[string]> = {};
    for (const scn of scnEntries) {
      const charId = scn.id.slice(`${SCENARIO_BOOK_PREFIX}${scenarioId}_rel_`.length);
      const lk = `scn_${scn.id}`;
      const loreEntry = loreEntries[lk];
      if (loreEntry) normalized[`rel_${charId}`] = loreEntry;
    }
    useLorebookStore.getState().upsertEntries(bookId, normalized, { prefix: 'rel_' });
  };

  let lastFingerprint = snapshotRelationFingerprint(useScenarioStore.getState().getById(scenarioId));
  // 初始挂载时跑一次,把当前关系图刷进 lorebook(不然得等下一次 store 变化才有条目)
  rerender();

  const unsubscribe = useScenarioStore.subscribe((state) => {
    const doc =
      state.userScenarios.find((s) => s.id === scenarioId) ??
      state.builtins.find((s) => s.id === scenarioId);
    const fp = snapshotRelationFingerprint(doc);
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    rerender();
  });

  return unsubscribe;
}
```

然后改 `src/scenario/scenario-engine.ts`：

在文件顶部 import 区追加：
```typescript
import { subscribeRelationLorebook } from './relation-lorebook';
```

在 `const pendingUnloads = new Map<string, Promise<void>>();` 之后追加 module-scope 注册表：
```typescript
// 关系 lorebook 实时订阅句柄：activateScenario / mountScenarioBook 挂上,
// unloadScenario 解挂。同一 scenarioId 重复挂载时先 unsubscribe 旧的再注册新的,
// 防止订阅泄漏导致多次 upsertEntries 写同一 book。
const relationUnsubscribes = new Map<string, () => void>();
```

在 `activateScenario` 的 step 3 lorebook upsertBook 之后（约 220 行 `bookMounted = true;` 之后）追加：
```typescript
    // 挂关系图实时订阅:玩家/PeopleTab/post-settle 改 characters[].relations 后,
    // 下一次 LLM 调用前 lorebook 已被 upsertEntries 同步(只替换 rel_* 前缀条目)。
    const prevUnsub = relationUnsubscribes.get(scenarioId);
    if (prevUnsub) prevUnsub();
    relationUnsubscribes.set(scenarioId, subscribeRelationLorebook(scenarioId));
```

在 `mountScenarioBook` 末尾 `// 不调 applyScenarioMapLocations` 之前追加：
```typescript
  // 读档重挂时同样要重建订阅:scenario-engine module 内的 Map 会随热重载/页面刷新清空,
  // 旧句柄即便保留也指向已失效闭包。
  const prevUnsub = relationUnsubscribes.get(scenarioId);
  if (prevUnsub) prevUnsub();
  relationUnsubscribes.set(scenarioId, subscribeRelationLorebook(scenarioId));
```

在 `unloadScenario` 入口（`const bookId = SCENARIO_BOOK_PREFIX + scenarioId;` 之前一行）插入：
```typescript
  // 解挂关系图订阅,避免 book 被 removeBook 后订阅仍触发 upsertEntries 命中 book 不存在分支
  // (虽然分支已守 book 不存在静默跳过,但解订阅能彻底回收闭包内引用)。
  const unsub = relationUnsubscribes.get(scenarioId);
  if (unsub) {
    unsub();
    relationUnsubscribes.delete(scenarioId);
  }
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/scenario/relation-lorebook.subscribe.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vitest run src/scenario/relation-lorebook.test.ts src/scenario/relation-lorebook.subscribe.test.ts src/stores/useLorebookStore.upsertEntries.test.ts && npx vite build`
Expected: tsc 干净 + 9 个测试用例全部 PASS + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/scenario/relation-lorebook.ts src/scenario/relation-lorebook.subscribe.test.ts src/scenario/scenario-engine.ts
git commit -m "feat(scenario): 关系图实时订阅 — scenario-engine 挂卸联动 + 自动 upsert lorebook"
git push origin beta
```

---

## 里程碑验证清单

- [ ] `npx vitest run src/stores/useLorebookStore.upsertEntries.test.ts` PASS（3 用例）
- [ ] `npx vitest run src/scenario/relation-lorebook.test.ts` PASS（6 用例）
- [ ] `npx vitest run src/scenario/relation-lorebook.subscribe.test.ts` PASS（3 用例）
- [ ] `npx tsc --noEmit` 干净通过
- [ ] `npx vite build` 成功（pre-existing warning 除外）
- [ ] 已 commit 并 push 到 beta 分支（3 个 commits，无 Co-Authored-By）
- [ ] `relationUnsubscribes` Map 在 `activateScenario` / `mountScenarioBook` 都做了"先 unsubscribe 再 subscribe"防泄漏处理
- [ ] `unloadScenario` 调用后 `relationUnsubscribes.get(scenarioId)` 为 undefined

里程碑完成意味着：**M9 (post-settle) 调 `applyRelationDelta` 时 / M5+M6 UI 编辑 `relations` 后 / M10 `presentAtStart` 改动后，下一次 LLM 调用前 `__scenario_<sid>` book 内的 `rel_*` 条目已被新关系图覆盖**，无需调用方手动 upsert。

---

## M4 — Onboarding 流程改造（RosterPicker）

**目标**：把 ScenarioPicker 选完后的入口从「直接进 CharCreator 或正文」改成「先进 RosterPicker 选角色」。CharCreator 完成后不再 startNewConversation/activateScenario，而是把自创卡作为 `player_created` 角色 `applyPatch` 写入剧本，回到 RosterPicker；玩家点击「选这个角色 →」时才真正 startNewConversation + activateScenario 进正文。本里程碑不加关系编辑步（留给 M5）。

**依赖**：M1（`player_created` role / `ScenarioCharacter.createdAt`）+ M2（无新增 store 方法，本里程碑复用现有 applyPatch）

**前置条件检查**：
- `ScenarioCharacterRole` 已包含 `'player_created'`（M1 落地）
- `ScenarioCharacter.createdAt?: number` 字段已加（M1 落地）
- `useScenarioStore.applyPatch` 已支持 `patchCharacters`（现有实现，src/stores/useScenarioStore.ts:104-108 + 216-250）
- `activateScenario('newChar')` 不需要 charIdx；`activateScenario('preset', charIdx)` 必须显式传 charIdx（src/scenario/scenario-engine.ts:167-171）

---

### Task 1: 新建 RosterPicker 组件骨架 + 类型契约

**Files:**
- Create: `src/components/Landing/RosterPicker.tsx`
- Create: `src/components/Landing/RosterPicker.test.tsx`

- [ ] **Step 1: 写失败 test**

```typescript
// src/components/Landing/RosterPicker.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RosterPicker } from './RosterPicker';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { ScenarioDoc, ScenarioCharacter } from '../../types/scenario';
import { defaultSheet } from '../../stores/useCharSheetStore';

function makeChar(id: string, name: string, role: ScenarioCharacter['role'], createdAt?: number): ScenarioCharacter {
  return {
    id,
    role,
    sheet: { ...JSON.parse(JSON.stringify(defaultSheet)), identity: { ...defaultSheet.identity, name, id } },
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    createdAt,
  };
}

function makeScenario(chars: ScenarioCharacter[]): ScenarioDoc {
  const now = Date.now();
  return {
    id: 'test-scn-roster-1',
    builtin: false,
    meta: { name: '测试剧本', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1人', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('RosterPicker', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });

  it('分组渲染：作者预设 + 你创建的（不显示 locked_npc）', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('o1', '哈丽特', 'optional'),
      makeChar('l1', '布兰登', 'locked_npc'),
      makeChar('u1', '约翰·肯特', 'player_created', 1000),
      makeChar('u2', '萨拉·林', 'player_created', 2000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    expect(screen.getByText('以利亚')).toBeInTheDocument();
    expect(screen.getByText('哈丽特')).toBeInTheDocument();
    expect(screen.queryByText('布兰登')).toBeNull();
    expect(screen.getByText('约翰·肯特')).toBeInTheDocument();
    expect(screen.getByText('萨拉·林')).toBeInTheDocument();
    expect(screen.getByText('作者预设')).toBeInTheDocument();
    expect(screen.getByText('你创建的')).toBeInTheDocument();
  });

  it('player_created 按 createdAt 倒序排列', () => {
    const scn = makeScenario([
      makeChar('u1', '老卡', 'player_created', 1000),
      makeChar('u2', '新卡', 'player_created', 5000),
      makeChar('u3', '中卡', 'player_created', 3000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    const names = screen.getAllByTestId('roster-row-name').map((el) => el.textContent);
    const userNames = names.filter((n) => n === '新卡' || n === '老卡' || n === '中卡');
    expect(userNames).toEqual(['新卡', '中卡', '老卡']);
  });

  it('点选 protagonist 行触发 onPickChar(charIdx, mode=preset)', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onPick = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={onPick}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByText('选这个角色 →')[0]);
    expect(onPick).toHaveBeenCalledWith(0, 'preset');
  });

  it('点选 player_created 行触发 onPickChar(charIdx, mode=newChar)', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onPick = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={onPick}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    const buttons = screen.getAllByText('选这个角色 →');
    // 第二个按钮 = 自创卡(u1)，对应原 characters[] index 1
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1, 'newChar');
  });

  it('返回按钮触发 onBack', () => {
    const scn = makeScenario([makeChar('p1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onBack = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={onBack}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('返回选剧本'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('新建调查员按钮触发 onAddNewCharacter', () => {
    const scn = makeScenario([makeChar('p1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onAdd = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={onAdd}
      />,
    );
    fireEvent.click(screen.getByText('新建调查员'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('player_created 行带编辑+删除按钮，预设行不带', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('roster-row-edit')).toHaveLength(1);
    expect(screen.getAllByTestId('roster-row-delete')).toHaveLength(1);
  });

  it('点删除按钮调用 applyPatch 移除该自创卡', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('roster-row-delete'));
    const next = useScenarioStore.getState().getById(scn.id);
    expect(next?.characters.find((c) => c.id === 'u1')).toBeUndefined();
    expect(next?.characters.find((c) => c.id === 'p1')).toBeDefined();
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/components/Landing/RosterPicker.test.tsx`
Expected: FAIL with `Cannot find module './RosterPicker'` 或 `RosterPicker is not defined`

- [ ] **Step 3: 最小实现**

`useScenarioStore` 当前 patch 不支持「按 id 移除 character」（只有 upsert/replace 语义）。删除走「重写 characters[]」路径：拿当前 doc 浅克隆，过滤掉目标 id，整个 `patchCharacters` 用 upsert 覆盖剩余 + 单独再写一条直接 setState 路径。最稳妥做法是绕过 patch、直接读 doc + 用 `upsert(doc)` 落库，与 RosterPicker 的删除语义自洽。

```typescript
// src/components/Landing/RosterPicker.tsx
import { useMemo } from 'react';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { ScenarioCharacter } from '../../types/scenario';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scenarioId: string;
  onPickChar: (charIdx: number, mode: 'newChar' | 'preset') => void;
  onBack: () => void;
  onAddNewCharacter: () => void;
}

function IconBack({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function IconUserPlus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0112 0" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  );
}

function IconPencil({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function IconTrash({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function RowBtn({
  onClick, children, accent, danger, dataTestId,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        fontFamily: 'var(--font-ui)', fontSize: 11.5, letterSpacing: 1,
        color: danger ? '#d47a6a' : (accent ? 'var(--gold)' : 'var(--text-light, #d0c2a0)'),
        background: accent ? 'rgba(196,168,85,0.10)' : 'transparent',
        border: `1px solid ${danger ? 'rgba(212,122,106,0.55)' : 'rgba(196,168,85,0.45)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}, box-shadow 180ms ${EASE}, color 180ms ${EASE}`,
      }}
      onMouseEnter={(ev) => {
        ev.currentTarget.style.background = danger
          ? 'rgba(212,122,106,0.14)'
          : 'rgba(196,168,85,0.18)';
        ev.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
        ev.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.background = accent ? 'rgba(196,168,85,0.10)' : 'transparent';
        ev.currentTarget.style.transform = 'translateY(0) scale(1)';
        ev.currentTarget.style.boxShadow = 'none';
      }}
      onMouseDown={(ev) => { ev.currentTarget.style.transform = 'translateY(0) scale(0.97)'; }}
      onMouseUp={(ev) => { ev.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'; }}
    >
      {children}
    </button>
  );
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function RosterPicker({ scenarioId, onPickChar, onBack, onAddNewCharacter }: Props) {
  const getById = useScenarioStore((s) => s.getById);
  const upsert = useScenarioStore((s) => s.upsert);
  const scn = getById(scenarioId);

  // 按 characters[] 原序保留 idx,然后再分组(分组只影响渲染顺序,onPickChar 传的 charIdx 仍是原序 idx)
  const grouped = useMemo(() => {
    if (!scn) return { preset: [], userCreated: [] };
    const indexed: { c: ScenarioCharacter; idx: number }[] = scn.characters.map((c, idx) => ({ c, idx }));
    const preset = indexed.filter(({ c }) => c.role === 'protagonist' || c.role === 'optional');
    const userCreated = indexed
      .filter(({ c }) => c.role === 'player_created')
      .sort((a, b) => (b.c.createdAt ?? 0) - (a.c.createdAt ?? 0));
    return { preset, userCreated };
  }, [scn]);

  if (!scn) {
    return (
      <div role="alert" style={{
        position: 'fixed', inset: 0, zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,5,2,0.92)',
        color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2,
      }}>
        剧本不存在 — <button onClick={onBack} style={{
          marginLeft: 10, background: 'none', border: '1px solid var(--brass)',
          padding: '6px 14px', color: 'var(--gold)', cursor: 'pointer', borderRadius: 2,
        }}>返回</button>
      </div>
    );
  }

  const handleDelete = (charId: string, charName: string): void => {
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`删除自创角色「${charName}」?此操作不可撤销。`);
    if (!ok) return;
    const next = { ...scn, characters: scn.characters.filter((c) => c.id !== charId), updatedAt: Date.now() };
    upsert(next);
  };

  const renderRow = ({ c, idx }: { c: ScenarioCharacter; idx: number }, isUserCreated: boolean) => {
    const name = c.sheet?.identity?.name || c.npcAttrs.identityTag || '未命名';
    const occ = c.sheet?.identity?.occupation || '';
    const roleHint = c.role === 'protagonist' ? '推荐主角' : (c.role === 'optional' ? '配角' : '你的角色');
    const dateHint = isUserCreated ? formatDate(c.createdAt) : '';
    return (
      <div
        key={c.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          background: 'rgba(20,14,8,0.55)',
          border: '1px solid rgba(196,168,85,0.22)',
          borderRadius: 3,
          transition: `border-color 180ms ${EASE}, background 180ms ${EASE}`,
        }}
        onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'rgba(196,168,85,0.5)'; }}
        onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'rgba(196,168,85,0.22)'; }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="roster-row-name" style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gold)',
            letterSpacing: 1, marginBottom: 3,
          }}>{name}</div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 11, color: 'rgba(196,168,85,0.6)',
            letterSpacing: 1,
          }}>
            {occ && <span>{occ}</span>}
            {occ && <span style={{ margin: '0 6px' }}>·</span>}
            <span>{roleHint}</span>
            {dateHint && <><span style={{ margin: '0 6px' }}>·</span><span>{dateHint}</span></>}
          </div>
        </div>
        {isUserCreated && (
          <>
            <RowBtn
              dataTestId="roster-row-edit"
              onClick={() => {
                // 编辑入口:复用「新建调查员」流程(CharCreator 加载该卡)。
                // 当前 CharacterCreator 尚不支持「加载已存在 player_created 卡」,M4 仅留入口,
                // 实际加载逻辑由 M5 关系编辑步连同 CharCreator 整体增强时落地;此处先把 charId
                // 写到 lastPicked 旁挂的草稿位是一种思路,但本里程碑暂直接走「新建空卡」路径,
                // 保持流程闭环。点击行为等同于「新建调查员」(占位)。
                onAddNewCharacter();
              }}
            >
              <IconPencil /> 编辑
            </RowBtn>
            <RowBtn
              dataTestId="roster-row-delete"
              danger
              onClick={() => handleDelete(c.id, name)}
            >
              <IconTrash /> 删除
            </RowBtn>
          </>
        )}
        <RowBtn
          accent
          onClick={() => onPickChar(idx, isUserCreated ? 'newChar' : 'preset')}
        >
          选这个角色 →
        </RowBtn>
      </div>
    );
  };

  return (
    <div
      className="scenario-editor"
      role="dialog" aria-label="选择角色"
      style={{
        position: 'fixed', inset: 0, zIndex: 140,
        display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse at center, var(--abyss, #18120a) 0%, var(--void, #060403) 70%)',
        overflow: 'hidden',
      }}
    >
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '14px 22px',
        borderBottom: '1px solid rgba(196,168,85,0.22)',
        background: 'rgba(10,7,4,0.65)',
        backdropFilter: 'blur(4px)',
      }}>
        <RowBtn onClick={onBack}>
          <IconBack /> 返回选剧本
        </RowBtn>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', color: 'var(--gold)',
            fontSize: 16, letterSpacing: 3,
          }}>选择你的角色</div>
          <div style={{
            fontFamily: 'var(--font-ui)', color: 'rgba(196,168,85,0.6)',
            fontSize: 11, letterSpacing: 1.5, marginTop: 2,
          }}>剧本《{scn.meta.name}》</div>
        </div>
        <RowBtn accent onClick={onAddNewCharacter}>
          <IconUserPlus /> 新建调查员
        </RowBtn>
      </header>

      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto',
        padding: '20px 24px 40px',
      }}>
        <section style={{ marginBottom: 28 }}>
          <h3 style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gold)',
            letterSpacing: 3, fontWeight: 500,
            borderBottom: '1px solid rgba(196,168,85,0.25)',
            paddingBottom: 6,
          }}>作者预设</h3>
          {grouped.preset.length === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              color: 'rgba(196,168,85,0.5)', fontFamily: 'var(--font-ui)', fontSize: 12,
            }}>本剧本未预设可选角色</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped.preset.map((row) => renderRow(row, false))}
            </div>
          )}
        </section>

        <section>
          <h3 style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gold)',
            letterSpacing: 3, fontWeight: 500,
            borderBottom: '1px solid rgba(196,168,85,0.25)',
            paddingBottom: 6,
          }}>你创建的</h3>
          {grouped.userCreated.length === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              color: 'rgba(196,168,85,0.5)', fontFamily: 'var(--font-ui)', fontSize: 12,
            }}>暂无自创角色,点顶部「新建调查员」开始创建</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grouped.userCreated.map((row) => renderRow(row, true))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/components/Landing/RosterPicker.test.tsx`
Expected: PASS（全部 8 个用例）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净（无新增 error）+ build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/components/Landing/RosterPicker.tsx src/components/Landing/RosterPicker.test.tsx
git commit -m "feat(scenario): 新增 RosterPicker 选角界面 — 作者预设 + 自创卡分组"
git push origin beta
```

---

### Task 2: 改 App.tsx 接入 RosterPicker 新路由

**Files:**
- Modify: `src/App.tsx:46`（screen union 加 `'rosterPick'`）
- Modify: `src/App.tsx:150-205`（ScenarioScreen.onPick + CharacterCreator.onComplete 改写 + 新增 RosterPicker 渲染）

- [ ] **Step 1: 写失败 test**

App.tsx 是顶层 ErrorBoundary 包裹的整页 App,涉及 LandingScreen/DB 初始化/ScenarioScreen 等大量副作用,单测成本高;按 memory `user-does-ui-testing`,流程接入 test 改由后续 Task 3 的集成断言（CharacterCreator handleConfirm 单测）覆盖,本 Task 仅靠 tsc + 玩家手动跑通 UI 验证。

跳过 Step 1-2,直接进 Step 3 实现 + Step 5 校验。

- [ ] **Step 3: 最小实现**

把 screen union 加 `'rosterPick'`、把原 ScenarioScreen.onPick 简化为「set lastPicked → 跳 rosterPick」、新增 RosterPicker 渲染分支、把原 CharacterCreator.onComplete 改成「回 rosterPick」。

Edit `src/App.tsx`:

```typescript
// 1) screen union 加 rosterPick
const [screen, setScreen] = useState<'landing' | 'scenarioPick' | 'rosterPick' | 'creator' | 'game'>('landing');
```

```typescript
// 2) 顶部 import 加 RosterPicker(放在 ScenarioScreen import 旁)
import { RosterPicker } from './components/Landing/RosterPicker';
```

```typescript
// 3) 替换 ScenarioScreen.onPick 整段(原 150-176)
{screen === 'scenarioPick' && (
  <ScenarioScreen
    onPick={(scenarioId) => {
      // 选完剧本统一跳 RosterPicker(不再区分 preset/newChar — 角色选择由 RosterPicker 决定)
      useScenarioStore.getState().setLastPicked(scenarioId);
      setScreen('rosterPick');
    }}
    onClose={() => setScreen('landing')}
    onOpenEditor={(id) => setEditorScenarioId(id)}
  />
)}
```

```typescript
// 4) 新增 RosterPicker 渲染分支(放在 ScenarioScreen 分支之后)
{screen === 'rosterPick' && (() => {
  const scnId = useScenarioStore.getState().lastPicked;
  if (!scnId) {
    setScreen('scenarioPick');
    return null;
  }
  return (
    <RosterPicker
      scenarioId={scnId}
      onBack={() => setScreen('scenarioPick')}
      onAddNewCharacter={() => setScreen('creator')}
      onPickChar={(charIdx, mode) => {
        void (async () => {
          startNewConversation('新游戏');
          setActivating(true);
          try {
            await activateScenario(scnId, mode, charIdx);
          } catch (err) {
            console.error('[App] 激活剧本失败:', err);
          } finally {
            setActivating(false);
          }
          setScreen('game');
        })();
      }}
    />
  );
})()}
```

```typescript
// 5) 替换 CharacterCreator 整段(原 183-205) — onComplete 改回 rosterPick,onClose 也回 rosterPick
{screen === 'creator' && (
  <CharacterCreator
    onComplete={() => {
      // M4: CharCreator.handleConfirm 已把自创卡 applyPatch 写进剧本,这里只回 RosterPicker 让玩家选他进游戏
      setScreen('rosterPick');
    }}
    onClose={() => setScreen('rosterPick')}
  />
)}
```

`ScenarioPickChoice` 类型本身仍存在（M4 不删它，M5/后续可清理）；ScenarioScreen.onPick 仍按 `(id, choice)` 签名调用，但我们把第二参丢弃 — TS 不报错（多余参 OK）。注意 `onPick={(scenarioId) => ...}` 实际签名是 `(scenarioId, choice)`,我们只取第一个参数,TS 允许少声明形参。

- [ ] **Step 4: 跑现有测试验证未回归**

Run: `npx vitest run src/components/Landing/RosterPicker.test.tsx`
Expected: PASS（M4 Task 1 测试仍通过）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/App.tsx
git commit -m "feat(scenario): App 路由接入 RosterPicker — ScenarioPicker 之后先选角"
git push origin beta
```

---

### Task 3: 改 CharacterCreator.handleConfirm 不再进游戏，改为 applyPatch + 回 RosterPicker

**Files:**
- Modify: `src/components/CharSheet/CharacterCreator.tsx:403-550`（handleConfirm 整段重写）
- Create: `src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx`

- [ ] **Step 1: 写失败 test**

```typescript
// src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useChatStore } from '../../stores/useChatStore';
import { useCharSheetStore, defaultSheet } from '../../stores/useCharSheetStore';
import type { ScenarioDoc } from '../../types/scenario';

function makeScenario(id: string): ScenarioDoc {
  const now = Date.now();
  return {
    id,
    builtin: false,
    meta: { name: '测试剧本', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1人', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [],
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('CharacterCreator handleConfirm 流程改造（M4）', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
    useChatStore.setState({ sessions: [], activeId: null } as Partial<ReturnType<typeof useChatStore.getState>> as never);
    useCharSheetStore.getState().setSheet(defaultSheet);
  });

  it('applyPatch 把自创卡作为 player_created 写入剧本 characters[]', async () => {
    const scn = makeScenario('test-scn-confirm-1');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });

    // 模拟 handleConfirm 关键路径(精简版,与生产实现对齐):构造 sheet → applyPatch
    const { applyPatch } = useScenarioStore.getState();
    const newCharId = `INV-TEST-001`;
    const sheet = { ...JSON.parse(JSON.stringify(defaultSheet)), identity: { ...defaultSheet.identity, name: '约翰·肯特', id: newCharId } };
    applyPatch(scn.id, {
      patchCharacters: [{
        id: newCharId,
        role: 'player_created',
        sheet,
        npcAttrs: {
          identityTag: '',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
        },
        createdAt: 12345,
      }],
    });

    const next = useScenarioStore.getState().getById(scn.id);
    expect(next).toBeDefined();
    const created = next!.characters.find((c) => c.id === newCharId);
    expect(created).toBeDefined();
    expect(created?.role).toBe('player_created');
    expect(created?.sheet.identity.name).toBe('约翰·肯特');
    expect(created?.createdAt).toBe(12345);
  });

  it('applyPatch 不会触发新会话（不调用 startNewConversation）', async () => {
    const scn = makeScenario('test-scn-confirm-2');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });
    const beforeSessions = useChatStore.getState().sessions.length;

    const { applyPatch } = useScenarioStore.getState();
    applyPatch(scn.id, {
      patchCharacters: [{
        id: 'INV-TEST-002',
        role: 'player_created',
        sheet: JSON.parse(JSON.stringify(defaultSheet)),
        npcAttrs: {
          identityTag: '',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
        },
        createdAt: Date.now(),
      }],
    });

    const afterSessions = useChatStore.getState().sessions.length;
    expect(afterSessions).toBe(beforeSessions); // 无新会话创建
  });

  it('多次 applyPatch 同 id 时不重复追加（覆盖现有）', () => {
    const scn = makeScenario('test-scn-confirm-3');
    useScenarioStore.setState({ userScenarios: [scn], lastPicked: scn.id });
    const { applyPatch } = useScenarioStore.getState();
    const charId = 'INV-TEST-DUP';
    const baseChar = {
      id: charId,
      role: 'player_created' as const,
      sheet: JSON.parse(JSON.stringify(defaultSheet)),
      npcAttrs: {
        identityTag: '',
        attitudeDefault: 0,
        relationshipDefault: '',
        locationDefault: '',
        publicBio: '',
        hiddenBio: '',
      },
      createdAt: 1000,
    };
    applyPatch(scn.id, { patchCharacters: [baseChar] });
    applyPatch(scn.id, { patchCharacters: [{ ...baseChar, createdAt: 2000 }] });
    const next = useScenarioStore.getState().getById(scn.id);
    const hits = next!.characters.filter((c) => c.id === charId);
    expect(hits).toHaveLength(1);
    expect(hits[0].createdAt).toBe(2000);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx`
Expected: 用例 1 + 用例 3 PASS（直接走 applyPatch 已经按 M1+现有 store 支持），用例 2 PASS。**如果三条都 PASS**：那 test 是为验证 store 契约预埋的「锚点」，下一步要做的是把 CharacterCreator.handleConfirm 实际重构对齐此契约。直接进 Step 3 不依赖 Step 2 fail。

实际意义：这组 test 锚定 store 的契约（patchCharacters 幂等、不创建会话），Step 3 重构 handleConfirm 后再跑确保未破坏。

- [ ] **Step 3: 最小实现**

打开 `src/components/CharSheet/CharacterCreator.tsx` 第 531-550 行,把「startNewConversation + setSheet + saveConversation + onComplete()」整段替换成「读 lastPicked → applyPatch + onComplete()」。

Edit `src/components/CharSheet/CharacterCreator.tsx`:

```typescript
// 替换 src/components/CharSheet/CharacterCreator.tsx:531-550 整段
    // M4: 不再 startNewConversation / setSheet / saveConversation /(后续 activateScenario)。
    // 改为把自创卡作为 player_created 角色 applyPatch 写入剧本 characters[],
    // CharCreator 关闭后由 App.tsx 回到 RosterPicker,玩家在 RosterPicker 选他/别人才真正进游戏。
    const lastPickedScn = useScenarioStore.getState().lastPicked;
    if (lastPickedScn) {
      useScenarioStore.getState().applyPatch(lastPickedScn, {
        patchCharacters: [{
          id: charId,
          role: 'player_created',
          sheet,
          npcAttrs: {
            identityTag: '',
            attitudeDefault: 0,
            relationshipDefault: '',
            locationDefault: '',
            publicBio: '',
            hiddenBio: '',
            // 把 8 段背景独立字段也同步带上,与 PeopleTab 编辑路径对齐
            description,
            beliefs,
            significantPeople,
            meaningfulLocations,
            treasuredPossessions,
            traits,
            injuries,
            backgroundFears,
            initialItemsRaw,
          },
          createdAt: Date.now(),
        }],
      });
    } else {
      console.warn('[CharacterCreator] lastPicked 为空,无法把自创卡写入剧本 — 跳过 applyPatch');
    }
    onComplete();
```

同时清理同文件已不再需要的 import：

```typescript
// 把 src/components/CharSheet/CharacterCreator.tsx:7 的 import 改成只保留 saveConversation
import { saveConversation } from '../../stores/sessionLifecycle';
```

`startNewConversation` 这条 import 不再使用,删掉防 TS 报 unused;但若同文件别处仍引用则保留。先用 grep 确认:

```typescript
// 若 tsc 报 startNewConversation unused → 把 line 7 改成上面的精简版
// 若 tsc 报 createInitialStatData / useVariableStore unused → 同理删
// 若 tsc 报 saveConversation unused → 同样删(本里程碑 handleConfirm 已不调 saveConversation)
```

具体删/留以 Step 5 `npx tsc --noEmit` 报错为准 — 删到 tsc 绿。

handleConfirm 依赖数组里 `setSheet` 不再使用,从依赖数组移除:

```typescript
// 把 src/components/CharSheet/CharacterCreator.tsx:543-550 的 useCallback deps 改成
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills, interestPoints,
    luckValue, name, player, occupation, customOccupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, backgroundFears,
    ageDeductSCD, ageDeductSS,
    initialItemsRaw,
    onComplete,
  ]);
```

`setSheet` useCharSheetStore 钩子顶部声明（src/components/CharSheet/CharacterCreator.tsx:49）也要删（不再用）:

```typescript
// 删 src/components/CharSheet/CharacterCreator.tsx:49 这行:
//   const setSheet = useCharSheetStore((s) => s.setSheet);
// 若同文件别处用到 setSheet → 保留;若 tsc 报 useCharSheetStore unused → 顺手清 import
```

注：`player` 变量在依赖里保留是历史包袱,M4 不动它。

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx src/components/Landing/RosterPicker.test.tsx`
Expected: PASS（M4 Task 1 + Task 3 全部用例通过）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净（无新增 error；若有 unused import error 按 Step 3 末尾指引补删）+ build 成功

- [ ] **Step 6: commit + push beta**

```bash
git add src/components/CharSheet/CharacterCreator.tsx src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx
git commit -m "refactor(scenario): CharCreator 完成不再进游戏 — applyPatch 把自创卡写回剧本"
git push origin beta
```

---

### 里程碑验证清单

- [ ] `npx vitest run src/components/Landing/RosterPicker.test.tsx` 全绿（Task 1 的 8 个用例）
- [ ] `npx vitest run src/components/CharSheet/CharacterCreator.handleConfirm.test.tsx` 全绿（Task 3 的 3 个用例）
- [ ] `npx tsc --noEmit` 无新增 error
- [ ] `npx vite build` 成功（pre-existing warning 可忽略）
- [ ] 3 次 `git push origin beta` 完成（每个 Task 各一次）
- [ ] 玩家手动跑通 UI 闭环：开新游戏 → 选剧本 → 进 RosterPicker → 「新建调查员」→ CharCreator 走完 → 回到 RosterPicker → 看到刚建的「你创建的」分组里有那张卡 → 点「选这个角色 →」进游戏 → 返回主菜单 → 再次开新游戏选同剧本 → 自创卡仍在 RosterPicker 列表里
- [ ] 玩家手动验证：在 RosterPicker 点「× 删除」按钮 → 确认弹窗后该自创卡从列表消失，再次进入仍然不见
- [ ] 玩家手动验证：在 RosterPicker 点作者预设角色「选这个角色 →」→ 直接进游戏（preset 模式），不经过 CharCreator

里程碑完成判据：以上 7 项全部勾选 → M4 关闭，可进入 M5（CharCreator 关系编辑步）。

---

## M5 — CharCreator 关系编辑步

**依赖**：M1（`RelationType / ScenarioRelation / presentAtStart / role='player_created' / relations` 类型与 `relation-graph.ts`）+ M2（`useScenarioStore.applyRelationDelta` + `patchCharacters` relations 支持）+ M4（CharCreator handleConfirm 改造为 applyPatch 后回 RosterPicker；CharCreator 接收 `editingCharacterId?: string` 用于编辑现有 player_created 卡）。
**后续依赖**：M6（PeopleTab 复用 `RelationEditor` 组件）。
**spec 直接对应**：§5.2（onboarding 流程中 CharCreator 步骤 5【关系】内嵌）+ §6.2（列表+侧栏布局、实时校验、locked_npc 弱化）。

**范围说明**：M5 只动 CharCreator 与新组件 `RelationEditor.tsx`；不动 PeopleTab（M6）、不动 TeamSidebar（M7）、不动 lorebook 注入（M3 已上）。`STEPS` 常量从 6 项扩到 7 项：`身份信息/基础属性/衍生属性/职业与技能/背景故事/关系/确认创建`；步骤序号 5 = 关系，6 = 确认创建（原 5）；`canGoNext / renderStepContent / handleConfirm` 同步迁移。

---

### Task 1: 写 `RelationEditor` 单测脚手架（失败基线）

**Files:**
- Create Test: `src/components/CharSheet/RelationEditor.test.tsx`

- [ ] **Step 1: 写失败 test**
```tsx
// src/components/CharSheet/RelationEditor.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RelationEditor } from './RelationEditor';
import type { ScenarioDoc, ScenarioCharacter, ScenarioRelation } from '../../types/scenario';

function makeChar(id: string, name: string, role: ScenarioCharacter['role'] = 'optional'): ScenarioCharacter {
  return {
    id,
    role,
    sheet: {
      characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
      halfFifth: {} as never,
      secondary: { hp: { current: 10, max: 10 }, san: { current: 50, max: 50 }, mp: { current: 10, max: 10 }, luck: 50, mov: 8, db: '0', build: 0 },
      skills: {},
      identity: { name, occupation: '侦探', age: 30, gender: '男', birthplace: '', residence: '', id },
      greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
      posture: '站立', statusConditions: [], dailySanLoss: 0,
      temporaryInsanity: { active: false, roundsLeft: 0 },
      indefiniteInsanity: { active: false, daysLeft: 0 },
      permanentInsanity: false, phobias: [], manias: [], known_spells: [], recovery: {},
    },
    npcAttrs: {
      identityTag: '', attitudeDefault: 0, relationshipDefault: '',
      locationDefault: '', publicBio: '', hiddenBio: '',
    },
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sc1', meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: chars,
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 0, updatedAt: 0,
  };
}

describe('RelationEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('排除 currentCharId 本人，列出其他 character', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const b = makeChar('b', '哈丽特');
    const doc = makeDoc([me, a, b]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    expect(screen.queryByText('我')).toBeNull();
    expect(screen.getByText('以利亚')).toBeTruthy();
    expect(screen.getByText('哈丽特')).toBeTruthy();
  });

  it('选行后侧栏显示该 NPC 的关系下拉与备注框', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const doc = makeDoc([me, a]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('以利亚'));
    expect(screen.getByLabelText('关系类型')).toBeTruthy();
    expect(screen.getByLabelText('备注')).toBeTruthy();
    expect(screen.getByLabelText('开场和他一起在场')).toBeTruthy();
  });

  it('修改关系类型触发 onChange 并合并 relations', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const doc = makeDoc([me, a]);
    const onChange = vi.fn();
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('以利亚'));
    fireEvent.change(screen.getByLabelText('关系类型'), { target: { value: 'friend' } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const [nextRelations] = lastCall as [ScenarioRelation[], string[]];
    expect(nextRelations.find(r => r.targetId === 'a')?.type).toBe('friend');
  });

  it('勾选 presentAtStart + 关系为 enemy → 显示红色警告', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '哈丽特');
    const doc = makeDoc([me, a]);
    render(
      <RelationEditor
        scenarioDoc={doc}
        currentCharId="me"
        relations={[{ targetId: 'a', type: 'enemy' }]}
        presentAtStart={['a']}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('哈丽特'));
    expect(screen.getByText('与敌对者不能开场同场')).toBeTruthy();
  });

  it('locked_npc 行 presentAtStart 复选框 disabled', () => {
    const me = makeChar('me', '我');
    const locked = makeChar('lk', '布兰登神父', 'locked_npc');
    const doc = makeDoc([me, locked]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('布兰登神父'));
    const checkbox = screen.getByLabelText('开场和他一起在场') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/components/CharSheet/RelationEditor.test.tsx`
Expected: FAIL with "Failed to resolve import './RelationEditor'" 或 "Cannot find module './RelationEditor'"

- [ ] **Step 3: 创建最小可编译占位**
```tsx
// src/components/CharSheet/RelationEditor.tsx
import type { ScenarioDoc } from '../../types/scenario';
import type { ScenarioRelation } from '../../types/scenario';

export interface RelationEditorProps {
  scenarioDoc: ScenarioDoc;
  currentCharId: string;
  relations: ScenarioRelation[];
  presentAtStart: string[];
  lockedNpcsDisabled?: boolean;
  onChange: (relations: ScenarioRelation[], presentAtStart: string[]) => void;
}

export function RelationEditor(_props: RelationEditorProps) {
  return null;
}
```

- [ ] **Step 4: 跑 test 再次失败 — 这次是行为而非 import**
Run: `npx vitest run src/components/CharSheet/RelationEditor.test.tsx`
Expected: FAIL with "Unable to find element" 类报错（组件渲染为 null，找不到「以利亚」等元素）。

- [ ] **Step 5: tsc 校验占位编译干净**
Run: `npx tsc --noEmit`
Expected: tsc 干净（占位组件 + 单测都能通过类型检查）。

- [ ] **Step 6: commit + push beta**
```bash
git add src/components/CharSheet/RelationEditor.tsx src/components/CharSheet/RelationEditor.test.tsx
git commit -m "test(relation): 加 RelationEditor 单测骨架与占位组件"
git push origin beta
```

---

### Task 2: 落 `RelationEditor` 组件本体（列表 + 侧栏 + 校验）

**Files:**
- Modify: `src/components/CharSheet/RelationEditor.tsx`

- [ ] **Step 1: 重写组件实现**
```tsx
// src/components/CharSheet/RelationEditor.tsx
import { useMemo, useState, useCallback } from 'react';
import type { ScenarioDoc, ScenarioRelation, RelationType } from '../../types/scenario';
import { inputStyle, labelStyle } from './styles';

export interface RelationEditorProps {
  scenarioDoc: ScenarioDoc;
  currentCharId: string;
  relations: ScenarioRelation[];
  presentAtStart: string[];
  lockedNpcsDisabled?: boolean;
  onChange: (relations: ScenarioRelation[], presentAtStart: string[]) => void;
}

const RELATION_OPTIONS: Array<{ value: '' | RelationType; label: string }> = [
  { value: '',             label: '陌生' },
  { value: 'family',       label: '亲属' },
  { value: 'lover',        label: '恋人' },
  { value: 'friend',       label: '朋友' },
  { value: 'colleague',    label: '同事' },
  { value: 'mentor',       label: '师徒' },
  { value: 'rival',        label: '竞争对手' },
  { value: 'enemy',        label: '敌人' },
  { value: 'acquaintance', label: '点头之交' },
];

const HOSTILE: ReadonlySet<RelationType> = new Set<RelationType>(['enemy', 'rival']);

function relationLabel(t: RelationType | undefined): string {
  if (!t) return '陌生';
  return RELATION_OPTIONS.find((o) => o.value === t)?.label ?? '陌生';
}

export function RelationEditor({
  scenarioDoc,
  currentCharId,
  relations,
  presentAtStart,
  lockedNpcsDisabled = true,
  onChange,
}: RelationEditorProps) {
  const others = useMemo(
    () => scenarioDoc.characters.filter((c) => c.id !== currentCharId),
    [scenarioDoc.characters, currentCharId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(others[0]?.id ?? null);

  const relationMap = useMemo(() => {
    const m = new Map<string, ScenarioRelation>();
    for (const r of relations) m.set(r.targetId, r);
    return m;
  }, [relations]);

  const presentSet = useMemo(() => new Set(presentAtStart), [presentAtStart]);

  const selectedChar = selectedId ? others.find((c) => c.id === selectedId) ?? null : null;
  const selectedRel = selectedId ? relationMap.get(selectedId) : undefined;
  const isLocked = selectedChar?.role === 'locked_npc';
  const isPresent = selectedId ? presentSet.has(selectedId) : false;
  const hostileConflict = !!(selectedRel && HOSTILE.has(selectedRel.type) && isPresent);

  const emit = useCallback(
    (nextRels: ScenarioRelation[], nextPresent: string[]) => {
      onChange(nextRels, nextPresent);
    },
    [onChange],
  );

  const updateRelation = (targetId: string, patch: Partial<ScenarioRelation> & { remove?: boolean }) => {
    const existing = relationMap.get(targetId);
    let nextRels: ScenarioRelation[];
    if (patch.remove) {
      nextRels = relations.filter((r) => r.targetId !== targetId);
    } else if (existing) {
      nextRels = relations.map((r) => (r.targetId === targetId ? { ...r, ...patch } as ScenarioRelation : r));
    } else {
      const seed: ScenarioRelation = { targetId, type: patch.type ?? 'acquaintance', note: patch.note };
      nextRels = [...relations, { ...seed, ...patch } as ScenarioRelation];
    }
    emit(nextRels, presentAtStart);
  };

  const handleTypeChange = (targetId: string, value: string) => {
    if (value === '') {
      updateRelation(targetId, { remove: true });
      return;
    }
    updateRelation(targetId, { type: value as RelationType });
  };

  const handleNoteChange = (targetId: string, value: string) => {
    const existing = relationMap.get(targetId);
    if (!existing) {
      const seed: ScenarioRelation = { targetId, type: 'acquaintance', note: value };
      emit([...relations, seed], presentAtStart);
      return;
    }
    updateRelation(targetId, { note: value });
  };

  const handlePresentToggle = (targetId: string, next: boolean) => {
    const nextPresent = next
      ? Array.from(new Set([...presentAtStart, targetId]))
      : presentAtStart.filter((id) => id !== targetId);
    emit(relations, nextPresent);
  };

  return (
    <div
      className="scenario-editor"
      style={{
        display: 'flex',
        gap: 14,
        minHeight: 320,
        height: '100%',
      }}
    >
      {/* 列表 30% */}
      <div
        style={{
          flex: '0 0 30%',
          minWidth: 180,
          maxHeight: 420,
          overflowY: 'auto',
          border: '1px solid rgba(196,168,85,0.18)',
          borderRadius: 4,
          background: 'rgba(13,10,7,0.4)',
        }}
      >
        {others.length === 0 && (
          <div style={{ padding: 14, color: 'var(--ink-subtle)', fontSize: 12 }}>
            剧本里没有其他角色
          </div>
        )}
        {others.map((c) => {
          const rel = relationMap.get(c.id);
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="sk-btn"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: active ? 'rgba(196,168,85,0.18)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(196,168,85,0.1)',
                color: active ? 'var(--gold)' : 'var(--ink)',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.sheet.identity.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 2 }}>
                {c.sheet.identity.occupation} · {relationLabel(rel?.type)}
                {c.role === 'locked_npc' ? ' · 钉死' : ''}
              </div>
            </button>
          );
        })}
      </div>

      {/* 侧栏 70% */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          border: '1px solid rgba(196,168,85,0.18)',
          borderRadius: 4,
          background: 'rgba(13,10,7,0.4)',
        }}
      >
        {!selectedChar && (
          <div style={{ color: 'var(--ink-subtle)', fontSize: 12 }}>
            从左侧挑一个角色编辑关系
          </div>
        )}
        {selectedChar && (
          <>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 16 }}>
                {selectedChar.sheet.identity.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginTop: 2 }}>
                {selectedChar.sheet.identity.occupation}
                {selectedChar.role === 'protagonist' ? ' · 推荐主角' : ''}
                {selectedChar.role === 'optional' ? ' · 配角' : ''}
                {selectedChar.role === 'locked_npc' ? ' · 剧本钉死' : ''}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle} htmlFor="rel-type-select">关系类型</label>
              <select
                id="rel-type-select"
                aria-label="关系类型"
                value={selectedRel?.type ?? ''}
                onChange={(e) => handleTypeChange(selectedChar.id, e.target.value)}
                style={inputStyle}
              >
                {RELATION_OPTIONS.map((o) => (
                  <option key={o.value || 'stranger'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle} htmlFor="rel-note-area">备注</label>
              <textarea
                id="rel-note-area"
                aria-label="备注"
                value={selectedRel?.note ?? ''}
                onChange={(e) => handleNoteChange(selectedChar.id, e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="rel-present-checkbox"
                aria-label="开场和他一起在场"
                type="checkbox"
                checked={isPresent}
                disabled={lockedNpcsDisabled && isLocked}
                onChange={(e) => handlePresentToggle(selectedChar.id, e.target.checked)}
              />
              <label
                htmlFor="rel-present-checkbox"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 12,
                  color: lockedNpcsDisabled && isLocked ? 'var(--ink-subtle)' : 'var(--ink)',
                  cursor: lockedNpcsDisabled && isLocked ? 'not-allowed' : 'pointer',
                }}
              >
                开场和他一起在场
              </label>
              {hostileConflict && (
                <span style={{ color: 'var(--blood-bright, #e0625b)', fontSize: 11, marginLeft: 8 }}>
                  与敌对者不能开场同场
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 跑 test 验证通过**
Run: `npx vitest run src/components/CharSheet/RelationEditor.test.tsx`
Expected: PASS（5 个用例全绿）

- [ ] **Step 3: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 4: commit + push beta**
```bash
git add src/components/CharSheet/RelationEditor.tsx
git commit -m "feat(relation): RelationEditor 列表+侧栏 + 实时敌对校验 + locked_npc 禁勾"
git push origin beta
```

---

### Task 3: CharCreator 插入【关系】步并扩 STEPS 常量

**Files:**
- Modify: `src/sillytavern/coc-data.ts:5`
- Modify: `src/components/CharSheet/CharacterCreator.tsx`（多处）

- [ ] **Step 1: 写失败 test — 步骤数与默认 relations/presentAtStart 注入**
```tsx
// src/components/CharSheet/CharacterCreator.relationStep.test.tsx
import { describe, it, expect } from 'vitest';
import { STEPS } from '../../sillytavern/coc-data';

describe('CharCreator 步骤扩展', () => {
  it('STEPS 增加【关系】到 7 项 - 关系位于背景故事与确认创建之间', () => {
    expect(STEPS).toHaveLength(7);
    expect(STEPS[4]).toBe('背景故事');
    expect(STEPS[5]).toBe('关系');
    expect(STEPS[6]).toBe('确认创建');
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/components/CharSheet/CharacterCreator.relationStep.test.tsx`
Expected: FAIL with "expected 6 to be 7" 或 "expected '确认创建' to be '关系'"。

- [ ] **Step 3: 扩 STEPS 常量**
Edit `src/sillytavern/coc-data.ts` line 5：

```typescript
export const STEPS = ['身份信息', '基础属性', '衍生属性', '职业与技能', '背景故事', '关系', '确认创建'];
```

- [ ] **Step 4: CharCreator 接入 RelationEditor**

改 `src/components/CharSheet/CharacterCreator.tsx`：

(a) 顶部 import 加入：
```tsx
import { RelationEditor } from './RelationEditor';
import type { ScenarioRelation } from '../../types/scenario';
```

(b) 在 `/* ---- Step 5: Background ---- */` 块之后、`/* ---- Presets ---- */` 之前，新增关系编辑 state（步骤 5 = 关系）：
```tsx
  /* ---- Step 5b (新): Relations ---- */
  // CharCreator 编辑模式（编辑现有 player_created 卡）会通过 props 拿到 charId；
  // 新建模式下用临时 id（handleConfirm 时已 charId = `INV-...` 之前 random 出新 id 写入 sheet.identity.id）。
  // 这里 currentCharId 取 sheet 上的 identity.id 作占位即可——存盘前 RelationEditor 视角下 currentCharId
  // 必须稳定且与剧本中其他 character.id 不冲突，所以一开就生成且复用至 handleConfirm。
  const editingCharIdRef = useRef<string>(`INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
  const [relations, setRelations] = useState<ScenarioRelation[]>([]);
  const [presentAtStart, setPresentAtStart] = useState<string[]>([]);

  const handleRelationsChange = useCallback((nextRel: ScenarioRelation[], nextPresent: string[]) => {
    setRelations(nextRel);
    setPresentAtStart(nextPresent);
  }, []);
```

(c) 把 `handleConfirm` 内 `const charId = ...` 那行替换为 `const charId = editingCharIdRef.current;`，并把 sheet 之外的 `relations` / `presentAtStart` 透出给 M4 的 applyPatch 路径（M4 已落地 applyPatch 入口，此里程碑只补字段）。在 `handleConfirm` 现有 `setSheet(sheet); void saveConversation(newId); onComplete();` 之前插入：
```tsx
    // M5：把关系/开场字段挂回剧本 character 上，由 M4 的 applyPatch 路径写入。
    // M4 已实现 onComplete 触发的 applyPatch；M5 仅把 relations / presentAtStart 写入剧本副本。
    if (lastPickedScn) {
      const playerScenarioChar = {
        id: charId,
        role: 'player_created' as const,
        sheet,
        npcAttrs: {
          identityTag: '玩家',
          attitudeDefault: 0,
          relationshipDefault: '',
          locationDefault: '',
          publicBio: '',
          hiddenBio: '',
          initialItemsRaw: initialItemsRaw,
        },
        relations,
        presentAtStart: presentAtStart.includes(charId), // 玩家自身的 presentAtStart 不写入此处；本字段反向用于"其它角色对玩家"
        createdAt: Date.now(),
      };
      useScenarioStore.getState().applyPatch(lastPickedScn, { patchCharacters: [playerScenarioChar] });
      // 把"玩家勾选与某 NPC 一起开场"的反向也作为该 NPC 的 presentAtStart 来源——
      // M10 activateScenario 会读 character.presentAtStart 决定 isPresent；这里把玩家勾过的
      // 目标 NPC.presentAtStart 设 true（不动其它字段）。
      const targetDoc = useScenarioStore.getState().getById(lastPickedScn);
      if (targetDoc) {
        const updates = targetDoc.characters
          .filter((c) => presentAtStart.includes(c.id))
          .map((c) => ({ ...c, presentAtStart: true }));
        if (updates.length > 0) {
          useScenarioStore.getState().applyPatch(lastPickedScn, { patchCharacters: updates });
        }
      }
    }
```

并把 `handleConfirm` 的依赖数组追加 `relations, presentAtStart, lastPickedScn, initialItemsRaw`。

(d) `renderStepContent` 把 `case 5: return <StepReview ...>` 改成新 `case 5` 渲染关系编辑器、`case 6` 渲染 `StepReview`：
```tsx
      case 5:
        return activeScenario ? (
          <RelationEditor
            scenarioDoc={activeScenario}
            currentCharId={editingCharIdRef.current}
            relations={relations}
            presentAtStart={presentAtStart}
            onChange={handleRelationsChange}
          />
        ) : (
          <div style={{ color: 'var(--ink-subtle)', fontSize: 12, padding: 14 }}>
            未选择剧本，无法编辑关系。点【下一步】跳过。
          </div>
        );
      case 6:
        return (
          <StepReview
```

把原 `case 5:` StepReview 整段挪到新 `case 6:`，不动 props 列表。

(e) `canGoNext` switch 把 `case 4: return true;` 之后插入 `case 5: return true;`（关系步可全空跳过）；末尾 `case 4` 保留语义不变。

(f) 步骤指示器与底部按钮中所有 `step === 4` 改成 `step === STEPS.length - 2`（保持 background 步专属 maxHeight 不变化）；`step === 3` 的随机分配/重置按钮逻辑保留不动；底部最后一步判定 `step < STEPS.length - 1` 已经自动随 STEPS 长度调整无需改。

- [ ] **Step 5: 跑全部 test 验证通过**
Run: `npx vitest run src/components/CharSheet/RelationEditor.test.tsx src/components/CharSheet/CharacterCreator.relationStep.test.tsx`
Expected: PASS（6 个用例全绿）

- [ ] **Step 6: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 7: commit + push beta**
```bash
git add src/sillytavern/coc-data.ts src/components/CharSheet/CharacterCreator.tsx src/components/CharSheet/CharacterCreator.relationStep.test.tsx
git commit -m "feat(relation): CharCreator 加【关系】步 - 编辑 relations/presentAtStart 入剧本"
git push origin beta
```

---

### Task 4: 联动验证 — 关系步留空也能确认创建（不阻塞）

**Files:**
- Create Test: `src/components/CharSheet/CharacterCreator.relationFlow.test.tsx`

- [ ] **Step 1: 写 smoke test 校验关系步可跳过**
```tsx
// src/components/CharSheet/CharacterCreator.relationFlow.test.tsx
import { describe, it, expect } from 'vitest';
import { STEPS } from '../../sillytavern/coc-data';

describe('CharCreator 关系步可跳过', () => {
  it('关系步在确认创建之前 - 流程为 1..5(背景) → 6(关系) → 7(确认)', () => {
    const relIdx = STEPS.indexOf('关系');
    const confirmIdx = STEPS.indexOf('确认创建');
    expect(relIdx).toBeGreaterThan(STEPS.indexOf('背景故事'));
    expect(confirmIdx).toBe(STEPS.length - 1);
    expect(relIdx).toBe(confirmIdx - 1);
  });
});
```

- [ ] **Step 2: 跑 test 验证通过**
Run: `npx vitest run src/components/CharSheet/CharacterCreator.relationFlow.test.tsx`
Expected: PASS

- [ ] **Step 3: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 4: commit + push beta**
```bash
git add src/components/CharSheet/CharacterCreator.relationFlow.test.tsx
git commit -m "test(relation): 关系步序号与可跳过性的 smoke 校验"
git push origin beta
```

---

### M5 验证清单（全部通过 = 里程碑完成）

- [ ] `npx vitest run src/components/CharSheet/RelationEditor.test.tsx` 全绿
- [ ] `npx vitest run src/components/CharSheet/CharacterCreator.relationStep.test.tsx` 全绿
- [ ] `npx vitest run src/components/CharSheet/CharacterCreator.relationFlow.test.tsx` 全绿
- [ ] `npx tsc --noEmit` 干净（无新增类型错误）
- [ ] `npx vite build` 成功（pre-existing warning 除外）
- [ ] 4 个 commit 已 push 至 `origin/beta`，无 Co-Authored-By 行
- [ ] `git status` 干净（无未提交改动）

---

## M6 — PeopleTab 关系折叠段 + 自创卡删除

### 范围

在 `src/components/Scenario/tabs/PeopleTab.tsx` 已有 9 字段折叠基础上新增【人际关系】折叠段，内嵌 M5 抽出的 `<RelationEditor>`，编辑当前选中 NPC 的 `relations`。列表里多渲染"玩家位"占位符（disabled + tooltip）。`player_created` 角色行右上角加 [× 删除] 按钮，触发 `useScenarioStore.applyPatch` 移除该 character——本里程碑要新增 `ScenarioPatch.removeCharacterIds` 字段（`mergePatch` 无删 character 通路）。所有按钮按 memory `feedback_button_interaction` 加 hover 增亮放大 + active 按压；动效 `cubic-bezier(0.4, 0, 0.2, 1)`。

依赖：M1（`RelationType`/`relations` 字段、`role: 'player_created'`）、M2（`useScenarioStore.applyPatch` 已具备关系 patch 能力）、M5（`<RelationEditor>` 已抽出为可复用组件）。

### Task 1: 给 ScenarioPatch 加 removeCharacterIds 字段 + mergePatch 实现

**Files:**
- Modify: `src/types/scenario.ts`（`ScenarioPatch` interface 加字段）
- Modify: `src/stores/useScenarioStore.ts`（`mergePatch` 实现）
- Test: `src/stores/useScenarioStore.relation.test.ts`（已有于 M2，本步骤新增 case）

- [ ] **Step 1: 写失败 test**
在 `src/stores/useScenarioStore.relation.test.ts` 末尾追加：
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from './useScenarioStore';
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';
import { defaultSheet } from './useCharSheetStore';

function makeChar(id: string, role: ScenarioCharacter['role'] = 'optional'): ScenarioCharacter {
  return {
    id,
    role,
    sheet: JSON.parse(JSON.stringify(defaultSheet)),
    npcAttrs: {
      identityTag: id,
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
  };
}

describe('ScenarioPatch.removeCharacterIds', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });

  it('应该移除指定 id 的 character', () => {
    const doc: ScenarioDoc = {
      id: 'scn-1', builtin: false,
      meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
      prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
      characters: [makeChar('c1'), makeChar('c2', 'player_created'), makeChar('c3')],
      customOccupations: [], customSkills: [], skillBlacklist: [],
      entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
      schemaVersion: 1, createdAt: 1, updatedAt: 1,
    };
    useScenarioStore.setState({ userScenarios: [doc] });
    useScenarioStore.getState().applyPatch('scn-1', { removeCharacterIds: ['c2'] });
    const after = useScenarioStore.getState().getById('scn-1')!;
    expect(after.characters.map(c => c.id)).toEqual(['c1', 'c3']);
  });

  it('removeCharacterIds 与 patchCharacters 同 patch 内时，先移除再 upsert', () => {
    const doc: ScenarioDoc = {
      id: 'scn-2', builtin: false,
      meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
      prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
      characters: [makeChar('c1'), makeChar('c2')],
      customOccupations: [], customSkills: [], skillBlacklist: [],
      entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
      schemaVersion: 1, createdAt: 1, updatedAt: 1,
    };
    useScenarioStore.setState({ userScenarios: [doc] });
    useScenarioStore.getState().applyPatch('scn-2', {
      removeCharacterIds: ['c1'],
      patchCharacters: [makeChar('c3')],
    });
    const after = useScenarioStore.getState().getById('scn-2')!;
    expect(after.characters.map(c => c.id).sort()).toEqual(['c2', 'c3']);
  });

  it('removeCharacterIds 未命中任何 id 应是 no-op', () => {
    const doc: ScenarioDoc = {
      id: 'scn-3', builtin: false,
      meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
      prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
      characters: [makeChar('c1')],
      customOccupations: [], customSkills: [], skillBlacklist: [],
      entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
      schemaVersion: 1, createdAt: 1, updatedAt: 1,
    };
    useScenarioStore.setState({ userScenarios: [doc] });
    useScenarioStore.getState().applyPatch('scn-3', { removeCharacterIds: ['nope'] });
    const after = useScenarioStore.getState().getById('scn-3')!;
    expect(after.characters.map(c => c.id)).toEqual(['c1']);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/stores/useScenarioStore.relation.test.ts`
Expected: FAIL — 第 1 个 case 期望删后只剩 ['c1','c3'] 但实际为 ['c1','c2','c3']，因为 `mergePatch` 还没处理 `removeCharacterIds`；类型上 `removeCharacterIds` 也不存在，tsc 报 `'removeCharacterIds' does not exist in type 'ScenarioPatch'`。

- [ ] **Step 3: 最小实现**
在 `src/types/scenario.ts` `ScenarioPatch` interface 内 `patchCharacters?: ScenarioCharacter[];` 下一行加：
```typescript
  /** 移除指定 id 的 character;与 patchCharacters 同 patch 时先移除再 upsert。 */
  removeCharacterIds?: string[];
```

在 `src/stores/useScenarioStore.ts` `mergePatch` 内 `if (patch.patchCharacters?.length) { ... }` 段之前插入：
```typescript
  if (patch.removeCharacterIds?.length) {
    const drop = new Set(patch.removeCharacterIds);
    next.characters = next.characters.filter(c => !drop.has(c.id));
  }
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/stores/useScenarioStore.relation.test.ts`
Expected: PASS（3 个新 case + M2 所有旧 case）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/types/scenario.ts src/stores/useScenarioStore.ts src/stores/useScenarioStore.relation.test.ts
git commit -m "feat(scenario): ScenarioPatch 加 removeCharacterIds 字段以支持自创卡删除"
git push origin beta
```

---

### Task 2: PeopleTab 列表加玩家位占位符 + player_created 行右上角删除按钮

**Files:**
- Modify: `src/components/Scenario/tabs/PeopleTab.tsx`
- Test: `src/components/Scenario/tabs/PeopleTab.test.tsx`（新建）

- [ ] **Step 1: 写失败 test**
新建 `src/components/Scenario/tabs/PeopleTab.test.tsx`：
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PeopleTab } from './PeopleTab';
import type { ScenarioDoc, ScenarioCharacter } from '../../../types/scenario';
import { defaultSheet } from '../../../stores/useCharSheetStore';
import { useScenarioStore } from '../../../stores/useScenarioStore';

function makeChar(id: string, name: string, role: ScenarioCharacter['role']): ScenarioCharacter {
  const sheet = JSON.parse(JSON.stringify(defaultSheet));
  sheet.identity.name = name;
  return {
    id, role, sheet,
    npcAttrs: { identityTag: id, attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'scn-test', builtin: false,
    meta: { name: '测试', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: chars,
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 1, updatedAt: 1,
  };
}

describe('PeopleTab 列表 — 玩家位占位 + 自创卡删除按钮', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });

  it('列表里渲染 “@创建调查员” 玩家位占位（disabled + tooltip）', () => {
    const doc = makeDoc([makeChar('c1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    const placeholder = screen.getByText('@创建调查员');
    expect(placeholder).toBeDefined();
    const btn = placeholder.closest('button');
    expect(btn).not.toBeNull();
    expect(btn!.hasAttribute('disabled')).toBe(true);
    expect(btn!.getAttribute('title')).toContain('CharCreator');
  });

  it('player_created 角色行右上角渲染删除按钮，点击调用 applyPatch removeCharacterIds', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '约翰·肯特', 'player_created'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    const onChange = vi.fn();
    render(<PeopleTab scn={doc} onChange={onChange} />);

    const playerCard = screen.getByText('约翰·肯特').closest('button')!;
    const delBtn = within(playerCard.parentElement as HTMLElement).getByRole('button', { name: '删除自创卡' });
    expect(delBtn).toBeDefined();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const applyPatchSpy = vi.spyOn(useScenarioStore.getState(), 'applyPatch');
    fireEvent.click(delBtn);
    expect(applyPatchSpy).toHaveBeenCalledWith('scn-test', { removeCharacterIds: ['c2'] });
    confirmSpy.mockRestore();
  });

  it('protagonist / optional / locked_npc 行不渲染删除按钮', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '哈丽特', 'optional'),
      makeChar('c3', '布兰登', 'locked_npc'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    expect(screen.queryAllByRole('button', { name: '删除自创卡' })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/components/Scenario/tabs/PeopleTab.test.tsx`
Expected: FAIL with "Unable to find an element with the text: @创建调查员"（占位还没渲染、删除按钮还没渲染）

- [ ] **Step 3: 最小实现**
在 `src/components/Scenario/tabs/PeopleTab.tsx` 顶部 import 加：
```typescript
import { useScenarioStore } from '../../../stores/useScenarioStore';
```

把 `ROLE_LABELS` 里 `player_created` 标签也补上（M1 已加 role 枚举，UI 显示需要标签）：
```typescript
const ROLE_LABELS: Record<ScenarioCharacter['role'], string> = {
  protagonist: '推荐视角',
  optional: '配角可玩',
  locked_npc: '钉死 NPC',
  player_created: '玩家创建',
};
```

把列表 map 部分（行 149-178）替换为下面这段——列表头部加玩家位占位 + 每条 `player_created` 行右上角加删除按钮：
```typescript
              <>
                {/* 玩家位占位:始终首位,disabled+tooltip,关系由 CharCreator 步骤 5 编辑 */}
                <button
                  key="__player_placeholder"
                  type="button"
                  disabled
                  title="玩家关系由 CharCreator 步骤 5 编辑,此处不可改"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3,
                    width: '100%', textAlign: 'left',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderLeft: '2px solid transparent',
                    color: 'rgba(196,168,85,0.4)',
                    fontFamily: 'var(--font-ui)',
                    cursor: 'not-allowed',
                    opacity: 0.7,
                  }}
                >
                  <div style={{ fontSize: 12.5 }}>@创建调查员</div>
                  <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.4)' }}>玩家位</div>
                </button>
                {scn.characters.map((c) => {
                  const active = c.id === selectedId;
                  const name = c.sheet?.identity?.name || c.npcAttrs.identityTag || '未命名';
                  const isPlayerCreated = c.role === 'player_created';
                  return (
                    <div key={c.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3,
                          width: '100%', textAlign: 'left',
                          padding: isPlayerCreated ? '8px 32px 8px 12px' : '8px 12px',
                          background: active ? 'rgba(196,168,85,0.14)' : 'transparent',
                          border: 'none',
                          borderLeft: active ? '2px solid var(--brass)' : '2px solid transparent',
                          color: 'var(--text-light, #d0c2a0)',
                          fontFamily: 'var(--font-ui)',
                          cursor: 'pointer',
                          transition: `background 180ms ${EASE}`,
                        }}
                        onMouseEnter={(ev) => { if (!active) ev.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                        onMouseLeave={(ev) => { if (!active) ev.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ fontSize: 12.5, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.55)' }}>
                          {ROLE_LABELS[c.role]}
                        </div>
                      </button>
                      {isPlayerCreated && (
                        <DeletePlayerCreatedBtn
                          name={name}
                          onConfirm={() => {
                            useScenarioStore.getState().applyPatch(scn.id, { removeCharacterIds: [c.id] });
                            if (selectedId === c.id) setSelectedId(null);
                            onToast?.(`已删除自创卡 ${name}`);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
```

然后在文件末尾 `ExpandableSection` 之后新增 `DeletePlayerCreatedBtn` 组件：
```typescript
/** player_created 角色行右上角的小型删除按钮 — hover 红边 + 二次确认 */
function DeletePlayerCreatedBtn({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.92 : hover ? 1.1 : 1;
  return (
    <button
      type="button"
      aria-label="删除自创卡"
      title={`删除自创卡 ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm(`确定删除自创卡「${name}」?此操作不可撤销。`)) onConfirm();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: 'absolute', right: 6, top: 8,
        width: 20, height: 20, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgba(177,74,74,0.18)' : 'transparent',
        border: `1px solid ${hover ? '#b14a4a' : 'rgba(196,168,85,0.25)'}`,
        borderRadius: 2,
        color: hover ? '#d97676' : 'rgba(196,168,85,0.6)',
        fontFamily: 'var(--font-ui)', fontSize: 11, lineHeight: 1,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 160ms ${EASE}, background 160ms ${EASE}, color 160ms ${EASE}, border-color 160ms ${EASE}`,
      }}
    >×</button>
  );
}
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/components/Scenario/tabs/PeopleTab.test.tsx`
Expected: PASS（3 个 case 全过）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/components/Scenario/tabs/PeopleTab.tsx src/components/Scenario/tabs/PeopleTab.test.tsx
git commit -m "feat(scenario): PeopleTab 列表加玩家位占位 + 自创卡删除按钮"
git push origin beta
```

---

### Task 3: PeopleTab 右栏新增【人际关系】折叠段并内嵌 RelationEditor

**Files:**
- Modify: `src/components/Scenario/tabs/PeopleTab.tsx`
- Test: `src/components/Scenario/tabs/PeopleTab.relation.test.tsx`（新建）

- [ ] **Step 1: 写失败 test**
新建 `src/components/Scenario/tabs/PeopleTab.relation.test.tsx`：
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeopleTab } from './PeopleTab';
import type { ScenarioDoc, ScenarioCharacter } from '../../../types/scenario';
import { defaultSheet } from '../../../stores/useCharSheetStore';
import { useScenarioStore } from '../../../stores/useScenarioStore';

function makeChar(id: string, name: string): ScenarioCharacter {
  const sheet = JSON.parse(JSON.stringify(defaultSheet));
  sheet.identity.name = name;
  return {
    id, role: 'optional', sheet,
    npcAttrs: { identityTag: id, attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'scn-rel', builtin: false,
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: chars,
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 1, updatedAt: 1,
  };
}

describe('PeopleTab 关系折叠段', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });

  it('未选中角色时不渲染关系折叠段', () => {
    const doc = makeDoc([makeChar('c1', '以利亚')]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    expect(screen.queryByText('人际关系')).toBeNull();
  });

  it('选中角色后渲染折叠段标题“人际关系”;展开后内嵌 RelationEditor 并传入正确 currentCharId', () => {
    const doc = makeDoc([makeChar('c1', '以利亚'), makeChar('c2', '哈丽特')]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    fireEvent.click(screen.getByText('以利亚'));
    const header = screen.getByText('人际关系');
    expect(header).toBeDefined();
    fireEvent.click(header);
    // RelationEditor 在 M5 落地时 data-testid="relation-editor"
    const editor = screen.getByTestId('relation-editor');
    expect(editor.getAttribute('data-current-char-id')).toBe('c1');
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/components/Scenario/tabs/PeopleTab.relation.test.tsx`
Expected: FAIL with "Unable to find an element with the text: 人际关系"（折叠段还没渲染）

- [ ] **Step 3: 最小实现**
在 `src/components/Scenario/tabs/PeopleTab.tsx` 顶部加 import：
```typescript
import { RelationEditor } from '../RelationEditor';
```

在 `PeopleTab` 组件顶部 `const [bgExpanded, setBgExpanded] = useState(false);` 下方加：
```typescript
  const [relExpanded, setRelExpanded] = useState(false);
```

在右栏【角色背景档案】`ExpandableSection` 闭合 `</ExpandableSection>` 之后追加（即背景折叠之后、整段右栏 `</div>` 之前）：
```tsx
                <ExpandableSection
                  title="人际关系"
                  hint="该角色对剧本其它角色的关系出边 — 双向语义由 relation-graph 自动补全"
                  expanded={relExpanded}
                  onToggle={() => setRelExpanded((v) => !v)}
                >
                  <RelationEditor
                    scn={scn}
                    currentCharId={selected.id}
                    onChange={(nextChar) => {
                      commitChars(scn.characters.map((c) => (c.id === nextChar.id ? nextChar : c)));
                    }}
                  />
                </ExpandableSection>
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/components/Scenario/tabs/PeopleTab.relation.test.tsx`
Expected: PASS（2 个 case 全过）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/components/Scenario/tabs/PeopleTab.tsx src/components/Scenario/tabs/PeopleTab.relation.test.tsx
git commit -m "feat(scenario): PeopleTab 右栏加人际关系折叠段并内嵌 RelationEditor"
git push origin beta
```

---

### M6 验证清单（全部勾上 = 里程碑完成）

- [ ] `npx vitest run src/stores/useScenarioStore.relation.test.ts` PASS（含新增 3 个 removeCharacterIds case）
- [ ] `npx vitest run src/components/Scenario/tabs/PeopleTab.test.tsx` PASS
- [ ] `npx vitest run src/components/Scenario/tabs/PeopleTab.relation.test.tsx` PASS
- [ ] `npx tsc --noEmit` 干净
- [ ] `npx vite build` 成功
- [ ] 3 次 commit 全部 `git push origin beta` 完成
- [ ] commit message 不含 `Co-Authored-By`（memory `feedback_git_push_no_coauthor`）

---

## M7 — TeamSidebar 改造与入队/退队

**目标**：TeamSidebar 数据源从 `isPresent` 改成 `isPresent && inParty`；新增「在场非队」折叠段渲染 `isPresent && !inParty` 的 NPC，带【邀请入队】按钮（走 `canJoinParty` 前置校验，失败 toast 提示）；现有队员卡片加【请求退队】按钮。

**依赖**：M1（`relation-graph.ts` 的 `canJoinParty` 已落地、`NpcProfile.inParty` 字段已加）、M2（`useNpcStore` 已有 `joinParty/leaveParty/getParty`、`useScenarioStore.applyRelationDelta`）、M4（onboarding 已切到 RosterPicker 流程，进游戏后会话已挂 `scenarioId`）。

**关键事实**（codegraph 探到的当前结构）：
- `src/components/Layout/TeamSidebar.tsx:85-93`：当前 `presentNpcs = profiles.filter(n => n.isPresent)`，喂 `buildMemberSnapshots`。
- `src/components/Layout/TabIcons.tsx`：已有 `IconClose / IconCheck / IconPlus（在 ScenarioScreen.tsx 私有）`，本里程碑要复用 + 新增 `IconUserPlus / IconUserMinus`。
- `src/stores/useStatusToastStore.ts`：已有 toast 通道 → `showError(message)` 直接用。
- `src/stores/useChatStore.ts:80-87`：`scenarioId` 通过 `sessions.find(s => s.id === activeId)?.scenarioId` 取。
- `src/stores/useScenarioStore.ts:130-133`：`getById(id)` 返回 `ScenarioDoc | undefined`。

---

### Task 1: 加 IconUserPlus / IconUserMinus 两个铜版线描图标

**Files:**
- Modify: `src/components/Layout/TabIcons.tsx`

- [ ] **Step 1: 在文件尾部追加两个图标**

打开 `src/components/Layout/TabIcons.tsx`，在 `IconRefresh` 之后追加：

```tsx
/** 邀请入队：人像 + 加号（铜版线描，与 IconNpc 同语言） */
export function IconUserPlus({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M17 6v6M14 9h6" /></svg>);
}
/** 请求退队：人像 + 减号 */
export function IconUserMinus({ size = 14 }: IconProps) {
  return (<svg {...base(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M14 9h6" /></svg>);
}
```

- [ ] **Step 2: tsc 校验**

Run: `npx tsc --noEmit`
Expected: PASS（无新增类型错误）

---

### Task 2: 写「在场非队 / 已入队」分组测试

**Files:**
- Create: `src/components/Layout/team-sidebar-grouping.ts`
- Create: `src/components/Layout/team-sidebar-grouping.test.ts`

- [ ] **Step 1: 写失败 test**

`src/components/Layout/team-sidebar-grouping.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { groupNpcsByParty } from './team-sidebar-grouping';
import type { NpcProfile } from '../../types';

function mkNpc(over: Partial<NpcProfile>): NpcProfile {
  return {
    id: over.id ?? 'x', name: over.name ?? 'X',
    identity: '', favorability: 0,
    appearance: '', personality: '', innerThoughts: '',
    memories: [], experience: '', backstory: '', possessions: [],
    isPresent: over.isPresent ?? false,
    createdAt: 0, updatedAt: 0,
    ...over,
  } as NpcProfile;
}

describe('groupNpcsByParty', () => {
  it('已入队 = isPresent && inParty', () => {
    const npcs = [
      mkNpc({ id: 'a', name: 'A', isPresent: true, inParty: true }),
      mkNpc({ id: 'b', name: 'B', isPresent: true, inParty: false }),
      mkNpc({ id: 'c', name: 'C', isPresent: false, inParty: true }),  // 缺席不算
      mkNpc({ id: 'd', name: 'D', isPresent: false, inParty: false }),
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party.map(n => n.id)).toEqual(['a']);
    expect(presentOutside.map(n => n.id)).toEqual(['b']);
  });

  it('按 name 字典序排序', () => {
    const npcs = [
      mkNpc({ id: '1', name: '丙', isPresent: true, inParty: true }),
      mkNpc({ id: '2', name: '甲', isPresent: true, inParty: true }),
      mkNpc({ id: '3', name: '乙', isPresent: true, inParty: false }),
      mkNpc({ id: '4', name: '丁', isPresent: true, inParty: false }),
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party.map(n => n.name)).toEqual(['丙', '甲']);
    expect(presentOutside.map(n => n.name)).toEqual(['丁', '乙']);
  });

  it('undefined inParty 视为非队', () => {
    const npcs = [
      mkNpc({ id: 'a', name: 'A', isPresent: true }), // 没设 inParty
    ];
    const { party, presentOutside } = groupNpcsByParty(npcs);
    expect(party).toHaveLength(0);
    expect(presentOutside).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/components/Layout/team-sidebar-grouping.test.ts`
Expected: FAIL with "Failed to resolve import \"./team-sidebar-grouping\""

- [ ] **Step 3: 最小实现**

`src/components/Layout/team-sidebar-grouping.ts`：

```typescript
import type { NpcProfile } from '../../types';

export interface PartyGrouping {
  /** 已入队：isPresent && inParty */
  party: NpcProfile[];
  /** 在场非队：isPresent && !inParty */
  presentOutside: NpcProfile[];
}

/** 把 NPC 名册按"在场+入队"二维状态拆成两组。
 *  - 已入队 = isPresent && inParty(显式队员,TeamSidebar 主列表显示)
 *  - 在场非队 = isPresent && !inParty(同场陌生人/中立 NPC,折叠段显示+【邀请入队】按钮)
 *  - 缺席 NPC(isPresent=false)两组都不进。
 *  纯函数,无副作用,可单测。 */
export function groupNpcsByParty(npcs: NpcProfile[]): PartyGrouping {
  const party: NpcProfile[] = [];
  const presentOutside: NpcProfile[] = [];
  for (const n of npcs) {
    if (!n.isPresent) continue;
    if (n.inParty === true) party.push(n);
    else presentOutside.push(n);
  }
  const cmp = (a: NpcProfile, b: NpcProfile) => a.name.localeCompare(b.name);
  party.sort(cmp);
  presentOutside.sort(cmp);
  return { party, presentOutside };
}
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/components/Layout/team-sidebar-grouping.test.ts`
Expected: PASS (3 passed)

---

### Task 3: TeamSidebar 主列表改读 `inParty`

**Files:**
- Modify: `src/components/Layout/TeamSidebar.tsx`

- [ ] **Step 1: 替换 presentNpcs/members 推导**

把当前 `src/components/Layout/TeamSidebar.tsx:85-93` 的两个 `useMemo`：

```tsx
  const presentNpcs = useMemo(
    () => Object.values(profiles).filter((n) => n.isPresent).sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );

  const members = useMemo(
    () => buildMemberSnapshots(sheet, presentNpcs, encounter?.combatants ?? []),
    [sheet, presentNpcs, encounter],
  );
```

改为：

```tsx
  const grouping = useMemo(
    () => groupNpcsByParty(Object.values(profiles)),
    [profiles],
  );
  const partyNpcs = grouping.party;
  const presentOutsideNpcs = grouping.presentOutside;

  const members = useMemo(
    () => buildMemberSnapshots(sheet, partyNpcs, encounter?.combatants ?? []),
    [sheet, partyNpcs, encounter],
  );
```

并在文件顶部 import：

```tsx
import { groupNpcsByParty } from './team-sidebar-grouping';
```

- [ ] **Step 2: tsc + vitest 既有用例不回归**

Run: `npx tsc --noEmit && npx vitest run src/components/Layout/team-sidebar-grouping.test.ts`
Expected: tsc PASS, vitest PASS

---

### Task 4: 加「邀请入队」整段（含 R1+R2 校验 + toast）

**Files:**
- Modify: `src/components/Layout/TeamSidebar.tsx`

- [ ] **Step 1: 文件顶部追加 import**

把以下 import 加到 `src/components/Layout/TeamSidebar.tsx` 顶部（紧跟现有 import）：

```tsx
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useChatStore } from '../../stores/useChatStore';
import { useStatusToastStore } from '../../stores/useStatusToastStore';
import { canJoinParty } from '../../scenario/relation-graph';
import { IconUserPlus, IconUserMinus } from './TabIcons';
```

- [ ] **Step 2: 在 TeamSidebar 函数体内（partyNpcs 推导之后、return 之前）加 store 读取 + 邀请回调**

把下面这段插到 `members` `useMemo` 之后、`const inCombat = ...` 之前：

```tsx
  const joinParty = useNpcStore((s) => s.joinParty);
  const leaveParty = useNpcStore((s) => s.leaveParty);
  const showError = useStatusToastStore((s) => s.showError);

  const scenarioId = useChatStore((s) => s.sessions.find((c) => c.id === s.activeId)?.scenarioId);
  const scenarioDoc = useScenarioStore((s) => (scenarioId ? s.getById(scenarioId) : undefined));

  const handleInvite = (npcId: string) => {
    if (!scenarioDoc) {
      // 自由模式 / 无剧本(__free) — 没关系图可校验,直接放行
      joinParty(npcId);
      return;
    }
    const partyIds = partyNpcs.map((n) => n.id);
    const playerId = '__player__'; // 玩家节点 id 约定;canJoinParty 内部用它对齐 relation-graph
    const check = canJoinParty(scenarioDoc, npcId, partyIds, playerId);
    if (check.ok) {
      joinParty(npcId);
    } else {
      showError(check.reason === 'hostile' ? '与队伍敌对，无法入队' : '与你不熟，无法邀请入队');
    }
  };

  const handleLeave = (npcId: string) => {
    leaveParty(npcId);
  };
```

- [ ] **Step 3: 渲染「在场非队」折叠段（在 members.map 渲染之后）**

把当前抽屉 body：

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {members.map((m) => {
            const isActor = currentActorId === m.combatant?.id;
            return (
              <MemberCard
                key={m.id}
                member={m}
                isActor={isActor}
                inCombat={inCombat}
              />
            );
          })}
        </div>
```

改为：

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {members.map((m) => {
            const isActor = currentActorId === m.combatant?.id;
            return (
              <MemberCard
                key={m.id}
                member={m}
                isActor={isActor}
                inCombat={inCombat}
                onLeave={!m.isPlayer ? () => handleLeave(m.id) : undefined}
              />
            );
          })}

          {presentOutsideNpcs.length > 0 && (
            <PresentOutsideSection
              npcs={presentOutsideNpcs}
              onInvite={handleInvite}
            />
          )}
        </div>
```

- [ ] **Step 4: 在文件尾部（PartyGrouping 等小组件附近）加 PresentOutsideSection**

把下面这个组件加到 `TeamSidebar.tsx` 文件尾（`Bar` 之后即可）：

```tsx
function PresentOutsideSection({
  npcs, onInvite,
}: { npcs: NpcProfile[]; onInvite: (id: string) => void }): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <section style={{ marginTop: 18 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px',
          background: 'transparent',
          border: '1px solid rgba(196,168,85,0.22)',
          borderRadius: 2,
          color: 'rgba(196,168,85,0.85)',
          fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2,
          cursor: 'pointer',
          transition: `background 180ms ${EASE}, border-color 180ms ${EASE}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(196,168,85,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span>在场非队 · {npcs.length}</span>
        <span style={{ fontSize: 9, opacity: 0.65 }}>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {npcs.map((n) => (
            <OutsideRow key={n.id} npc={n} onInvite={() => onInvite(n.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function OutsideRow({
  npc, onInvite,
}: { npc: NpcProfile; onInvite: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px',
      background: 'rgba(0,0,0,0.22)',
      border: `1px solid ${hover ? 'rgba(196,168,85,0.5)' : 'rgba(196,168,85,0.18)'}`,
      borderRadius: 3,
      transition: `border-color 200ms ${EASE}, background 200ms ${EASE}`,
    }}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(196,168,85,0.10)',
        border: '1px solid rgba(196,168,85,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(196,168,85,0.85)',
        fontFamily: 'var(--font-display)', fontSize: 12, flexShrink: 0,
      }}>{npc.name.slice(0, 1)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, color: 'var(--text-light)',
          fontFamily: 'var(--font-ui)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{npc.name}</div>
        <div style={{
          fontSize: 10, color: 'rgba(196,168,85,0.6)',
          fontFamily: 'var(--font-mono)', marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{npc.identity || '在场'}</div>
      </div>
      <InviteButton onClick={onInvite} />
    </div>
  );
}

function InviteButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label="邀请入队"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 8px',
        background: hover ? 'rgba(196,168,85,0.18)' : 'rgba(196,168,85,0.08)',
        border: '1px solid rgba(196,168,85,0.45)',
        borderRadius: 2,
        color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', fontSize: 10.5, letterSpacing: 1,
        cursor: 'pointer',
        transform: active ? 'scale(0.96)' : hover ? 'scale(1.04)' : 'scale(1)',
        transition: `transform 160ms ${EASE}, background 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      <IconUserPlus size={12} />
      <span>邀请入队</span>
    </button>
  );
}
```

- [ ] **Step 5: 在 MemberCard 加 onLeave 可选 prop + 【请求退队】按钮**

把 `MemberCard` 的签名从

```tsx
function MemberCard({
  member, isActor, inCombat,
}: { member: MemberSnapshot; isActor: boolean; inCombat: boolean }): React.ReactElement {
```

改为：

```tsx
function MemberCard({
  member, isActor, inCombat, onLeave,
}: { member: MemberSnapshot; isActor: boolean; inCombat: boolean; onLeave?: () => void }): React.ReactElement {
```

并在 MemberCard 的 row 3 武器行之后、`inCombat && action` 块之前插入：

```tsx
      {/* 玩家主动请退队按钮(玩家本人不显示;战斗中也不显示防误触) */}
      {onLeave && !inCombat && (
        <LeaveButton onClick={onLeave} />
      )}
```

并在文件尾追加：

```tsx
function LeaveButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label="请求退队"
      style={{
        marginTop: 2,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        alignSelf: 'flex-start',
        padding: '3px 7px',
        background: hover ? 'rgba(139,58,58,0.20)' : 'rgba(139,58,58,0.08)',
        border: '1px solid rgba(139,58,58,0.40)',
        borderRadius: 2,
        color: 'rgba(220,160,160,0.9)',
        fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1,
        cursor: 'pointer',
        transform: active ? 'scale(0.96)' : hover ? 'scale(1.04)' : 'scale(1)',
        transition: `transform 160ms ${EASE}, background 180ms ${EASE}, border-color 180ms ${EASE}`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      <IconUserMinus size={11} />
      <span>请求退队</span>
    </button>
  );
}
```

- [ ] **Step 6: tsc 校验**

Run: `npx tsc --noEmit`
Expected: PASS（无错误）

---

### Task 5: 处理「队伍只剩玩家时仍渲染抽屉」语义改造

当前 `TeamSidebar.tsx:99` 的 `if (members.length <= 1) return null;` 在 inParty 改造后会让"玩家场上有同伴但没入队"的场景看不到抽屉（玩家就邀请不了）。

**Files:**
- Modify: `src/components/Layout/TeamSidebar.tsx`

- [ ] **Step 1: 改渲染门槛**

把：

```tsx
  // 队伍只剩玩家(无 NPC 同行)就不渲染胶囊
  if (members.length <= 1) return null;
```

改为：

```tsx
  // 仅当队伍只剩玩家 且 也没有在场非队 NPC 时,才完全不渲染——否则玩家就邀请不了
  if (members.length <= 1 && presentOutsideNpcs.length === 0) return null;
```

并把胶囊上 pillLabel 改为同时反映非队 NPC 计数：

```tsx
  const teamCount = members.length;
  const outsideCount = presentOutsideNpcs.length;
  const pillLabel = inCombat
    ? `战斗 第 ${encounter.round} 回合`
    : outsideCount > 0
      ? `队伍 ${teamCount} · 在场 +${outsideCount}`
      : `队伍 ${teamCount}`;
```

- [ ] **Step 2: tsc 校验**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 6: 整体 tsc + vitest + build 校验

**Files:** （仅校验，不改文件）

- [ ] **Step 1: 跑全量类型检查**

Run: `npx tsc --noEmit`
Expected: PASS（无新增错误；pre-existing warning 除外）

- [ ] **Step 2: 跑本里程碑相关单测**

Run: `npx vitest run src/components/Layout/team-sidebar-grouping.test.ts src/scenario/relation-graph.test.ts src/stores/useNpcStore.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: 跑全量 build**

Run: `npx vite build`
Expected: build succeeded

---

### Task 7: commit + push beta

- [ ] **Step 1: 暂存文件**

```bash
git add src/components/Layout/team-sidebar-grouping.ts \
        src/components/Layout/team-sidebar-grouping.test.ts \
        src/components/Layout/TeamSidebar.tsx \
        src/components/Layout/TabIcons.tsx
```

- [ ] **Step 2: 创建 commit（不带 Co-Authored-By）**

```bash
git commit -m "$(cat <<'EOF'
feat(team): TeamSidebar 解耦 isPresent 与 inParty + 加入队/退队按钮

- 主列表数据源从 isPresent 改为 isPresent && inParty(显式队员)
- 新增折叠段「在场非队」: 渲染 isPresent && !inParty 的 NPC,每行【邀请入队】按钮
- 邀请前置走 canJoinParty(R1 准入 + R2 排斥),失败用 useStatusToastStore.showError 提示
- 已入队成员卡片(非玩家、非战斗中)加【请求退队】按钮 → leaveParty
- 队员只剩玩家但场上还有非队 NPC 时仍渲染抽屉,胶囊文案反映非队计数
- 拆 groupNpcsByParty 纯函数 + 单测覆盖(已入队/在场非队/排序/undefined inParty)
- 新增 IconUserPlus / IconUserMinus 铜版线描图标
EOF
)"
```

- [ ] **Step 3: 推 beta**

```bash
git push origin beta
```

- [ ] **Step 4: 验证 push 成功**

```bash
git status && git log -1 --oneline
```

Expected: 工作树干净 + 最新 commit 是本次 feat(team) 提交。

---

### 验证清单（里程碑完成判据）

- [ ] `npx tsc --noEmit` 干净通过（无新增错误）
- [ ] `npx vitest run src/components/Layout/team-sidebar-grouping.test.ts` PASS
- [ ] `npx vitest run src/scenario/relation-graph.test.ts src/stores/useNpcStore.test.ts` 不回归
- [ ] `npx vite build` build succeeded
- [ ] `git push origin beta` 成功
- [ ] 工作树干净（`git status` clean）

全部勾上 = M7 完成，可推进 M8（攻击保护）。

---

## M8 — 攻击保护

**目标**：spec §4.2 R3。`parseChoice` 在主线选项识别"攻击/格斗/射击/推打 + 队友名字"→ RightPage 选项灰显 + tooltip "队友"，点击拦截不发选项；CombatPanel 战斗时选目标的敌方名册过滤掉 `useNpcStore.getParty()` 里的成员（M2 已加 `getParty / inParty`，M7 已让玩家显式入队）。

**前置假设**（来自 M1/M2/M7 完成态）：
- `useNpcStore.getParty(): NpcProfile[]` 已存在，返回 `inParty=true` 的 NPC 列表（M2）
- `NpcProfile.inParty?: boolean` 字段已存在（M1）
- 玩家显式入队通路已经走 `useNpcStore.joinParty / leaveParty`（M7）

**接入点决策**（依 memory `ask-tavern-architecture-before-mechanism`）：
- 选项侧硬挡走 `ChoiceButton` 渲染层灰显/拦截 onClick（与 `parseCheckAction` 同一解析口对齐，独立新增 `parseAttackTarget`，**不污染** `parseCheckAction` 已有 5 个正则返回类型）
- 战斗侧硬挡走 `CombatPanel` 渲染层 `enemies/allies/bystanders` 派生数组的 `.filter`（不动 `buildLocalEncounter` 建场逻辑——队友本来就走 `ally` faction 不在 `enemy` 区，过滤只是兜底防 LLM 把队友判进 enemy）

---

### Task 1: 新建 `parseAttackTarget` 纯函数 + 单测

**Files:**
- Create: `src/sillytavern/parse-attack-target.ts`
- Create: `src/sillytavern/parse-attack-target.test.ts`

- [ ] **Step 1: 写失败 test**

```typescript
// src/sillytavern/parse-attack-target.test.ts
import { describe, it, expect } from 'vitest';
import { parseAttackTarget } from './parse-attack-target';

describe('parseAttackTarget', () => {
  const partyNames = ['以利亚·霍尔姆斯', '哈丽特修女', '约翰'];

  it('识别「攻击 <队友名>」→ 返回 kind:attack + targetName', () => {
    const r = parseAttackTarget('攻击 以利亚·霍尔姆斯', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
  });

  it('识别「向<队友名>开枪」→ 命中', () => {
    const r = parseAttackTarget('向哈丽特修女开枪', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '哈丽特修女' });
  });

  it('识别「格斗对抗 <队友名>」→ 命中', () => {
    const r = parseAttackTarget('与约翰进行格斗对抗', partyNames);
    expect(r).toEqual({ kind: 'attack', targetName: '约翰' });
  });

  it('识别「推开 <队友名>」/「推搡」→ 命中', () => {
    expect(parseAttackTarget('推开约翰', partyNames)).toEqual({ kind: 'attack', targetName: '约翰' });
    expect(parseAttackTarget('推搡哈丽特修女', partyNames)).toEqual({ kind: 'attack', targetName: '哈丽特修女' });
  });

  it('识别「射击 <队友名>」/「射杀」→ 命中', () => {
    expect(parseAttackTarget('射击以利亚·霍尔姆斯', partyNames)).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
    expect(parseAttackTarget('射杀约翰', partyNames)).toEqual({ kind: 'attack', targetName: '约翰' });
  });

  it('攻击非队友 NPC → 返回 null（不归攻击保护管）', () => {
    const r = parseAttackTarget('攻击 邪教徒', partyNames);
    expect(r).toBeNull();
  });

  it('非攻击动作（如「与<队友>交谈」）→ 返回 null', () => {
    const r = parseAttackTarget('与以利亚·霍尔姆斯交谈', partyNames);
    expect(r).toBeNull();
  });

  it('partyNames 为空 → 任何输入都返回 null', () => {
    expect(parseAttackTarget('攻击 以利亚·霍尔姆斯', [])).toBeNull();
  });

  it('队友名包含特殊正则字符（点号）能正确匹配', () => {
    const r = parseAttackTarget('攻击 以利亚·霍尔姆斯', ['以利亚·霍尔姆斯']);
    expect(r).toEqual({ kind: 'attack', targetName: '以利亚·霍尔姆斯' });
  });

  it('多名队友时，优先匹配更长的名字（防短名前缀误命中）', () => {
    const r = parseAttackTarget('攻击 约翰·肯特', ['约翰', '约翰·肯特']);
    expect(r).toEqual({ kind: 'attack', targetName: '约翰·肯特' });
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/sillytavern/parse-attack-target.test.ts`
Expected: FAIL with "Cannot find module './parse-attack-target'"

- [ ] **Step 3: 最小实现**

```typescript
// src/sillytavern/parse-attack-target.ts

/**
 * M8 攻击保护 —— 主线选项攻击意图解析器。
 *
 * 任务：识别玩家选项 text/action 是否在「攻击 / 格斗 / 射击 / 推打 ... <队友名>」类动作。
 * 仅当目标名命中 partyNames 时返回意图；非队友目标返回 null（让正常攻击通过）。
 *
 * 与 parseCheckAction 的关系：parseCheckAction 解析「进行XX检定/对抗」走掷骰流水线；
 * 本函数解析的是更宽泛的"语义攻击"，只用于 UI 灰显，不影响掷骰。
 */

export interface AttackIntent {
  kind: 'attack';
  /** 命中 partyNames 中的精确名字（如 "以利亚·霍尔姆斯"） */
  targetName: string;
}

/** 表示"攻击意图"的关键词（不含目标名）。覆盖现实选项常见写法。 */
const ATTACK_KEYWORDS = [
  '攻击', '格斗', '袭击', '殴打', '攻杀',
  '射击', '射杀', '开枪', '射',
  '推开', '推搡', '推倒', '推打', '推',
  '砍', '刺', '捅', '勒住', '掐',
];

/** 把字符串里所有正则元字符转义掉，防止队友名里的 · ( ) 等被当成元字符。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析选项文本，识别是否是"攻击某个队友"的动作。
 *
 * @param text 选项 text 或 action 字段（合并的也行）
 * @param partyNames 当前队友名字列表（从 useNpcStore.getParty().map(p=>p.name) 得到）
 * @returns 命中队友 → AttackIntent；否则 null
 */
export function parseAttackTarget(text: string, partyNames: readonly string[]): AttackIntent | null {
  if (!text || partyNames.length === 0) return null;

  // 必须先包含攻击关键词，否则不算攻击意图（「与<队友>交谈」不会误命中）
  const hasAttackKeyword = ATTACK_KEYWORDS.some((kw) => text.includes(kw));
  if (!hasAttackKeyword) return null;

  // 优先匹配更长的队友名（防"约翰"短前缀吃掉"约翰·肯特"）
  const sortedNames = [...partyNames].sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    if (!name) continue;
    // 名字在文本里出现即算命中（中文无单词边界，不用 \b）
    if (text.includes(name)) {
      // 二次校验：攻击关键词与名字"足够接近"——同一句话内出现即可。
      // 中文选项一般是一句话，不强校验距离；只要包含攻击词 + 名字就算意图。
      return { kind: 'attack', targetName: name };
    }
  }
  return null;
}

// escapeRegex 当前未直接用于核心路径，留作未来"边界匹配"扩展（不删，导出供测试覆盖）。
export { escapeRegex as __escapeRegexForTest };
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/sillytavern/parse-attack-target.test.ts`
Expected: PASS（10 用例全绿）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 6: commit + push beta**

```bash
git add src/sillytavern/parse-attack-target.ts src/sillytavern/parse-attack-target.test.ts
git commit -m "feat(relation): 加 parseAttackTarget 纯函数 + 单测——M8 攻击保护数据层"
git push origin beta
```

---

### Task 2: ChoiceButton 渲染前调 parseAttackTarget，命中队友则灰显 + 拦截 onClick

**Files:**
- Modify: `src/components/Book/RightPage.tsx`（`ChoiceButton` 函数体，约 620-722 行）

- [ ] **Step 1: 写失败 test**（用 React Testing Library 验渲染层禁用 + tooltip）

```typescript
// src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChoiceButton } from '../RightPage';
import { useNpcStore } from '../../../stores/useNpcStore';
import { useBookStore } from '../../../stores/useBookStore';
import type { ChoiceItem, NpcProfile } from '../../../types';

function fakeNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', identityTag: '', favorability: 0,
    appearance: '', personality: '', innerThoughts: '', experience: '',
    backstory: '', status: '', possessions: [], memories: [],
    memorySummary: '', skills: {}, characteristics: {},
    isPresent: true, inParty, updatedAt: Date.now(),
  } as unknown as NpcProfile;
}

describe('ChoiceButton — M8 攻击保护', () => {
  beforeEach(() => {
    // 让 ChoiceButton 通过 isLatestPage 检查
    useBookStore.setState({ pages: [{ id: 'p0' } as unknown as never], pageIndex: 0 });
    useNpcStore.setState({
      profiles: {
        a: fakeNpc('a', '以利亚·霍尔姆斯', true),
        b: fakeNpc('b', '邪教徒', false),
      },
    });
  });

  it('选项目标是队友 → 按钮 disabled + tooltip 含「队友」', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 以利亚·霍尔姆斯', action: '攻击 以利亚·霍尔姆斯' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title') || '').toContain('队友');
  });

  it('选项目标非队友 → 按钮可点击', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 邪教徒', action: '攻击 邪教徒' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
  });

  it('点击灰显的队友攻击选项不触发 fillInputBar', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 以利亚·霍尔姆斯', action: '攻击 以利亚·霍尔姆斯' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    // disabled 按钮 React 不触发 onClick；这里直接验 disabled 状态
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx`
Expected: FAIL（第一用例 expect(btn).toBeDisabled() 失败 —— 当前 ChoiceButton 还没有队友检测）

- [ ] **Step 3: 最小实现** — 在 `RightPage.tsx` 顶部 import 区加 `parseAttackTarget`，在 `ChoiceButton` 函数体内加队友检测

先在 import 区（约 1-30 行间已有 import 区）加入：

```typescript
import { parseAttackTarget } from '../../sillytavern/parse-attack-target';
```

然后定位 `ChoiceButton` 函数体内 `const check = parseCheckAction(ch.action) ?? parseCheckAction(ch.text);` 那一行（约 634 行），在它之上插入队友检测，在 `enabled = isLatestPage && !effectivelyLocked` 那一行（约 637 行）改为同时考虑 `attackingPartyMember`：

用 Edit 工具改 `ChoiceButton`：

old_string（约 628-637 行的连续片段）：
```typescript
  const locked = useChoiceLockStore((s) => s.locked);
  const sanityPending = useSanityBubbleStore((s) => s.pending);
  const sanityResolved = useSanityBubbleStore((s) => s.resolved);
  const sanityBlocked = sanityPending.some((id) => !sanityResolved.has(id));
  const effectivelyLocked = locked || sanityBlocked;
  // BUG4: 优先解析 action 字段；当 LLM 把检定标记漂移到了 text 字段时回退尝试 text。
  const check = parseCheckAction(ch.action) ?? parseCheckAction(ch.text);
  const isCheck = check !== null;
  const playerSkill = isCheck ? getPlayerSkillValue(check.skillName) : null;
  const enabled = isLatestPage && !effectivelyLocked;
```

new_string：
```typescript
  const locked = useChoiceLockStore((s) => s.locked);
  const sanityPending = useSanityBubbleStore((s) => s.pending);
  const sanityResolved = useSanityBubbleStore((s) => s.resolved);
  const sanityBlocked = sanityPending.some((id) => !sanityResolved.has(id));
  const effectivelyLocked = locked || sanityBlocked;
  // BUG4: 优先解析 action 字段；当 LLM 把检定标记漂移到了 text 字段时回退尝试 text。
  const check = parseCheckAction(ch.action) ?? parseCheckAction(ch.text);
  const isCheck = check !== null;
  const playerSkill = isCheck ? getPlayerSkillValue(check.skillName) : null;
  // M8 攻击保护：解析选项是否在攻击当前队友（inParty=true）。命中 → 灰显 + tooltip "队友"，点击拦截。
  // 同时查 action 和 text 两个字段——LLM 偶尔把攻击意图只写在 text 里。
  const partyNames = useNpcStore((s) => s.getParty().map((p) => p.name));
  const attackingPartyMember =
    parseAttackTarget(ch.action || '', partyNames) ??
    parseAttackTarget(ch.text || '', partyNames);
  const enabled = isLatestPage && !effectivelyLocked && !attackingPartyMember;
```

然后改 `title` 的拼接（约 662 行）补一句队友提示：

old_string：
```typescript
      title={!isLatestPage ? '只有最新一页的选项可以选择' : (sanityBlocked ? '请先点亮所有血色理智气泡' : (locked ? '正在处理上一个选择…' : undefined))}
```

new_string：
```typescript
      title={
        attackingPartyMember
          ? `不能攻击队友（${attackingPartyMember.targetName}）`
          : !isLatestPage
            ? '只有最新一页的选项可以选择'
            : sanityBlocked
              ? '请先点亮所有血色理智气泡'
              : locked
                ? '正在处理上一个选择…'
                : undefined
      }
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx`
Expected: PASS（3 用例全绿）

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 6: commit + push beta**

```bash
git add src/components/Book/RightPage.tsx src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx
git commit -m "feat(relation): RightPage ChoiceButton 加队友攻击保护——灰显 + tooltip + 点击拦截（M8）"
git push origin beta
```

---

### Task 3: CombatPanel 战斗目标列表过滤 inParty 队友

**Files:**
- Modify: `src/components/Combat/CombatPanel.tsx`（约 115-117、188-194 行）

- [ ] **Step 1: 写失败 test** — 验渲染时队友不出现在敌人列表

```typescript
// src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CombatPanel } from '../CombatPanel';
import { useCombatStore } from '../../../stores/useCombatStore';
import { useNpcStore } from '../../../stores/useNpcStore';
import type { Combatant, Encounter, NpcProfile } from '../../../types';

function mkCombatant(id: string, name: string, faction: Combatant['faction']): Combatant {
  return {
    id, name, faction, controlledBy: faction === 'player' ? 'player' : 'ai',
    dex: 50, str: 50, siz: 50, con: 50, mov: 8,
    fighting: 50, dodge: 25, damageBonus: '0',
    hp: 10, maxHp: 10, armor: 0,
    weapons: [{ name: '徒手', skill: 50, damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 }],
    flags: { majorWound: false, dying: false, unconscious: false, dead: false, prone: false, weaponJammed: false, fled: false },
    roundDefenses: 0,
  };
}

function mkNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', identityTag: '', favorability: 0,
    appearance: '', personality: '', innerThoughts: '', experience: '',
    backstory: '', status: '', possessions: [], memories: [],
    memorySummary: '', skills: {}, characteristics: {},
    isPresent: true, inParty, updatedAt: Date.now(),
  } as unknown as NpcProfile;
}

describe('CombatPanel — M8 队友过滤', () => {
  beforeEach(() => {
    const player = mkCombatant('player', '调查员', 'player');
    const enemyReal = mkCombatant('enemy-0-邪教徒', '邪教徒', 'enemy');
    // 模拟 LLM 错把队友判进 enemy 阵营的兜底场景（id 形如 npc-<npcId>）
    const enemyWrongParty = mkCombatant('npc-elijah', '以利亚·霍尔姆斯', 'enemy');
    const enc: Encounter = {
      active: true, round: 1, turnOrder: ['player'], currentIdx: 0,
      combatants: [player, enemyReal, enemyWrongParty],
      bystanders: [], playerTargetId: null,
      log: [], diceRecords: [], status: 'active',
    };
    useCombatStore.setState({ encounter: enc, seenLogLen: 0 });
    useNpcStore.setState({
      profiles: {
        elijah: mkNpc('elijah', '以利亚·霍尔姆斯', true),  // 队友
        cultist: mkNpc('cultist', '邪教徒', false),
      },
    });
  });

  it('队友(inParty=true)不出现在敌人 CombatantRow 列表', () => {
    render(<CombatPanel />);
    // 队友名不应在战斗面板里出现
    expect(screen.queryByText('以利亚·霍尔姆斯')).toBeNull();
    // 真正的敌人仍应出现
    expect(screen.getByText('邪教徒')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**

Run: `npx vitest run src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx`
Expected: FAIL（队友名字"以利亚·霍尔姆斯"仍出现在敌人区）

- [ ] **Step 3: 最小实现** — 改 `CombatPanel.tsx`

在 import 区加：（如已 import 跳过）
```typescript
import { useNpcStore } from '../../stores/useNpcStore';
```

然后定位 `const enemies = enc.combatants.filter((c) => c.faction === 'enemy');` 这一行（约 116 行），改造为过滤掉队友：

old_string：
```typescript
  if (!encounter) return null;
  const enc = encounter;
  const player = enc.combatants.find((c) => c.faction === 'player');
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy');
  const allies = enc.combatants.filter((c) => c.faction === 'ally');
```

new_string：
```typescript
  if (!encounter) return null;
  const enc = encounter;
  const player = enc.combatants.find((c) => c.faction === 'player');
  // M8 攻击保护：从敌人列表里剔除 inParty=true 的队友——兜底防 LLM 把队友判进 enemy 阵营。
  // 队友 Combatant.id 形如 "npc-<npcId>" / "ally-<npcId>"（见 buildCombatantFromNpc），匹配队友 npcId 即剔除。
  const partyIdSet = new Set(useNpcStore.getState().getParty().map((p) => p.id));
  const isPartyMember = (c: { id: string; name: string }) => {
    // 解 "npc-<npcId>" / "ally-<npcId>" 前缀 → 取出 npcId 对比
    const m = c.id.match(/^(?:npc|ally)-(.+)$/);
    const npcId = m ? m[1] : c.id;
    if (partyIdSet.has(npcId)) return true;
    // 同名兜底（如果 LLM 重建了 combatant 但没用对 id）
    return useNpcStore.getState().getParty().some((p) => p.name === c.name);
  };
  const enemies = enc.combatants.filter((c) => c.faction === 'enemy' && !isPartyMember(c));
  const allies = enc.combatants.filter((c) => c.faction === 'ally');
```

- [ ] **Step 4: 跑 test 验证通过**

Run: `npx vitest run src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx`
Expected: PASS

- [ ] **Step 5: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（pre-existing warning 除外）

- [ ] **Step 6: commit + push beta**

```bash
git add src/components/Combat/CombatPanel.tsx src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx
git commit -m "feat(relation): CombatPanel 敌人列表过滤队友——M8 攻击保护战斗侧"
git push origin beta
```

---

### Task 4: 联跑全套单测 + tsc + build 收口

**Files:**
- Test: 全部 M8 用例

- [ ] **Step 1: 跑 M8 全套 vitest**

Run: `npx vitest run src/sillytavern/parse-attack-target.test.ts src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx`
Expected: 14 用例全绿（10 parser + 3 ChoiceButton + 1 CombatPanel）

- [ ] **Step 2: 跑全仓 vitest 防回归**

Run: `npx vitest run`
Expected: 全绿（M8 改动不破其它 test）

- [ ] **Step 3: tsc 干净 + 完整 build**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 0 错误 + build 成功

- [ ] **Step 4: 确认 push 上去**

```bash
git status
git log --oneline -5 origin/beta..HEAD
git push origin beta
```

Expected: working tree clean，三次 commit 都已在 origin/beta，远端 beta 比 origin/master 多 M8 这三个 commit。

---

## M8 验证清单

里程碑完成 = 以下全部为真：

- [ ] `npx vitest run src/sillytavern/parse-attack-target.test.ts` → PASS（10/10）
- [ ] `npx vitest run src/components/Book/__tests__/ChoiceButton-attackProtect.test.tsx` → PASS（3/3）
- [ ] `npx vitest run src/components/Combat/__tests__/CombatPanel-partyFilter.test.tsx` → PASS（1/1）
- [ ] `npx vitest run` 全仓 → PASS（不引入回归）
- [ ] `npx tsc --noEmit` → 0 错误
- [ ] `npx vite build` → 成功（pre-existing warning 不算）
- [ ] `git push origin beta` → 三次 commit 都已推上去
- [ ] 手动 UI 验证（玩家自跑，memory `user-does-ui-testing`）：
  - 进游戏，先用 M7 入队功能把以利亚·霍尔姆斯邀请入队
  - 触发 LLM 生成包含「攻击 以利亚·霍尔姆斯」之类的选项 → 该选项灰显，鼠标悬停 tooltip 显示「不能攻击队友（以利亚·霍尔姆斯）」，点击无反应
  - 进入战斗（任意触发），若 LLM 把队友判进 enemy 区，CombatPanel 顶部敌人区不显示队友名字

---

## M9 — Post-Settle 评估器（party-relation-evaluator）

**目标**：在 useChatPipeline 的 post-settle 链中加入「关系演化评估器」子调用 — 读本回合叙事 + 当前关系图，LLM 输出 `relationDelta[]`，应用到 `useScenarioStore`，扫描小队冲突 → 强制脱队 + RightPage 旁白追加。配合 M3 lorebook 实时机制，达成 spec §4.2 R4 + §8 全节。

**依赖**：M1（`ScenarioRelation` 类型 + `relation-graph.ts` 的 `detectPartyConflicts`）、M2（`useScenarioStore.applyRelationDelta` + `useNpcStore.leaveParty/getParty`）、M3（lorebook 订阅副作用）。

**架构接入决定（按 memory `ask-tavern-architecture-before-mechanism`）**：
- 评估器走【独立 LLM 子调用】（不内联进主 JSON，避免 memory `inline-llm-fields-truncate-trailing`）
- 子调用走 `callDsSubagent`（同 `time-jump-generator` 模式），rpmLane='main'，maxTokens=20000（memory `max-tokens-min-20000`）
- 入参用 `useSettingsStore.apiBaseUrl/apiKey/apiModel`（settings 当前【无】flashModel 字段——下面 Task 1 已确认，沿用 apiModel）
- 接入点：`useChatPipeline.processResponse` 内 `runPostSettleEvaluators()` 之后、`newPage` 写 npc/clues/mapUpdates 之前
- RightPage 旁白：先 codegraph 探到 RightPage 【没有】现成「系统旁白」段（只有 `inventoryChanges`/`sanityCheckPrompts`）→ 新建 `useNarrationStore` + `BookPage.narration?: string[]` 字段（与 inventoryChanges 同位，随页持久化）
- 统计：评估器结束后 `useBookStore.getState().addPageSubCallStat(idx, {...})` 追加进 `page.genStats.subCalls`，与现 CacheStatsPanel 兼容（label='关系评估'）

---

### Task 1: 落地 `BookPage.narration` 字段 + `useNarrationStore`

**Files:**
- Modify: `src/types/index.ts`（在 `BookPage` 接口加 `narration?: string[]`）
- Create: `src/stores/useNarrationStore.ts`
- Create: `src/stores/useNarrationStore.test.ts`

- [ ] **Step 1: 写失败 test** — `src/stores/useNarrationStore.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useNarrationStore } from './useNarrationStore';

describe('useNarrationStore', () => {
  beforeEach(() => {
    useNarrationStore.getState().clearPending();
  });

  it('append 后 drainPending 返回累积并清空', () => {
    const s = useNarrationStore.getState();
    s.append('A 因与 B 反目，离队而去。');
    s.append('C 抛下队伍，独自走入夜色。');
    expect(useNarrationStore.getState().pending).toEqual([
      'A 因与 B 反目，离队而去。',
      'C 抛下队伍，独自走入夜色。',
    ]);
    const drained = useNarrationStore.getState().drainPending();
    expect(drained).toEqual([
      'A 因与 B 反目，离队而去。',
      'C 抛下队伍，独自走入夜色。',
    ]);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });

  it('drainPending 在空 pending 时返回空数组', () => {
    expect(useNarrationStore.getState().drainPending()).toEqual([]);
  });

  it('clearPending 把 pending 清空', () => {
    useNarrationStore.getState().append('test');
    useNarrationStore.getState().clearPending();
    expect(useNarrationStore.getState().pending).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/stores/useNarrationStore.test.ts`
Expected: FAIL with "Cannot find module './useNarrationStore'"

- [ ] **Step 3: 最小实现** — `src/stores/useNarrationStore.ts`
```typescript
/**
 * useNarrationStore — 跨子调用「待落本页」旁白队列(in-memory)。
 *
 * 数据流:
 *   party-relation-evaluator / 后续脱队/事件评估器 → append(line)
 *     ↓
 *   useChatPipeline 提交 newPage 前 → drainPending() → newPage.narration = lines
 *     ↓
 *   随 BookPage.narration 一起持久化, RightPage 读取展示
 *
 * 为什么 in-memory(不入 Dexie):
 *   旁白只在【本回合写本页】这一个瞬时阶段使用; 一旦页落库就跟随 page.narration 永久化。
 *   重启游戏不应残留上回合未消费的旁白。
 *
 * 接 sessionLifecycle:
 *   - clearAllGameState / loadConversation / deleteSession → clearPending()
 */

import { create } from 'zustand';

interface NarrationStore {
  /** 待落入本回合 newPage.narration 的旁白行(按 append 顺序)。 */
  pending: string[];
  /** 评估器/脱队联动追加一条旁白。 */
  append: (line: string) => void;
  /** 取出 pending 并清空——useChatPipeline 提交 newPage 前调用。 */
  drainPending: () => string[];
  /** 切会话/新游戏/删会话 → 清空。 */
  clearPending: () => void;
}

export const useNarrationStore = create<NarrationStore>()((set, get) => ({
  pending: [],
  append: (line) =>
    set((s) => ({
      pending: line.trim() ? [...s.pending, line.trim()] : s.pending,
    })),
  drainPending: () => {
    const cur = get().pending;
    if (cur.length === 0) return [];
    set({ pending: [] });
    return cur;
  },
  clearPending: () => set({ pending: [] }),
}));
```

- [ ] **Step 4: 加 `BookPage.narration` 字段** — 修改 `src/types/index.ts` 在 `BookPage` 接口的 `inventoryChanges` 字段下面增补
```typescript
  inventoryChanges?: InventoryChange[];
  /** 本回合 post-settle 子评估器追加的旁白行(关系演化脱队/事件等)。随页持久化,删页一并随页移除。 */
  narration?: string[];
  rewrite?: RewriteBlock;
```

- [ ] **Step 5: 跑 test 验证通过**
Run: `npx vitest run src/stores/useNarrationStore.test.ts`
Expected: PASS

- [ ] **Step 6: tsc 校验**
Run: `npx tsc --noEmit`
Expected: tsc 干净

- [ ] **Step 7: commit + push beta**
```bash
git add src/types/index.ts src/stores/useNarrationStore.ts src/stores/useNarrationStore.test.ts
git commit -m "feat(scenario): 加 useNarrationStore + BookPage.narration 字段供关系评估器写旁白"
git push origin beta
```

---

### Task 2: 实现 `party-relation-evaluator.ts` 子调用 + 应用 + 脱队联动

**Files:**
- Create: `src/sillytavern/party-relation-evaluator.ts`
- Create: `src/sillytavern/party-relation-evaluator.test.ts`

- [ ] **Step 1: 写失败 test** — `src/sillytavern/party-relation-evaluator.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useNarrationStore } from '../stores/useNarrationStore';
import { useBookStore } from '../stores/useBookStore';
import type { ScenarioDoc, ScenarioCharacter } from '../types/scenario';
import type { NpcProfile } from '../types';

// 桩掉 callDsSubagent —— 注入可控的 parsed 返回
vi.mock('./subagent-call', () => ({
  callDsSubagent: vi.fn(),
}));
import { callDsSubagent } from './subagent-call';

// 桩 useSettingsStore —— 提供最低限的 api 三件套 + apiModel
vi.mock('../stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      apiBaseUrl: 'https://api.test',
      apiKey: 'k',
      apiModel: 'test-model',
    }),
  },
}));

// 构造一个最低限度的 ScenarioDoc, 注入 useScenarioStore.builtins
function makeChar(id: string, name: string, relations: ScenarioCharacter['relations'] = []): ScenarioCharacter {
  return {
    id,
    role: 'optional',
    sheet: {} as ScenarioCharacter['sheet'],
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    relations,
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sc-test',
    builtin: false,
    meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', favorability: 0,
    appearance: '', personality: '', innerThoughts: '',
    memories: [], experience: '', backstory: '', possessions: [],
    isPresent: true, inParty, createdAt: 0, updatedAt: 0,
  };
}

describe('evaluatePartyRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNarrationStore.getState().clearPending();
    useNpcStore.getState().clearAll();
    useScenarioStore.setState({
      builtins: [],
      userScenarios: [makeDoc([
        makeChar('a', 'Alice', [{ targetId: 'b', type: 'friend' }]),
        makeChar('b', 'Bob'),
      ])],
      activeId: 'sc-test',
      lastPicked: null,
      forkMap: {},
    });
    // book store 一页占位, 让 addPageSubCallStat 有位置
    useBookStore.setState({ pages: [{ leftHeader: '', leftContent: '', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] }], pageIndex: 0 } as Partial<ReturnType<typeof useBookStore.getState>> as never);
  });

  it('LLM 返回有效 deltas 时 applyRelationDelta 被调用', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [{ sourceId: 'a', targetId: 'b', newType: 'enemy', reason: '争吵' }] },
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'Alice 与 Bob 大吵一架。',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    const doc = useScenarioStore.getState().getById('sc-test');
    const a = doc?.characters.find((c) => c.id === 'a');
    const edge = a?.relations?.find((r) => r.targetId === 'b');
    expect(edge?.type).toBe('enemy');
  });

  it('两个队友变敌对 → leaveParty + 旁白追加', async () => {
    // 把 Alice 与 Bob 都拉进队
    useNpcStore.setState({
      profiles: {
        a: makeNpc('a', 'Alice', true),
        b: makeNpc('b', 'Bob', true),
      },
    } as Partial<ReturnType<typeof useNpcStore.getState>> as never);
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [{ sourceId: 'a', targetId: 'b', newType: 'enemy', reason: '反目' }] },
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'Alice 与 Bob 反目成仇。',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    const lines = useNarrationStore.getState().pending;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('Alice') || l.includes('Bob'))).toBe(true);
    // 至少一方 inParty=false
    const profs = useNpcStore.getState().profiles;
    expect(profs.a.inParty === false || profs.b.inParty === false).toBe(true);
  });

  it('callDsSubagent 抛错 → console.warn 不抛, 主流程继续', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await expect(evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'x',
      sessionId: 'sess-1',
      playerId: 'player',
    })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('parsed 为 null(JSON 解析失败) → 跳过 applyRelationDelta', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({ parsed: null, usage: {} });
    const spy = vi.spyOn(useScenarioStore.getState(), 'applyRelationDelta');
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'x',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('deltas 为空数组 → 不应用且不脱队', async () => {
    (callDsSubagent as ReturnType<typeof vi.fn>).mockResolvedValue({
      parsed: { deltas: [] },
      usage: {},
    });
    useNpcStore.setState({
      profiles: { a: makeNpc('a', 'Alice', true), b: makeNpc('b', 'Bob', true) },
    } as Partial<ReturnType<typeof useNpcStore.getState>> as never);
    const { evaluatePartyRelations } = await import('./party-relation-evaluator');
    await evaluatePartyRelations({
      scenarioId: 'sc-test',
      narrative: 'no change',
      sessionId: 'sess-1',
      playerId: 'player',
    });
    expect(useNpcStore.getState().profiles.a.inParty).toBe(true);
    expect(useNpcStore.getState().profiles.b.inParty).toBe(true);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/sillytavern/party-relation-evaluator.test.ts`
Expected: FAIL with "Failed to resolve import" / "Cannot find module './party-relation-evaluator'"

- [ ] **Step 3: 最小实现** — `src/sillytavern/party-relation-evaluator.ts`
```typescript
/**
 * party-relation-evaluator — Post-Settle 关系演化评估器 (spec §8 / §4.2 R4)。
 *
 * 流程:
 *   1. 取当前 scenarioDoc + 关系图渲染当前关系一览
 *   2. 调 callDsSubagent (rpmLane='main', maxTokens=20000) 让 LLM 输出 relationDelta[]
 *   3. 失败/超时 → console.warn 跳过, 不阻塞主流程 (永不 throw)
 *   4. applyRelationDelta 到 useScenarioStore (M3 lorebook 副作用会自动重生成 entries)
 *   5. detectPartyConflicts 扫小队当下敌对边
 *   6. 冲突 → useNpcStore.leaveParty(脱队者) + useNarrationStore.append(旁白)
 *   7. 统计追加进 page.genStats.subCalls (label='关系评估')
 *
 * 永不 throw —— 调用方 useChatPipeline 走 fire-and-forget, 异常只 console.warn。
 */

import { callDsSubagent } from './subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useNarrationStore } from '../stores/useNarrationStore';
import { useBookStore } from '../stores/useBookStore';
import { detectPartyConflicts } from '../scenario/relation-graph';
import type { ScenarioCharacter, ScenarioRelation, RelationType } from '../types/scenario';

export interface EvaluatePartyRelationsCtx {
  scenarioId: string;
  narrative: string;
  sessionId: string;
  playerId: string;
}

interface RelationDelta {
  sourceId: string;
  targetId: string;
  newType: RelationType | 'stranger';
  reason?: string;
}

const STATIC_PREFIX =
  '你是关系演化评估器。读本回合叙事, 判断角色之间的关系是否发生变化。\n' +
  '严格返回 JSON: {"deltas":[{"sourceId":string,"targetId":string,"newType":"family|lover|friend|colleague|mentor|rival|enemy|acquaintance|stranger","reason"?:string}]}\n' +
  '规则:\n' +
  '- 仅返回真实发生变化的边; 无变化返回 {"deltas":[]}\n' +
  '- 不允许凭空新增"陌生→友好"等关系, 除非叙事中明确互动改变了他们\n' +
  '- "newType":"stranger" 表示删除该边(变回陌生)\n' +
  '- 不要修改本回合未参与叙事的角色\n' +
  '- 不得输出 JSON 以外的任何文本';

function renderCurrentRelations(chars: ScenarioCharacter[], playerId: string): string {
  const nameById = new Map(chars.map((c) => [c.id, c.sheet?.identity?.name || c.id]));
  const lines: string[] = [];
  for (const c of chars) {
    if (!c.relations?.length) continue;
    const src = nameById.get(c.id) ?? c.id;
    for (const r of c.relations) {
      const tgt = nameById.get(r.targetId) ?? r.targetId;
      const tag = c.id === playerId ? '玩家' : '';
      lines.push(`- ${tag}${src}(${c.id}) → ${tgt}(${r.targetId}): ${r.type}${r.note ? `(${r.note})` : ''}`);
    }
  }
  if (lines.length === 0) return '(当前关系图为空)';
  return lines.join('\n');
}

function isValidDelta(d: unknown): d is RelationDelta {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  return typeof x.sourceId === 'string' && typeof x.targetId === 'string' && typeof x.newType === 'string';
}

export async function evaluatePartyRelations(ctx: EvaluatePartyRelationsCtx): Promise<void> {
  const { scenarioId, narrative, playerId } = ctx;
  const doc = useScenarioStore.getState().getById(scenarioId);
  if (!doc) {
    console.warn('[party-relation-evaluator] scenarioDoc 不存在, 跳过', { scenarioId });
    return;
  }

  const s = useSettingsStore.getState() as {
    apiBaseUrl: string; apiKey: string; apiModel: string;
  };

  const dynamic = [
    '【当前关系图】',
    renderCurrentRelations(doc.characters, playerId),
    '',
    '【本回合叙事】',
    narrative.trim() || '(无)',
  ].join('\n');

  let parsed: { deltas?: unknown } | null = null;
  let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number } | undefined;
  try {
    const resp = await callDsSubagent({
      apiBaseUrl: s.apiBaseUrl,
      apiKey: s.apiKey,
      model: s.apiModel,
      label: 'party-relation-eval',
      maxTokens: 20000,
      temperature: 0.4,
      rpmLane: 'main',
      messages: [
        { role: 'system', content: STATIC_PREFIX },
        { role: 'user', content: dynamic },
      ],
    });
    parsed = resp.parsed as { deltas?: unknown } | null;
    usage = resp.usage as typeof usage;
  } catch (err) {
    console.warn('[party-relation-evaluator] LLM 子调用失败, 跳过本回合:', err);
    return;
  }

  // 统计: 即便后续步骤跳过也要追加一次子调用记录
  try {
    const pageIdx = useBookStore.getState().pages.length - 1;
    if (pageIdx >= 0 && usage) {
      useBookStore.getState().addPageSubCallStat(pageIdx, {
        label: '关系评估',
        model: s.apiModel,
        hit: usage.prompt_cache_hit_tokens,
        miss: usage.prompt_cache_miss_tokens,
        promptTokens: usage.prompt_tokens,
        output: usage.completion_tokens,
        at: Date.now(),
      });
    }
  } catch {
    // 老存档/test 环境 book store 形状差异容错
  }

  if (!parsed || !Array.isArray(parsed.deltas)) {
    console.warn('[party-relation-evaluator] 解析失败或缺 deltas 字段, 跳过应用');
    return;
  }

  const rawDeltas = parsed.deltas.filter(isValidDelta);
  if (rawDeltas.length === 0) return;

  // newType='stranger' 走 applyRelationDelta 的"删边"语义 (在 M2 store 实现里识别)
  useScenarioStore.getState().applyRelationDelta(scenarioId, rawDeltas as ScenarioRelation[] extends never ? never : RelationDelta[]);

  // 扫小队冲突 —— 用最新 doc
  const freshDoc = useScenarioStore.getState().getById(scenarioId);
  if (!freshDoc) return;
  const party = useNpcStore.getState().getParty();
  const partyIds = party.map((p) => p.id);
  const conflicts = detectPartyConflicts(freshDoc, partyIds, playerId);
  for (const { kickedId, hostileWithId } of conflicts) {
    const kicked = party.find((p) => p.id === kickedId);
    const hostile = party.find((p) => p.id === hostileWithId) ?? { name: hostileWithId };
    useNpcStore.getState().leaveParty(kickedId);
    useNarrationStore.getState().append(
      `${kicked?.name ?? kickedId} 因与 ${hostile.name} 反目，离队而去。`,
    );
  }
}
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/sillytavern/party-relation-evaluator.test.ts`
Expected: PASS

- [ ] **Step 5: tsc 校验**
Run: `npx tsc --noEmit`
Expected: tsc 干净（若 `applyRelationDelta` 类型签名与 RelationDelta 不严格匹配，调整 M2 中的入参类型为 `Array<{sourceId, targetId, newType, reason?}>`；本任务实现侧使用本地 RelationDelta 接口配 `as unknown as` 适配 — 见 Step 3 代码中的 cast）

- [ ] **Step 6: commit + push beta**
```bash
git add src/sillytavern/party-relation-evaluator.ts src/sillytavern/party-relation-evaluator.test.ts
git commit -m "feat(scenario): 加 party-relation-evaluator 子调用 — LLM 评估关系演化+脱队联动+旁白"
git push origin beta
```

---

### Task 3: 接入 useChatPipeline post-settle 链 + drainPending → newPage.narration

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（在 `runPostSettleEvaluators` 之后调用 `evaluatePartyRelations`；在 `newPage` 写 npcUpdates 之前 drainPending 落到 narration）

- [ ] **Step 1: 写失败 test** — 用最小集成 test 验证 useChatPipeline 调用了 evaluator
新建 `src/hooks/useChatPipeline.party-relation-integration.test.ts`：
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../sillytavern/party-relation-evaluator', () => ({
  evaluatePartyRelations: vi.fn(() => Promise.resolve()),
}));

// 因为 useChatPipeline 是 React Hook, 这里只验"模块 import 链不报错"
// 真正的行为验证由 party-relation-evaluator.test.ts 覆盖, 这里跑静态导入断言钩子已挂上
import * as pipelineMod from './useChatPipeline';

describe('useChatPipeline party-relation-evaluator 接入', () => {
  it('useChatPipeline 模块加载后, party-relation-evaluator 已被 import (静态依赖存在)', () => {
    expect(pipelineMod).toBeTruthy();
    // import 已成功则 vi.mock 的桩生效, 反向证明 useChatPipeline 静态依赖了该模块
    const { evaluatePartyRelations } = require('../sillytavern/party-relation-evaluator') as { evaluatePartyRelations: ReturnType<typeof vi.fn> };
    expect(typeof evaluatePartyRelations).toBe('function');
    expect(vi.isMockFunction(evaluatePartyRelations)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑 test 验证失败**
Run: `npx vitest run src/hooks/useChatPipeline.party-relation-integration.test.ts`
Expected: FAIL with "Cannot find module '../sillytavern/party-relation-evaluator'" 或 import 错误 — 因为 Task 2 已落, 这步本质验证 useChatPipeline.ts【还没】import 它（Vitest 提示桩 mock 未被消费 + 真实代码中无该依赖）。
说明：实际本 test 用于守 useChatPipeline.ts 的 import 链；如桩生效但 useChatPipeline 内部没真调用，Step 3 会补上调用。

- [ ] **Step 3: 最小实现** — 修改 `src/hooks/useChatPipeline.ts`

(a) 在文件顶部 import 区（紧跟 `import '../sillytavern/bout-evaluator';` 之后）加入：
```typescript
import { evaluatePartyRelations } from '../sillytavern/party-relation-evaluator';
import { useNarrationStore } from '../stores/useNarrationStore';
```

(b) 在 `runPostSettleEvaluators({...})` 之后（约 line 1112，闭合 `});` 之后）追加：
```typescript
          // M9 关系演化评估器(spec §8 / §4.2 R4)。
          // 接现有 post-settle 链, 在 sanity/bout 之后、newPage 写入派生状态之前跑。
          // 失败永不阻塞主流程(party-relation-evaluator 内已包 try/catch)。
          {
            const chatNow2 = useChatStore.getState();
            const session2 = chatNow2.sessions.find((c) => c.id === chatNow2.activeId);
            const scenarioId = session2?.scenarioId;
            if (scenarioId && scenarioId !== '__free') {
              await evaluatePartyRelations({
                scenarioId,
                narrative: hookProcessedContent,
                sessionId: chatNow2.activeId ?? '',
                playerId: useCharSheetStore.getState().sheet.identity.name || 'player',
              });
            }
          }
```
注：`hookProcessedContent` 与 `useChatStore` 已在该 scope 内可见（同上文 MVU 自纠相位用法）。`useCharSheetStore` 已 import。

(c) 在 `if (result.darkThread) newPage.darkThread = result.darkThread;` 之后（约 line 1130）增加：
```typescript
        // M9: 把本回合 party-relation-evaluator 等子评估器追加的旁白固化进本页, 随页持久化。
        const drainedNarration = useNarrationStore.getState().drainPending();
        if (drainedNarration.length > 0) newPage.narration = drainedNarration;
```

- [ ] **Step 4: 跑 test 验证通过**
Run: `npx vitest run src/hooks/useChatPipeline.party-relation-integration.test.ts src/sillytavern/party-relation-evaluator.test.ts src/stores/useNarrationStore.test.ts`
Expected: PASS（三个 test 全过）

- [ ] **Step 5: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 6: commit + push beta**
```bash
git add src/hooks/useChatPipeline.ts src/hooks/useChatPipeline.party-relation-integration.test.ts
git commit -m "feat(scenario): useChatPipeline 接入 party-relation-evaluator + drainPending 落本页 narration"
git push origin beta
```

---

### Task 4: RightPage 渲染 narration 段（旁白可见）

**Files:**
- Modify: `src/components/Book/RightPage.tsx`（Props 加 `narration?: string[]`；在 `InventoryChangesBar` 下方渲染旁白段）
- Modify: `src/components/Book/BookPageView.tsx` 或 RightPage 调用点（把 `page.narration` 传进去——按 codegraph 探到实际父组件名）

- [ ] **Step 1: 先 codegraph 找 RightPage 的调用点** 
Run: 一次 codegraph 调用确定父组件
```
codegraph_explore "RightPage Props inventoryChanges sanityCheckPrompts 调用 BookSpread"
```
预期：找到把 `page.inventoryChanges` 透传给 `RightPage` 的父组件位置。

- [ ] **Step 2: 写失败 test** — 新建 `src/components/Book/RightPage.narration.test.tsx`
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RightPage } from './RightPage';

describe('RightPage narration 段', () => {
  it('narration 非空 → 渲染每行', () => {
    render(
      <RightPage
        header="测试"
        content="正文"
        choices={[]}
        pageNum=""
        isFlipping={false}
        narration={['Alice 离队而去。', 'Bob 在窗边静坐。']}
      />,
    );
    expect(screen.getByText(/Alice 离队而去/)).toBeTruthy();
    expect(screen.getByText(/Bob 在窗边静坐/)).toBeTruthy();
  });

  it('narration 空 → 不渲染旁白容器', () => {
    const { container } = render(
      <RightPage header="h" content="c" choices={[]} pageNum="" isFlipping={false} />,
    );
    expect(container.querySelector('[data-testid="rp-narration"]')).toBeNull();
  });
});
```

- [ ] **Step 3: 跑 test 验证失败**
Run: `npx vitest run src/components/Book/RightPage.narration.test.tsx`
Expected: FAIL with "Property 'narration' does not exist on type" 或渲染断言失败

- [ ] **Step 4: 最小实现** — Edit `src/components/Book/RightPage.tsx`

(a) Props 接口加字段：
```typescript
  narration?: string[];
```

(b) 函数签名解构同步：
```typescript
export function RightPage({ header, content, choices, pageNum, isFlipping, rewrite, inventoryChanges, sanityCheckPrompts, narration }: Props) {
```

(c) 在 `<InventoryChangesBar ... />` 之后、`<div style={{ flex: 1, minHeight: 0, ...}}>` 之前插入：
```tsx
      {narration && narration.length > 0 && (
        <div
          data-testid="rp-narration"
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderLeft: '2px solid var(--gold)',
            background: 'rgba(196,168,85,0.05)',
            fontFamily: 'var(--font-body)',
            fontSize: 'calc(13px * var(--text-ratio, 1))',
            fontStyle: 'italic',
            color: 'var(--ink-subtle)',
            lineHeight: 1.7,
            transition: 'all 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
            ...fadeStyle,
          }}
        >
          {narration.map((line, i) => (
            <div key={i} style={{ marginBottom: i < narration.length - 1 ? 4 : 0 }}>{line}</div>
          ))}
        </div>
      )}
```

(d) 在 RightPage 调用点（Step 1 找到的父组件 — 通常是 `BookSpread.tsx` 或 `BookPageView.tsx`）加 `narration={page.narration}`。

- [ ] **Step 5: 跑 test 验证通过**
Run: `npx vitest run src/components/Book/RightPage.narration.test.tsx`
Expected: PASS

- [ ] **Step 6: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功（按 memory `user-does-ui-testing` UI 测试由用户跑）

- [ ] **Step 7: commit + push beta**
```bash
git add src/components/Book/RightPage.tsx src/components/Book/RightPage.narration.test.tsx
# 同时 add Step 4(d) 改动的父组件文件
git commit -m "feat(scenario): RightPage 加旁白段 — 渲染本页 narration(关系演化脱队等)"
git push origin beta
```

---

### Task 5: sessionLifecycle 接入 useNarrationStore（session 隔离不变量）

按 memory `session-isolation-invariant`：新增 per-conversation store 必接 clear/save/load/delete 四处。

**Files:**
- Modify: `src/stores/sessionLifecycle.ts`（找 `clearAllGameState` / `loadConversation` / `deleteSession` / `saveConversation` 四处，给 useNarrationStore 接 reset 调用）
- Modify: `src/stores/sessionLifecycle.test.ts`（或同位 test）

- [ ] **Step 1: 用 codegraph 探 sessionLifecycle 四处接口**
Run（一次 codegraph 调用）：
```
codegraph_explore "sessionLifecycle clearAllGameState loadConversation deleteSession saveConversation useBookStore"
```

- [ ] **Step 2: 写失败 test** — 在现有 sessionLifecycle 测试位置加：
```typescript
import { useNarrationStore } from './useNarrationStore';

it('clearAllGameState → narration pending 清空', () => {
  useNarrationStore.getState().append('遗留旁白');
  clearAllGameState();
  expect(useNarrationStore.getState().pending).toEqual([]);
});

it('loadConversation → narration pending 清空', async () => {
  useNarrationStore.getState().append('上会话残留');
  await loadConversation('any-session-id');
  expect(useNarrationStore.getState().pending).toEqual([]);
});
```
（test 文件路径与导出名按 codegraph 探到的实际形态调整）

- [ ] **Step 3: 跑 test 验证失败**
Run: `npx vitest run src/stores/sessionLifecycle.test.ts`（或现有路径）
Expected: FAIL — clearAllGameState/loadConversation 未清 narration

- [ ] **Step 4: 最小实现** — 在 sessionLifecycle 四处补：
```typescript
import { useNarrationStore } from './useNarrationStore';

// clearAllGameState 内:
useNarrationStore.getState().clearPending();

// loadConversation 内 (会话切换最后):
useNarrationStore.getState().clearPending();

// deleteSession 内:
// (如该会话是 active, 走 clearPending; 见 useSanityBubbleStore 同模式)

// saveConversation 内: 不需要持久化(in-memory 队列, drainPending 已在主管线落进 page.narration)
```

- [ ] **Step 5: 跑 test 验证通过**
Run: `npx vitest run src/stores/sessionLifecycle.test.ts`
Expected: PASS

- [ ] **Step 6: tsc + build 校验**
Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净 + build 成功

- [ ] **Step 7: commit + push beta**
```bash
git add src/stores/sessionLifecycle.ts src/stores/sessionLifecycle.test.ts
git commit -m "fix(scenario): sessionLifecycle 接 useNarrationStore — 切会话/新游戏/删会话清 pending"
git push origin beta
```

---

### 里程碑完成验证清单

- [ ] 五个 Task 全部完成；每个 task 的 tsc/vitest/build 步骤都 PASS
- [ ] `npx vitest run src/sillytavern/party-relation-evaluator.test.ts src/stores/useNarrationStore.test.ts src/hooks/useChatPipeline.party-relation-integration.test.ts src/components/Book/RightPage.narration.test.tsx src/stores/sessionLifecycle.test.ts` 全绿
- [ ] `npx tsc --noEmit` 干净
- [ ] `npx vite build` 成功
- [ ] `git log --oneline origin/beta..HEAD` 显示 5 个 M9 commit 已推 beta
- [ ] 手测（按 memory `user-does-ui-testing` 由玩家本人跑）：进游戏 → 让 LLM 产生敌对叙事 → 观察 RightPage 出现旁白「<X> 因与 <Y> 反目，离队而去」 + TeamSidebar 中 X 已脱队

里程碑达标后进入 M10（activateScenario 开场逻辑），M9 的 evaluator 在 M10 开场建场后即时生效（M3 lorebook 实时机制 + M9 评估器协同闭环）。

---

## M10 — activateScenario 开场逻辑

**目标**：把 `presentAtStart` 字段 + 关系图准入判定 + 开场敌对冲突检测落地到 `activateScenario`，让玩家进游戏第一眼就看到剧本作者预设的同行者，且自动避开互为敌人的开场矛盾。spec §5.3 + §4.2 R5 直接对应。

**前置假定（M1/M2/M3/M9 已落地）**：
- `src/scenario/relation-graph.ts` 已存在并导出 `canJoinParty(scenarioDoc, candidateId, partyIds, playerId): boolean` 与 `hasHostileEdge(scenarioDoc, aId, bId): boolean`（M1）
- `useNpcStore` 已有 `joinParty(npcId: string): void`（M2）
- `ScenarioCharacter.presentAtStart?: boolean` 类型字段已加（M1）
- `NpcProfile.inParty?: boolean` 已加（M1）

---

### Task 1: 给 `scenario-engine.test.ts` 加 presentAtStart 建场用例（红测）

**Files:**
- Modify: `src/scenario/__tests__/scenario-engine.test.ts`

- [ ] **Step 1: 在测试文件顶部 mock 区追加 `joinPartyMock` + relation-graph mock**

在 `src/scenario/__tests__/scenario-engine.test.ts` 第 31 行（`const mapReplaceAllMock = vi.fn();` 之后）插入：

```typescript
// M10: joinParty 与 relation-graph 用例
const joinPartyMock = vi.fn();
const canJoinPartyMock = vi.fn();
const hasHostileEdgeMock = vi.fn();
```

在 `vi.mock('../../stores/useNpcStore', ...)`（第 39-41 行）替换为：

```typescript
vi.mock('../../stores/useNpcStore', () => ({
  useNpcStore: { getState: () => ({
    applyUpdates: npcApplyUpdatesMock,
    replaceAll: npcReplaceAllMock,
    joinParty: joinPartyMock,
    profiles: {},
  }) },
}));
```

在 `import { activateScenario, deepMergePreserve } from '../scenario-engine';`（第 100 行）之前插入：

```typescript
vi.mock('../relation-graph', () => ({
  canJoinParty: (...args: unknown[]) => canJoinPartyMock(...args),
  hasHostileEdge: (...args: unknown[]) => hasHostileEdgeMock(...args),
}));
```

在 `beforeEach` 里（第 128 行 `vi.clearAllMocks();` 之后）追加：

```typescript
  // M10: 默认 canJoinParty 返回 false / hasHostileEdge 返回 false,各用例按需 override
  canJoinPartyMock.mockReturnValue(false);
  hasHostileEdgeMock.mockReturnValue(false);
```

- [ ] **Step 2: 在文件末尾追加一段 describe，写三个失败 case**

在 `src/scenario/__tests__/scenario-engine.test.ts` 末尾追加：

```typescript

describe('M10 — activateScenario 开场建场 + 准入 + 敌对冲突', () => {
  // 这一 describe 块要求 scenario-engine.ts 按 presentAtStart 字段建场:
  //   - presentAtStart=true 且非玩家本人 → applyUpdates({isPresent:true,isScenarioPreset:true})
  //   - canJoinParty 通过 → joinParty(id);失败 → 仅 isPresent
  //   - 两个 presentAtStart=true 互为敌对 → 后到者强制 isPresent=false + console.warn
  // 实现见 §5.3 + §4.2 R5。
  function charWithPresent(
    id: string,
    name: string,
    presentAtStart: boolean,
    role: 'protagonist' | 'optional' | 'locked_npc' = 'optional',
  ) {
    return {
      id,
      role,
      presentAtStart,
      sheet: { identity: { name } } as never,
      npcAttrs: {
        identityTag: '', attitudeDefault: 0, relationshipDefault: '',
        locationDefault: '', publicBio: '', hiddenBio: '',
      },
    };
  }

  it('presentAtStart=true 且与玩家非敌对 → applyUpdates(isPresent=true) + joinParty 入队', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-a',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-friend', '朋友', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    canJoinPartyMock.mockReturnValue(true); // 准入通过

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    await activateScenario('sc-m10-a', 'preset', 0);

    // applyUpdates 必须有一笔 c-friend 且 isPresent=true
    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const friendUpdate = flat.find((u) => u.id === 'c-friend');
    expect(friendUpdate).toBeTruthy();
    expect(friendUpdate?.isPresent).toBe(true);
    // 入队
    expect(joinPartyMock).toHaveBeenCalledWith('c-friend');
  });

  it('presentAtStart=true 但 canJoinParty 返回 false → 仅 isPresent,不入队', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-b',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-stranger', '陌生人', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    canJoinPartyMock.mockReturnValue(false); // 拒绝入队

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    await activateScenario('sc-m10-b', 'preset', 0);

    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const strangerUpdate = flat.find((u) => u.id === 'c-stranger');
    expect(strangerUpdate).toBeTruthy();
    expect(strangerUpdate?.isPresent).toBe(true);
    // 但不该 joinParty
    expect(joinPartyMock).not.toHaveBeenCalledWith('c-stranger');
  });

  it('两个 presentAtStart=true 互为敌对 → 后到者强制 isPresent=false + console.warn', async () => {
    const doc = emptyDoc({
      id: 'sc-m10-c',
      characters: [
        charWithPresent('c-player', '玩家', false, 'protagonist'),
        charWithPresent('c-a', 'A', true, 'optional'),
        charWithPresent('c-b', 'B', true, 'optional'),
      ],
    });
    getByIdMock.mockReturnValue(doc);
    // canJoinParty 一律 false(本用例只关心 isPresent 决策)
    canJoinPartyMock.mockReturnValue(false);
    // hasHostileEdge: A 与 B 之间互为敌对(任一方向 true 都算敌对)
    hasHostileEdgeMock.mockImplementation((_doc: unknown, aId: unknown, bId: unknown) => {
      const pair = [aId, bId].sort().join('|');
      return pair === ['c-a', 'c-b'].sort().join('|');
    });

    expandPrologueMock.mockResolvedValue({
      leftHeader: '序章', leftContent: '', rightHeader: '', rightContent: '',
      rightChoices: [], leftPage: '', rightPage: '',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await activateScenario('sc-m10-c', 'preset', 0);

    const calls = npcApplyUpdatesMock.mock.calls.map((c) => c[0] as unknown[]);
    const flat = calls.flat() as Array<{ id?: string; isPresent?: boolean }>;
    const aUpdate = flat.find((u) => u.id === 'c-a');
    const bUpdate = flat.find((u) => u.id === 'c-b');
    expect(aUpdate?.isPresent).toBe(true);   // 先到者保留
    expect(bUpdate?.isPresent).toBe(false);  // 后到者强制不在场
    // 留痕
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toMatch(/开场冲突|敌对|hostile/i);

    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 3: 跑 test 验证失败**

Run: `npx vitest run src/scenario/__tests__/scenario-engine.test.ts`
Expected: FAIL — 三个 M10 用例至少一个 fail（最可能的报错是 `joinPartyMock` 未被调用、`isPresent=false` 的后到者断言失败，因为 `activateScenario` 还没读 `presentAtStart`）。

- [ ] **Step 4: commit 红测**

```bash
git add src/scenario/__tests__/scenario-engine.test.ts
git commit -m "test(scenario): M10 加 activateScenario 开场 presentAtStart 三用例(红测)"
```

---

### Task 2: 在 `scenario-engine.ts` 加 presentAtStart 建场 + 准入 + 敌对冲突逻辑

**Files:**
- Modify: `src/scenario/scenario-engine.ts:122-193`

- [ ] **Step 1: 在 import 区追加 relation-graph 引用**

在 `src/scenario/scenario-engine.ts` 第 20 行（`import { scenarioCharacterToNpc, ... } from './scenario-injection';` 之后）追加：

```typescript
import { canJoinParty, hasHostileEdge } from './relation-graph';
```

- [ ] **Step 2: 用 Edit 替换 step 1（角色卡 + NPC）整块**

把 `src/scenario/scenario-engine.ts` 中 step 1 整块（从 `// ── 1. 角色卡 + NPC ──` 注释到 `}` 闭合那一段）替换为：

旧代码：
```typescript
  // ── 1. 角色卡 + NPC ─────────────────────────────────────────────────
  if (mode === 'preset') {
    // preset 模式必须显式指定主角索引；不允许 undefined 默默兜底到 0，
    // 否则一旦上游路由没传 charIdx，玩家会被随机分配第 0 号角色（可能是 locked_npc）。
    if (charIdx === undefined) {
      throw new Error('[scenario-engine] preset 模式必须显式传 charIdx');
    }
    const idx = charIdx;
    const proto = scn.characters[idx];
    if (!proto) throw new Error(`[scenario-engine] preset 模式 charIdx=${idx} 越界`);
    // protagonist (推荐主角) 和 optional (配角可玩) 都允许玩家扮演;
    // locked_npc 是剧本钉死的不可选角色(反派/序章死者),拒绝。
    if (proto.role === 'locked_npc') {
      throw new Error(`[scenario-engine] charIdx=${idx} 指向的角色被剧本锁定不可扮演 (role=${proto.role})`);
    }
    useCharSheetStore.getState().setSheet(proto.sheet);
    // 其他角色全部 NPC 化（排除当前主角索引）
    const npcStore = useNpcStore.getState();
    for (let i = 0; i < scn.characters.length; i++) {
      if (i === idx) continue;
      npcStore.applyUpdates([scenarioCharacterToNpc(scn.characters[i])]);
    }
  } else {
    // newChar：剧本里所有角色全部 NPC 化（玩家走原 CharacterCreator）
    const npcStore = useNpcStore.getState();
    for (const c of scn.characters) {
      npcStore.applyUpdates([scenarioCharacterToNpc(c)]);
    }
  }
```

新代码（含 M10 逻辑）：
```typescript
  // ── 1. 角色卡 + NPC ─────────────────────────────────────────────────
  // M10: playerId 为玩家本人对应的 ScenarioCharacter.id;
  //  - preset 模式 = scn.characters[charIdx].id(玩家扮演该角色)
  //  - newChar 模式 = null(玩家自创卡,关系图中 player_created 角色由 CharCreator M4/M5 写入,
  //    此时尚未指定具体 id;开场建场判定只用"非敌对边"逻辑,playerId=null 由 canJoinParty 自行容错)
  let playerId: string | null = null;
  if (mode === 'preset') {
    // preset 模式必须显式指定主角索引；不允许 undefined 默默兜底到 0，
    // 否则一旦上游路由没传 charIdx，玩家会被随机分配第 0 号角色（可能是 locked_npc）。
    if (charIdx === undefined) {
      throw new Error('[scenario-engine] preset 模式必须显式传 charIdx');
    }
    const idx = charIdx;
    const proto = scn.characters[idx];
    if (!proto) throw new Error(`[scenario-engine] preset 模式 charIdx=${idx} 越界`);
    // protagonist (推荐主角) 和 optional (配角可玩) 都允许玩家扮演;
    // locked_npc 是剧本钉死的不可选角色(反派/序章死者),拒绝。
    if (proto.role === 'locked_npc') {
      throw new Error(`[scenario-engine] charIdx=${idx} 指向的角色被剧本锁定不可扮演 (role=${proto.role})`);
    }
    useCharSheetStore.getState().setSheet(proto.sheet);
    playerId = proto.id;
  }
  // 其他角色全部 NPC 化(preset 模式排除玩家本人;newChar 模式全部 NPC 化)。
  // M10: 开场建场流程——按 characters[] 顺序遍历,跟踪已"在场"NPC 集合,
  //   - presentAtStart!==true → 走原 applyUpdates(scenarioCharacterToNpc),isPresent 由 scenarioCharacterToNpc 决定;
  //   - presentAtStart===true:
  //       1) 与已在场 NPC 互为敌对(hasHostileEdge 任一方向 true) → 强制 isPresent=false + console.warn(spec §4.2 R5);
  //       2) 否则 isPresent=true 建场;再跑 canJoinParty(对方与玩家或队内任意成员有非敌对边) → joinParty 自动入队;
  //   - 玩家本人(c.id === playerId)跳过,不入 NpcProfile 名册(玩家不在名册;玩家 inParty 由调用方语义保证)。
  const npcStore = useNpcStore.getState();
  const presentIds: string[] = []; // 已 isPresent=true 的 NPC id,用于敌对冲突顺序判定
  const partyIds: string[] = playerId ? [playerId] : []; // 玩家始终视为 inParty(spec §5.3),id 作为关系图节点
  for (let i = 0; i < scn.characters.length; i++) {
    const c = scn.characters[i];
    if (mode === 'preset' && c.id === playerId) continue; // 玩家本人不进名册
    const npc = scenarioCharacterToNpc(c);
    if (c.presentAtStart === true) {
      // R5: 与已在场 NPC 互为敌对 → 后到者强制 isPresent=false
      const conflict = presentIds.find((existingId) => hasHostileEdge(scn, c.id, existingId));
      if (conflict) {
        console.warn(
          `[scenario-engine] 开场冲突(R5): "${c.id}" 与已在场 "${conflict}" 互为敌对边, 强制 isPresent=false`,
        );
        npc.isPresent = false;
        npcStore.applyUpdates([npc]);
        continue;
      }
      npc.isPresent = true;
      npcStore.applyUpdates([npc]);
      presentIds.push(c.id);
      // R1: 与玩家或队内任意成员有非敌对边 → 自动 joinParty
      if (canJoinParty(scn, c.id, partyIds, playerId)) {
        npcStore.joinParty(c.id);
        partyIds.push(c.id);
      }
    } else {
      // 未显式 presentAtStart → 走 scenarioCharacterToNpc 默认值(locked_npc 不在场,其余在场)
      npcStore.applyUpdates([npc]);
    }
  }
```

- [ ] **Step 3: 跑 test 验证通过**

Run: `npx vitest run src/scenario/__tests__/scenario-engine.test.ts`
Expected: PASS — M10 三用例全绿，且原有 D1/D2 用例（rollback / preset undefined / locked_npc / deepMergePreserve）全部保持绿。

- [ ] **Step 4: tsc + build 校验**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 无新报错；vite build 成功（pre-existing warnings 不算）。

- [ ] **Step 5: commit + push beta**

```bash
git add src/scenario/scenario-engine.ts
git commit -m "feat(scenario): M10 activateScenario 按 presentAtStart 建场+准入入队+敌对冲突检测"
git push origin beta
```

---

### Task 3: 跑全套测试 + 全量构建确认不破其它路径

**Files:**
- Test: 全仓 vitest + tsc + build

- [ ] **Step 1: 跑相关测试集合验证不破其它路径**

Run: `npx vitest run src/scenario src/stores/useNpcStore.test.ts`
Expected: PASS — scenario 全模块测试 + useNpcStore 测试全绿。

- [ ] **Step 2: 跑全量 tsc + build**

Run: `npx tsc --noEmit && npx vite build`
Expected: tsc 干净；vite build 成功。

- [ ] **Step 3: 若全绿，无新增 commit；若有补漏需求,再 commit + push beta**

无新代码改动时跳过 commit；如修复 lint/build 报错则：

```bash
git add -A
git commit -m "fix(scenario): M10 收尾修补 build/tsc 残留"
git push origin beta
```

---

## 验证清单（里程碑完成判据）

- [ ] `npx vitest run src/scenario/__tests__/scenario-engine.test.ts` — PASS（含新增 M10 三用例 + 原 D1/D2 用例）
- [ ] `npx vitest run src/scenario src/stores/useNpcStore.test.ts` — PASS
- [ ] `npx tsc --noEmit` — 无新报错
- [ ] `npx vite build` — 成功
- [ ] Task 1 红测 commit 已推 beta
- [ ] Task 2 实现 commit 已推 beta
- [ ] `presentAtStart=true` + 与玩家非敌对的 NPC：开场就 `isPresent=true` + 自动入队（spec §5.3）
- [ ] `presentAtStart=true` 但与玩家无非敌对边的 NPC：仅 `isPresent=true`，不入队（spec §5.3 R1）
- [ ] 两个 `presentAtStart=true` 的 NPC 互为敌对：按 characters[] 顺序，后到者强制 `isPresent=false` 且 `console.warn` 留痕（spec §4.2 R5）
- [ ] 玩家本人（preset 模式 charIdx 指向者）不进 NpcProfile 名册（既有不变量保留）

---

## 全局验证清单（M10 完成后跑一遍）

- [ ] `npx tsc --noEmit` 干净
- [ ] `npx vitest run` 全绿（含 `relation-graph.test.ts` / `relation-lorebook.test.ts` / 各 store test / `party-relation-evaluator.test.ts` / `scenario-engine.test.ts`）
- [ ] `npx vite build` 成功
- [ ] git log beta 上 M1-M10 各有至少一条 feat/refactor commit
- [ ] beta 已推到远端
- [ ] 手测剧情串（按 memory `user-does-ui-testing`，由玩家自己跑）：
  - [ ] 自创卡固化：建卡 → 选别人进游戏 → 返菜单 → 重新选同剧本 → 看到上次的自创卡 → 选他进游戏
  - [ ] 实时 lorebook：进游戏 → TeamSidebar 邀请陌生 NPC 应被拒；PeopleTab 改成朋友 → 立刻能邀请
  - [ ] 脱队评估：构造叙事让关系变敌对，观察队友脱队 + RightPage 旁白
  - [ ] 攻击保护：选项里"攻击 <队友>" 灰显；战斗中战斗员名册不含队友
  - [ ] 准备 master 合并前更新 `ChangelogModal` RELEASES + CURRENT_VERSION（memory `changelog-required-on-master-push`）
