# 行动补写（Action Rewrite）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当玩家输入选项外的自定义行动时，由 AI 就地补写「过渡叙述 + 4 个候选选项」追加到当前页（不推进剧情），可反复重新续写（带动效），推进按钮升级为「推进/行动补写」双态。

**Architecture:** 纯逻辑（匹配判定、补写 JSON 解析）抽成可单测的纯函数；补写产出以隔离字段 `BookPage.rewrite` 存储并随存档持久化；补写生成复用现有 `buildPromptMessages` 上下文 + 一套专门指令，API 通道复用 MVU 独立 API 范式。

**Tech Stack:** React 19 + Zustand + framer-motion + Vite + Vitest（jsdom）。无 React 组件测试库，故 UI 任务用 `tsc` + 手动验证，纯逻辑/Store 任务用 Vitest TDD。

**约定（项目记忆）：** commit **不含** `Co-Authored-By`；每个任务完成即 `git commit`，全部完成后由执行者统一 `git push`。

---

## File Structure

新增：
- `src/sillytavern/choice-match.ts` — 规范化、强相关匹配、按钮模式判定（纯函数）
- `src/sillytavern/choice-match.test.ts`
- `src/sillytavern/rewrite-instruction.ts` — 补写专用 LLM 指令常量

修改：
- `src/types/index.ts` — `RewriteBlock` + `BookPage.rewrite`
- `src/sillytavern/llm-response-parser.ts` — `parseRewriteResponse`（+ 复用 `escapeStrayInnerQuotes`）
- `src/sillytavern/llm-response-parser.test.ts` — 补写解析测试
- `src/stores/useBookStore.ts` — `setPageRewrite` action
- `src/stores/useBookStore.test.ts` — store 测试
- `src/stores/useSettingsStore.ts` — 4 个补写 API 字段 + setter + 默认值
- `src/hooks/useChatPipeline.ts` — `buildPromptMessages` 加 `formatOverride` 参数；新增 `rewriteAction` 并导出
- `src/components/Layout/InputBar.tsx` — 双态按钮
- `src/components/Book/RightPage.tsx` — 渲染 rewrite 区 + 动效
- `src/components/Book/Storybook.tsx` — 把 `page.rewrite` 传入 RightPage（3 处调用点）
- `src/components/Settings/SettingsPanel.tsx` — 补写独立 API 配置组

---

## Task 1: 类型定义 RewriteBlock + BookPage.rewrite

**Files:**
- Modify: `src/types/index.ts:48-62`（`BookPage` 与其后）

- [ ] **Step 1: 添加类型**

在 `src/types/index.ts` 中 `ChoiceItem` 定义之后（约 `:89` 块附近）新增 `RewriteBlock`，并给 `BookPage` 加可选字段。

`BookPage` 接口内（`:61` `inventoryChanges` 行之后、`:62` 的 `}` 之前）加一行：
```ts
  rewrite?: RewriteBlock;
```

在 `ChoiceItem` 接口（`:89-93`，以 `action: string;` 结尾的 `}` 之后）新增：
```ts

export interface RewriteBlock {
  /** 承接玩家意图的过渡叙述，不含结果、不推进剧情 */
  text: string;
  /** 4 个候选行动选项，编号续接原选项（V–VIII） */
  choices: ChoiceItem[];
  /** 触发补写时玩家的原始输入，用于重新续写复用与匹配 */
  sourceInput: string;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: EXIT 0（无新错误）

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): 新增 RewriteBlock 与 BookPage.rewrite 字段"
```

---

## Task 2: 强相关匹配与按钮模式判定（纯函数 TDD）

