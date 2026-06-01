# 右下角生成统计（本次 token 用量 + 耗时）实现编辑

目标：把 `TokenDisplay`（书本右下角）从「按当前页字数估算 token」改为显示**本次生成实际用量 + 耗时**。优先用 API 返回的真实 `usage`，拿不到则估算（前缀 `~`）。耗时为本次主生成的墙钟时间（含 JSON 重试）。

涉及文件：`stream-parser.ts`、`api-router.ts`、新增 `useGenStatsStore.ts`、`useChatPipeline.ts`、`TokenDisplay.tsx`。

每个 Task：精确编辑 → `npx tsc -b` 必须 EXIT 0 → `git add` 相关文件并提交（无 Co-Authored-By，不 push）。

---

## Task 1：usage 数据管线（stream-parser + api-router）

**文件**：`src/sillytavern/stream-parser.ts`、`src/sillytavern/api-router.ts`
**提交信息**：`feat(API): 解析 chat/completions 的 token usage（非流式+流式 include_usage）`

### 1.1 `stream-parser.ts` — 新增 usage 类型并在流块中解析

把开头的接口：
```ts
export interface StreamToken {
  content?: string;
  done: boolean;
}
```
改为：
```ts
export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface StreamToken {
  content?: string;
  done: boolean;
  usage?: TokenUsage;
}
```

把解析体：
```ts
    const parsed = JSON.parse(data);
    const content: string | undefined = parsed.choices?.[0]?.delta?.content;
    if (content) {
      tokens.push({ content, done: false });
    }
```
改为：
```ts
    const parsed = JSON.parse(data);
    const content: string | undefined = parsed.choices?.[0]?.delta?.content;
    if (content) {
      tokens.push({ content, done: false });
    }
    // include_usage 模式下，末尾有一个 choices 为空、仅含 usage 的块
    if (parsed.usage) {
      tokens.push({ done: false, usage: parsed.usage });
    }
```

### 1.2 `api-router.ts` — 类型、请求体、流式/非流式返回带上 usage

(a) 顶部导入补 TokenUsage：
```ts
import { parseStreamChunk } from './stream-parser';
```
改为：
```ts
import { parseStreamChunk, type TokenUsage } from './stream-parser';
```

(b) `ChatCompletionResponse` 接口补 usage 字段，把：
```ts
  content: string;
  model?: string;
}
```
改为：
```ts
  content: string;
  model?: string;
  usage?: TokenUsage;
}
```

(c) 流式请求体启用 usage 统计，把：
```ts
        stream,
      }),
```
改为：
```ts
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
```

(d) 流式分支捕获并返回 usage。把：
```ts
    let streamDone = false;
```
改为：
```ts
    let streamDone = false;
    let streamUsage: TokenUsage | undefined;
```
把 token 循环：
```ts
        const tokens = parseStreamChunk(line);
        for (const token of tokens) {
          if (token.content) {
            fullContent += token.content;
            if (onToken) onToken(token.content);
          }
          if (token.done) { streamDone = true; break; }
        }
```
改为：
```ts
        const tokens = parseStreamChunk(line);
        for (const token of tokens) {
          if (token.content) {
            fullContent += token.content;
            if (onToken) onToken(token.content);
          }
          if (token.usage) streamUsage = token.usage;
          if (token.done) { streamDone = true; break; }
        }
```
把流式返回：
```ts
    return { content: fullContent };
```
改为：
```ts
    return { content: fullContent, usage: streamUsage };
```

(e) 非流式返回带 usage，把：
```ts
  return { content, model: json.model };
```
改为：
```ts
  return { content, model: json.model, usage: json.usage };
```

---

## Task 2：生成统计 store + pipeline 计时/落库

**文件**：新增 `src/stores/useGenStatsStore.ts`；改 `src/hooks/useChatPipeline.ts`
**提交信息**：`feat(统计): 记录本次主生成的 token 用量与耗时到 useGenStatsStore`

### 2.1 新建 `src/stores/useGenStatsStore.ts`
```ts
import { create } from 'zustand';

/** 本次主生成（产出书页那次 LLM 调用）的 token 用量与耗时。会话级易失，不持久化。 */
interface GenStatsStore {
  totalTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  /** true = 无 API usage、按字数估算 */
  estimated: boolean;
  setStats: (s: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs: number;
    estimated: boolean;
  }) => void;
}

export const useGenStatsStore = create<GenStatsStore>((set) => ({
  totalTokens: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  estimated: false,
  setStats: (s) => set({
    totalTokens: s.totalTokens,
    promptTokens: s.promptTokens ?? null,
    completionTokens: s.completionTokens ?? null,
    durationMs: s.durationMs,
    estimated: s.estimated,
  }),
}));
```

### 2.2 `useChatPipeline.ts` 编辑

(a) 顶部导入区追加（紧跟现有 import）：
```ts
import { useGenStatsStore } from '../stores/useGenStatsStore';
import type { TokenUsage } from '../sillytavern/stream-parser';
```

