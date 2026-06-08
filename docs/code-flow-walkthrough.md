# 核心代码流程走读

本项目是一个 COC 跑团（TRPG）前端（React + TypeScript + Zustand + Dexie），其完整数据流可以串成一条"用户输入 → 渲染/落盘"的主干，再由若干子系统在主干上挂接。用户在 InputBar 输入文本后，先经 `revealHiddenRolls`（暗骰还原）穿过骰子边界进入 `useChatPipeline.submit`；submit 调用 `buildPromptMessages` 这一重量级提示词装配阶段——它在内部依次驱动**世界书匹配/注入**、**统一宏引擎**、**正则脚本引擎**、**上下文预算裁剪**，把系统提示词、世界书、用户输入、格式指令拍平为 `AssembledMessage[]`；该数组经 `applyPostProcessing` 后交给 **LLM API 路由**（`sendChatCompletion`，先过 RPM 限流闸再发 HTTP，流式/非流式两条返回路径）。LLM 原始字符串先被 **AI 输出正则** 与 **TH onReceive 钩子** 处理，再进入 **LLM 响应解析**（`parseLlmResponse`，容错 JSON → `BookPage`）与 **MVU 变量抽取**（独立 LLM 抽取 + `processResponse` 的 JSON Patch → `statData`）。解析产物作为新 `Page` 写入 `useBookStore`，并把关键词/摘要/暗线/物品分流写入各自 store，最后由 **会话生命周期**（`saveConversation`）把全部内存 store 快照落入 Dexie v2 关系表。各流程的连接点高度集中：`buildPromptMessages`（提示词装配的真正编排者）既是世界书注入流也是宏引擎/正则流的宿主；`sendChatCompletion` 是唯一 LLM 网关；`statData` 既被解析流写入、被宏引擎读取、又被提示词装配阶段以"运行时常驻 LoreEntry"形式注回提示词；`saveConversation` 是所有写流程的统一落盘出口。骰子流与角色创建流则相对独立，分别通过 `submit` 入口与 `saveConversation` 出口接入主干。

## 主聊天管线（输入 → 叙事）

**入口**：`src/hooks/useChatPipeline.ts:779` `submit`

**调用链**：

1. `src/hooks/useChatPipeline.ts:779` `submit` — 入口。守卫空输入/重入（loadingRef）/无活动会话；递增 messageCountRef、递减 sticky/cooldown 计数；`/` 开头则走 `processSlashCommands` 短路；校验 apiKey；调用 `buildPromptMessages` 成功后转入 `handleSendFromPreview`。
2. `src/hooks/useChatPipeline.ts:172` `buildPromptMessages` — 提示词装配阶段（useCallback）。跑 TH onSend 钩子、构建上下文、解析活动世界书并分桶、`matchLoreEntries` 匹配，注入运行时常驻项（暗线/关键词字典/statData 快照），合并桶、加载 ChatPreset、EJS 渲染、批量解析宏、应用 USER_INPUT 正则，`assemblePrompt` 组装后 `trimToBudget` 裁剪。返回 `{messages, tokenCount, preset, liteSavedTokens}` 或 null。
3. `src/sillytavern/prompt-assembler.ts:350` `assemblePrompt` — 边界（prompt-assembler 子系统）。从 input/preset/已处理 lore/格式指令/世界书前后块构建最终有序 `AssembledMessage[]`。
4. `src/hooks/useChatPipeline.ts:534` `handleSendFromPreview` — 发送+解析+回写阶段。中止在途请求、建 AbortController、startStream，构造重试纠偏消息并计算 `skipInventoryNarrativeCheck`（pages.length≤1），以 `sendChatCompletion(applyPostProcessing(...))` 为 send、`parseLlmResponse` 为 parse 调用 `sendWithJsonRetry`。成功后跑 AI 输出正则、TH onReceive 钩子、变量抽取，最后写页 + 边车 store + 落盘。
5. `src/hooks/useChatPipeline.ts:106` `sendWithJsonRetry` — 通用发送/解析重试骨架（模块级）。先 `send(false)` + `parse`；parse 返回 null 且未达上限则 `send(true)`（追加纠偏消息）重解析。主生成与 rewriteAction 共用。
6. `src/sillytavern/api-router.ts:16` `sendChatCompletion` — 边界（api-router 子系统）。执行真正的 LLM HTTP 调用，流式 token 经 onToken 回流，返回 `ChatCompletionResponse`。
7. `src/sillytavern/post-processor.ts` `applyPostProcessing` — 边界（post-processor）。按 `settings.promptPostProcessing` 在发送前包装消息数组（如合并角色），在 send 闭包中内联调用。
8. `src/sillytavern/llm-response-parser.ts:293` `parseLlmResponse` — 边界（llm-response-parser）。把原始字符串解析为 `ParsedLlmResult|null`（非法 JSON 返 null 触发重试），产出 `result.page` 与 `result.darkThread`。
9. `src/sillytavern/regex-engine.ts` `runAllRegexScripts` — 边界（regex-engine）。两次应用：placement 1 于用户输入、placement 2 于 AI 输出。
10. `src/sillytavern/th-script-engine.ts` `runReceiveHooks` — 边界（th-script-engine）。在正则处理后的 AI 内容上跑 onReceive 钩子，产物喂给变量抽取。
11. `src/sillytavern/mvu-extractor.ts:43` `extractVariablesWithLLM` — 边界（mvu-extractor）。受 `shouldUseLlmExtraction`/`mvuForceAlways` + 独立 API 设置门控；成功则 `processResponse` + 逐变量 `setVariable(...,'llm')`，抛错回退本地 `processResponse`，未门控则直接 `processResponse`。
12. `src/stores/useVariableStore.ts:43` `processResponse` — 写（useVariableStore）。本地抽取路径：解析显式 var 标签 / JSON-Patch 指令写入变量 store（statData），变量回写 Zustand 的规范路径。
13. `src/hooks/useChatPipeline.ts:646` `chatStore.addMessage` — 写（useChatStore）。把 user/assistant 消息追加到会话消息日志。
14. `src/sillytavern/parse-dice-input.ts` `parseDiceResultsFromInput` — 变换。从用户输入提取骰子结果，挂到 `newPage.diceResults`。
15. `src/hooks/useChatPipeline.ts:672` `bookStore.appendPage / replacePage` — 写（useBookStore）。replace=true → `replacePage`（regenerate）；否则 `appendPage` + `autoFlipForward` 及按设置 `trimPages`。
16. `src/hooks/useChatPipeline.ts:699` `chatStore.savePages` — 写（useChatStore）。把当前 `useBookStore.pages` 持久化进活动会话（写页后与末尾各调一次）。
17. `src/hooks/useChatPipeline.ts:705` `keywordStore.addKeywords` — 写（useKeywordStore）。累积 `newPage.keywords`（首见去重）。
18. `src/hooks/useChatPipeline.ts:713` `lorebookStore.upsertSummaryEntry` — 写（useLorebookStore）。summary+id 存在时，按 keywords/leftHeader upsert 自动摘要 lore 条目入 AUTO_SUMMARY 书。
19. `src/hooks/useChatPipeline.ts:725` `darkThreadStore.addEntry` — 写（useDarkThreadStore）。`result.darkThread.development` 存在时记录暗线条目。
20. `src/sillytavern/item-acquisition.ts` `filterAlreadyAcquiredAdds` — 变换。对 `newPage.inventoryChanges` 按 rewrite 源页的 `acquiredItems` 去重，避免拾取选项重复计数。
21. `src/hooks/useChatPipeline.ts:741` `inventoryStore.applyChanges` — 写（useInventoryStore）。把去重后的物品变更（增/删/数量）应用到背包。
22. `src/stores/sessionLifecycle.ts:174` `saveConversation` — 边界/落盘（sessionLifecycle）。把所有内存 store 序列化进 Dexie v2 关系表（经 enqueue），结束流程。

**触达的 store / DB**：useVariableStore（processResponse/setVariable）、useBookStore（appendPage/replacePage/autoFlipForward/trimPages）、useChatStore（addMessage/savePages）、useKeywordStore、useLorebookStore（AUTO_SUMMARY）、useDarkThreadStore、useInventoryStore、useTavernHelperStore（setMacroVar）、usePromptViewerStore、读侧 useSettingsStore/useRegexStore/useCharSheetStore；末端 `saveConversation` 落 Dexie v2（经 enqueue）；kv 读取 preset/extensions。

**关键类型**：`AssembledMessage {role; content}`、`ChatPreset`、`ChatCompletionResponse`（`.content`）、`ParsedLlmResult | null`（含 `.page`/`.darkThread`）、`Page`（leftHeader/leftContent/rightContent/rightChoices/keywords/summary/inventoryChanges/diceResults/id/acquiredItems）、`LoreEntry`（运行时常驻桶被合成为 LoreEntry）、`MacroContext`、`RewriteBlock`、`buildPromptMessages` 返回 `{messages; tokenCount; preset; liteSavedTokens} | null`。

**坑/边界**：

- 三入口（`submit` / `regenerate` replace=true / `rewriteAction` lite-lore + parseRewriteResponse + 独立 rewrite API）共用 `buildPromptMessages` + `sendWithJsonRetry`，回写路径不可混淆。
- 变量抽取三分支（LLM 辅助 / LLM 失败回退 / 门控关闭直走 `processResponse`）最终都汇于 useVariableStore 回写。
- 运行时常驻注入（暗线/关键词字典/statData 快照）是 `buildPromptMessages` 内合成的"伪 LoreEntry"，非真实世界书条目；lite/rewrite 模式经 `selectLoreForRewrite` 丢弃其中大部分。
- 中止检测用 `controller.signal.aborted` 而非 `err.name==='AbortError'`——非流式中止在 api-router 被重包为普通 Error，仅流式中止冒泡 AbortError。
- 开场首回合（pages.length≤1，`skipInventoryNarrativeCheck=true` 标识之）：起始装备【不再内联进 format 块】（曾被「无变化则省略 inventoryChanges」压过而整体丢失），改为解析成功后用独立 LLM 调用 `generateStartingItems` 据职业+情境生成 3-6 件、并入首页 `inventoryChanges`（与坏结局 `generateBadEnding` 同源解耦）；同步生成因背包是「页锚定」态须随首页持久化。`skipInventoryNarrativeCheck=true` 仍保留以放宽解析校验、兼容模型偶发直出物品。
- `savePages` 被调用两次（写页后 + `saveConversation` 前），刻意为之非 bug。
- 物品重复计数防护：`filterAlreadyAcquiredAdds` 须在 `applyChanges` 前对源页 `acquiredItems` 去重，否则 `applyChanges` 按名合并会翻倍。

