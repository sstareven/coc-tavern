# 流式刻印渲染 设计文档

日期：2026-06-09
作者：Claude + Lau Ka Chun
状态：待用户审批

## 0. 一句话

主推进 LLM 调用走 SSE 真流式；首个 chunk 触发翻页；左页正文按汉字逐字「高光→黑字」刻印出场；JSON 结构字符与 `<kw>/<san/>/<thinking>` 等 marker 字符全程不显示，闭合后内容直接呈现为关键词高亮 / SAN 气泡。右页（rightContent / choices / HP/SAN）维持现有「等 MVU 回来再放出」的政策。SettingsModal 加一个默认关的 Toggle。

## 1. 范围与非目标

### 1.1 范围
- 仅**主推进**那一次 LLM 调用（出主回合 JSON 的请求）。
- 仅 leftHeader / leftContent 两个字段参与流式刻印。
- SettingsModal 加 Toggle，默认关闭；现有行为为 fallback。
- SSE 不可用 / 流中断时**静默降级**为一次性请求，行为退化为现有非流式逻辑。

### 1.2 非目标（明确不做）
- MVU 综合、地图自检、剧本重写、NovelAI 提示词、标题等子调用**不**改为流式。`callDsSubagent` 不动。
- rightContent / choices / 顶部状态栏（HP/SAN）**不**逐字刻印——它们仍在主流结束 + MVU 完成后**整体一次性**呈现，保留现有「MVU 不跳变」政策。
- 不给用户暴露刻印节拍速度的设置项（写死 40ms/字）。
- 不动 callDsSubagent，不动 forceJsonObject 协议（json_object 模式与 SSE 在 DeepSeek/OpenAI 端均兼容）。

## 2. 现状

`src/sillytavern/stream-parser.ts` 已经能把 SSE 行解析为 `StreamToken { content?, done, usage? }`。

`src/hooks/useStreamingRenderer.ts` 已暴露 `streamingText / isStreaming / onToken / startStream / endStream / enabled`，受 `useTavernHelperStore.render.allowStreamRender` 开关控制；`useChatPipeline` 已经在 import 这套 hook，但当前 onToken 只把 chunk 拼成纯文本回显，不参与翻页或字段提取。

主推进的 fetch 与 SSE 收流逻辑已存在；本设计只是改造 onToken 路径与翻页时机，不重写网络层。

主回合返回字段顺序由 `FORMAT_INSTRUCTION` 钉死：sceneInfo → leftHeader → leftContent → rightHeader → rightContent → choices → keywords → summary → inventoryChanges → clues → darkThread → npcUpdates → sanityCheckPrompts → mapUpdates → currentLocationEcho；其后跟一个 `<UpdateVariable><JSONPatch>…</JSONPatch></UpdateVariable>` 块。LeftPage 渲染管线为 `renderContentWithCodeBlocks` → `splitTextWithSanBubbles` → `beautifyText`，识别 `<kw>` 高亮、`<san id="..."/>` 气泡。

## 3. 架构

```
SSE chunk ──► onToken(content)
                 │
                 ▼
         ┌──────────────────────┐
         │ streaming-json-walker│  状态机：在哪个顶层字段的字符串值里？
         └──────────────────────┘  只在 leftHeader / leftContent 里出字符
                 │ 叙事字符流
                 ▼
         ┌──────────────────────┐
         │      tag-mask        │  状态机：是否在 <kw>/<thinking>/<UpdateVariable> 内？
         └──────────────────────┘  分类：可见字符 / 隐藏字符 / 闭合事件（kw, san）
                 │ 渲染事件流：char | open-kw | close-kw | san-bubble | tag-strip
                 ▼
         ┌──────────────────────┐
         │  print queue (40ms)  │  raf 循环，按汉字逐字出场
         └──────────────────────┘
                 │ 已刻印 segment 数组
                 ▼
         ┌──────────────────────┐
         │ useStreamingPrinter  │  React state：streamingHeader, streamingSegments
         └──────────────────────┘
                 │
                 ▼
            LeftPage 渲染
```

四个纯函数模块 + 一个 React hook + 三个改动点（callMainApi / useChatPipeline / LeftPage）。

## 4. 数据流时序