(b) `sendWithJsonRetry` 透传 usage。把：
```ts
async function sendWithJsonRetry<T>(opts: {
  maxRetries: number;
  send: (corrective: boolean) => Promise<{ content: string }>;
  parse: (content: string) => T | null;
  logTag: string;
}): Promise<{ result: T | null; attempts: number; lastContent: string }> {
```
改为：
```ts
async function sendWithJsonRetry<T>(opts: {
  maxRetries: number;
  send: (corrective: boolean) => Promise<{ content: string; usage?: TokenUsage }>;
  parse: (content: string) => T | null;
  logTag: string;
}): Promise<{ result: T | null; attempts: number; lastContent: string; lastUsage?: TokenUsage }> {
```
把该函数结尾：
```ts
  return { result, attempts: attempt, lastContent: response.content };
}
```
改为：
```ts
  return { result, attempts: attempt, lastContent: response.content, lastUsage: response.usage };
}
```

(c) **仅主生成那处**（`runPipeline` 内、约 580 行，后接书页构建逻辑；**不是**约 983 行的行动补写那处）加计时并捕获 usage。把该处：
```ts
        const { result, attempts: attempt, lastContent } = await sendWithJsonRetry({
```
改为：
```ts
        const genStart = performance.now();
        const { result, attempts: attempt, lastContent, lastUsage } = await sendWithJsonRetry({
```
> 注意：约 983 行的补写调用若是相同字面量，请 Read 上下文区分，**只改主生成那处**。

(d) 写入统计。找到主生成成功后的这段日志（`API响应成功 — ...tokens...`）：
```ts
        pushLog(
          'info',
          `API响应成功 — ${response.content.length}字符, 总消耗~${estimateTokens(JSON.stringify(editedMessages)) + estimateTokens(regexProcessedContent)} tokens${attempt > 0 ? `（重试${attempt}次后成功）` : ''}`,
        );
```
在这段**之后**紧接插入：
```ts

        // 本次生成统计：优先用 API 真实 usage，拿不到则按消息/正文估算；耗时含 JSON 重试墙钟。
        {
          const durationMs = Math.round(performance.now() - genStart);
          const promptEst = estimateTokens(JSON.stringify(editedMessages));
          const completionEst = estimateTokens(response.content);
          if (lastUsage?.total_tokens != null) {
            useGenStatsStore.getState().setStats({
              totalTokens: lastUsage.total_tokens,
              promptTokens: lastUsage.prompt_tokens,
              completionTokens: lastUsage.completion_tokens,
              durationMs,
              estimated: false,
            });
          } else {
            useGenStatsStore.getState().setStats({
              totalTokens: promptEst + completionEst,
              promptTokens: promptEst,
              completionTokens: completionEst,
              durationMs,
              estimated: true,
            });
          }
        }
```

---

## Task 3：TokenDisplay 改为显示本次生成统计

**文件**：`src/components/Shared/TokenDisplay.tsx`
**提交信息**：`feat(UI): 右下角改显示本次生成的 token 用量与耗时`

把整个文件替换为：
```tsx
import { useGenStatsStore } from '../../stores/useGenStatsStore';
import { useBookStore } from '../../stores/useBookStore';

export function TokenDisplay() {
  const totalTokens = useGenStatsStore((s) => s.totalTokens);
  const promptTokens = useGenStatsStore((s) => s.promptTokens);
  const completionTokens = useGenStatsStore((s) => s.completionTokens);
  const durationMs = useGenStatsStore((s) => s.durationMs);
  const estimated = useGenStatsStore((s) => s.estimated);

  // 尚无本次生成数据（首次进入/读档）时，回退到按当前页字数的粗估
  const pageIndex = useBookStore((s) => s.pageIndex);
  const pages = useBookStore((s) => s.pages);

  let text: string;
  let title: string | undefined;
  if (totalTokens != null) {
    const sec = durationMs != null ? (durationMs / 1000).toFixed(1) : '?';
    text = `${estimated ? '~' : ''}${totalTokens.toLocaleString()} tok · ${sec}s`;
    if (promptTokens != null && completionTokens != null) {
      title = `本次生成${estimated ? '（估算）' : ''}：输入 ${promptTokens.toLocaleString()} · 输出 ${completionTokens.toLocaleString()} tokens`;
    }
  } else {
    const page = pages[pageIndex];
    const len = page ? page.leftContent.length + page.rightContent.length : 0;
    text = `~${Math.max(1, Math.floor(len / 2.5))} tokens`;
  }

  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        bottom: 8,
        right: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--ink-faded)',
        letterSpacing: 0.5,
        opacity: 0.5,
        pointerEvents: title ? 'auto' : 'none',
      }}
    >
      {text}
    </div>
  );
}
```

---

## 备注 / 风险
- 流式默认路径靠 `stream_options:{include_usage:true}` 拿真实用量；标准 OpenAI 字段，one-api/new-api/OpenRouter 均支持；个别端点不支持会忽略该字段 → usage 缺失 → 自动回退估算（带 `~`），不报错。
- 统计只记**主生成**（产出书页那次），不含已异步化的 MVU / 行动补写——符合「这次生成」语义。
- store 不持久化：读档/刷新后先显示页字数粗估，下次生成后即为真实值。