## 提示词装配 + 世界书注入

**入口**：`src/sillytavern/prompt-assembler.ts:350` `assemblePrompt`（标称入口，但实际编排者是 `buildPromptMessages`，见坑位）。

**调用链**：

1. `src/hooks/useChatPipeline.ts:172` `buildPromptMessages` — 真正的编排者（useCallback）。取 overrideInput/formatOverride/opts(lite)，跑 TH onSend 钩子（183），由近期页构建上下文（`buildContextFromPages` 186），驱动整个装配。
2. `src/hooks/useChatPipeline.ts:189` `resolveActiveBooks` + 分桶循环 — 读 `useLorebookStore.books` + 会话 lorebookIds；`resolveActiveBooks`(193) 产出 scoped 书；循环(199-217) 按 keys(@INJECT、generate:before/after)、constant 标志、AUTO_SUMMARY_BOOK_ID 把条目分入 generateInjects/constant/summary/other 桶。
3. `src/sillytavern/prompt-assembler.ts:95` `matchLoreEntries` — ST 兼容匹配引擎，调用两次（otherEntries 244、summaryEntries 247）。5 阶段：主键匹配(112)、递归匹配(195)、包含组解析(220)、token 预算执行(275)、sticky/cooldown 回写 ref Map(288)。返回激活的 `LoreEntry[]`。
4. `src/hooks/useChatPipeline.ts:246` 概率过滤 + 额外桶 — `Math.random` 概率过滤(246)，summary 切到 maxSummaryEntries(249)，构建 constant/暗线/关键词字典(`buildKeywordInjection` 275)/statData 快照(`formatStatDataYaml` 304)/generate-inject/inverted 桶。
5. `src/sillytavern/rewrite-lite.ts:55` `selectLoreForRewrite` — 把所有桶合并为有序 matchedLore。非 lite：keyword→summary→constant→darkThread→keyword→statSnapshot→generateInjects→inverted；lite：constant ± matchedKeyword。`droppedLoreForRewrite`(79) 估算 lite 节省。
6. `src/hooks/useChatPipeline.ts:370` preset 加载 — 从 session/kvGet 解析 activePresetId，合并 DEFAULT_INPUT_PRESET + 内置 DEFAULT_PRESETS + 已存为 activePreset。
7. `src/sillytavern/ejs-template.ts:146` `renderTemplate` — EJS 渲染（disableWith/cache），应用于 systemPrompt(412)、每条 matchedLore.content(417-420)、格式指令(427)；`ensureFormatInstructionMarker`(411) 回填 marker。
8. `src/sillytavern/unified-macro-engine.ts:633` `resolveAllMacrosBatch` — 批量展开所有 `{{...}}` 宏，结果写回 processedPreset.systemPrompt/processedLore[i].content/input/resolvedFormat(450-455)，变更的 macroVars 持久化(459-462)。
9. `src/hooks/useChatPipeline.ts:470` `runAllRegexScripts` — 对宏/模板处理后的输入应用全局+preset 正则（placement 1 USER_INPUT，470-475），得 regexProcessedInput。
10. `src/hooks/useChatPipeline.ts:480` `sortByInsertionStrategy` + wbBefore/wbAfter — 按 position（0=before，否则 after）切分 processedLore，各按 worldInfoStrategy 排序(480-481)，拼成 wbBefore/wbAfter 字符串(482-483)——传给 assemblePrompt 的实际世界书注入文本。
11. `src/sillytavern/prompt-assembler.ts:350` `assemblePrompt` — 最终拍平器。按 order/enabled 排序过滤 preset.promptItems，逐 marker 经 `resolveMarkerContent`(312) 解析来源（worldInfoBefore/After=wbBefore/wbAfter，main=mainPrompt||systemPrompt，formatInstruction），`resolvePlaceholders`(8) 对 `{{...}}`（已预解析，空操作），推入 role/content，追加 format/history/input。返回 `AssembledMessage[]`（history=[]，vars={}）。
12. `src/sillytavern/context-manager.ts:48` `trimToBudget` — 裁剪到模型预算（`getModelBudget` 504）。保留 system（prompt+lore+format）与末条 user 消息，先裁最旧历史，可选摘要。返回 `{trimmed, summary, trimmedCount}`；summary 重新插入到 format 前(508-511)。
13. `src/hooks/useChatPipeline.ts:496` `usePromptViewerStore.setPrompt` — 存最终 messages+model+preset 名供 Prompt Viewer UI。`buildPromptMessages` 随后返回 `{messages:result.trimmed, tokenCount, preset, liteSavedTokens}`。
14. `src/hooks/useChatPipeline.ts:565` `handleSendFromPreview → sendChatCompletion` — 流程边界/消费者：`applyPostProcessing`(569) 后 `sendChatCompletion`(568) 发往 LLM。数组在此离开装配/注入流。

**触达的 store / DB**：localStorage via kvGet（coc_last_preset、coc_presets_v1）；`usePromptViewerStore.setPrompt`；`useTavernHelperStore.setMacroVar`；stickyStateRef/cooldownStateRef Map（由 matchLoreEntries Phase 5 写）；只读：useLorebookStore.books、useChatStore.sessions、useSettingsStore、useVariableStore.statData、useBookStore.pages、useKeywordStore.keywords、useDarkThreadStore、useCharSheetStore、useRegexStore。

**关键类型**：`AssembledMessage {role; content}`（prompt-assembler.ts:3）、`buildPromptMessages` 返回 `{messages; tokenCount; preset; liteSavedTokens}`、`MatchContext`（prompt-assembler.ts:20，caseSensitive/matchWholeWord/messageCount/stickyState Map/cooldownState Map/maxRecursionSteps/tokenBudget/charName/generationType/matchSources）、`LoreEntry & {_id?; _score?; _source?}`、`trimToBudget` 返回 `{trimmed; summary; trimmedCount}`。

**坑/边界**：

- 标称入口 `assemblePrompt`(350) 是**最终拍平器而非编排者**；真正流程在 `buildPromptMessages`(useChatPipeline.ts:172)，它是 `matchLoreEntries` 与 `assemblePrompt` 唯一的非测试调用者。
- `assemblePrompt` 以 history=[]、variables={} 被调用，因为 `buildPromptMessages` 已预解析宏/模板并把 lore 预渲染为 loreContent {before,after}；其内部 history 循环与 `resolvePlaceholders` 在主路径中等于空操作。
- `matchLoreEntries` Phase 5(288-293) 作为**副作用**改写传入的 sticky/cooldown Map（ref.current），定时效应跨回合持久。
- 概率过滤(246) 与包含组加权 roll(255) 用 `Math.random`——lore 选择**非确定性**。
- lite 模式（rewrite 路径）经 `selectLoreForRewrite` 丢弃 summary/darkThread/keyword/statSnapshot/generateInjects/inverted 桶。
- 流程边界：产出的 `AssembledMessage[]` 在 `handleSendFromPreview`(535) → `applyPostProcessing` → `sendChatCompletion`(568) 离开本流；LLM 调用在装配/注入边界之外。

## LLM API 路由（流式 + 非流式 + RPM 限流）

**入口**：`src/sillytavern/api-router.ts:16` `sendChatCompletion`

**调用链**：