| t | 事件 |
|---|---|
| t0 | 用户点选 choice，pipeline 启动；SettingsModal 流式开关=on |
| t1 | callMainApi 发出 `stream:true` 请求 |
| t2 | 拿到第一个 SSE chunk（任意 `delta.content` 非空，不必是叙事字符）→ dispatch 翻页，进度条进入「主输出·流式」阶段 |
| t3 | 翻页 1500ms 动画进行中；同时 SSE 持续来字。前置 chunk 通常是 `{"sceneInfo":{...},"leftHeader":"`，walker 先吃掉结构字符直到进入 leftHeader/leftContent 字段；玩家此时看到的是翻页过程，没有刻印负担 |
| t4 | 翻页结束（t2+1.5s 左右）；通常 leftHeader 已流到，leftContent 也已经在 push 字符。printer 开始 40ms/字出场，玩家看到正文一笔一笔刻 |
| t5 | leftContent 流完（json-walker 识别到 `,"rightHeader"`），右半边内容继续流但不显示 |
| t6 | 主流 `[DONE]`；把累积的完整 raw content 整体交给现有 `coerceJsonObject` / `strictJsonParse`，提取所有字段（含 leftContent 完整版作为对账之用，但**不重新刷新左页**——已刻印的就是最终态） |
| t7 | MVU 子调用照旧走非流式；MVU 回来 + 主 JSON 解析就绪 → 右页（rightContent / choices）/ 状态栏一次性呈现 |

t2~t4 是流式的核心收益：玩家在翻页过程中就看到正文开始刻印，避免空白等候。

t6 一次性 parse 路径与现有非流式分支共用同一个 parser，所以失败行为、json_object fallback、retry harness 完全继承。

### 中断兜底

任一中断（HTTP 4xx、SSE 连接断、chunk 超时、json_object 被拒、内容到 t6 仍无法 parse 出有效 JSON）：

1. 废掉已收 chunk 与已刻印 segments
2. 重置 streamingSegments、streamingHeader 为空，左页回归"刻印前空白"状态（但页已翻过去，回不到上一页）
3. 走现有的 `sendWithJsonRetry` 重试一次非流式拿完整 JSON
4. 拿到后用现有 LeftPage 路径整体写入，正文以「平淡 fadeIn」呈现（不再刻印）——区分"刻印失败的兜底页"与"流式成功的页"

### SSE 不可用降级

`callMainApi` 内置探测：

- 服务端对 `stream:true` 返回 4xx → 立即静默降级为 `stream:false` 同一请求
- 探测命中后**本会话**该 `apiBaseUrl` 缓存到 `unsupportedStreamingEndpoints` Set，后续不再尝试流式（参考已有的 `unsupportedJsonObjectModels` 模式）
- 第一个 chunk 30 秒超时 → 同上降级

降级时 UI 不弹错，按非流式路径走。`pushLog('warn', ...)` 留痕迹方便调试。

## 5. 组件设计

### 5.1 `src/sillytavern/streaming-json-walker.ts`（新文件，纯函数 + 类）

```ts
export type WalkerEvent =
  | { kind: 'enterField'; field: 'leftHeader' | 'leftContent' }
  | { kind: 'exitField' }
  | { kind: 'narrativeChar'; ch: string }
  | { kind: 'streamDone' };

export class StreamingJsonWalker {
  feed(chunk: string): WalkerEvent[];
  end(): WalkerEvent[];
}
```

只关心两个顶层字段的字符串值里的字符。其他字符（结构 `{}[],"` / 其他字段值 / `<UpdateVariable>` 块尾巴）都丢弃。

状态：`outside | inKey | afterKey | inValue<field>`；track 转义 `\"` `\\` `\n` 等，遇到非转义 `"` 关字段。

不需要解析完整 JSON——这是「过滤器」不是「parser」。

### 5.2 `src/sillytavern/streaming-tag-mask.ts`（新文件，纯函数 + 类）

```ts
export type MaskEvent =
  | { kind: 'visibleChar'; ch: string }
  | { kind: 'openKw' }
  | { kind: 'closeKw' }
  | { kind: 'sanBubble'; id: string }
  | { kind: 'enterHiddenBlock'; block: 'thinking' | 'updateVar' }
  | { kind: 'exitHiddenBlock' };

export class StreamingTagMask {
  feed(ch: string): MaskEvent[];
}
```

在 walker 输出的叙事字符流上叠一层：

- `<thinking>...</thinking>`：进入后直到 `</thinking>` 全程 emit 隐藏事件，期间字符不送给 UI
- `<UpdateVariable>...</UpdateVariable>`：同上（虽然 walker 已经过滤掉了 JSON 之外的尾巴，但为防万一 LLM 写到 leftContent 里）
- `<kw>` 标签：emit `openKw`，标签字符本身不可见，内部字符正常 visibleChar，遇 `</kw>` emit `closeKw`
- `<san id="p1"/>`：解析完自闭合直接 emit `sanBubble`，标签字符不可见
- 不识别的标签：保守起见原文透传（视为 visibleChar）

