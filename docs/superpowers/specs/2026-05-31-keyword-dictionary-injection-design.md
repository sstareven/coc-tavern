# 关键词词典累积与注入 — 设计文档

**日期:** 2026-05-31
**状态:** 待实现
**关联:** 审计 needs_review 项「useKeywordStore.addKeywords 已实现但无调用者」

## 背景与问题

当前关键词系统存在断裂：

- `useKeywordStore.keywords`（`Record<词, 释义>`）是会话级关键词 DB，随会话存档（Dexie `keywords` 表），`KeywordTooltip` 读它给玩家做悬停释义。
- LLM 每页生成时会一并产出 `page.keywords`（词→释义），但 `useChatPipeline.ts:632` 只取**键名**拼成「剧情摘要世界书条目」的触发词，**释义被丢弃**，且**从不写入** `useKeywordStore`。
- `addKeywords`（带「保留首见」去重逻辑）从未被任何路径调用。
- 结果：会话级关键词 DB 几乎永远为空；LLM 定义过的关键词释义既不持久化、也不回灌给 LLM。

**目标**：把 LLM 每页产出的关键词（词+释义）累积进 DB，并在后续生成时按「混合策略」注入 prompt，让 LLM 知道这些既定设定的存在，保持叙事一致性。

## 需求（已与用户确认）

- **注入方式**：混合策略 —— 近期关键词常驻注入；更早的关键词按当前文本匹配注入。
- **关键词来源**：LLM 每页产出的 `page.keywords`（不引入额外提取逻辑）。
- **常驻窗口**：按最近 N 页（默认 N=3）。
- **注入上限**：默认 ~40 条；超出丢弃最旧并记日志。

## 架构

复用现有「暗线」注入模式：暗线把 `buildContextInjection()` 的文本包成一个 `constant` LoreEntry，在 `useChatPipeline.ts:238` 附近塞进注入 bucket，交给现有 prompt 组装管道。关键词注入照此办理 —— **纯函数算文本 + 像暗线一样包成 LoreEntry 注入**，不改 `assemblePrompt` 签名、不污染世界书体系。

### 组件

1. **`src/sillytavern/keyword-injection.ts`（新，纯计算层，零 store 依赖）**

   ```ts
   export function buildKeywordInjection(opts: {
     recentPages: BookPage[];              // 调用方已切片的最近 N 页
     accumulated: Record<string, string>; // useKeywordStore 全量累积词典
     scanText: string;                     // 当前输入/上下文，用于匹配老词
     maxEntries?: number;                  // 默认 40
   }): string;
   ```

   逻辑：
   - `resident` = 最近 N 页各 `page.keywords` 合并，保留首见（先出现优先）。
   - `residentWords` = resident 的键集合。
   - `matched` = `accumulated` 中键不在 `residentWords`、且 `scanText` 以子串 `includes` 命中该键的条目。
   - 合并顺序 `resident` 在前、`matched` 在后，截断到 `maxEntries`（常驻优先保留）。
   - 输出格式：
     ```
     [已知词条 — 守秘人参考，可在叙事中自然沿用以下既定设定]
     - 词：释义
     - 词：释义
     ```
   - 无任何条目时返回 `''`（调用方据此跳过注入）。

2. **`src/sillytavern/keyword-injection.test.ts`（新）** — 覆盖：常驻合并去重、老词按 scanText 匹配、常驻优先的上限截断、空输入返回空串、中文子串匹配。

3. **`useChatPipeline.ts`（改）**
   - **入库**：拿到 `newPage.keywords` 时调 `useKeywordStore.getState().addKeywords(newPage.keywords)`（保留首见）。位置在 `:632` 摘要处理附近；现有「摘要条目」逻辑保持不动。
   - **注入**：在 `:238` 暗线 bucket 构造处并列，调 `buildKeywordInjection`，文本非空时包成 `{ name: '已知词条', keys: '', content, constant 注入 }` 的 LoreEntry 放入注入 bucket。
   - 常量：`KEYWORD_RESIDENT_PAGES = 3`、`KEYWORD_MAX_ENTRIES = 40`。
   - `scanText` 取本回合用户输入（与暗线同源上下文）。

4. **`useKeywordStore.ts`** — 无需改动（`addKeywords` 已就绪，去重逻辑契合）。

5. **持久化** — 无需改动；`sessionLifecycle` 已把 `useKeywordStore.keywords` 存入 Dexie `keywords` 表并在切档恢复。

## 数据流

```
LLM 生成一页
  └─ page.keywords (词→释义)
       ├─ ① addKeywords(page.keywords)        → useKeywordStore (持久化 + 玩家 tooltip)
       └─ ② (现有) 取键名拼剧情摘要条目         → 不变

下一回合组装 prompt
  └─ buildKeywordInjection({
        recentPages: 最近 3 页,
        accumulated: useKeywordStore.keywords 全量,
        scanText: 本回合用户输入,
     })
       └─ 文本 → 包成「已知词条」LoreEntry → 注入 bucket → 喂 LLM
```

## 边界与错误处理

- 无关键词 / 释义为空：`addKeywords` 已过滤 `k && v`；`buildKeywordInjection` 返回 `''`，不注入。
- 中文无词边界：匹配用子串 `includes`（与项目其他关键词匹配一致），可预测。
- 超上限：常驻优先保留，丢弃最旧的匹配项，并 `pushLog('debug', ...)` 记录丢弃数。
- **轻量补写模式（rewrite-lite）跳过关键词注入**，与暗线/摘要在该模式下被跳过保持一致，省 token。

## 测试策略

- `keyword-injection.test.ts` 纯函数单测（无 store/IndexedDB 依赖）。
- 现有 525 测试须全绿；新增不破坏 `llm-response-parser`/`prompt-assembler` 相关测试。
- 验证三连：`tsc -b` + `vitest` + `vite build`。

## 不做（YAGNI）

- 不引入 statData 关键词提取（来源仅 `page.keywords`）。
- 不做玩家手动关键词编辑 UI。
- `N` 与上限暂为模块常量，不提设置项（后续按需再提）。
- 不动现有「剧情摘要世界书条目」机制。