1. `src/sillytavern/api-router.ts:16` `sendChatCompletion` — 入口。取 (messages, preset, baseUrl, apiKey, model, stream=false, onToken?, signal?, rpmKind='main')。`url = ${baseUrl}/chat/completions`。**先 await `rpmAcquire(rpmKind)`(30)** 再 fetch，随后 POST 由 preset 组装的 OpenAI 风格 body（preset.seed≥0 时才带 seed），按 stream 分支返回 `ChatCompletionResponse`。
2. `src/sillytavern/rpm-limiter.ts:43` `rpmAcquire` — RPM 闸。`resolveBucket(kind)` 选桶+limit；limit≤0 立即返回（不限流）；否则循环：`rpmEvaluate(histories[bucket], now, limit)`，回写保留时间戳，waitMs≤0 则推入 now 并返回（拿到 slot），否则 `setTimeout(min(waitMs+20, 5000))` 后重试。内存滑动窗口队列，无 DB 写。
3. `src/sillytavern/rpm-limiter.ts:31` `resolveBucket` — 读 `useSettingsStore.getState()`。`!perApiRpmEnabled` → `{bucket:'main', limit:rpmLimit}`（所有 kind 共用一窗，旧行为）；启用则 'mvu'→mvuRpmLimit、'rewrite'→rewriteRpmLimit、其余 main→rpmLimit。
4. `src/sillytavern/rpm-limiter.ts:15` `rpmEvaluate` — 纯核心。limit≤0 → `{kept:history, waitMs:0}`；否则 kept = now 前 WINDOW_MS(60s) 内的时间戳；kept.length<limit → waitMs 0；否则 waitMs = max(0, WINDOW_MS−(now−kept[0]))。无副作用。
5. `src/sillytavern/api-router.ts:34` fetch (POST /chat/completions) — RPM 闸放行后发请求。网络错误包为 `网络请求失败` Error 保留 cause(54-58)；`!response.ok` 读错误体（json 后 text 兜底）抛 `API错误 {status}: {detail}`(60-75)。
6. `src/sillytavern/api-router.ts:77` 流式分支 — `stream && response.body` 时经 reader 读 body，TextDecoder 解码入 buffer，按 `\n` 切分（最后半行留 buffer）；每完整行 `parseStreamChunk`，累积 token.content 入 fullContent 并按 delta 触发 onToken；遇 done 停。返回 `{content: fullContent}`（无 model 字段）。
7. `src/sillytavern/stream-parser.ts:6` `parseStreamChunk` — 把一条 SSE 行解析为 `StreamToken[]`。非 `data: ` 开头 → []；`data: [DONE]` → `[{done:true}]`；否则 JSON.parse 取 `choices[0].delta.content`。畸形 JSON 被吞（返 []）。纯函数。
8. `src/sillytavern/api-router.ts:109` 非流式分支 — `await response.json()`；`content = json.choices[0].message.content ?? ''`；返回 `{content, model: json.model}`。**唯一**填充 model 字段的路径。
9. `src/hooks/useChatPipeline.ts:568` 主生成调用点 — `sendWithJsonRetry.send` 内调用，messages 已后处理，preset、settings.{apiBaseUrl,apiKey,apiModel}、stream=streamRenderEnabled、流式时 onToken、controller.signal，默认 rpmKind 'main'。结果喂 `parseLlmResponse` + JSON 重试。
10. `src/hooks/useChatPipeline.ts:923` action-rewrite 调用点 — stream=false、onToken/signal 均 undefined、rpmKind='rewrite' → 走 rewrite 桶。结果喂 `parseRewriteResponse` + 重试。
11. `src/components/CharSheet/CharacterCreator.tsx:664` `quickFill`（第三调用者）— 角色创建器快速填充也调用 `sendChatCompletion`，是聊天管线外的另一 `ChatCompletionResponse` 生产者。

**触达的 store / DB**：`useSettingsStore`（getState() 只读：perApiRpmEnabled、rpmLimit、mvuRpmLimit、rewriteRpmLimit，均 clamp 0..3，0=无限）；模块级内存 `histories: Record<RpmKind, number[]>`（rpm-limiter.ts，由 rpmAcquire 写滑动窗口时间戳，**不持久化**，本流无 Dexie/DB 写）。

**关键类型**：`ChatCompletionRequest {messages; preset; stream?}`、`ChatCompletionResponse {content; model?}`、`RpmKind = 'main'|'mvu'|'rewrite'`、`rpmEvaluate → {kept:number[]; waitMs:number}`、`resolveBucket → {bucket:RpmKind; limit:number}`、`StreamToken {content?; done:boolean}`。

**坑/边界**：

- RPM 闸 `rpmAcquire` 在 fetch **之前**运行，可经 setTimeout 循环阻塞/await；每次重试 sleep ≤ min(waitMs+20, 5000)ms，循环至 slot 释放。
- `WINDOW_MS` 硬编码 60_000；limit≤0 完全禁用限流（rpmEvaluate 与 rpmAcquire 双双早返）。
- `histories` 是模块全局可变状态，全应用共享，仅 `_resetRpm`（测试助手）重置；`resolveBucket` 每次 acquire 重读设置，中途切换 perApiRpmEnabled 会重路由桶但**不迁移**已有时间戳。
- 流式路径返回 `{content}` **无 model**；仅非流式从 json.model 设 model。
- 流式解析依赖 `\n` 分隔 SSE，半行留 buffer 跨读；`parseStreamChunk` 静默丢弃畸形/空内容行，仅遇 `[DONE]` 或 done token 停。
- seed 条件省略：仅 preset.seed≥0 时发送（seed=-1 表随机）。
- 非 2xx 抛 `API错误 {status}`，网络层失败抛 `网络请求失败` 保留 cause；调用方（sendWithJsonRetry）处理 JSON 解析重试，不处理这些传输错误。
- AbortSignal **仅**接在主生成调用点；rewrite 调用点 signal=undefined，**action-rewrite 请求不可取消**。
- rpmKind 默认 'main'；`CharacterCreator.quickFill` 与流式主路径都用默认 'main' 桶，未启用 perApiRpmEnabled 时争用同一窗口，且 quickFill 不受桶拆分影响（始终 'main'）。

## LLM 响应解析（parseLlmResponse）

**入口**：`src/sillytavern/llm-response-parser.ts:293` `parseLlmResponse`

**调用链**：

1. `src/hooks/useChatPipeline.ts:578` parse 回调 → `parseLlmResponse(content, {skipInventoryNarrativeCheck})` — 入口调用者，content 是最终 LLM 回复，结果喂下游页构建/持久化（本流边界外）。
2. `src/sillytavern/llm-response-parser.ts:295` `coerceJsonObject(raw)` — 容错清洗+解析，返回 `{parsed, jsonStr, error}`；`!parsed` → `pushLog('warn')` + 返回 null(297-300)。
3. `src/sillytavern/llm-response-parser.ts:220` `normalizeStructuralPunct` — 字符串外结构标点归一（保护字符串值内 CJK 标点）。
4. `src/sillytavern/llm-response-parser.ts:238` `escapeStrayInnerQuotes` — 逐字符转义游离内部双引号，**仅**在 3 次 JSON.parse 循环的第 2 次重试(attempt==1)运行。
5. `src/sillytavern/llm-response-parser.ts:313` `useBookStore.getState().pages` — 读 store。sceneInfo 兜底：parsed.sceneInfo 缺失时复用末页 sceneInfo。
6. `src/sillytavern/llm-response-parser.ts:318` `extractVarTags(JSON.stringify(parsed))` — 正则抽取 `<var name=.. value=../>` 入 Record，merge 进 sceneInfo location/date/time/weather(322-325)。
7. `src/sillytavern/llm-response-parser.ts:330` `useVariableStore.getState().setVariable(k,v,'llm')` — **写 store**。逐变量持久化（source='llm'），try/catch 包裹（store 不可用容错）。
8. `src/sillytavern/llm-response-parser.ts:344` `useKeywordStore.getState().addKeywords(entries)` — **写 store**。把 parsed.keywords 中字符串项加入；pageKeywords 也附到返回页。
9. `src/sillytavern/llm-response-parser.ts:349` `cleanHeader(parsed.leftHeader/rightHeader)` — 剥 `<>{}` 格式残留，默认 '探索'/'行动'。
10. `src/sillytavern/llm-response-parser.ts:350` `stripMvu(parsed.leftContent/rightContent)` — 剥 MVU/var 标签，bold/em 归一为 `{{...}}` 关键词，单花括号关键词归一。
11. `src/sillytavern/llm-response-parser.ts:359` `cleanChoiceField(item.text/item.action)` — 清洗至多 4 个选项（stripVarTagsLoose + stripMvu + 去裸难度文本），补齐到 4 再切到 4(365-372)。
12. `src/sillytavern/llm-response-parser.ts:404` `itemNarrated(change.name, narrative)` — **硬闸**：add/remove 物品变更若名称未在 leftContent+rightContent 出现则丢弃（normForMatch + longestCommonSubstr）；equip/unequip/update 豁免；`skipInventoryNarrativeCheck` 时绕过。
13. `src/sillytavern/llm-response-parser.ts:434` `computeNextPageNumber()` / `computeNextRightPageNumber()` — 来自 context-builder.ts:40/48，计算新 BookPage 的左右页码。
14. `src/sillytavern/llm-response-parser.ts:429` `return {page: BookPage, darkThread?}` — 输出。组装 BookPage（crypto.randomUUID id、headers、content、choices、sceneInfo、summary、keywords、inventoryChanges）+ 可选 darkThread。返回 useChatPipeline；**parseLlmResponse 不写 useBookStore**。

**触达的 store / DB**：`useBookStore` — 仅读（getState().pages 作 sceneInfo 兜底，:313）；`useVariableStore` — 写 `setVariable(name,value,'llm')`(:330)；`useKeywordStore` — 写 `addKeywords`(:344)；`useLogStore` — 写 pushLog；本流无 Dexie/DB 写，BookPage 落盘在下游 useChatPipeline。

**关键类型**：`ParsedLlmResult {page:BookPage; darkThread?:DarkThreadData}`(:17)、`JsonCoercion {parsed; jsonStr; error}`(:169)、`DarkThreadData {development; progress; threatLevel; foreshadowing}`(:10)、`SceneInfo {date; weekday; time; weather; location}`、`BookPage`、`InventoryChange {action; name; category?; quantity?; description?; equipped?; equippable?}`、`ChoiceItem {num; text; action}`。

**坑/边界**：

- `parseLlmResponse` **不**把页写入 useBookStore——只返回 BookPage，持久化是调用方（useChatPipeline.ts:578）的事；易误读为写 store 流。
- `coerceJsonObject` 3 次重试：attempt 0=原始清洗串、attempt 1 剥零宽/空白、attempt 2 跑 `escapeStrayInnerQuotes`；后者仅末次触发，单遍心智模型看不到。
- store 调用是方法链（`.getState().X`），故 `parseLlmResponse` 的 outgoingCalls **不**列出 setVariable/addKeywords/pages——需对链式调用点手动 goToDefinition。
- `setVariable` 循环裹在 try/catch 静默吞错（'store 不可用'）——变量写入可能静默失败。
- add/remove 物品若名称未在叙事中出现则**静默丢弃**（itemNarrated 闸），除非传 `skipInventoryNarrativeCheck`；LLM 叙述松散可丢失合法物品。
- sceneInfo 增量改写：`<var>` 标签（location/date/time/weather）**覆盖** parsed.sceneInfo，即 var 标签胜过结构化 sceneInfo。
- choices 强制归一为恰好 4 个（'继续探索' 补齐后切片）——多/少都被静默矫正。
- `extractVarTags` 跑在 `JSON.stringify(parsed)` 上，扫描整个序列化对象（含转义引号），非原始文本。