### 5.3 `src/hooks/useStreamingPrinter.ts`（新文件）

```ts
export interface PrintSegment {
  kind: 'text' | 'kw' | 'sanBubble';
  content?: string;
  sanId?: string;
}

export function useStreamingPrinter(): {
  push: (events: MaskEvent[]) => void;
  segments: PrintSegment[];
  headerText: string;
  reset: () => void;
};
```

内部用 ref 维护「待刻印队列」：`Array<MaskEvent>`。raf 循环消费队列：

- **节拍**：每个 `visibleChar` 事件占 **40ms**；`openKw` / `closeKw` / `sanBubble` / `enterHiddenBlock` / `exitHiddenBlock` 不占节拍，在 raf tick 里同帧顺序消费直到撞上下一个 `visibleChar`。这样 `<kw>词</kw>` 看起来就是"词"3 个字逐字浮现 + 闭合后那段变为高亮，不会因为标签事件吃掉 80ms 而错乱节奏。
- 节拍写死，不暴露
- visibleChar：append 到「当前 segment」（kw 内→当前 kw segment；否则→当前 text segment）
- openKw：push 新 `{ kind: 'kw', content: '' }` 到 segments 尾部，后续 visibleChar 进这里
- closeKw：「封口」当前 kw segment + push 一个新的空 text segment 接续
- sanBubble：push 一个 `{ kind: 'sanBubble', sanId }`

每个 char 进入 DOM 时套 CSS keyframe `streaming-ink`：

```css
@keyframes streaming-ink {
  0%   { color: rgba(196,168,85,1); text-shadow: 0 0 8px rgba(196,168,85,0.6); }
  60%  { color: rgba(196,168,85,0.6); text-shadow: 0 0 4px rgba(196,168,85,0.3); }
  100% { color: var(--ink); text-shadow: none; }
}
```

时长 0.45s，缓动用项目标准 `cubic-bezier(0.4, 0, 0.2, 1)`（符合 [[feedback_animation_bezier]]）。

### 5.4 `src/components/Book/LeftPage.tsx`（改造）

新增可选 prop：
```ts
streamingSegments?: PrintSegment[];
streamingHeader?: string;
isStreamingPrint?: boolean;
```

当 `isStreamingPrint=true`：跳过 `renderContentWithCodeBlocks` / `splitTextWithSanBubbles` / `beautifyText` 三层（这些都需要完整字符串），直接渲染 segments：

- text segment：`<span>{content}</span>`，每个新字外面套 `.streaming-ink-char` 触发 keyframe
- kw segment（封口后）：复用 `KeywordTooltipSpan` 组件的样式，但 keywords 字典还没回来（在 t6 才有）；先 fallback 用纯 `<kw>` 高亮样式，t6 后 keywords 注入再 re-render 时切到含 tooltip 的渲染
- sanBubble segment：直接渲染 `SanityBubble`，prompts 字典同样在 t6 后才到位；流式期间气泡不可点（disabled），t6 后激活

PageBanner（图片）流式期间不渲染——只有页完成时才知道要不要插图。

### 5.5 `src/hooks/useChatPipeline.ts`（改造）

在 `submit` / `regenerate` 主流程里：

1. 读 `useSettingsStore.streamingPrintEnabled`（新设置）
2. 若 on：build messages → 调 `callMainApiStream(messages, { onChunk })`；onChunk 内部跑 `walker.feed(chunk)` → `mask.feed(ch)` → `printer.push(events)`
3. 第一个有效 narrativeChar 到达时 dispatch `book.startFlip()`
4. SSE [DONE] 后把累积的完整 raw content 交给现有 `sendWithJsonRetry` 的 parse 路径（不发新请求），拿到完整解析对象后走原有的 createPage/saveConversation/MVU 流程
5. 中断/兜底：清掉 printer 状态、退到非流式 `sendWithJsonRetry`，等拿到再用现有 LeftPage 渲染

### 5.6 `src/sillytavern/main-api-call.ts`（改造点 ── 主推进 fetch）

> 实际文件名以代码现状为准（待 plan 阶段精确定位 callMainApi 的实现位置）。改造点：

新增 `callMainApiStream(...)`：fetch body 带 `stream: true`，循环读 `response.body.getReader()`，每行送 `parseStreamChunk`，回调 onChunk(content)。读完返回拼接的完整 content，让上层走 parser 一次。

`unsupportedStreamingEndpoints` Set 缓存不支持的中转站，命中直接走非流式分支。

### 5.7 `src/stores/useSettingsStore.ts`（改造）

新增 `streamingPrintEnabled: boolean`（默认 false）。

### 5.8 `src/components/Settings/...`（改造）