**Files:**
- Create: `src/sillytavern/choice-match.ts`
- Test: `src/sillytavern/choice-match.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/sillytavern/choice-match.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { normalizeChoiceText, matchesExistingChoice, resolveButtonMode } from './choice-match';
import type { ChoiceItem } from '../types';

const choices: ChoiceItem[] = [
  { num: 'I', text: '仔细搜查书房的每个角落', action: "进行侦查检定(普通)，搜查书房 <var name='lastAction' value='搜查'/>" },
  { num: 'II', text: '翻阅尘封的旧档案', action: '进行图书馆使用检定(普通)，查阅档案' },
];

describe('normalizeChoiceText', () => {
  it('去标点/空白并小写', () => {
    expect(normalizeChoiceText(' 仔细，搜查。 ')).toBe('仔细搜查');
  });
  it('剥离 <var> 标记', () => {
    expect(normalizeChoiceText("查阅 <var name='x' value='y'/> 档案")).toBe('查阅档案');
  });
  it('全角字母数字转半角', () => {
    expect(normalizeChoiceText('ＡＢＣ１２３')).toBe('abc123');
  });
});

describe('matchesExistingChoice', () => {
  it('与选项 text 规范化相等 → true', () => {
    expect(matchesExistingChoice('仔细搜查书房的每个角落', choices)).toBe(true);
  });
  it('与选项 action 规范化相等（点选项填入 action 的场景）→ true', () => {
    expect(matchesExistingChoice("进行图书馆使用检定(普通)，查阅档案", choices)).toBe(true);
  });
  it('意思相近但措辞不同 → false', () => {
    expect(matchesExistingChoice('我去翻翻那些旧文件', choices)).toBe(false);
  });
  it('空输入 → false', () => {
    expect(matchesExistingChoice('   ', choices)).toBe(false);
  });
});

describe('resolveButtonMode', () => {
  it('空输入 → advance', () => {
    expect(resolveButtonMode('', choices)).toBe('advance');
  });
  it('斜杠指令 → advance', () => {
    expect(resolveButtonMode('/help', choices)).toBe('advance');
  });
  it('匹配选项 → advance', () => {
    expect(resolveButtonMode('翻阅尘封的旧档案', choices)).toBe('advance');
  });
  it('选项外自定义文字 → rewrite', () => {
    expect(resolveButtonMode('我想点燃这本书', choices)).toBe('rewrite');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/choice-match.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数**

创建 `src/sillytavern/choice-match.ts`：
```ts
import type { ChoiceItem } from '../types';