## MVU 变量抽取 + JSON Patch 应用

**入口**：`src/sillytavern/mvu-extractor.ts:43` `extractVariablesWithLLM`（可选独立 LLM 抽取器；真正的 JSON Patch→statData 路径是 `useVariableStore.processResponse`）。

**调用链**：

1. `src/hooks/useChatPipeline.ts:607` `needLlmExtraction` 闸 — `mvuForceAlways || shouldUseLlmExtraction(text)`，且需 mvuUseIndependentApi + mvuApiKey。分流 LLM 路径或直走 processResponse。
2. `src/sillytavern/mvu-extractor.ts:32` `shouldUseLlmExtraction` — 仅当叙事有数值 stat 提示（理智/HP/眩晕…）**且**无显式 `<var`/`{{set:` 标签时返 true。纯闸，无写。
3. `src/sillytavern/mvu-extractor.ts:43` `extractVariablesWithLLM`（入口）— `rpmAcquire('mvu')` → POST `{EXTRACTOR_PROMPT, text}` 到独立 MVU API；解析 `{variables:[...]}`，**总是**再 merge 本地正则（`extractAllVariables` + `parseStatChanges`）。返回 `{variables:Record<string,string>, cleanedText}`。**不**调用 mvu-jsonpatch，**不**触 statData。
4. `src/sillytavern/mvu-extractor.ts:102` `extractAllVariables` / `parseStatChanges` — 本地正则补全（显式 `<var>`/`{{set:}}` 标签与叙事 stat 增量），结果叠加在 LLM vars 上。
5. `src/hooks/useChatPipeline.ts:622` `processResponse` + setVariable 循环 — 调 `st.processResponse(text)`（JSON Patch 路径），并把每个 LLM 抽取变量经 `st.setVariable(name,value,'llm')` 写入扁平 variables map；LLM 出错则只回退 processResponse(632)。
6. `src/stores/useVariableStore.ts:76` `processResponse` — 编排者。旧扁平抽取（`extractAllVariables`/`parseStatChanges`），用 `isCharsheetPath` 丢弃 `调查员.*` 叶，`mergeVariables` 合并；再走 JSON Patch 路径；最后 `set({variables:merged, statData:nextStatData})`。
7. `src/sillytavern/mvu-jsonpatch.ts:45` `extractJsonPatchBlocks` — 正则抽 `<UpdateVariable>...<JSONPatch>[ops]</JSONPatch>...</UpdateVariable>` 块（BLOCK_RE/INNER_RE），剥 ```json 围栏，逐块 JSON.parse，铺平 op 数组；畸形块跳过。返回未校验 `unknown[]`。
8. `src/stores/useVariableStore.ts:94` `structuredClone` + `applyMvuPatch` 调用 — ops>0 时深克隆 statData 入 nextStatData，读当前 sheet，定义 redirect 回调，调 applyMvuPatch；sheetChanged 则经 `useCharSheetStore.setSheet` 提交。
9. `src/sillytavern/mvu-jsonpatch.ts:189` `applyMvuPatch` — 逐 op：isPlainOp 守卫、需 string op；move 单独处理；`ptrToPath` 归一路径；先咨询 `redirect(dotPath,op,value)`（消费 `调查员.*`）；`isReadOnlyPath` 拦 `_`/`$` 段；switch 分派 replace/delta/insert|add/remove。原地改树。
10. `src/stores/useVariableStore.ts:99` redirect 回调 — `!isCharsheetPath` 返 false（引擎应用到 statData）；否则调 `applyCharsheetRedirect`，成功则更新 sheet + sheetChanged，**始终返 true** 以消费 `调查员.*`（阻止 statData 出现 char-sheet 叶）。
11. `src/sillytavern/mvu-charsheet-redirect.ts:40` `applyCharsheetRedirect` — 对数值字段（HP/SAN/MP current|max、`调查员.幸运`、`调查员.技能.X`→skills.X.current）的 replace/delta 返回**新** CharacterSheet；不支持的 op/path/非数值返 null。
12. `src/sillytavern/mvu-jsonpatch.ts:251` `applyReplace` — 根 `''` replace 经 Object.assign 合并；否则需路径已存在（hasPath）；VWD 二元组 `[value,desc]` 感知；旧值为 number 时 `coerceNumeric`；`setByPath`。
13. `src/sillytavern/mvu-jsonpatch.ts:278` `applyDelta` — 数值加。需已存在数值路径（或 number[0] 的 VWD 元组）；coerce 字符串 delta；非数报错；`setByPath(old+delta)`。
14. `src/sillytavern/mvu-jsonpatch.ts:309` `applyInsert`（insert/add）— 走/建容器链（数组 vs 对象由下一段是否 `-`/数字决定）；数组 `-` 追加、数字索引 splice、对象键赋值；容器为标量则报错。
15. `src/sillytavern/mvu-jsonpatch.ts:361` `applyRemove` — hasPath 守卫后 `unsetByPath`（数组 splice / 对象 delete）。
16. `src/sillytavern/mvu-jsonpatch.ts:373` `applyMove` — 读 from/to，对两端点 redirect 检查 + 只读守卫，`getByPath(from)` → `unsetByPath(from)` → `applyInsert(dest)`。
17. `src/stores/useVariableStore.ts:114` `set({variables, statData})` — 最终 zustand 写，提交合并扁平 variables + nextStatData 树。
18. `src/stores/sessionLifecycle.ts:110` saveSession statData blob — 落盘时把非空 statData 序列化为单一保留 gameVars 行 `__statData__` = JSON.stringify(statData)；load 重解析并回填旧扁平叙事路径。

**触达的 store / DB**：`useVariableStore`（variables 扁平 map + statData 嵌套树，由 processResponse `set()` 与 setVariable 写）；`useCharSheetStore`（sheet，redirect 改 `调查员.*` 时经 setSheet 写）；Dexie gameVars 表（statData 作单一保留行 `__statData__` 经 sessionLifecycle.saveSession 落盘，仅非空时）；`useSettingsStore`（只读：mvu* 门控/配置）。

**关键类型**：`MvuOp = replace|delta|insert/add|remove|move`(:8)、`ApplyOpts {redirect?(dotPath,op,value):boolean; onError?(msg)}`(:15)、`extractVariablesWithLLM → Promise<{variables; cleanedText}>`、`processResponse(text) → {cleanedText; extracted}`、`VariableStore.statData: Record<string,unknown>`（嵌套 世界/剧情/NPC/flags，**非** `调查员.*`）、VWD 二元组 `[value, desc]`、`CharacterSheet`、`GameVarRow` 保留名 `__statData__`。

**坑/边界**：

- **入口文件混淆**：`extractVariablesWithLLM`（mvu-extractor.ts）**不**调 mvu-jsonpatch、**不**写 statData——只产扁平 Record 并经 setVariable 推入 `useVariableStore.variables`。真正的 JSON Patch→statData 路径是 `useVariableStore.processResponse`，无论 LLM 抽取器是否运行**总是**被调用。
- 同一文本上跑**两套独立抽取系统**：扁平 `<var>`/`{{set:}}`/叙事正则（旧 variables map）与 `<UpdateVariable><JSONPatch>` ZOD ops（statData 树），互不相干，勿混淆。
- **真相边界**：任何 `调查员.*` 路径**始终**被 redirect 消费（即便 `applyCharsheetRedirect` 返 null/不可写也返 true），故 statData 永不存 char-sheet 叶——未识别的 `调查员.*` op 从 statData 与 sheet **双双静默丢弃**。
- `applyCharsheetRedirect` 仅支持数值字段（HP/SAN/MP current|max、luck、技能.X.current）的 replace/delta；insert/remove/move 与 `调查员.*` 身份字段不写 sheet（返 null → 仍被消费/丢弃）。
- `extractJsonPatchBlocks` 逐块吞畸形 JSON（不抛），且仅收 `<UpdateVariable>` 包裹内的 ops——裸 `<JSONPatch>` **不**被抽取。
- ops 出 `extractJsonPatchBlocks` 时未校验；校验在 applyMvuPatch 内逐 op 经 onError（此处默认空操作，故无效 op 静默失败）。
- `_`/`$` 起始段路径只读跳过（isReadOnlyPath）；空路径 replace 是整树 Object.assign 合并特例。
- delta/replace/remove 需路径**已存在**（hasPath）——对缺失路径 replace/delta 报错；仅 insert/add 创建缺失容器链。
- statData 仅非空时落 Dexie（空树不写 `__statData__` 行）；load 回填旧扁平叙事路径但 blob 胜出。
- BLOCK_RE/INNER_RE 用 global 标志 + 手动 lastIndex 重置，依赖共享模块级 regex 状态——此处因有重置故安全，但并发复用是隐患。

## 骰子检定（d100 五档 + 奖励/惩罚骰 + 暗骰）

**入口**：`src/sillytavern/dice-engine.ts:29` `determineResult`（纯数学层；实际由两条独立流消费）。

**调用链**：

1. `src/sillytavern/dice-engine.ts:7` `randD10` — 纯叶：`Math.floor(Math.random()*10)` → 单 d10(0-9)。
2. `src/sillytavern/dice-engine.ts:13` `d100` — 纯：tens+ones 组合（(0,0)→100，否则 t*10+o）。
3. `src/sillytavern/dice-engine.ts:29` `determineResult` — 纯五档分类器 (roll,target,sanCheck)→DiceResultType：100→大失败；SAN&&≥96→大失败；1→大成功；≤target/5 极难；≤target/2 困难；≤target 成功；!SAN&&target<50&&≥96 失误；否则失败。被 `useDiceStore.roll:37` 与 RightPage sanity 分支:215 调用，**不**被 rollWithBonus/rollOpposed 使用。
4. `src/sillytavern/dice-engine.ts:61` `rollDiceExpr` — 解析+掷多面表达式（'1D6+2' 等）→`{expr,total,rolls}|null`；拒 count≤0/>100、sides≤0/>1000、残留字符。被 RightPage 多面伤害:233 与 san 损失:218 调用。
5. `src/components/Dice/DicePanel.tsx:172` `handleRoll` — **流 A** UI 触发：调 `useDiceStore.roll()`，100ms 后读 `getState()` 驱动显示/音效/粒子/抖动/闪光。
6. `src/stores/useDiceStore.ts:27` `useDiceStore.roll` — **流 A** 核心：randD10 t,o；bonusDice≠0 则掷 bonus tens bt（bonus 取 min、penalty 取 max）；originalRoll=d100(t,o)、finalRoll=d100(ft,o)；resultType=`determineResult(finalRoll,target,sanCheck)`；mode==='opposed' 时掷对抗 d10；set() 入 store；再 `addRecord({skill, padded roll, target, type, time, page=useBookStore.pageIndex+1})`。
7. `src/stores/useDiceStore.ts:50` `useDiceStore.addRecord` — 输出汇：prepend DiceRecord 到 history 再 slice(0,20)。**仅内存 Zustand，无 DB 写**。也被 RightPage 流 B 经 getState().addRecord 直接调用。
8. `src/components/Dice/DiceHistory.tsx:170` DiceHistory render — 读侧：订阅 history 渲染记录列表。
9. `src/components/Book/RightPage.tsx:193` `fillInputBar` — **流 B** 入口：守卫最新页；parseCheckAction/parsePolyAction 选项文本；路由到多面（san/伤害）、暗骰、对抗或普通检定分支；构建结果行、addRecord、dispatch `'dice-roll-animate'` CustomEvent。
10. `src/components/Book/RightPage.tsx:110` `rollWithBonus` — **流 B** 普通/奖惩核心：3 个本地 d10（t1,t2,o）；bonus→min(t1,t2)、penalty→max；raw d100；**内联五档分类（无 SAN；target<50&&raw≥96 总是失误）——不调 determineResult**。返回 `{raw,resultType,label,bonusTens,tensUsed,tensAlt,ones}`。
11. `src/components/Book/RightPage.tsx:145` `rollOpposed` — **流 B** 对抗：掷玩家+对手 d100，内联 getResult 分类，经 RESULT_RANK 排名定 win/lose/draw（平局比 target）。**又一份内联五档重实现**。
12. `src/components/Book/RightPage.tsx:259` + `src/sillytavern/hidden-roll.ts:16` `stashHiddenRoll` — 暗骰写：对暗骰技能（isHiddenRollSkill）存 `{token, real}` 到 hidden-roll.ts 模块级单例 `pending`；只显遮罩 token，**不**入可见 history。
13. `src/sillytavern/hidden-roll.ts:21` `revealHiddenRolls` — 提交时：input 含 pending.token 则替换为真实结果行、清 pending、返回还原文本给 LLM；否则透传。
14. `src/components/Layout/InputBar.tsx:50` `handleSubmit` — 流末：`forLLM=revealHiddenRolls(trimmed)` 后 `pipeline.submit(forLLM)`——把还原文本送 LLM 而玩家保留遮罩。穿出骰子边界进入聊天管线。

**触达的 store / DB**：`useDiceStore`（tens/ones/finalTens/bonusTens/oppTens/oppOnes/originalRoll/finalRoll/resultType 由 roll() set；history[]（max 20）由 addRecord()，**仅内存无 DB**）；hidden-roll.ts 模块单例 `pending`；DOM CustomEvent `'dice-roll-animate'` / `'auto-submit-input'`；读侧 useBookStore.pageIndex、useCharSheetStore.sheet（resolveTargetFromSheet）。

**关键类型**：`DiceResultType`（crit-success|extreme-success|hard-success|success|failure|crit-failure）、`DiceExprResult {expr; total; rolls}`、`DiceRecord {skill; roll; target; type; time; page; kind?}`、`BonusType`（none|bonus|penalty）、`DiceMode`（check|opposed）、DiceStore shape。

**坑/边界**：

- **流 B 的 `rollWithBonus`/`rollOpposed` 内联重实现五档逻辑，不调 `determineResult`**；规则有别（无 SAN 参数，target<50&&raw≥96 总是失误）。仅面板流（useDiceStore.roll）与 sanity 分支用 determineResult——**重复逻辑可能漂移**。
- `useDiceStore.history` **仅内存**，slice(0,20) 上限，无 Dexie 持久化——刷新即丢。
- 暗骰依赖 hidden-roll.ts 模块级单例 `pending`（**单槽**）；第二次 stashHiddenRoll 覆盖第一次，revealHiddenRolls 提交时消费/清空。暗骰刻意**不**入可见 history。
- DicePanel 在 roll() 后 100ms setTimeout 内经 getState() 读结果（依赖同步 set() 已完成）。

## 角色创建向导

**入口**：`src/components/CharSheet/CharacterCreator.tsx:47` `CharacterCreator`

**调用链**：

1. `src/components/CharSheet/CharacterCreator.tsx:47` `CharacterCreator` — 编排者。从 useCharSheetStore 解构 setSheet(48)，~30 个 useState 持向导态，`renderStepContent`(764) 委派 Step*.tsx 子组件并下传 lifted 回调（adjChar/rollChar/handlePoolAssign/toggleOccSkill/adjOccPoint…）。
2. `src/components/CharSheet/CharacterCreator.tsx:95` `rollChar` / `randomAll` — 属性输入变换。查 `CHAR_ROLL[key]`（coc-rules）写入 charValues；pool 模式则 `handlePoolAssign`(107) 同写 poolAssignments + charValues。
3. `src/sillytavern/coc-rules.ts:15` `CHAR_ROLL` / `roll3D6` / `roll2D6` — 纯骰函数。STR/CON/POW/DEX/APP=3d6*5，SIZ/INT=(2d6+6)*5，EDU=min(99,(3d6+3)*5)。
4. `src/components/CharSheet/CharacterCreator.tsx:201` `derived`（useMemo）— Step3 自算：hpMax=floor((SIZ+CON)/10)、sanMax=POW、mpMax=floor(POW/5)、`getDBBuild(STR+SIZ)`。**仅展示**；持久副本在 handleConfirm 重算。
5. `src/sillytavern/coc-rules.ts:28` `getDBBuild` — 纯。STR+SIZ → `{db:string, build:number}` 分档。derived memo 与 handleConfirm 共用。
6. `src/components/CharSheet/CharacterCreator.tsx:485` `randomAllocate` — Step4 自动填充。查 COC_OCCUPATIONS、取 [crMin,crMax] 信用、设 occSkills=suggested，按 allocLoop（尊重 99-base 上限，getBaseVal）分配 occPointPool(=EDU*4)/intPointPool(=INT*2)。
7. `src/components/CharSheet/CharacterCreator.tsx:261` `adjOccPoint` / `adjIntPoint` — 手动点数。enforce remaining=pool−used（occ 含 creditRating via crRef），maxBySkill=99−base（getBaseForSkill）。
8. `src/components/CharSheet/CharacterCreator.tsx:34` `getBaseForSkill` — 本地助手，从 charValues 解析技能 base（number | DEX_HALF | EDU），点数封顶用。是 confirm 期 `resolveSkillBase` 的镜像。
9. `src/components/CharSheet/CharacterCreator.tsx:349` `handleConfirm`（useCallback）— **提交核心**。重建 chars（CHAR_ORDER→charValues），重算 hp/san/mp/db/build/halfFifth，构建 skills（信用评级←creditRating、克苏鲁神话=0、occSkills base via `resolveSkillBase` + occPoints + interestPoints 封顶 99，再 interest-only），生成 charId/finalOccupation、合并 8 段背景为 combinedDesc，组装 CharacterSheet，然后跑 teardown + 写入。
10. `src/sillytavern/coc-rules.ts:39` `resolveSkillBase` — 纯。spec number|DEX_HALF|EDU → base。handleConfirm 构建持久 skills 的权威 base。
11. `src/components/CharSheet/CharacterCreator.tsx:449` teardown（`cleanupOrphanGameState` + clearAll 链）— **落盘前**：cleanupOrphanGameState()；darkThread/inventory/variable `.clearAll()`；`variable.setStatData(createInitialStatData())`；`lorebook.clearSummaryEntries()`；`keyword.replaceAll({})`；`book.resetToPrologue()`。**顺序攸关**：clearAll 会把 char sheet 重置为默认，故必须在 setSheet 之前跑。
12. `src/stores/useCharSheetStore.ts:44` `setSheet`（Zustand set）— **store 写 #1**。`set({sheet})`，内存权威角色卡。
13. `src/stores/useChatStore.ts:44` `createSession`（Zustand persist set）— **store 写 #2**。crypto.randomUUID id，push 空 messages/pages 的新 ChatSession 并设 activeId，persist 中间件持久化，返回 newId。
14. `src/stores/sessionLifecycle.ts:174` `saveConversation` → `saveConversationInner` — **DB 写（fire-and-forget，void）**。enqueue；读内存 store，在 'rw' 事务 `db.conversations.put` + `db.charsheets.put({conversationId,sheet})`(139/147) + 子表 bulkPut。
15. `src/components/CharSheet/CharacterCreator.tsx:464` `onComplete()` — 流程边界出口。父回调关向导。**saveConversation 未 await**。

**触达的 store / DB**：useCharSheetStore（setSheet→sheet，内存权威）、useChatStore（createSession，zustand persist localStorage）、teardown 期重置 useDarkThreadStore/useInventoryStore/useVariableStore/useLorebookStore/useKeywordStore/useBookStore；Dexie via saveConversation（conversations.put、charsheets.put、pages/inventory/darkThreads/keywords/gameVars/macroVars.bulkPut）。

**关键类型**：`CharacterSheet`（characteristics、halfFifth、secondary{hp/san/mp{current,max}, luck, mov, db, build}、skills{base,current}、identity、greeting/description/personality/scenario/personaDescription）、`COC7Characteristic`、`charValues`、`poolAssignments`、`occSkills/interestSkills`、`occPoints/interestPoints`、`getDBBuild→{db,build}`、`resolveSkillBase spec: number|'DEX_HALF'|'EDU'`。

**坑/边界**：

- **顺序攸关**：clearAll 重置 char sheet 为 defaultSheet，故 teardown(449-458) 必须**先于** setSheet(460)。内联注释警告：setSheet 若前置会被擦除，使 saveConversation 读到默认 sheet 并因 isDefaultSheet 守卫跳过持久化 → 角色丢失。
- `derived`(201) 仅展示；handleConfirm 独立重算 hp/san/mp/db/build——同公式两份，编辑漂移风险。
- `getBaseForSkill`(本地,34) vs `resolveSkillBase`(coc-rules,39) 是点数封顶 vs 最终构建的重复 base 解析逻辑，须保持一致。
- `saveConversation(newId)` fire-and-forget（void，未 await）先于 onComplete()，持久化与向导关闭竞速，依赖 enqueue() 任务队列完成。
- handleConfirm 直读 charValues（非 pool assignments）；pool 模式须已经 handlePoolAssign/switchToFreeMode 把值镜像进 charValues，否则丢失。
- skills `信用评级` base=0/current=creditRating、`克苏鲁神话` 恒 0 硬编码；occ 技能 current=min(99, base+occAlloc+intAlloc)，故既在 occSkills 又在 interestSkills 的技能会把兴趣点折叠进 occ 条目（interest 循环经 continue@392 跳过 occSkills）。
- `createSession` 建**空**会话（无 pages/messages）；序章书页来自内存 `useBookStore.resetToPrologue()`，由 saveConversation 读当前书态单独持久化。

## 会话生命周期 + 持久化（Dexie v2 关系子表）

**入口**：`src/stores/sessionLifecycle.ts:309` `switchConversation`

**调用链**：

1. `src/stores/sessionLifecycle.ts:309` `switchConversation(id)`（公共入口）— 由 LoadGameModal.tsx:67、ChatlistPanel.tsx:84 调用。设 pendingTarget=id，**同步**捕获 prevId=useChatStore.activeId（P1-5），enqueue 单链步：latest-wins 守卫 pendingTarget，await `saveConversationInner(prevId)`、`setActive(id)`、await `loadConversationInner(id)`。用 *Inner（未排队）变体避免**自死锁**。
2. `src/stores/sessionLifecycle.ts:77` `enqueue<T>(fn)` — **单一全局序列化**。`chain.then(fn, fn)`（无论前步 resolve/reject 都跑 fn），chain 重赋为吞错续体使一次失败不毒化全链。save/load/delete/switch 共用**一条链**（非 per-cid），故跨 cid 操作（switch A 时 delete B）也序列化。
3. `src/stores/sessionLifecycle.ts:174` `saveConversation(cid)` → `saveConversationInner`（经 enqueue）— 公共 save 入口。incomingCalls：persistActivePages:342、persistActiveGameState:356、CharacterCreator.tsx:463、useChatPipeline.ts:753（每回合）。
4. `src/stores/sessionLifecycle.ts:90` `saveConversationInner(cid)` — **快照阶段**：经 getState() 读 8 store（useChatStore.sessions、useBookStore.pages、useCharSheetStore.sheet、useInventoryStore.items、useDarkThreadStore.entries、useKeywordStore.keywords、useVariableStore.variables+statData、useTavernHelperStore.macroVars）；!cid 或会话未找到则 bail。
5. `src/stores/sessionLifecycle.ts:104` 行变换（.map/Object.entries）— **变换阶段**：pages→PageRow、items→InventoryRow、entries→DarkThreadRow、keywords→KeywordRow、variables→GameVarRow、macroVars→MacroVarRow，建 ConversationRow 元数据（updatedAt=Date.now）。`isDefaultSheet(sheet)` 决定 charsheet 是否持久化。
6. `src/stores/sessionLifecycle.ts:110` statData → `__statData__` blob 行 — statData 非空时 push 保留 GameVarRow `{name:'__statData__', value:JSON.stringify(statData), …}`。嵌套 MVU 树作单一 blob，**不**铺平进 gameVars。
7. `src/stores/sessionLifecycle.ts:135` `db.transaction('rw', [8 表], ...)` — **原子写 Dexie**。每子表 `where('conversationId').equals(cid).delete()` 然后 `bulkPut(rows)`（仅 bulkPut 不会删已删行）；charsheets：非默认 put 否则 delete(cid)（P0-1）；`conversations.put`。流程边界=Dexie EntityTable API。
8. `src/stores/sessionLifecycle.ts:170` `useChatStore.savePages(pages)` — 写后同步内存 session pageCount（页已在关系表，不重复持久化）。
9. `src/stores/sessionLifecycle.ts:272` `loadConversation(cid)` → `loadConversationInner`（经 enqueue）— 公共 load 入口（也在 switch 内被调）。
10. `src/stores/sessionLifecycle.ts:184` `loadConversationInner(cid)` — **读阶段**：**单 'r' 事务** Promise.all 读 7 子表（P1-4，无读偏斜）。pages/inventory/darkThreads/keywords/gameVars/macroVars 经 where().equals().toArray()，charsheets 经 .get(cid)。
11. `src/stores/sessionLifecycle.ts:205` `clearAllGameState()` — restore **前**清内存（load=clear+set，无跨会话泄漏）：setSheet(defaultSheet)、inventory/darkThread/variable.clearAll、tavernHelper.setMacroVars({})、lorebook.clearSummaryEntries、keyword.replaceAll({})、book.resetToPrologue。
12. `src/stores/sessionLifecycle.ts:208` restore：剥关系键 + store setter — pages 按 index 排序剥键 setPages；`rebuildSummariesFromPages`(217) 重建派生 __auto_summaries lore；`setSheet(charRow?.sheet ?? defaultSheet)`（P0-1 无条件）；inventory 行 → `normalizeItems` → replaceAll；darkThread/keyword replaceAll。
13. `src/stores/sessionLifecycle.ts:236` gameVars 分流：variables vs __statData__ — 遍历 gameVarRows：name==='__statData__' → JSON.parse 入 statData 树（损坏→空，吞错）；否则扁平 variables[name]。旧回填(253)：dotted 非 charsheet 且树中无该路径时 `setTreePath(statData, vname, gv.value)`。然后 `replaceAll(variables)` + `setStatData(statData)`。
14. `src/stores/sessionLifecycle.ts:262` macroVars restore + active 同步 — macroVarRows→Record→`setMacroVars`；`setActive(cid)` + savePages(pages) 同步 active id 与 pageCount。
15. `src/stores/sessionLifecycle.ts:281` `deleteConversationInner(cid)` — **范围删除**：单 'rw' 事务删 conversations.delete(cid) + 7 子表 where().equals().delete()。公共 deleteConversation:300 经 enqueue 包裹（共享链防 delete/save 撕裂 → 无孤儿复活）。
16. `src/db/database.ts:63` `db`（Dexie 'abyssal_archive'）+ V2_SCHEMA — v1 kvStore；v2 增 conversations '&id,updatedAt'、pages '[conversationId+index],conversationId'、charsheets '&conversationId'、inventory/darkThreads/keywords/gameVars/macroVars 各复合 PK + conversationId 索引。
17. `src/db/database.ts:147` `upgradeV2(tx)`（一次性 v1→v2 迁移）— 跑于 db.version(2).upgrade。parseEnvelope 读旧 coc_chat_v1 blob，把每 LegacyChatSession 爆破为**同样**关系行（per-session gameState 胜过残留独立 blob）。幂等；从不删源 blob；抛错则写 _v2_upgrade_failed 标志并 re-throw 使 Dexie **中止**版本升级（verno 留 1，部分写回滚，blob 保留）→ 下次打开安全重试。

**触达的 store / DB**：Dexie DB 'abyssal_archive'（kvStore/conversations/pages/charsheets/inventory/darkThreads/keywords/gameVars/macroVars）；useChatStore、useBookStore、useCharSheetStore、useInventoryStore、useDarkThreadStore、useKeywordStore、useVariableStore、useTavernHelperStore、useLorebookStore（派生 __auto_summaries）。

**关键类型**：`ConversationRow {id,name,presetId,lorebookIds,messages,pageCount,createdAt,updatedAt}`(db/database.ts:19)、`PageRow = {conversationId,index} & BookPage`、`CharsheetRow {conversationId, sheet}`、`InventoryRow`、`DarkThreadRow`、`KeywordRow`、`GameVarRow`（含保留 `__statData__` blob 行）、`MacroVarRow`、`statData: Record<string,unknown>`、`LegacyChatSession/LegacyGameState/PersistEnvelope<T>`（迁移专用）。

**坑/边界**：

- 单一全局 enqueue 链刻意非 per-cid：跨 cid 操作（switch-A 时 delete-B）须一起序列化，否则 save 可能复活 delete 刚删的孤儿行。enqueue 逐步吞错使一次失败不毒化全链。
- switch/save/load 内部用 *Inner（未排队）变体；在 enqueue 步内调公共（已排队）版本会 await 自己持有的链 = **自死锁**。
- switchConversation 在 enqueue **前同步**捕获 prevId（P1-5）——在 .then 内读 activeId 会看到并发 createSession 改后的 id，存错会话。pendingTarget latest-wins 守卫跳过陈旧 load，await save 后再检查。
- save 用 delete-then-bulkPut（bulkPut 不删内存已删行，跳过 delete 会留陈旧行，如已删物品复活）。
- charsheets P0-1：默认/空白 sheet **不**持久化且删残留行，故加载无 sheet 会话不会被全零 sheet 覆盖；load 无条件 `setSheet(charRow?.sheet ?? defaultSheet)` 防前会话角色串味。
- statData 作单一保留 gameVars 行 `__statData__`（JSON blob），load 时从扁平 variables 滤出；损坏 JSON 吞为空树。旧扁平 dotted 叙事变量仅在树缺该路径时回填（blob 胜出）。
- load 在单 'r' 事务读全部 7 表避免读偏斜（两读间并发写提交会产生跨域不一致快照）。
- upgradeV2 刻意失败 re-throw 使 Dexie 中止版本升级（verno 留 1）——把永久静默部分迁移转为安全幂等重试；_v2_upgrade_failed 标志随事务回滚，真正信号是**未推进的版本号**而非标志。

## 统一宏引擎（ST 兼容宏展开）

**入口**：`src/sillytavern/unified-macro-engine.ts:633` `resolveAllMacrosBatch`（生产入口；`resolveAllMacros`@609 仅测试用）。

**调用链**：

1. `src/hooks/useChatPipeline.ts:430` macroCtx 装配 — 从 store 建 MacroContext：macroVars（useTavernHelperStore.macroVars 的**拷贝**）、presetVars、charVars、gameVars、statData（useVariableStore）、charName（useCharSheetStore）、userName、modelName（useSettingsStore）。
2. `src/hooks/useChatPipeline.ts:442` allTexts 数组 — `[processedPreset.systemPrompt, ...processedLore.content, macroProcessedInput, processedFormat]`。
3. `src/hooks/useChatPipeline.ts:448` `resolveAllMacrosBatch`（调用）— 传 allTexts + macroCtx，收 `MacroResult[]`。
4. `src/sillytavern/unified-macro-engine.ts:633` `resolveAllMacrosBatch` — 批量编排者，maxDepth 默认 5。建 sharedOutletMap + per-text allMutations + allTokens，依次调 protectEscapes、removeComments、collectInjects、iterativeResolve、fillOutlets、restoreEscapes、processTrim。
5. `src/sillytavern/unified-macro-engine.ts:644` `protectEscapes` — Phase 0a：把 `\{\{...\}\}` 转义宏换成 `\x00ESC{n}\x00ESC` token 以幸存展开。
6. `src/sillytavern/unified-macro-engine.ts:646` `removeComments` — Phase 0b：经 COMMENT_RE 剥 `{{// ...}}`。
7. `src/sillytavern/unified-macro-engine.ts:647` `collectInjects` — Phase 0c：手动 brace-depth 扫描提取 `{{inject::key::content}}`（处理嵌套 `{{}}`），content 入**共享** outletMap[key] 并从文本移除。
8. `src/sillytavern/unified-macro-engine.ts:651` `iterativeResolve` — Phase 1：fixpoint 循环至 maxDepth，文本不变则早停。按序跑 6 个解析 pass，并对每个 outlet 内容重跑(654)。
9. `src/sillytavern/unified-macro-engine.ts:596` `resolveIfBlocks` — Pass 1：tokenize `{{if}}/{{else}}/{{/if}}`（brace-depth 感知），innermost-first 经 `resolveCondition`（内部又调 resolveShorthands+resolvePlaceholders）求值，splice 真/假分支。安全上限 50。
10. `src/sillytavern/unified-macro-engine.ts:597` `resolveShorthands` — Pass 2：SHORTHAND_RE 处理 `{{.name}}`（局部）/`{{$name}}`（全局），op =,++,--,+=,-=,==,!=,>,<,>=,<=,||,??,||=,??=。**原地改 ctx.macroVars** 并对写 op 推 MacroMutation。
11. `src/sillytavern/unified-macro-engine.ts:598` `resolvePlaceholders` — Pass 3：带参宏（random/roll/newline/format_message_variable）+ 无参（char/user/model/lastmessage/time/date/weekday/newline/noop/trim）。`format_message_variable` 经 `formatStatDataYaml` 序列化 ctx.statData 子树（跨模块调 mvu-format）。trim 发 `\x01TRIM\x01` 哨兵。
12. `src/sillytavern/unified-macro-engine.ts:599` `resolveCommandMacros` — Pass 4：CMD_MACRO_RE 处理 getvar/setvar/addvar/incvar/decvar/hasvar/deletevar（+global 变体）。**原地改 ctx.macroVars** 并推 MacroMutation（scope local/global）。
13. `src/sillytavern/unified-macro-engine.ts:600` `resolveCompatLayer` — Pass 5：向后兼容 `{{get_*_variable}}`/`{{format_*_variable}}`（经 resolveCompatScope 跨 macroVars/presetVars/charVars 读）+ 旧 `<USER>`/`<BOT>`/`<CHAR>` 标签。只读无 mutation。
14. `src/sillytavern/unified-macro-engine.ts:601` `resolveFallbackVars` — Pass 6：FALLBACK_VAR_RE 末路 `{{name}}` 查 ctx.gameVars 再 ctx.charVars；未命中留原样。只读。
15. `src/sillytavern/unified-macro-engine.ts:657` `fillOutlets` — Phase 2：用 sharedOutletMap 解析内容（换行 join）替换 `{{outlet::key}}`。因 map 共享，**跨文本**填充。
16. `src/sillytavern/unified-macro-engine.ts:660` `restoreEscapes` — Phase 3a：把 `\x00ESC` token 还原为字面 `{{...}}`。
17. `src/sillytavern/unified-macro-engine.ts:661` `processTrim` — Phase 3b：移除 `\x01TRIM\x01` 哨兵（含周围空白）并 trim 首尾换行。返回 `MacroResult {text, outletMap(共享), mutations(per-text)}`。
18. `src/hooks/useChatPipeline.ts:457` macroVars diff + 持久化 — 消费输出：diff ctx.macroVars vs store.macroVars，对每个变更 key 调 `useTavernHelperStore.setMacroVar(key,val)`。**注意 mutations[] 不在此读**——持久化由 ctx.macroVars diff 驱动。
19. `src/stores/useTavernHelperStore.ts:153` `setMacroVar` — store 写：`set((s)=>({macroVars:{...s.macroVars,[name]:value}}))`。
20. `src/stores/useTavernHelperStore.ts:169` persist 配置（coc_th_v2 / createDexieStorage）— store 经 persist 中间件，storage=`createJSONStorage(createDexieStorage)`，name 'coc_th_v2' → 变更 macroVars 落 Dexie/IndexedDB。流程边界至此（解析后文本续往 assemblePrompt@useChatPipeline.ts:486）。

**触达的 store / DB**：`useTavernHelperStore`（persist 'coc_th_v2'，createJSONStorage(createDexieStorage)→Dexie/IndexedDB，经 setMacroVar 写）；`useVariableStore.statData`（读入 MacroContext.statData）；useCharSheetStore（读 charName）；useSettingsStore（读 modelName/worldInfoStrategy）；useBookStore（读 pages.length）。

**关键类型**：`MacroContext {macroVars; presetVars?; charVars; gameVars; statData?; charName; userName; modelName?; lastMessage?}`、`MacroResult {text; outletMap; mutations}`、`MacroMutation {op:'set'|'inc'|'dec'|'add'|'delete'; scope:'local'|'global'|'preset'; name; value}`、`IfToken {type; condition?; start; end}`、`outletMap: Map<string, string[]>`（批内共享）。

**坑/边界**：

- `resolveAllMacros`(609) 是单文本公共 API，但**生产仅用** `resolveAllMacrosBatch`(useChatPipeline.ts:448)；前者只有测试调用者。
- `MacroResult.mutations[]` 被产出但**生产管线不消费**——持久化靠 diff ctx.macroVars 对 store，mutations 日志实为记录/测试产物。靠 mutations 重放副作用是错的。
- ctx.macroVars 被 resolveShorthands/resolveCommandMacros **原地改**；useChatPipeline 刻意传**拷贝**（`{...store.macroVars}`，:431），故 live store 直到显式 diff/setMacroVar 持久化步才被改。
- 批模式 outletMap **跨所有文本共享**（sharedOutletMap），故一文本的 `{{inject::k::...}}` 填另一文本的 `{{outlet::k}}`——刻意跨文本接线，但若文本本不应共享作用域则有**串扰**风险。
- iterativeResolve 靠 fixpoint（文本不变即停）+ maxDepth=5 默认；超 5 层嵌套宏静默停展。resolveIfBlocks 自有 50 上限。
- collectInjects/tokenizeIfBlocks 用手动 brace-depth 扫描（非纯正则）处理嵌套 `{{}}`；不平衡括号会使其早停（depth!==0→break），可能留部分宏。
- TRIM(`\x01`)/ESCAPE(`\x00ESC`)用字面控制字符哨兵；若源内容本含这些控制字符会碰撞。
- format_message_variable 依赖 ctx.statData（来自 useVariableStore）；statData undefined 时默认 `{}` 序列化空 YAML，无错。

## 正则脚本引擎（运行时对消息文本执行用户正则脚本）

**入口**：`src/sillytavern/regex-engine.ts:123` `runAllRegexScripts`

**调用链**：

1. `src/hooks/useChatPipeline.ts:466-475` buildPromptMessages（USER_INPUT 调用点）— 第一入口。从 useRegexStore 收 globalScripts+presetScripts，调 `runAllRegexScripts(renderTemplate(macroProcessedInput, tmplOpts), placement=1, regexScripts, {isPrompt:true})`。输出 regexProcessedInput 喂下游 assemblePrompt。
2. `src/hooks/useChatPipeline.ts:590-599` handleSendFromPreview（AI_OUTPUT 调用点）— 第二入口，LLM 回复后。再收 globalScripts+presetScripts，调 `runAllRegexScripts(response.content, placement=2, aiOutputRegexScripts, {isMarkdown:true, isPrompt:true})`。输出 regexProcessedContent 传 `runReceiveHooks`——穿出本流入 TH 钩子引擎。
3. `src/stores/useRegexStore.ts:69` useRegexStore（数据源）— Zustand store 供 `RegexScript[]`。globalScripts 预置 2 个内置 MVU 清洗脚本（mvu-clean 剥 `<var .../>`、mvu-clean-set 剥 `{{set:...}}`）；presetScripts 起初空。**唯一**触达的 store；引擎本身不写任何 store/DB。
4. `src/sillytavern/regex-engine.ts:123` `runAllRegexScripts` — 编排者。空输入/空脚本守卫；滤掉 disabled(138)；按 substituteRegex 升序排(140)；逐脚本由 markdownOnly/promptOnly 对 isMarkdown/isPrompt 算 shouldRun(153-156)，options.depth 为数时应用 minDepth/maxDepth 闸(159-162)，检查 `script.placement.includes(placement)`(163)。对幸存脚本调 runRegexScript，结果前向串接。
5. `src/sillytavern/regex-engine.ts:60` `runRegexScript` — 逐脚本变换器。`getRegexString()`(84) 按 substituteRegex NONE/RAW/ESCAPED 算 regexString 并可选跑 variableResolver；从 `RegexProvider.instance.get(regexString)`(85) 取编译 RegExp，null 则 bail 回 rawString。跑 `rawString.replace(findRegex, callback)`——callback 替换 `{{match}}`、$1/$N、$<name> 命名组，逐组 trimStrings replaceAll，resolve() 最终替换。
6. `src/sillytavern/regex-engine.ts:10` `RegexProvider.get`（LRU 缓存）— 单例（static instance,8）按字符串键缓存编译 RegExp（Map，max 1000）。命中：键重插刷新 LRU；未命中：`regexFromString` 编译，满则逐出最旧。返回前对 global/sticky regex 重置 lastIndex=0 避免有状态 replace bug。
7. `src/sillytavern/regex-engine.ts:35` `regexFromString` — 编译器。经 `/^\/(.+)\/([gimsuy]*)$/` 解析 `/pattern/flags`；否则把整串当字面 pattern 配 'gm' 标志。无效正则返 null（try/catch）。流的叶子。

**触达的 store / DB**：`useRegexStore`（Zustand）——本流**只读**：globalScripts + presetScripts 供脚本列表。无 DB。引擎是纯文本变换器，自身不持久化。

**关键类型**：`RegexScript`(types/index.ts:317){id, scriptName, findRegex, replaceString, trimStrings, placement:RegexPlacement[], disabled, markdownOnly, promptOnly, runOnEdit, substituteRegex, minDepth, maxDepth}、`RegexPlacement = 1|2|3|5|6`（1=USER_INPUT, 2=AI_OUTPUT, 3=SLASH_COMMAND, 5=WORLD_INFO, 6=REASONING）、`SubstituteFindRegex = 0|1|2`（NONE|RAW|ESCAPED）、`options? {variableResolver?; isMarkdown?; isPrompt?; depth?}`、`RegexProvider.#cache: Map<string, RegExp>`（LRU, max 1000）。

**坑/边界**：

- 引擎**无 DB/store 写**——只返回变换后字符串。持久化在别处（调用方存入提示词装配 / 传给钩子）。
- 排序键(140)用 `substituteRegex`（NONE/RAW/ESCAPED）而非真正脚本类型优先级，尽管注释写 'global > scoped > preset'；substituteRegex 语义是关于变量替换，故排序实为**代理**，可能不反映预期 global/preset 优先级。
- `RegexProvider.get` 对 global/sticky regex 重置 lastIndex=0(25)——关键，因缓存 RegExp 跨调用复用，陈旧 lastIndex 会致 replace() 漏匹配。
- 命名组处理(95,104)：callback 取 `args[args.length-1]` 作 groups 但用 `typeof==='object'` 守卫；无命名组时末参是输入串，守卫正确跳过。微妙，注释有载。
- `getRegexString` RAW vs ESCAPED 分支(73-78)当前行为**相同**（都只调 variableResolver(findRegex)）；ESCAPED **并未实际转义**——潜在 latent bug / 未完成特性。
- 空守卫短路：runRegexScript 在脚本 disabled、findRegex 空、rawString 空时原样返回；runAllRegexScripts 无输入/无脚本时早返。
- regexFromString 对非 `/.../` 串回退为字面 pattern 配 'gm'，可能让传入含正则元字符纯文本的调用方意外。
- useChatPipeline 两调用点独立构建脚本数组（global+preset）但 placement/options 不同——USER_INPUT 在 renderTemplate 后跑，AI_OUTPUT 在 TH receive 钩子前跑。内置 MVU 清洗脚本仅 placement=2 + markdownOnly 触发，故影响显示的 AI 输出而非提示词。

## 跨流程观察

**显著耦合**

- **`buildPromptMessages`（useChatPipeline.ts:172）是隐形枢纽**：它既是"主聊天管线"的提示词装配阶段，又是"提示词装配+世界书注入""统一宏引擎""正则脚本引擎"三流的真正宿主与编排者。三个独立 walkthrough 的真实入口都收敛到这一个 useCallback——标称入口 `assemblePrompt`/`resolveAllMacrosBatch`/`runAllRegexScripts` 只是它内部按序调用的边界子系统。任何对装配顺序（EJS→宏→正则→排序→拍平→裁剪）的改动都会同时波及三流。
- **`statData` 是跨四流的共享真相载体**：响应解析流（parseLlmResponse 经 setVariable）与 MVU 流（processResponse 经 JSON Patch）写它，宏引擎（format_message_variable）读它，提示词装配（formatStatDataYaml 快照注入）把它注回提示词，会话生命周期把它作单一 `__statData__` blob 落盘。其更新路径有两套并存系统（扁平 variables map vs 嵌套 statData 树），且 `调查员.*` 被强制重定向到 useCharSheetStore——一个变量的"家"取决于路径前缀，易误判。
- **`sendChatCompletion` 是唯一 LLM 网关，但有三个语义不同的调用点**：主生成（'main' 桶、可流式、可取消）、action-rewrite（'rewrite' 桶、非流式、**不可取消**）、CharacterCreator.quickFill（'main' 桶）。RPM 限流靠模块级全局 `histories`，跨调用点共享，且 perApiRpmEnabled 中途切换不迁移时间戳。
- **`saveConversation`（sessionLifecycle）是所有写流程的统一落盘出口**：被每回合的主管线、角色创建（fire-and-forget）、switchConversation 内部调用。单一全局 enqueue 链把 save/load/delete/switch 串行化以防撕裂。
- **`useChatPipeline.submit` 是骰子流与主流的接合点**：InputBar 经 revealHiddenRolls 把暗骰还原文本送入 submit，骰子结果再经 parseDiceResultsFromInput 回流进 newPage。

**风险**

- **五档骰逻辑三份实现漂移**：`determineResult`（dice-engine）只被面板流与 sanity 分支用；RightPage 的 `rollWithBonus`/`rollOpposed` 各自**内联重实现**五档分类，规则有别（无 SAN、target<50&&raw≥96 总失误）。规则修改极易只改一处。
- **同公式双份**：CharacterCreator 的 `derived`(useMemo) 与 `handleConfirm` 各算一遍 hp/san/mp/db/build；`getBaseForSkill`(本地) 与 `resolveSkillBase`(coc-rules) 是封顶 vs 构建的重复 base 解析。
- **顺序攸关的隐式契约**：角色创建 teardown 必须先于 setSheet（否则 isDefaultSheet 守卫致角色不落盘）；switchConversation 必须同步捕获 prevId（否则存错会话）；save 必须 delete-then-bulkPut（否则陈旧行复活）；这些都靠注释而非类型系统保障。
- **静默丢弃链**：itemNarrated 硬闸丢未叙述物品、未识别 `调查员.*` op 双双丢弃、setVariable try/catch 吞错、extractJsonPatchBlocks 吞畸形块、宏超 5 层静默停展、parseStreamChunk 吞畸形 SSE——多处一致性/容错以静默 no-op 实现，调试时无信号。
- **非确定性**：matchLoreEntries 的概率过滤与包含组加权 roll 用 Math.random，lore 选择不可复现。
- **持久化竞速/单槽**：角色创建 saveConversation 未 await（与向导关闭竞速）；暗骰 `pending` 单槽（第二次暗骰覆盖第一次）；useDiceStore.history 仅内存（刷新即丢）。
- **不可取消的 rewrite 请求**：action-rewrite 调用点 signal=undefined。

**LSP 死角**（取证可靠性边界）

- **call-hierarchy 对 const 箭头/useCallback 普遍失效**：`submit`(779)、`buildPromptMessages`、`handleConfirm`、`useDiceStore.roll`/`addRecord` 等的 prepareCallHierarchy/outgoingCalls 均返 'No call hierarchy item'，因它们是 const arrow 而非 hoisted function 声明。这些流的调用关系全靠对调用点 goToDefinition + 对 import 语句标识符跳转 + Grep 确认，**非** call-hierarchy 自动推导。
- **方法链调用不被 outgoingCalls 列出**：`store.getState().X()` 形式（如 parseLlmResponse 内的 setVariable/addKeywords/pages）需手动对链式调用点 goToDefinition。
- **goToDefinition 列敏感**：cat -n 行号≠编辑器列，多次 goToDefinition 落到局部变量自身（如 568/578），改打 import 语句标识符（19-50 行）才正确解析。
- **TS server 崩溃**：sessionLifecycle.ts:14 对 `db` import 的 goToDefinition 触发 Debug Failure（position-of-line-character bug），改用 documentSymbol 导航。
- 据此，文档中的调用关系以 import 跳转 + hover 签名 + outgoingCalls/incomingCalls（对具名声明可用）+ documentSymbol + Grep 交叉确认为准，未凭 call-hierarchy 对箭头函数的空结果臆测任何边。