SettingsModal 现有「显示与渲染」相关那个 Section 加一行：

```
流式刻印  [OFF]  ──  推进时正文逐字浮现，翻页与生成并行
```

用现有 `<Toggle>` 组件。位置参考现有 `allowStreamRender`（如有就放它旁边）。

## 6. 边界与失败行为

| 场景 | 行为 |
|------|------|
| Settings 关 | 走现有非流式路径，零回归 |
| 中转站不支持 stream | 首请求 4xx 静默降级 + 缓存端点 + 本会话不再试 |
| 第一个 chunk 30s 超时 | 同上降级 |
| SSE 中途断流 | 清打字队列 + 重置 streamingSegments + 走非流式 sendWithJsonRetry |
| LLM 把 leftContent 写得不带 `<kw>` | 字符照打，只是没有高亮（符合现有 fallback） |
| LLM 漏写 `</kw>` 闭合 | mask 状态机限定 kw 段最长 N 字（如 30），强行 closeKw 并 warn；与现有 `stripOrphanKwTags` 同精神 |
| 单个 SSE chunk 包含上千字 | walker 把字符 push 进队列，printer 按 40ms 出字，可能积压 5-10 秒；接受（节奏感优先于实时性） |
| 用户中途打断（abort） | abort controller 触发，walker/printer reset；和现有 abort 路径一致 |
| forceJsonObject + stream 同传被某些端点拒 | 探测命中后该端点+model 同时进 unsupportedStream 与 unsupportedJsonObject 缓存 |

## 7. 测试计划

四个新模块都是纯函数 / 纯类：

- `streaming-json-walker.test.ts`：feed 一段 mock SSE 拼成的 JSON，断言只有 leftHeader/leftContent 内的字符 emit；转义、嵌套引号、Unicode、断 chunk 边界
- `streaming-tag-mask.test.ts`：feed 带 `<kw>` 嵌套关键词、`<san id="p1"/>`、`<thinking>` 块、孤立 `<kw>`、字符级断点的混合流，断言事件序列
- `useStreamingPrinter.test.ts`（vitest + RTL）：push 一批事件，断言 40ms tick 节奏与 segments 增长
- 集成：mock SSE response 喂给 useChatPipeline，断言 startFlip 在第一字符到达时触发、segments 在 t6 切到完整 LeftPage 渲染

不写 E2E。UI 验证由用户自己跑（符合 [[user-does-ui-testing]]）。

## 8. 不做的事 / 已显式放弃

- 不流式 MVU——MVU 是 JSONPatch，逐字毫无观感价值，且会冲掉「MVU 阻塞翻页」的数值稳定性
- 不流式 NovelAI 提示词子调用——它本就在后台异步生成图，与主回合解耦
- 不让用户调节拍速度——避免增加设置面板表面积
- 不复用 `useStreamingRenderer.streamingText`——它是「raw 文本回显」，与本方案的「过滤后逐字刻印」语义不同，并存即可（一个用于调试 raw 输出，一个用于玩家观感）
- 不动 [[worldbook-injection-architecture]]、[[mvu-extraction-off-critical-path]]、[[contextText-only-feeds-worldbook-matching]] 中任何约束

## 9. 跟踪的相关 memory

- [[max-tokens-min-20000]]：流式不影响 max_tokens 限制
- [[mvu-extraction-off-critical-path]]：右页与状态栏仍走 MVU 阻塞路径
- [[feedback_animation_bezier]]：刻印动画用 cubic-bezier(0.4, 0, 0.2, 1)
- [[no-emoji-use-ui-icons]]：Settings 行不带 emoji
- [[decoupling-modularity-required]]：四个新模块（walker / mask / printer / settings）相互独立
- [[user-does-ui-testing]]：仅写单测，UI 验证用户来
- [[ask-tavern-architecture-before-mechanism]]：本 spec 即为「架构接入确认」环节

## 10. 实施轮廓（详见后续 implementation plan）

1. settings store 加字段 + SettingsModal Toggle（最小起点，可独立验证）
2. `streaming-json-walker.ts` + 单测
3. `streaming-tag-mask.ts` + 单测
4. `useStreamingPrinter.ts` + 单测
5. LeftPage 加 streaming 渲染分支
6. callMainApi 改造（stream 模式 + 不支持端点缓存 + 降级）
7. useChatPipeline 接线：开关 → 走流式 → 首字符触发翻页 → t6 切完整渲染 → 中断兜底
8. CSS keyframe `streaming-ink` + `.streaming-ink-char`
9. 集成 smoke：本地跑一回合验证视觉、跑一次断流验证兜底、跑一次开关关闭验证回归