/** 规范化：剥离 <var> 标记、去标点与空白、全角字母数字转半角、统一小写。用于强相关相等比对。 */
export function normalizeChoiceText(s: string): string {
  return s
    .replace(/<var\s+[^>]*\/>/gi, '')
    .replace(/[，。！？、；：,.!?;:「」『』“”‘’()（）\[\]【】\s]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

/** 输入是否与任一选项的 text 或 action 规范化后严格相等。 */
export function matchesExistingChoice(input: string, choices: ChoiceItem[]): boolean {
  const n = normalizeChoiceText(input);
  if (!n) return false;
  return choices.some(
    (c) => normalizeChoiceText(c.text) === n || normalizeChoiceText(c.action) === n,
  );
}

/** 推进按钮模式：空/指令/匹配选项 → advance；选项外自定义 → rewrite。 */
export function resolveButtonMode(input: string, choices: ChoiceItem[]): 'advance' | 'rewrite' {
  const t = input.trim();
  if (t === '') return 'advance';
  if (t.startsWith('/')) return 'advance';
  if (matchesExistingChoice(t, choices)) return 'advance';
  return 'rewrite';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/sillytavern/choice-match.test.ts`
Expected: PASS（13 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/choice-match.ts src/sillytavern/choice-match.test.ts
git commit -m "feat(rewrite): 强相关匹配与推进按钮模式判定纯函数"
```

---

## Task 3: 补写专用 LLM 指令常量

**Files:**
- Create: `src/sillytavern/rewrite-instruction.ts`

- [ ] **Step 1: 写常量**

创建 `src/sillytavern/rewrite-instruction.ts`：
```ts
// 行动补写专用指令。覆盖默认的整页 FORMAT_INSTRUCTION：只产出过渡叙述 + 4 个候选选项，不推进剧情。
export const REWRITE_INSTRUCTION = [
  '【行动补写模式】玩家输入了当前 4 个选项之外的自定义行动。请勿推进剧情、勿产生结果、勿掷骰、勿生成整页。',
  '你的任务：(1) 用 1-2 句承接玩家意图的过渡叙述（铺垫情境，不写结果）；(2) 给出恰好 4 个具体的后续行动候选选项。',
  '严格只输出如下 JSON（var 标签用单引号；字符串内引用一律用中文引号「」，严禁未转义的英文双引号）：',
  '{',
  '  "text": "承接玩家意图的过渡叙述，不含结果。",',
  '  "choices": [',
  '    {"num": "V", "text": "玩家可见的纯叙事行动描述", "action": "进行XX检定(普通)，具体行动 <var name=\'lastAction\' value=\'简述\'/> <var name=\'lastCheck\' value=\'技能名\'/>"},',
  '    {"num": "VI", "text": "...", "action": "..."},',
  '    {"num": "VII", "text": "...", "action": "..."},',
  '    {"num": "VIII", "text": "...", "action": "..."}',
  '  ]',
  '}',
  'choices 的 text 必须是纯叙事文字，禁止包含检定标记或技能名前缀；检定信息只能出现在 action 字段。必须恰好 4 个选项。',
].join('\n');
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add src/sillytavern/rewrite-instruction.ts
git commit -m "feat(rewrite): 补写专用 LLM 指令常量"
```

---

## Task 4: 补写 JSON 解析 parseRewriteResponse（TDD）

**Files:**
- Modify: `src/sillytavern/llm-response-parser.ts`（文件末尾新增导出函数，复用已有 `escapeStrayInnerQuotes`）
- Test: `src/sillytavern/llm-response-parser.test.ts`（已存在，追加 describe）

- [ ] **Step 1: 写失败测试**

在 `src/sillytavern/llm-response-parser.test.ts` 顶部 import 行追加 `parseRewriteResponse`：
```ts
import { stripMvu, escapeStrayInnerQuotes, parseRewriteResponse } from './llm-response-parser';
```
在文件末尾追加：
```ts
describe('parseRewriteResponse', () => {
  it('解析合法补写 JSON，选项重编号为 V–VIII', () => {
    const raw = '{"text":"你握紧了火柴。","choices":[{"num":"1","text":"点燃书页","action":"进行神秘学检定(普通)，点燃 <var name=\'lastAction\' value=\'点燃\'/>"},{"num":"2","text":"先后退","action":"后退观察"},{"num":"3","text":"呼救","action":"大声呼救"},{"num":"4","text":"逃跑","action":"夺门而出"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.text).toBe('你握紧了火柴。');
    expect(r.choices.map((c) => c.num)).toEqual(['V', 'VI', 'VII', 'VIII']);
    expect(r.choices[0].text).toBe('点燃书页');
  });

  it('多于 4 个选项时截断为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"},{"text":"e","action":"e"}]}';
    expect(parseRewriteResponse(raw)!.choices).toHaveLength(4);
  });

  it('不足 4 个选项时补足为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.choices).toHaveLength(4);
    expect(r.choices[3].num).toBe('VIII');
  });

  it('裸英文引号被兜底修复', () => {
    const raw = '{"text":"他说"快跑"然后消失","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"}]}';
    expect(parseRewriteResponse(raw)!.text).toContain('快跑');
  });

  it('完全非法 → null', () => {
    expect(parseRewriteResponse('这不是JSON')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/sillytavern/llm-response-parser.test.ts`
Expected: FAIL（`parseRewriteResponse` 未导出）

- [ ] **Step 3: 实现解析函数**

在 `src/sillytavern/llm-response-parser.ts` 末尾追加（文件已 import 了 `ChoiceItem`、已定义 `escapeStrayInnerQuotes`；`RewriteBlock` 需补充到顶部 import）：

顶部 type import 改为包含 `RewriteBlock`（找到现有 `import type { BookPage, SceneInfo, InventoryChange, InventoryAction, ItemCategory } from '../types';` 一行，追加 `RewriteBlock`）：
```ts
import type { BookPage, SceneInfo, InventoryChange, InventoryAction, ItemCategory, RewriteBlock, ChoiceItem } from '../types';
```
（若 `ChoiceItem` 已在别处导入则去重，保持单次导入。）

文件末尾追加：
```ts
const REWRITE_NUMERALS = ['V', 'VI', 'VII', 'VIII'];

/**
 * 解析「行动补写」返回的精简 JSON：{ text, choices[] }。
 * 选项强制重编号为 V–VIII，截断/补足到恰好 4 个。失败返回 null。
 * sourceInput 由调用方填充。
 */
export function parseRewriteResponse(raw: string): RewriteBlock | null {
  let jsonStr = raw.trim();
  const cb = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cb) jsonStr = cb[1].trim();
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  jsonStr = jsonStr.slice(start, end + 1);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    try {
      parsed = JSON.parse(escapeStrayInnerQuotes(jsonStr)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const rawChoices = Array.isArray(parsed.choices) ? (parsed.choices as Record<string, unknown>[]) : [];
  if (!text && rawChoices.length === 0) return null;

  const choices: ChoiceItem[] = rawChoices.slice(0, 4).map((c, i) => ({
    num: REWRITE_NUMERALS[i],
    text: String(c?.text ?? `选项 ${i + 1}`),
    action: String(c?.action ?? c?.text ?? ''),
  }));
  while (choices.length < 4) {
    const i = choices.length;
    choices.push({ num: REWRITE_NUMERALS[i], text: '继续当前行动', action: '继续当前行动' });
  }
  return { text, choices, sourceInput: '' };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/sillytavern/llm-response-parser.test.ts`
Expected: PASS（原有用例 + 5 个新用例）

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/llm-response-parser.ts src/sillytavern/llm-response-parser.test.ts
git commit -m "feat(rewrite): 补写 JSON 解析 parseRewriteResponse（复用裸引号兜底）"
```

---

## Task 5: useBookStore 新增 setPageRewrite（TDD）

**Files:**
- Modify: `src/stores/useBookStore.ts`（接口 `:91-113` 加方法签名；实现加在 `setPages` 之后 `:234` 附近）
- Test: `src/stores/useBookStore.test.ts`（已存在，追加 describe）

- [ ] **Step 1: 写失败测试**

在 `src/stores/useBookStore.test.ts` 末尾追加：
```ts
import type { RewriteBlock } from '../types';

describe('useBookStore.setPageRewrite', () => {
  const block: RewriteBlock = {
    text: '过渡叙述',
    choices: [
      { num: 'V', text: 'a', action: 'a' },
      { num: 'VI', text: 'b', action: 'b' },
      { num: 'VII', text: 'c', action: 'c' },
      { num: 'VIII', text: 'd', action: 'd' },
    ],
    sourceInput: '我想点燃书',
  };

  it('把 rewrite 写入指定页', () => {
    useBookStore.getState().setPages([
      { id: 'p1', leftHeader: '场景', leftContent: '...', leftPage: '— 3 —', rightPage: '— 4 —', rightHeader: '行动', rightContent: '', rightChoices: [] },
    ]);
    useBookStore.getState().setPageRewrite(0, block);
    expect(useBookStore.getState().pages[0].rewrite).toEqual(block);
  });

  it('传 undefined 清除 rewrite', () => {
    useBookStore.getState().setPageRewrite(0, undefined);
    expect(useBookStore.getState().pages[0].rewrite).toBeUndefined();
  });

  it('越界索引安全忽略', () => {
    expect(() => useBookStore.getState().setPageRewrite(99, block)).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/stores/useBookStore.test.ts`
Expected: FAIL（`setPageRewrite` 不存在）

- [ ] **Step 3: 实现 action**

在 `src/stores/useBookStore.ts`：

(a) `import type { BookPage, DiceRecord } from '../types';` 改为追加 `RewriteBlock`：
```ts
import type { BookPage, DiceRecord, RewriteBlock } from '../types';
```

(b) `interface BookStore` 中（`setPages` 签名 `:111` 之后）加：
```ts
  setPageRewrite: (index: number, block: RewriteBlock | undefined) => void;
```

(c) 在 `setPages` 实现（`:231-234`）之后新增：
```ts
  setPageRewrite: (index, block) => set((s) => {
    if (index < 0 || index >= s.pages.length) return {};
    const pages = [...s.pages];
    pages[index] = { ...pages[index], rewrite: block };
    return { pages };
  }),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/stores/useBookStore.test.ts`
Expected: PASS（原有 + 3 个新用例）

- [ ] **Step 5: Commit**

```bash
git add src/stores/useBookStore.ts src/stores/useBookStore.test.ts
git commit -m "feat(rewrite): useBookStore.setPageRewrite 写入/清除当前页补写"
```

---

## Task 6: useSettingsStore 补写独立 API 字段

**Files:**
- Modify: `src/stores/useSettingsStore.ts`（接口 `:17-20`、setter 声明 `:46-49`、默认值 `:76-79`、setter 实现 `:109-112` 各对应位置仿照 mvu 字段）

- [ ] **Step 1: 加字段**

仿照现有 `mvuUseIndependentApi` 等四处位置，分别添加补写字段：

(a) 接口字段（`mvuApiKey: string;` 之后）：
```ts
  rewriteUseIndependentApi: boolean;
  rewriteApiBaseUrl: string;
  rewriteApiModel: string;
  rewriteApiKey: string;
```

(b) setter 类型声明（`setMvuApiKey: (key: string) => void;` 之后）：
```ts
  setRewriteUseIndependentApi: (v: boolean) => void;
  setRewriteApiBaseUrl: (url: string) => void;
  setRewriteApiModel: (model: string) => void;
  setRewriteApiKey: (key: string) => void;
```

(c) 默认值（`mvuApiKey: '',` 之后）：
```ts
  rewriteUseIndependentApi: false,
  rewriteApiBaseUrl: 'https://api.deepseek.com',
  rewriteApiModel: 'deepseek-chat',
  rewriteApiKey: '',
```

(d) setter 实现（`setMvuApiKey: (key) => set({ mvuApiKey: key }),` 之后）：
```ts
      setRewriteUseIndependentApi: (v) => set({ rewriteUseIndependentApi: v }),
      setRewriteApiBaseUrl: (url) => set({ rewriteApiBaseUrl: url }),
      setRewriteApiModel: (model) => set({ rewriteApiModel: model }),
      setRewriteApiKey: (key) => set({ rewriteApiKey: key }),
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b`
Expected: EXIT 0

- [ ] **Step 3: 验证持久化白名单（如有）**

检查 `useSettingsStore.ts` 是否有 `partialize`/持久化字段白名单。Run: `grep -n "partialize\|rewriteUseIndependentApi" src/stores/useSettingsStore.ts`
若存在 `partialize` 且显式列出字段，则把 4 个 `rewrite*` 字段一并加入；若是整体持久化则无需改动。

- [ ] **Step 4: Commit**

```bash
git add src/stores/useSettingsStore.ts
git commit -m "feat(rewrite): 设置新增补写独立 API 字段（默认跟随主 API）"
```

---

## Task 7: buildPromptMessages 支持 formatOverride

**Files:**
- Modify: `src/hooks/useChatPipeline.ts:120`（`buildPromptMessages` 签名）、`:294`（format 来源）

- [ ] **Step 1: 加可选参数**

(a) 找到 `const buildPromptMessages = useCallback(` 后的参数列表（`:120` 起）。当前形如 `(input?: string) => {`（确认实际签名）。把第一个参数后追加可选第二参数 `formatOverride?: string`。例如由：
```ts
  const buildPromptMessages = useCallback(
    (rawInput?: string) => {
```
改为：
```ts
  const buildPromptMessages = useCallback(
    (rawInput?: string, formatOverride?: string) => {
```
（以文件中实际形参名为准，仅追加第二参数。）

(b) `:294` 行：
```ts
      const processedFormat = renderTemplate(FORMAT_INSTRUCTION, tmplOpts);
```
改为：
```ts
      const processedFormat = renderTemplate(formatOverride ?? FORMAT_INSTRUCTION, tmplOpts);
```

- [ ] **Step 2: 类型检查 + 既有测试回归**

Run: `npx tsc -b && npx vitest run`
Expected: EXIT 0，全部测试 PASS（现有调用方不传第二参，行为不变）

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "refactor(pipeline): buildPromptMessages 支持 formatOverride 以复用上下文"
```

---

## Task 8: useChatPipeline 新增 rewriteAction

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`（import 区；`regenerate` 之后 `:689` 附近新增；返回对象 `:838` 附近导出；返回类型接口 `:73-74` 附近）

- [ ] **Step 1: 加 import**

在 import 区追加：
```ts
import { REWRITE_INSTRUCTION } from '../sillytavern/rewrite-instruction';
import { parseRewriteResponse } from '../sillytavern/llm-response-parser';
```
确认 `parseLlmResponse` 已从 `llm-response-parser` 导入（若同文件已有该 import，合并为一行）。确认 `useChatStore`、`sendChatCompletion`、`applyPostProcessing`、`useSettingsStore`、`useBookStore` 均已在本文件导入（前文已使用，无需重复）。

- [ ] **Step 2: 返回类型声明加方法**

在 pipeline 返回类型接口中（`submit`/`regenerate` 声明附近，`:73-74`）追加：
```ts
  rewriteAction: (input: string) => Promise<void>;
```

- [ ] **Step 3: 实现 rewriteAction**

在 `regenerate` 的 `useCallback` 之后（`:689` 之后）新增：
```ts
  // ── rewriteAction（行动补写：就地生成过渡叙述+4候选，不推进剧情） ──

  const rewriteAction = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const settings = useSettingsStore.getState();
      const useIndep = settings.rewriteUseIndependentApi && !!settings.rewriteApiKey;
      const baseUrl = useIndep ? settings.rewriteApiBaseUrl : settings.apiBaseUrl;
      const apiKey = useIndep ? settings.rewriteApiKey : settings.apiKey;
      const model = useIndep ? settings.rewriteApiModel : settings.apiModel;
      if (!apiKey) {
        setError('请先在设置中配置API');
        return;
      }

      const bookStore = useBookStore.getState();
      const idx = bookStore.pageIndex;
      const hasPrev = !!bookStore.pages[idx]?.rewrite;
      const directive = hasPrev
        ? `${REWRITE_INSTRUCTION}\n\n（玩家对上次补写不满意，请给出与上次明显不同的 4 个方案。）`
        : REWRITE_INSTRUCTION;

      pushLog('info', `[行动补写] ${hasPrev ? '重新续写' : '生成'}: "${trimmed.slice(0, 40)}"`);

      const built = buildPromptMessages(trimmed, directive);
      if (!built) {
        setError('行动补写提示词组装失败');
        return;
      }

      const resp = await sendChatCompletion(
        applyPostProcessing(built.messages, settings.promptPostProcessing),
        built.preset,
        baseUrl,
        apiKey,
        model,
        false,
        undefined,
      );

      pushLog('debug', `[行动补写] 响应 ${resp.content.length}字`, 'api');
      const block = parseRewriteResponse(resp.content);
      if (!block) {
        setError('行动补写生成失败');
        return;
      }
      block.sourceInput = trimmed;
      useBookStore.getState().setPageRewrite(idx, block);
      useChatStore.getState().savePages(useBookStore.getState().pages);
      pushLog('info', `[行动补写] 已生成 4 个候选选项`);
    } catch (e) {
      setError(`行动补写失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [buildPromptMessages]);
```

- [ ] **Step 4: 在返回对象导出**

在 pipeline 末尾 `return {` 对象中 `regenerate,`（`:839`）之后追加：
```ts
    rewriteAction,
```

- [ ] **Step 5: 类型检查 + 回归**

Run: `npx tsc -b && npx vitest run`
Expected: EXIT 0，全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(rewrite): pipeline.rewriteAction 生成补写并写入当前页+存档"
```

---

## Task 9: InputBar 双态推进按钮

**Files:**
- Modify: `src/components/Layout/InputBar.tsx`（import；`:37-48` handlers；`:342-372` 按钮 JSX）

- [ ] **Step 1: 加 import 与当前页选项订阅**

import 区追加：
```ts
import { useBookStore } from '../../stores/useBookStore';
import { resolveButtonMode } from '../../sillytavern/choice-match';
```
组件内（`const apiModel = ...` 附近）追加订阅当前页选项集合：
```ts
  const currentChoices = useBookStore((s) => {
    const p = s.pages[s.pageIndex];
    return p ? [...p.rightChoices, ...(p.rewrite?.choices ?? [])] : [];
  });
  const buttonMode = resolveButtonMode(input, currentChoices);
```

- [ ] **Step 2: 加 rewrite handler**

在 `handleRegenerate`（`:46-48`）之后追加：
```ts
  const handleRewrite = async () => {
    const trimmed = input.trim();
    if (!trimmed || pipeline.loading) return;
    await pipeline.rewriteAction(trimmed);
  };
```

- [ ] **Step 3: 替换推进按钮为双态复合按钮**

把现有单按钮（`:342-372`，`<button onClick={handleSubmit} ...>{pipeline.loading ? '...' : '推 进'}</button>`）整体替换为上下两行复合按钮：
```tsx
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--gold)',
              borderRadius: 3,
              overflow: 'hidden',
              opacity: pipeline.loading ? 0.7 : 1,
            }}
          >
            <button
              onClick={handleSubmit}
              disabled={pipeline.loading || buttonMode !== 'advance'}
              title="推进剧情"
              style={dualBtnStyle(buttonMode === 'advance', pipeline.loading)}
            >
              {pipeline.loading && buttonMode === 'advance' ? '...' : '推 进'}
            </button>
            <div style={{ height: 1, background: 'rgba(196,168,85,0.25)' }} />
            <button
              onClick={handleRewrite}
              disabled={pipeline.loading || buttonMode !== 'rewrite'}
              title="补写当前自定义行动，生成新候选选项"
              style={dualBtnStyle(buttonMode === 'rewrite', pipeline.loading)}
            >
              {pipeline.loading && buttonMode === 'rewrite' ? '...' : '行动补写'}
            </button>
          </div>
```

- [ ] **Step 4: 加按钮样式函数**

在文件底部 `const wandBtnStyle` 定义附近追加：
```ts
function dualBtnStyle(active: boolean, loading: boolean): React.CSSProperties {
  return {
    padding: '7px 24px',
    border: 'none',
    background: active ? 'rgba(196,168,85,0.18)' : 'transparent',
    color: active ? 'var(--gold)' : 'rgba(196,168,85,0.35)',
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    letterSpacing: 3,
    cursor: active && !loading ? 'pointer' : 'default',
    pointerEvents: active && !loading ? 'auto' : 'none',
    whiteSpace: 'nowrap',
    transition: 'var(--transition-smooth)',
  };
}
```

- [ ] **Step 5: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: EXIT 0，构建成功

- [ ] **Step 6: 手动验证**

启动 `npm run dev`：(a) 输入框空 → 「推进」亮、「行动补写」暗；(b) 输入选项原文 → 「推进」亮；(c) 输入 `/help` → 「推进」亮；(d) 输入"我想烧了这本书" → 「行动补写」亮、「推进」暗。

- [ ] **Step 7: Commit**

```bash
git add src/components/Layout/InputBar.tsx
git commit -m "feat(rewrite): 推进按钮升级为推进/行动补写双态按钮"
```

---

## Task 10: RightPage 渲染补写区 + Storybook 传参

**Files:**
- Modify: `src/components/Book/RightPage.tsx`（Props `:12-18`；渲染 `:281-283` 选项之后）
- Modify: `src/components/Book/Storybook.tsx`（3 处 `<RightPage .../>`，`:237 :242 :248`）

- [ ] **Step 1: RightPage Props 加 rewrite**

`src/components/Book/RightPage.tsx`：

(a) import type 行（`:10`）追加 `RewriteBlock`：
```ts
import type { ChoiceItem, DiceResultType, RewriteBlock } from '../../types';
```
(b) `interface Props`（`:12-18`）加：
```ts
  rewrite?: RewriteBlock;
```
(c) 解构（`export function RightPage({ header, content, choices, pageNum, isFlipping }: Props)`）加 `rewrite`：
```ts
export function RightPage({ header, content, choices, pageNum, isFlipping, rewrite }: Props) {
```

- [ ] **Step 2: 渲染补写区**

在原选项列表（`:281-283` 的 `<div>{choices.map(...)}</div>`）之后、`</div>`（滚动容器）之前追加：
```tsx
          {rewrite && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed rgba(107,90,58,0.3)' }}>
              <p style={{ textIndent: '2em', marginBottom: 12, color: 'var(--ink)', fontStyle: 'italic' }}>
                {beautifyText(rewrite.text)}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rewrite.choices.map((ch) => <ChoiceButton key={ch.num} choice={ch} />)}
              </div>
            </div>
          )}
```
（动效在 Task 11 加；本任务先静态渲染。）

- [ ] **Step 3: Storybook 传 rewrite**

`src/components/Book/Storybook.tsx` 中 3 处 `<RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} />`（`:237 :242 :248`）各追加 `rewrite={page.rewrite}`：
```tsx
<RightPage header={page.rightHeader} content={page.rightContent} choices={page.rightChoices} pageNum={page.rightPage} rewrite={page.rewrite} />
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: EXIT 0

- [ ] **Step 5: 手动验证**

dev 中输入自定义行动 → 点「行动补写」→ 右页原 I–IV 下方出现虚线分隔 + 过渡叙述 + V–VIII 四个选项；点 V–VIII 之一可正常推进（填入输入框/掷骰）。

- [ ] **Step 6: Commit**

```bash
git add src/components/Book/RightPage.tsx src/components/Book/Storybook.tsx
git commit -m "feat(rewrite): RightPage 渲染补写区，Storybook 透传 page.rewrite"
```

---

## Task 11: 重新续写动效（framer-motion stagger）

**Files:**
- Modify: `src/components/Book/RightPage.tsx`（补写选项区包裹动效）

- [ ] **Step 1: 引入 motion 并加动效**

`src/components/Book/RightPage.tsx` import 区追加：
```ts
import { motion, AnimatePresence } from 'framer-motion';
```
把 Task 10 渲染的补写选项列表替换为带动效版本。用 `rewrite.sourceInput + rewrite.text` 作为 key 触发重挂载，逐项 stagger：
```tsx
              <AnimatePresence mode="wait">
                <motion.div
                  key={rewrite.sourceInput + '|' + rewrite.text}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {rewrite.choices.map((ch, i) => (
                    <motion.div
                      key={ch.num}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.32, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <ChoiceButton choice={ch} />
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
```
过渡叙述也加淡入：把 `<p>` 换成 `<motion.p key={rewrite.text} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.4, ease:[0.4,0,0.2,1]}} style={...同前...}>`。

- [ ] **Step 2: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: EXIT 0

- [ ] **Step 3: 手动验证**

补写产出时 4 选项逐个错位淡入；不改输入再点「行动补写」（重新续写）→ 旧选项淡出、新一批逐个淡入（因 key 变化触发）；过渡叙述淡入。曲线顺滑（`cubic-bezier(0.4,0,0.2,1)`）。

- [ ] **Step 4: Commit**

```bash
git add src/components/Book/RightPage.tsx
git commit -m "feat(rewrite): 补写选项 stagger 入场/重写切换动效"
```

---

## Task 12: SettingsPanel 补写独立 API 配置组

**Files:**
- Modify: `src/components/Settings/SettingsPanel.tsx`（store 取值/setter 订阅区 `:366-386` 附近；MVU 配置组 JSX `:795-880` 之后仿照新增一组）

- [ ] **Step 1: 订阅补写设置**

在 MVU 设置订阅区（`:366-386`）之后，仿照添加补写字段的取值与 setter、本地 state：
```ts
  const rewriteUseIndependentApi = useSettingsStore((s) => s.rewriteUseIndependentApi);
  const setRewriteUseIndependentApi = useSettingsStore((s) => s.setRewriteUseIndependentApi);
  const rewriteApiBaseUrl = useSettingsStore((s) => s.rewriteApiBaseUrl);
  const setRewriteApiBaseUrl = useSettingsStore((s) => s.setRewriteApiBaseUrl);
  const rewriteApiModel = useSettingsStore((s) => s.rewriteApiModel);
  const setRewriteApiModel = useSettingsStore((s) => s.setRewriteApiModel);
  const rewriteApiKey = useSettingsStore((s) => s.rewriteApiKey);
  const setRewriteApiKey = useSettingsStore((s) => s.setRewriteApiKey);
  const [localRewriteUrl, setLocalRewriteUrl] = useState(rewriteApiBaseUrl);
  const [localRewriteModel, setLocalRewriteModel] = useState(rewriteApiModel);
  const [localRewriteKey, setLocalRewriteKey] = useState(rewriteApiKey);
```

- [ ] **Step 2: 新增配置组 JSX**

在 MVU 配置组（`:795` 起 `{/* MVU Variable Engine API */}` 整个 `<div>...</div>`，到 `:793` 附近闭合）之后，仿照新增一组（精简版：开关 + Key + 地址 + 模型文本输入；不含连接测试/温度，保持轻量）：
```tsx
                {/* 行动补写 API */}
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(196,168,85,0.08)', paddingTop: 14 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>
                    行动补写 API
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>独立通道</span>
                    <button
                      onClick={() => setRewriteUseIndependentApi(!rewriteUseIndependentApi)}
                      style={{
                        padding: '5px 18px',
                        border: rewriteUseIndependentApi ? '1px solid var(--gold)' : '1px solid var(--ink-faded)',
                        borderRadius: 3,
                        background: rewriteUseIndependentApi ? 'rgba(196,168,85,0.15)' : 'rgba(0,0,0,0.2)',
                        color: rewriteUseIndependentApi ? 'var(--gold)' : 'var(--ink-faded)',
                        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
                      }}>
                      {rewriteUseIndependentApi ? '独立' : '跟随全局'}
                    </button>
                  </div>
                  {rewriteUseIndependentApi && (
                    <>
                      <div style={rowStyle}>
                        <span style={labelStyle}>API Key</span>
                        <input type="password" value={localRewriteKey}
                          onChange={(e) => { setLocalRewriteKey(e.target.value); setRewriteApiKey(e.target.value); }}
                          placeholder="sk-..." style={inputStyle}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                        />
                      </div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>API 地址</span>
                        <input value={localRewriteUrl}
                          onChange={(e) => { setLocalRewriteUrl(e.target.value); setRewriteApiBaseUrl(e.target.value); }}
                          style={{ ...inputStyle, width: 200 }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                        />
                      </div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>模型</span>
                        <input value={localRewriteModel}
                          onChange={(e) => { setLocalRewriteModel(e.target.value); setRewriteApiModel(e.target.value); }}
                          placeholder="deepseek-chat" style={{ ...inputStyle, width: 200 }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                        />
                      </div>
                    </>
                  )}
                </div>
```
（`rowStyle`/`labelStyle`/`inputStyle` 为该文件既有样式常量，直接复用。）

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc -b && npm run build`
Expected: EXIT 0

- [ ] **Step 4: 手动验证**

设置面板出现「行动补写 API」组，紧邻「MVU 变量引擎 API」；开关切换显示/隐藏 Key/地址/模型；填值后刷新仍在（持久化）。开启独立通道并填好后，触发补写应走该 API（可在调试日志观察）。

- [ ] **Step 5: Commit**

```bash
git add src/components/Settings/SettingsPanel.tsx
git commit -m "feat(rewrite): 设置面板新增行动补写独立 API 配置组"
```

---

## Task 13: 端到端验证 + 全量回归

- [ ] **Step 1: 全量类型检查 + 测试 + 构建**

Run: `npx tsc -b && npx vitest run && npm run build`
Expected: EXIT 0；测试全部 PASS；构建成功

- [ ] **Step 2: 端到端手动验证清单**

dev 中逐项确认：
1. 选项外输入 → 「行动补写」亮 → 点击 → 右页追加过渡叙述 + V–VIII（带入场动效）。
2. 不满意 → 再点「行动补写」→ 新一批选项替换（切换动效）。
3. 点 V–VIII 任一 → 正常推进（掷骰/填入）。
4. 翻页离开再回来 / 重启读档 → 补写区仍在（持久化）。
5. 输入匹配某选项或 `/` 指令或空 → 「推进」亮、点击走正常流程。
6. 设置开启补写独立 API → 补写走独立通道（调试日志可见）。

- [ ] **Step 3: 最终提交（如有收尾改动）**

```bash
git add -A
git commit -m "test(rewrite): 端到端验证收尾"
```
（执行者在全部任务后统一 `git push`。）

---

## Self-Review 记录

- **Spec 覆盖**：双态按钮(T9)、强相关匹配(T2)、数据模型方案A(T1/T5)、补写生成(T3/T4/T7/T8)、UI渲染(T10)、动效(T11)、独立API(T6/T12)、测试(T2/T4/T5)、错误处理(T8 内 setError + parser 兜底) —— 全覆盖。
- **占位符**：无 TBD/TODO；每个代码步给出完整代码。
- **类型一致性**：`RewriteBlock{text,choices,sourceInput}`、`setPageRewrite(index, block|undefined)`、`resolveButtonMode→'advance'|'rewrite'`、`parseRewriteResponse→RewriteBlock|null`、`buildPromptMessages(input, formatOverride?)`、`rewriteAction(input):Promise<void>` 在各任务间一致。
- **风险点**：T7 形参名以文件实际为准（计划已注明"以实际形参名为准"）；T6 持久化白名单按 grep 结果决定是否补字段（已在步骤内处理）。
