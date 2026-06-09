# 流式刻印渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主推进 LLM 调用走 SSE 真流式，首个 chunk 触发翻页；leftHeader/leftContent 按汉字 40ms 逐字「高光→黑字」刻印；JSON 结构字符与 `<kw>/<san/>/<thinking>` 标签字符全程不显示，闭合后内容呈现为关键词高亮 / SAN 气泡。右页 / 状态栏维持现有 MVU 阻塞政策。

**Architecture:**
- 三个纯函数模块（streaming-json-walker / streaming-tag-mask / useStreamingPrinter）串成 raw chunk → 渲染事件 → 节拍化 segments 的管线
- 复用现有 `sendChatCompletion`（src/sillytavern/api-router.ts）已完成的 SSE 网络层，只替换 onToken 回调与翻页时机
- 设置面板加独立 Toggle `streamingPrintEnabled`，与既有 TavernHelper 的 `allowStreamRender`（raw 回显，调试用）解耦

**Tech Stack:** TypeScript / React 18 / Zustand / Vitest（单测）/ 纯 ts 类（无外部依赖）

参考设计文档：`docs/superpowers/specs/2026-06-09-streaming-print-design.md`

## 文件结构

新增文件：
- `src/sillytavern/streaming-json-walker.ts` — JSON 字段位置追踪状态机（纯类）
- `src/sillytavern/streaming-tag-mask.ts` — `<kw>/<san/>/<thinking>` 标签状态机（纯类）
- `src/sillytavern/__tests__/streaming-json-walker.test.ts`
- `src/sillytavern/__tests__/streaming-tag-mask.test.ts`
- `src/hooks/useStreamingPrinter.ts` — 节拍化刻印队列（React hook）
- `src/hooks/__tests__/useStreamingPrinter.test.ts`
- `src/stores/useStreamingPrintStore.ts` — 全局 streamingSegments 状态（避免三处 LeftPage prop 透传地狱）

修改文件：
- `src/stores/useSettingsStore.ts` — 加 `streamingPrintEnabled: boolean` 字段
- `src/components/Settings/SettingsPanel.tsx` — 加 Toggle 到「生成与稳定性」section
- `src/styles/global.css` — 加 `@keyframes streaming-ink` 与 `.streaming-ink-char`
- `src/components/Book/LeftPage.tsx` — 新增 streaming 渲染分支（接收 streamingSegments + isStreamingPrint）
- `src/components/Book/Storybook.tsx` — 把 useStreamingPrintStore 的当前 segments 传给当前页 LeftPage
- `src/hooks/useChatPipeline.ts` — 替换 onToken 回调走新管线 + 首 chunk 翻页 + 1804 行 alreadyFlipped 防二次翻页

---

## Task 1: settings store 加 streamingPrintEnabled 字段 + setter

**Files:**
- Modify: `src/stores/useSettingsStore.ts`
- Test: 手动 verify（store 改动太轻，跑 build 验类型即可）

**目标：** 提供新设置的开关源，默认关，IndexedDB 自动持久化。

- [ ] **Step 1.1: 读当前 SettingsState interface 与 defaults 段位置**

Run: `grep -n 'interface SettingsState\|const defaults\|setDarkMode' src/stores/useSettingsStore.ts | head -10`

记录：interface 段起始行、defaults 段起始行、setter 段起始行（实际行号以输出为准，不要照搬本文档示例）。

- [ ] **Step 1.2: 在 SettingsState interface 加字段**

找到 interface SettingsState 段，在 `cheatingUnlocked: boolean;` 行下方加：

```ts
  /** 流式刻印渲染:主推进走 SSE 真流式,首 chunk 触发翻页,leftContent 按汉字 40ms 逐字"高光→黑字"刻印。
   *  与 TavernHelper.render.allowStreamRender(raw 回显,调试用)解耦——默认关。 */
  streamingPrintEnabled: boolean;
```

并在 actions 段（toggleSound 附近）加：

```ts
  setStreamingPrintEnabled: (v: boolean) => void;
```

- [ ] **Step 1.3: 在 defaults 加默认值**

在 `cheatingUnlocked: false,` 行下方加：

```ts
  streamingPrintEnabled: false,
```

- [ ] **Step 1.4: 在 actions 实现里加 setter**

找到 `setDarkMode: (v) => set({ darkMode: v }),` 行下方加：

```ts
  setStreamingPrintEnabled: (v) => set({ streamingPrintEnabled: v }),
```

- [ ] **Step 1.5: 跑 tsc 验类型 + commit**

Run: `npx tsc -b 2>&1 | head -20`
Expected: 无新增 error。

```bash
git add src/stores/useSettingsStore.ts
git commit -m "feat(settings): 加 streamingPrintEnabled 开关字段(默认关)"
```

---

## Task 2: SettingsPanel 加流式刻印 Toggle

**Files:**
- Modify: `src/components/Settings/SettingsPanel.tsx`

**目标：** 设置面板「生成与稳定性」section 里多一行 Toggle 控制流式刻印。

- [ ] **Step 2.1: 精准定位「生成与稳定性」section 与一个真实 Toggle 调用点**

Run: `grep -n 'CategoryBar label="生成与稳定性"' src/components/Settings/SettingsPanel.tsx`

Run: `grep -B 2 -A 5 'Toggle' src/components/Settings/SettingsPanel.tsx | head -40`

记录：「生成与稳定性」CategoryBar 起始行 + 一个完整的现场 Toggle 行的真实结构（可能不是 `<Row>`，可能是裸 `<div style={{ display: 'flex' }}>` 包装；按现场风格走）。

- [ ] **Step 2.2: 加 Toggle 行**

在「生成与稳定性」CategoryBar 内,参考既有 Toggle 行的结构,加一行（具体语法跟现场代码风格走 — 不要照搬 TavernHelperContent 的 ToggleRow，用本文件已有的 row 函数）：

```tsx
<Row label="流式刻印">
  <Toggle
    on={settings.streamingPrintEnabled}
    onChange={() => settings.setStreamingPrintEnabled(!settings.streamingPrintEnabled)}
  />
</Row>
```

或者如果本文件用的是别的 row 函数（如 `<SettingRow>` / `<ToggleRow>`），用现场风格替换。**不带 emoji**（[[no-emoji-use-ui-icons]]）。**不带英文对照**（[[ui-pref-no-english-label]]）。

- [ ] **Step 2.3: 跑 build + commit**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

```bash
git add src/components/Settings/SettingsPanel.tsx
git commit -m "feat(settings): SettingsPanel 加流式刻印 Toggle(默认关)"
```

---

## Task 3: streaming-json-walker — 测试

**Files:**
- Create: `src/sillytavern/__tests__/streaming-json-walker.test.ts`

**目标：** 写 RED 测试，规定 walker 的输入输出契约。

- [ ] **Step 3.1: 写测试文件**

```ts
import { describe, it, expect } from 'vitest';
import { StreamingJsonWalker } from '../streaming-json-walker';

describe('StreamingJsonWalker', () => {
  it('丢弃非 leftHeader/leftContent 字段的字符', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"sceneInfo":{"time":"深夜"},"leftHeader":"序章"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('序章');
  });

  it('支持 leftContent 字段字符 emit', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"a","leftContent":"调查员推门进入"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('a调查员推门进入');
  });

  it('正确处理 chunk 边界:同一字段跨 chunk', () => {
    const w = new StreamingJsonWalker();
    const e1 = w.feed('{"leftContent":"调查');
    const e2 = w.feed('员推门"');
    const chars = [...e1, ...e2].filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('调查员推门');
  });

  it('JSON 转义反斜杠不被当字符:\\" 与 \\\\ 与 \\n', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftContent":"他说「\\"快走\\"」\\n然后"');
    const chars = events.filter((e) => e.kind === 'narrativeChar').map((e) => (e as { ch: string }).ch).join('');
    // \" → " ; \n → 换行
    expect(chars).toBe('他说「"快走"」\n然后');
  });

  it('emit enterField / exitField 事件', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"leftHeader":"标题","leftContent":"正文"}');
    const enters = events.filter((e) => e.kind === 'enterField').map((e) => (e as { field: string }).field);
    const exits = events.filter((e) => e.kind === 'exitField').length;
    expect(enters).toEqual(['leftHeader', 'leftContent']);
    expect(exits).toBe(2);
  });

  it('end() emit streamDone', () => {
    const w = new StreamingJsonWalker();
    w.feed('{"leftContent":"正文"}');
    const events = w.end();
    expect(events.some((e) => e.kind === 'streamDone')).toBe(true);
  });

  it('其他字段(rightContent / choices / sceneInfo)字符全丢', () => {
    const w = new StreamingJsonWalker();
    const events = w.feed('{"rightContent":"应该看不见","choices":[{"text":"A"}]}');
    const chars = events.filter((e) => e.kind === 'narrativeChar');
    expect(chars).toEqual([]);
  });
});
```

- [ ] **Step 3.2: 跑测试验证 RED**

Run: `npx vitest run src/sillytavern/__tests__/streaming-json-walker.test.ts 2>&1 | tail -20`
Expected: FAIL — 找不到 streaming-json-walker 模块。

- [ ] **Step 3.3: commit RED 测试**

```bash
git add src/sillytavern/__tests__/streaming-json-walker.test.ts
git commit -m "test(streaming): RED — streaming-json-walker 契约测试"
```

---

## Task 4: streaming-json-walker — 实现

**Files:**
- Create: `src/sillytavern/streaming-json-walker.ts`

**目标：** 实现 walker 让 Task 3 测试 GREEN。这是个有限状态机：跟踪当前是否在某个顶层字段的 value 字符串里。

- [ ] **Step 4.1: 写实现**

```ts
// 流式 JSON 字段过滤器 — 只关心 leftHeader / leftContent 两个顶层字段的字符串值里的字符。
// 不解析完整 JSON 树:这是一个"过滤器",不是 parser。其他字段的字符全部丢弃,结构字符(`{}[],"`)也丢。
//
// 状态机:
//   outside    — 还没进入 JSON 对象 / 在两字段之间的结构字符里
//   inKey      — 正在读 key 字符串("..." 之间)
//   afterKey   — 读完 key 等冒号
//   inValue    — 在某个目标字段的 value 字符串里(activeField 记录是哪个)
//   inValueNonTarget — 在非目标字段的 value 字符串里(只是为了正确识别字符串结束)
//
// 转义处理:value 字符串里遇 `\` 把下一字符按 JSON 转义规则解码后 emit(若仍在目标字段)。

export type WalkerEvent =
  | { kind: 'enterField'; field: 'leftHeader' | 'leftContent' }
  | { kind: 'exitField' }
  | { kind: 'narrativeChar'; ch: string }
  | { kind: 'streamDone' };

type State =
  | 'outside'
  | 'inKey'
  | 'afterKey'
  | 'inValueTarget'
  | 'inValueNonTarget';

const TARGET_FIELDS = new Set(['leftHeader', 'leftContent']);

export class StreamingJsonWalker {
  private state: State = 'outside';
  private keyBuf = '';
  private activeField: 'leftHeader' | 'leftContent' | null = null;
  private escape = false; // 上一字符是 `\`

  feed(chunk: string): WalkerEvent[] {
    const out: WalkerEvent[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (this.state === 'outside') {
        if (ch === '"') {
          this.state = 'inKey';
          this.keyBuf = '';
        }
        continue;
      }

      if (this.state === 'inKey') {
        if (this.escape) { this.keyBuf += ch; this.escape = false; continue; }
        if (ch === '\\') { this.escape = true; continue; }
        if (ch === '"') {
          this.state = 'afterKey';
          continue;
        }
        this.keyBuf += ch;
        continue;
      }

      if (this.state === 'afterKey') {
        if (ch === ':') continue;
        if (/\s/.test(ch)) continue;
        if (ch === '"') {
          // value 是字符串
          if (TARGET_FIELDS.has(this.keyBuf)) {
            this.state = 'inValueTarget';
            this.activeField = this.keyBuf as 'leftHeader' | 'leftContent';
            out.push({ kind: 'enterField', field: this.activeField });
          } else {
            this.state = 'inValueNonTarget';
          }
          continue;
        }
        // value 不是字符串(数字/对象/数组/布尔)— 直接回外面,等下一个 key
        this.state = 'outside';
        continue;
      }

      if (this.state === 'inValueTarget' || this.state === 'inValueNonTarget') {
        if (this.escape) {
          if (this.state === 'inValueTarget') {
            const decoded = decodeJsonEscape(ch);
            out.push({ kind: 'narrativeChar', ch: decoded });
          }
          this.escape = false;
          continue;
        }
        if (ch === '\\') { this.escape = true; continue; }
        if (ch === '"') {
          if (this.state === 'inValueTarget') {
            out.push({ kind: 'exitField' });
            this.activeField = null;
          }
          this.state = 'outside';
          continue;
        }
        if (this.state === 'inValueTarget') {
          out.push({ kind: 'narrativeChar', ch });
        }
      }
    }
    return out;
  }

  end(): WalkerEvent[] {
    return [{ kind: 'streamDone' }];
  }
}

/** JSON 字符串转义:\" → " / \\ → \ / \n → 换行 / \t → tab / \r → \r / 其他原样。
 *  Unicode `\uXXXX` 这里不处理(主推进 LLM 用中文,极少触发;万一触发会显示 4 字符,可接受)。 */
function decodeJsonEscape(ch: string): string {
  switch (ch) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case 'b': return '\b';
    case 'f': return '\f';
    default: return ch;
  }
}
```

- [ ] **Step 4.2: 跑测试验证 GREEN**

Run: `npx vitest run src/sillytavern/__tests__/streaming-json-walker.test.ts 2>&1 | tail -20`
Expected: PASS — 7 tests pass。

如果有 FAIL，读 fail 信息修实现，不要修测试。

- [ ] **Step 4.3: commit**

```bash
git add src/sillytavern/streaming-json-walker.ts
git commit -m "feat(streaming): streaming-json-walker 状态机过滤主 JSON 叙事字段"
```

---

## Task 5: streaming-tag-mask — 测试

**Files:**
- Create: `src/sillytavern/__tests__/streaming-tag-mask.test.ts`

**目标：** 规定 tag mask 的输入输出契约。

- [ ] **Step 5.1: 写测试文件**

```ts
import { describe, it, expect } from 'vitest';
import { StreamingTagMask } from '../streaming-tag-mask';

describe('StreamingTagMask', () => {
  function feedAll(m: StreamingTagMask, s: string) {
    const events = [];
    for (const ch of s) events.push(...m.feed(ch));
    return events;
  }

  it('普通字符 emit visibleChar', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '调查员');
    const chars = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('调查员');
  });

  it('<kw>词</kw>:tag 字符不可见,内容 visibleChar,且 emit openKw/closeKw', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a<kw>词</kw>b');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('a词b');
    expect(events.some((e) => e.kind === 'openKw')).toBe(true);
    expect(events.some((e) => e.kind === 'closeKw')).toBe(true);
  });

  it('<san id="p1"/>:自闭合,emit sanBubble(id="p1"),tag 字符不可见', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '正文<san id="p1"/>后续');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('正文后续');
    const sanEvents = events.filter((e) => e.kind === 'sanBubble');
    expect(sanEvents.length).toBe(1);
    expect((sanEvents[0] as { id: string }).id).toBe('p1');
  });

  it('<thinking>:进入后字符全隐藏,直到 </thinking>', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '前<thinking>推演内容</thinking>后');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('前后');
  });

  it('<UpdateVariable>...</UpdateVariable>:进入后字符全隐藏', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '前<UpdateVariable>[补丁]</UpdateVariable>后');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('前后');
  });

  it('孤立 </kw>(无 <kw>) 不崩,作为可见字符或静默吞掉', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a</kw>b');
    // 静默吞掉孤立闭合标签(更接近 stripOrphanKwTags 精神)
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('ab');
  });

  it('未识别的标签(如 <abc>)原文透传为 visibleChar', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a<abc>x</abc>b');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('a<abc>x</abc>b');
  });

  it('kw 段超过 30 字未闭合 → 强行 closeKw(spec § 6 边界硬约束)', () => {
    const m = new StreamingTagMask();
    const longText = '正常字'.repeat(15); // 45 字
    const events = feedAll(m, `<kw>${longText}`);
    const closeCount = events.filter((e) => e.kind === 'closeKw').length;
    expect(closeCount).toBeGreaterThanOrEqual(1);
  });

  it('支持逐字符跨多次 feed 调用 — 状态机 instance 字段保持', () => {
    const m = new StreamingTagMask();
    // 标签拆成 5 段 feed
    const events = [
      ...m.feed('<'),
      ...m.feed('k'),
      ...m.feed('w'),
      ...m.feed('>'),
      ...m.feed('词'),
      ...m.feed('<'),
      ...m.feed('/'),
      ...m.feed('k'),
      ...m.feed('w'),
      ...m.feed('>'),
    ];
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词');
    expect(events.some((e) => e.kind === 'openKw')).toBe(true);
    expect(events.some((e) => e.kind === 'closeKw')).toBe(true);
  });
});
```

- [ ] **Step 5.2: 跑测试验证 RED**

Run: `npx vitest run src/sillytavern/__tests__/streaming-tag-mask.test.ts 2>&1 | tail -20`
Expected: FAIL — 找不到 streaming-tag-mask 模块。

- [ ] **Step 5.3: commit RED 测试**

```bash
git add src/sillytavern/__tests__/streaming-tag-mask.test.ts
git commit -m "test(streaming): RED — streaming-tag-mask 契约测试"
```

---

## Task 6: streaming-tag-mask — 实现

**Files:**
- Create: `src/sillytavern/streaming-tag-mask.ts`

**目标：** 实现 mask 让 Task 5 测试 GREEN。**逐字符 feed 支持跨调用状态保持**（inTagBuf / hiddenBlock / kwOpenCount 是 instance 变量，walker 的 narrativeChar 流可以一字一字喂进来，不必担心 chunk 边界）。

- [ ] **Step 6.1: 写实现**

```ts
// 流式标签遮罩 — 在 walker 输出的叙事字符流上叠一层:
//   - <kw>...</kw>: emit openKw/closeKw, 标签字符不可见, 内部字符正常 visibleChar
//   - <san id="..."/>: 自闭合, emit sanBubble{id}, 标签字符不可见
//   - <thinking>...</thinking>: 进入后所有字符隐藏,直到 </thinking>
//   - <UpdateVariable>...</UpdateVariable>: 同上
//   - 孤立 </kw>(无配对 <kw>): 静默吞掉(对齐 stripOrphanKwTags 的精神)
//   - 未识别标签: 原文透传为 visibleChar(保守)
//
// 边界硬约束(spec § 6):
//   - kw 段累积超过 KW_SEGMENT_MAX_CHARS 字符仍未遇 </kw> → 强行 emit closeKw + 警告日志(防 LLM 漏闭合吞后文)
//
// 设计:逐字符喂入【支持跨多次调用】。所有状态(inTagBuf/tagBuf/hiddenBlock/kwOpenCount/kwCharsSinceOpen)
// 都是 instance 字段,walker 的 narrativeChar 流可以一字一字喂进来,不必担心 chunk 边界。
// 缓冲超长(>64 字符)视为非标签,把 < 与缓冲内容当 visibleChar 吐(防 LLM 漏写 > 把后面正文全吞)。

export type MaskEvent =
  | { kind: 'visibleChar'; ch: string }
  | { kind: 'openKw' }
  | { kind: 'closeKw' }
  | { kind: 'sanBubble'; id: string }
  | { kind: 'enterHiddenBlock'; block: 'thinking' | 'updateVar' }
  | { kind: 'exitHiddenBlock' };

type HiddenBlock = 'thinking' | 'updateVar' | null;

const KW_SEGMENT_MAX_CHARS = 30;

export class StreamingTagMask {
  private inTagBuf = false;
  private tagBuf = '';
  private hiddenBlock: HiddenBlock = null;
  private kwOpenCount = 0;
  private kwCharsSinceOpen = 0; // 已 open 后累积的可见字符数(开新 kw 时清零)

  feed(ch: string): MaskEvent[] {
    const out: MaskEvent[] = [];

    if (this.hiddenBlock) {
      if (!this.inTagBuf && ch === '<') {
        this.inTagBuf = true;
        this.tagBuf = '';
        return out;
      }
      if (this.inTagBuf) {
        if (ch === '>') {
          const tag = this.tagBuf;
          this.inTagBuf = false;
          this.tagBuf = '';
          if (
            (this.hiddenBlock === 'thinking' && tag === '/thinking') ||
            (this.hiddenBlock === 'updateVar' && tag === '/UpdateVariable')
          ) {
            out.push({ kind: 'exitHiddenBlock' });
            this.hiddenBlock = null;
          }
          return out;
        }
        this.tagBuf += ch;
        if (this.tagBuf.length > 64) {
          this.inTagBuf = false;
          this.tagBuf = '';
        }
        return out;
      }
      return out;
    }

    if (this.inTagBuf) {
      if (ch === '>') {
        const tag = this.tagBuf;
        this.inTagBuf = false;
        this.tagBuf = '';
        this.decideTag(tag, out);
        return out;
      }
      this.tagBuf += ch;
      if (this.tagBuf.length > 64) {
        out.push({ kind: 'visibleChar', ch: '<' });
        for (const c of this.tagBuf) out.push({ kind: 'visibleChar', ch: c });
        this.inTagBuf = false;
        this.tagBuf = '';
      }
      return out;
    }

    if (ch === '<') {
      this.inTagBuf = true;
      this.tagBuf = '';
      return out;
    }

    // 普通可见字符 — 如果在 kw 段里,累计并检查上限
    out.push({ kind: 'visibleChar', ch });
    if (this.kwOpenCount > 0) {
      this.kwCharsSinceOpen++;
      if (this.kwCharsSinceOpen >= KW_SEGMENT_MAX_CHARS) {
        // LLM 漏写 </kw> 防护 — 强行闭合 + 日志(用 console.warn,避免引入 pushLog 循环依赖)
        console.warn(`[streaming-tag-mask] kw 段超过 ${KW_SEGMENT_MAX_CHARS} 字仍未闭合,强行 closeKw`);
        this.kwOpenCount--;
        this.kwCharsSinceOpen = 0;
        out.push({ kind: 'closeKw' });
      }
    }
    return out;
  }

  private decideTag(tag: string, out: MaskEvent[]): void {
    const t = tag.trim();

    if (t === 'kw') {
      this.kwOpenCount++;
      this.kwCharsSinceOpen = 0;
      out.push({ kind: 'openKw' });
      return;
    }
    if (t === '/kw') {
      if (this.kwOpenCount > 0) {
        this.kwOpenCount--;
        this.kwCharsSinceOpen = 0;
        out.push({ kind: 'closeKw' });
      }
      return;
    }
    if (t === 'thinking') {
      out.push({ kind: 'enterHiddenBlock', block: 'thinking' });
      this.hiddenBlock = 'thinking';
      return;
    }
    if (t === 'UpdateVariable') {
      out.push({ kind: 'enterHiddenBlock', block: 'updateVar' });
      this.hiddenBlock = 'updateVar';
      return;
    }
    const sanMatch = /^san\s+id\s*=\s*"([^"]+)"\s*\/?$/.exec(t);
    if (sanMatch) {
      out.push({ kind: 'sanBubble', id: sanMatch[1] });
      return;
    }
    out.push({ kind: 'visibleChar', ch: '<' });
    for (const c of tag) out.push({ kind: 'visibleChar', ch: c });
    out.push({ kind: 'visibleChar', ch: '>' });
  }
}
```

- [ ] **Step 6.2: 跑测试验证 GREEN**

Run: `npx vitest run src/sillytavern/__tests__/streaming-tag-mask.test.ts 2>&1 | tail -20`
Expected: PASS — 9 tests pass。

- [ ] **Step 6.3: commit**

```bash
git add src/sillytavern/streaming-tag-mask.ts
git commit -m "feat(streaming): streaming-tag-mask 状态机 (kw/san/thinking/UpdateVar) + 长 kw 段防护"
```

---

## Task 7: useStreamingPrintStore — 全局 segments 状态

**Files:**
- Create: `src/stores/useStreamingPrintStore.ts`

**目标：** 把刻印 segments 放在全局 store，避免 Storybook 三处 LeftPage 调用点都得透传 prop。

- [ ] **Step 7.1: 写 store**

```ts
// 全局流式刻印状态 — useStreamingPrinter hook 写,Storybook/LeftPage 读。
// 不持久化(每回合独立),会话切换时 reset。

import { create } from 'zustand';

export interface PrintSegment {
  /** text: 普通可见字符;kw: 关键词(高亮);sanBubble: SAN 检定气泡 */
  kind: 'text' | 'kw' | 'sanBubble';
  content?: string;
  sanId?: string;
}

interface StreamingPrintState {
  /** 已刻印的 segment 列表 — visible 顺序 */
  segments: PrintSegment[];
  /** 已刻印的 leftHeader */
  headerText: string;
  /** true = 正在流式刻印中(LeftPage 走 streaming 渲染分支) */
  isStreamingPrint: boolean;

  startStreamingPrint: () => void;
  endStreamingPrint: () => void;
  reset: () => void;
  /** 内部用 — useStreamingPrinter hook 每帧 setState */
  _setSegments: (segments: PrintSegment[]) => void;
  _setHeaderText: (text: string) => void;
}

export const useStreamingPrintStore = create<StreamingPrintState>((set) => ({
  segments: [],
  headerText: '',
  isStreamingPrint: false,

  startStreamingPrint: () => set({ isStreamingPrint: true, segments: [], headerText: '' }),
  endStreamingPrint: () => set({ isStreamingPrint: false }),
  reset: () => set({ segments: [], headerText: '', isStreamingPrint: false }),
  _setSegments: (segments) => set({ segments }),
  _setHeaderText: (headerText) => set({ headerText }),
}));
```

- [ ] **Step 7.2: 跑 tsc + commit**

Run: `npx tsc -b 2>&1 | head -10`
Expected: 无新增 error。

```bash
git add src/stores/useStreamingPrintStore.ts
git commit -m "feat(streaming): useStreamingPrintStore 全局 segments 状态"
```

---

## Task 8: useStreamingPrinter hook — 测试

**Files:**
- Create: `src/hooks/__tests__/useStreamingPrinter.test.ts`

**目标：** 验证节拍化打字队列在 40ms / visibleChar 节奏下正确 push 进 store。

- [ ] **Step 8.1: 写测试文件**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingPrinter } from '../useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('useStreamingPrinter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('40ms 一个 visibleChar 入 segments', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: '调' },
        { kind: 'visibleChar', ch: '查' },
        { kind: 'visibleChar', ch: '员' },
      ]);
    });

    // t=0:还没 tick
    expect(useStreamingPrintStore.getState().segments).toEqual([]);

    // 第 1 个字 40ms 后
    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调');

    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调查');

    act(() => { vi.advanceTimersByTime(40); });
    expect(textOf(useStreamingPrintStore.getState().segments)).toBe('调查员');
  });

  it('openKw → 内部字符 → closeKw 形成独立 kw segment', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: 'a' },
        { kind: 'openKw' },
        { kind: 'visibleChar', ch: '词' },
        { kind: 'closeKw' },
        { kind: 'visibleChar', ch: 'b' },
      ]);
    });

    act(() => { vi.advanceTimersByTime(40 * 3); }); // a 词 b 全部出完

    const segs = useStreamingPrintStore.getState().segments;
    // 期望:[text("a"), kw("词"), text("b")]
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ kind: 'text', content: 'a' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '词' });
    expect(segs[2]).toEqual({ kind: 'text', content: 'b' });
  });

  it('sanBubble 事件入 segments 不占节拍', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([
        { kind: 'visibleChar', ch: 'a' },
        { kind: 'sanBubble', id: 'p1' },
        { kind: 'visibleChar', ch: 'b' },
      ]);
    });

    // 1 tick 后:a 出 + sanBubble 同帧出
    act(() => { vi.advanceTimersByTime(40); });
    let segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: 'a' },
      { kind: 'sanBubble', sanId: 'p1' },
    ]);

    // 又 40ms:b 接着出
    act(() => { vi.advanceTimersByTime(40); });
    segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: 'a' },
      { kind: 'sanBubble', sanId: 'p1' },
      { kind: 'text', content: 'b' },
    ]);
  });

  it('reset 清空 store 与队列', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    act(() => {
      result.current.push([{ kind: 'visibleChar', ch: 'a' }]);
      vi.advanceTimersByTime(40);
    });
    expect(useStreamingPrintStore.getState().segments.length).toBe(1);

    act(() => {
      result.current.reset();
    });
    expect(useStreamingPrintStore.getState().segments).toEqual([]);
  });
});

function textOf(segments: { kind: string; content?: string }[]): string {
  return segments.filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
}
```

- [ ] **Step 8.2: 跑测试验证 RED**

Run: `npx vitest run src/hooks/__tests__/useStreamingPrinter.test.ts 2>&1 | tail -20`
Expected: FAIL — 找不到 useStreamingPrinter 模块。

- [ ] **Step 8.3: commit**

```bash
git add src/hooks/__tests__/useStreamingPrinter.test.ts
git commit -m "test(streaming): RED — useStreamingPrinter 节拍队列契约"
```

---

## Task 9: useStreamingPrinter hook — 实现

**Files:**
- Create: `src/hooks/useStreamingPrinter.ts`

**目标：** 节拍化打字队列。每 40ms 消费一个 visibleChar，其他事件同帧顺序消费。

- [ ] **Step 9.1: 写实现**

```ts
// 节拍化刻印队列:把 streaming-tag-mask 的 MaskEvent 流按 40ms / visibleChar 节奏推到 segments。
// 其他事件(openKw/closeKw/sanBubble/enter/exitHiddenBlock)不占节拍,在同帧顺序消费直到撞下一个 visibleChar。
// 状态写到 useStreamingPrintStore(全局),Storybook → LeftPage 直接订阅。

import { useCallback, useEffect, useRef } from 'react';
import type { MaskEvent } from '../sillytavern/streaming-tag-mask';
import { useStreamingPrintStore, type PrintSegment } from '../stores/useStreamingPrintStore';

// 用 setInterval 而非 requestAnimationFrame 是有意选择:vitest fake-timer 对 setInterval 的
// vi.advanceTimersByTime() 支持稳定,RAF 在 jsdom 下 polyfill 行为偶发漂移会影响单测断言。
// 真实视觉上 40ms tick 与 60fps(16.6ms) 不同步,但每帧只渲染一字符也无肉眼可察的跳帧。
const TICK_MS = 40;

export function useStreamingPrinter(): {
  push: (events: MaskEvent[]) => void;
  reset: () => void;
} {
  const queueRef = useRef<MaskEvent[]>([]);
  const inKwRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentsRef = useRef<PrintSegment[]>([]);

  const ensureTextSegment = useCallback(() => {
    const segs = segmentsRef.current;
    const last = segs[segs.length - 1];
    if (!last || last.kind !== 'text') {
      segs.push({ kind: 'text', content: '' });
    }
  }, []);

  const tick = useCallback(() => {
    const q = queueRef.current;
    // 先消费所有非 visibleChar 事件
    while (q.length > 0 && q[0].kind !== 'visibleChar') {
      const ev = q.shift()!;
      if (ev.kind === 'openKw') {
        segmentsRef.current.push({ kind: 'kw', content: '' });
        inKwRef.current = true;
      } else if (ev.kind === 'closeKw') {
        inKwRef.current = false;
      } else if (ev.kind === 'sanBubble') {
        segmentsRef.current.push({ kind: 'sanBubble', sanId: ev.id });
      }
      // enter/exitHiddenBlock 不入 segments(已经在 mask 层过滤掉了字符)
    }

    // 消费一个 visibleChar
    if (q.length > 0 && q[0].kind === 'visibleChar') {
      const ev = q.shift()! as { kind: 'visibleChar'; ch: string };
      if (inKwRef.current) {
        const last = segmentsRef.current[segmentsRef.current.length - 1];
        if (last && last.kind === 'kw') {
          last.content = (last.content ?? '') + ev.ch;
        }
      } else {
        ensureTextSegment();
        const last = segmentsRef.current[segmentsRef.current.length - 1];
        last.content = (last.content ?? '') + ev.ch;
      }
    }

    // 同步到 store
    useStreamingPrintStore.getState()._setSegments([...segmentsRef.current]);

    // 队列空了停 interval(下次 push 会重启)
    if (q.length === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [ensureTextSegment]);

  const push = useCallback(
    (events: MaskEvent[]) => {
      queueRef.current.push(...events);
      if (!intervalRef.current && queueRef.current.length > 0) {
        intervalRef.current = setInterval(tick, TICK_MS);
      }
    },
    [tick],
  );

  const reset = useCallback(() => {
    queueRef.current = [];
    segmentsRef.current = [];
    inKwRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    useStreamingPrintStore.getState().reset();
  }, []);

  // 卸载时清 interval
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { push, reset };
}
```

- [ ] **Step 9.2: 跑测试验证 GREEN**

Run: `npx vitest run src/hooks/__tests__/useStreamingPrinter.test.ts 2>&1 | tail -20`
Expected: PASS — 4 tests pass。

注意：测试用 `setInterval` 假定的 fake-timer 行为，若实际用了 `requestAnimationFrame`，测试需要相应改 `vi.useFakeTimers` 配置；这里用 setInterval 保持简单可测。

- [ ] **Step 9.3: commit**

```bash
git add src/hooks/useStreamingPrinter.ts
git commit -m "feat(streaming): useStreamingPrinter 节拍化刻印队列(40ms/字)"
```

---

## Task 10: streaming-ink CSS keyframe

**Files:**
- Modify: `src/styles/global.css`

**目标：** 加 keyframe + className，让新出现的字带「高光→黑字」刻印动画。

- [ ] **Step 10.1: Read 现有 keyframes 段**

Run: `head -40 src/styles/global.css`

确认 `@keyframes spin` 和 `skill-pulse` 现状。

- [ ] **Step 10.2: 在 skill-pulse 行下方追加**

```css

/* 流式刻印 — 字进入 DOM 时高光金色,缓慢落定为正文黑字。
 * 时长 0.45s,缓动用项目标准 cubic-bezier(0.4, 0, 0.2, 1)。 */
@keyframes streaming-ink {
  0%   { color: rgba(196, 168, 85, 1); text-shadow: 0 0 8px rgba(196, 168, 85, 0.6); }
  60%  { color: rgba(196, 168, 85, 0.6); text-shadow: 0 0 4px rgba(196, 168, 85, 0.3); }
  100% { color: var(--ink); text-shadow: none; }
}
.streaming-ink-char {
  animation: streaming-ink 0.45s cubic-bezier(0.4, 0, 0.2, 1) both;
  display: inline;
}
```

- [ ] **Step 10.3: 跑 build 验 css 解析 + commit**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

```bash
git add src/styles/global.css
git commit -m "feat(streaming): 加 streaming-ink keyframe(高光→黑字 0.45s)"
```

---

## Task 11: LeftPage 加 streaming 渲染分支

**Files:**
- Modify: `src/components/Book/LeftPage.tsx`

**目标：** LeftPage 在 `isStreamingPrint=true` 时，跳过现有 `renderContentWithCodeBlocks/splitTextWithSanBubbles/beautifyText` 三层，直接渲染 streamingSegments。其他渲染（imageBanner / pageNum / summary 等）保持。

- [ ] **Step 11.1: Read LeftPage.tsx Props interface 与 body**

Run: `head -130 src/components/Book/LeftPage.tsx`

确认 `Props`、`renderedContent`、`renderStringWithBubblesAndBeauty` 现状。

- [ ] **Step 11.2: 改 Props interface**

在 `interface Props { ... }` 段加（**注释明确流式 vs 非流式 props 关系**）：

```ts
  /** 流式刻印模式 — true 时:
   *  - header / content / sanityCheckPrompts / imageUrl 等原 props 被【忽略】,
   *  - 改用 streamingHeader 与 streamingSegments 渲染叙事文本,
   *  - PageBanner / SanityBubble 完整组件不渲染(避免半成数据触发副作用)。
   *  isStreamingPrint=false 走原渲染路径,所有 props 恢复有效。 */
  isStreamingPrint?: boolean;
  /** 已刻印的 segments(由 useStreamingPrintStore 提供) */
  streamingSegments?: PrintSegment[];
  /** 已刻印的 header 文本(流式期间覆盖 header) */
  streamingHeader?: string;
```

并在文件顶部加 import：

```ts
import type { PrintSegment } from '../../stores/useStreamingPrintStore';
```

- [ ] **Step 11.3: 改 component body 的渲染分支**

在 LeftPage 函数体内，把现有 `renderedContent` 计算前加一个分支：

```tsx
  // 流式刻印模式 — 不走 renderContentWithCodeBlocks(那需要完整字符串),直接渲染 segments。
  // 不渲染 PageBanner / 完整 SanityBubble(spec § 5.4):
  //  - PageBanner 依赖 imageUrl/imageGenStatus,流式期间这些字段尚未到位
  //  - 完整 SanityBubble 依赖 sanityCheckPrompts 字典,流式期间也没到位
  //  - 流结束 isStreamingPrint=false 后,Storybook 退回常规 LeftPage 渲染,这些都自动恢复。
  if (isStreamingPrint) {
    return (
      <div style={{ /* 复用原来的最外层 div style — 直接 copy 来 */
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '28px 24px 20px 28px', minHeight: 0, minWidth: 0,
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
        boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
        color: 'var(--ink)', fontFamily: 'var(--font-body)',
        fontSize: 'calc(15px * var(--text-ratio, 1))', lineHeight: 1.75, position: 'relative',
      }}>
        <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--text-ratio, 1))', color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>
            {streamingHeader ?? header}
          </h3>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div className="lp-scroll" style={{ height: '100%', overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)' }}>
            <p style={{ textIndent: '2em', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
              {(streamingSegments ?? []).map((seg, i) => renderStreamingSegment(seg, i))}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 'calc(12px * var(--text-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(var(--ink-faded-rgb),0.15)', flexShrink: 0 }}>
          {pageNum}
        </div>
      </div>
    );
  }
```

并在文件末尾加辅助函数：

```tsx
function renderStreamingSegment(seg: PrintSegment, idx: number): React.ReactNode {
  if (seg.kind === 'sanBubble') {
    // 流式期间气泡不可点 — placeholder 用 opacity + pointerEvents:none 明确"未就绪",t6 后切回完整 SanityBubble 自动恢复可点
    return (
      <span key={`sb-${idx}`} style={{
        display: 'inline-block', width: '0.9em', height: '0.9em', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,80,80,0.5) 0%, rgba(220,80,80,0.1) 70%)',
        margin: '0 2px', verticalAlign: 'middle', opacity: 0.6, pointerEvents: 'none', cursor: 'wait',
      }} />
    );
  }
  if (seg.kind === 'kw') {
    return (
      <span key={`kw-${idx}`} style={{
        color: 'var(--gold)', fontWeight: 600, borderBottom: '1px dashed var(--gold)',
      }}>
        {(seg.content ?? '').split('').map((ch, j) => (
          <span key={j} className="streaming-ink-char">{ch}</span>
        ))}
      </span>
    );
  }
  // text segment — 每个字单独 span 触发刻印 keyframe
  return (
    <span key={`t-${idx}`}>
      {(seg.content ?? '').split('').map((ch, j) => (
        <span key={j} className="streaming-ink-char">{ch}</span>
      ))}
    </span>
  );
}
```

注意：`renderStreamingSegment` 给每个字都加 `.streaming-ink-char` className 触发 keyframe；React 会对新增的 span 重新挂载并播放一次动画。已经在 DOM 里的旧字符 key 不变，不会重播。

- [ ] **Step 11.4: 跑 build + commit**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

```bash
git add src/components/Book/LeftPage.tsx
git commit -m "feat(streaming): LeftPage 加流式刻印渲染分支"
```

---

## Task 12: Storybook 接 useStreamingPrintStore

**Files:**
- Modify: `src/components/Book/Storybook.tsx`

**目标：** Storybook 把 useStreamingPrintStore 的当前 segments / isStreamingPrint 传给当前页的 LeftPage（三处调用点）。

- [ ] **Step 12.1: Read Storybook 的 LeftPage 调用点**

Run: `grep -n "<LeftPage" src/components/Book/Storybook.tsx`

记录三个调用点行号（研究 E 报 369/374/380，以实际为准）。

- [ ] **Step 12.2: 加 store 订阅**

在 Storybook component 顶部（其他 useStore 订阅旁），加：

```ts
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

// 在组件 body 顶部 hooks 区
const streamingSegments = useStreamingPrintStore((s) => s.segments);
const streamingHeader = useStreamingPrintStore((s) => s.headerText);
const isStreamingPrint = useStreamingPrintStore((s) => s.isStreamingPrint);
```

- [ ] **Step 12.3: 给每个 <LeftPage> 调用加 3 个 props**

只有【当前 active page】的 LeftPage 需要传 streaming props（流式只发生在新页）。如果三处调用是「前一页 / 当前页 / 翻页中的下一页」之类的结构，识别出当前页那一处，加：

```tsx
isStreamingPrint={isStreamingPrint && /* 是当前页判断 */}
streamingSegments={streamingSegments}
streamingHeader={streamingHeader}
```

注意：判断「是否当前页」要参考 Storybook 现有逻辑（如 `pageIndex === pages.length - 1` 或类似）。如果三处都是当前页（仅是不同翻页态），都加；其他不加。

- [ ] **Step 12.4: 跑 build + commit**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

```bash
git add src/components/Book/Storybook.tsx
git commit -m "feat(streaming): Storybook 接 useStreamingPrintStore 到当前页 LeftPage"
```

---

## Task 13: useChatPipeline 接线 — 替换 onToken + 首 chunk 翻页 + 中断兜底 + SSE 降级

**Files:**
- Modify: `src/hooks/useChatPipeline.ts`

**目标：** 当 `streamingPrintEnabled=true` 时：
1. 强制开启 stream（无视 TavernHelper allowStreamRender）
2. 替换 onToken 走新管线（walker → mask → printer）
3. 首个 SSE chunk 时 dispatch autoFlipForward；既有 autoFlipForward 调用点用 `alreadyFlipped` 防二次翻页
4. **中断兜底**：sendChatCompletion 抛错或 abort 时，清 store + 留 log，已翻的页保留（由 sendWithJsonRetry 重试一次非流式填进去）
5. **SSE 不支持降级**：模块级 `unsupportedStreamingEndpoints: Set<string>` 缓存，命中直接走 stream=false；首 chunk 30 秒超时也加入缓存

研究 D 已确认 `sendChatCompletion(messages, preset, baseUrl, apiKey, model, useStream, onToken, signal, lane, extraParams)` 在 src/sillytavern/api-router.ts 已完整支持 stream + onToken + abort，无需改 api-router。

⚠️ **行号警告**：以下行号是 plan 撰写时的快照（grep 命中 startStream:1003 / sendChatCompletion:1021 / appendPage:1488 / autoFlipForward:1804 / endStream:1837 / useCallback deps:1843）。执行时务必先 grep 一次确认实际位置；如果文件已变动，按【语义定位】走：「主推进 send 配置块」「主页入库后」「pipeline finally 块」。

- [ ] **Step 13.1: 实际定位关键代码段**

Run: `grep -n 'startStream\|endStream\|sendChatCompletion\|appendPage\|autoFlipForward' src/hooks/useChatPipeline.ts`

记录每个名称的真实出现行号。**注意主 send 与 regenerate 都调 sendChatCompletion，本 plan 只改 submit 路径（grep 输出里第一个 sendChatCompletion 调用块）；regenerate 留给后续 PR**——这与 spec § 1.1「仅主推进」是一致的。

Run: `sed -n '985,1045p' src/hooks/useChatPipeline.ts` 看 submit 起点
Run: `sed -n '1480,1510p' src/hooks/useChatPipeline.ts` 看 appendPage
Run: `sed -n '1800,1850p' src/hooks/useChatPipeline.ts` 看 autoFlipForward + endStream + useCallback deps

- [ ] **Step 13.2: 文件顶部加 imports（在现有 stream-parser / api-router import 附近）**

```ts
import { StreamingJsonWalker } from '../sillytavern/streaming-json-walker';
import { StreamingTagMask, type MaskEvent } from '../sillytavern/streaming-tag-mask';
import { useStreamingPrinter } from './useStreamingPrinter';
import { useStreamingPrintStore } from '../stores/useStreamingPrintStore';
```

- [ ] **Step 13.3: 在 hook body 顶部加 setting 订阅 + printer hook**

在 `const streamRenderEnabled = useTavernHelperStore((s) => s.render.allowStreamRender);` 行下方加：

```ts
const streamingPrintEnabled = useSettingsStore((s) => s.streamingPrintEnabled);
const printer = useStreamingPrinter();
```

- [ ] **Step 13.4: 文件顶部加模块级 SSE 不支持缓存（参考 unsupportedJsonObjectModels 模式）**

在 `// ── Hook ──` 注释行的【上方】（与其他模块级常量同区），加：

```ts
/** 进程级缓存：已知不支持 SSE 的中转站 baseUrl。
 *  探测命中后写入；后续同 baseUrl 调用直接跳过 stream:true 尝试。刷新页面/重启进程后清空。 */
const unsupportedStreamingEndpoints = new Set<string>();
```

- [ ] **Step 13.5: 替换 submit 函数体的发送区块（核心改造）**

把【submit 函数体内的「主推进 send 块」】整段替换。在原有 `startStream();` 之前/之后,**结构如下**（实际位置以 Step 13.1 grep 输出为准）：

```ts
// ── 流式刻印管线初始化(每次 submit 调用都是新 closure,无需担心跨回合污染) ──
const effectiveBaseUrl = settings.getEffectiveMainApi().baseUrl;
const wantStreamingPrint = streamingPrintEnabled
  && !unsupportedStreamingEndpoints.has(effectiveBaseUrl);
const useStream = wantStreamingPrint || streamRenderEnabled;

// 跨 chunk 状态(closure 变量,onToken 多次调用共享)
const walker = wantStreamingPrint ? new StreamingJsonWalker() : null;
const mask = wantStreamingPrint ? new StreamingTagMask() : null;
let alreadyFlipped = false;
let activeField: 'leftHeader' | 'leftContent' | null = null;
let headerAccum = '';
let firstChunkAt = 0; // 用于检测首 chunk 超时(目前未启用,留作未来 30s 超时 hook)

if (wantStreamingPrint) {
  printer.reset();
  useStreamingPrintStore.getState().startStreamingPrint();
}

const effectiveOnToken = !useStream
  ? undefined
  : (chunk: string) => {
      if (streamRenderEnabled) onToken(chunk); // 旧的 raw 回显(调试用)保留
      if (!wantStreamingPrint || !walker || !mask) return;

      if (firstChunkAt === 0) {
        firstChunkAt = Date.now();
        // 首 chunk 触发翻页 — appendPage 还没跑(在下面 1488),用 microtask 推迟到当前同步代码结束
        if (!alreadyFlipped) {
          alreadyFlipped = true;
          queueMicrotask(() => useBookStore.getState().autoFlipForward());
        }
      }

      const walkerEvents = walker.feed(chunk);
      const allMaskEvents: MaskEvent[] = [];
      for (const ev of walkerEvents) {
        if (ev.kind === 'enterField') activeField = ev.field;
        else if (ev.kind === 'exitField') activeField = null;
        else if (ev.kind === 'narrativeChar') {
          if (activeField === 'leftHeader') {
            headerAccum += ev.ch;
            useStreamingPrintStore.getState()._setHeaderText(headerAccum);
          } else if (activeField === 'leftContent') {
            allMaskEvents.push(...mask.feed(ev.ch));
          }
        }
      }
      if (allMaskEvents.length > 0) printer.push(allMaskEvents);
    };
```

然后在【现有的 sendChatCompletion 调用块】（Step 13.1 grep 出来的第一个，第 6 个参数 useStream 第 7 参 onToken）替换为：

```ts
send: (corrective) => sendChatCompletion(
  applyPostProcessing(corrective ? [...editedMessages, correctiveMsg] : editedMessages, settings.promptPostProcessing),
  presetForApi,
  settings.getEffectiveMainApi().baseUrl,
  settings.getEffectiveMainApi().apiKey,
  settings.getEffectiveMainApi().model,
  useStream,
  effectiveOnToken,
  controller.signal,
  'main',
  settings.getEffectiveMainApi().extraParams,
).catch((err) => {
  // SSE 不支持降级:HTTP 4xx 命中 → 缓存端点,sendWithJsonRetry 内部会重试非流式
  if (wantStreamingPrint && isLikelyStreamUnsupportedError(err)) {
    unsupportedStreamingEndpoints.add(effectiveBaseUrl);
    pushLog('warn', `[streaming-print] 中转站 ${effectiveBaseUrl} 不支持 SSE,本会话剩余调用走非流式`, 'api');
  }
  throw err;
}),
```

并在文件底部加辅助函数：

```ts
function isLikelyStreamUnsupportedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as Error).message || '').toLowerCase();
  // 4xx 中典型的 "stream not supported" / "stream is not supported" / "invalid parameter: stream" 等
  return (
    msg.includes('stream') &&
    (msg.includes('not supported') || msg.includes('unsupported') || msg.includes('invalid parameter'))
  );
}
```

- [ ] **Step 13.6: 既有 autoFlipForward 调用点加 alreadyFlipped 防二次翻页**

定位现有的 `useBookStore.getState().autoFlipForward();`（grep 出的行）改为：

```ts
if (!alreadyFlipped) {
  useBookStore.getState().autoFlipForward();
}
```

- [ ] **Step 13.7: finally 块加 endStreamingPrint + 中断兜底清理**

定位现有的 `endStream();` 行（在 finally 块中），其后加：

```ts
if (wantStreamingPrint) {
  useStreamingPrintStore.getState().endStreamingPrint();
  // 注意:不在这里 reset segments — 流成功结束后 isStreamingPrint=false 让 Storybook 退回常规渲染,
  // 此时 segments 留在 store 也无害,下次 submit 开头 printer.reset() + startStreamingPrint() 会清。
}
```

【中断兜底】在【sendWithJsonRetry 调用的 try/catch 块或紧邻】（grep `sendWithJsonRetry` 找位置）加：

```ts
// 流中断或解析失败 — sendWithJsonRetry 内部已会用非流式重试一次。此处仅清掉流式 store。
if (wantStreamingPrint && !result.result) {
  printer.reset();
  useStreamingPrintStore.getState().reset();
  pushLog('warn', '[streaming-print] 流式解析失败/中断,已清空刻印 store,等非流式重试结果回灌', 'system');
}
```

- [ ] **Step 13.8: 更新 useCallback dependencies array**

定位 submit 的 `useCallback(..., [...])` 的 deps 数组（Step 13.1 grep 输出里靠后那行），把这些新引用加进去：

```ts
[
  endStream, onToken, startStream, streamRenderEnabled, thHooks,
  streamingPrintEnabled, printer, // 新增
]
```

- [ ] **Step 13.9: 跑 build + commit**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

```bash
git add src/hooks/useChatPipeline.ts
git commit -m "feat(streaming): useChatPipeline 接 streaming-print 管线 + 中断兜底 + SSE 降级"
```

---

## Task 14: 集成 smoke — 单测覆盖管线串联

**Files:**
- Create: `src/sillytavern/__tests__/streaming-pipeline.integration.test.ts`

**目标：** walker + mask + printer 串成一条管线的端到端单测，捕捉接口耦合 bug。

- [ ] **Step 14.1: 写集成测试**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StreamingJsonWalker } from '../streaming-json-walker';
import { StreamingTagMask } from '../streaming-tag-mask';
import { useStreamingPrinter } from '../../hooks/useStreamingPrinter';
import { useStreamingPrintStore } from '../../stores/useStreamingPrintStore';

describe('streaming pipeline 集成', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStreamingPrintStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('JSON chunk → walker → mask → printer 端到端,kw 段正常分割', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    const chunk = '{"leftContent":"调查员看见<kw>密信</kw>。"}';

    act(() => {
      const walkerEvents = walker.feed(chunk);
      const maskEvents = [];
      for (const ev of walkerEvents) {
        if (ev.kind === 'narrativeChar') {
          maskEvents.push(...mask.feed(ev.ch));
        }
      }
      result.current.push(maskEvents);
    });

    // 推进足够时间让所有字 emit
    act(() => { vi.advanceTimersByTime(40 * 20); });

    const segs = useStreamingPrintStore.getState().segments;
    // 期望:[text("调查员看见"), kw("密信"), text("。")]
    expect(segs.length).toBe(3);
    expect(segs[0]).toEqual({ kind: 'text', content: '调查员看见' });
    expect(segs[1]).toEqual({ kind: 'kw', content: '密信' });
    expect(segs[2]).toEqual({ kind: 'text', content: '。' });
  });

  it('<thinking> 块完全隐藏不进 segments', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    act(() => {
      const walkerEvents = walker.feed('{"leftContent":"<thinking>推演</thinking>正文"}');
      const maskEvents = [];
      for (const ev of walkerEvents) {
        if (ev.kind === 'narrativeChar') maskEvents.push(...mask.feed(ev.ch));
      }
      result.current.push(maskEvents);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const text = useStreamingPrintStore.getState().segments
      .filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
    expect(text).toBe('正文');
  });

  it('断 chunk 边界:同一 kw 跨 chunk 不破裂', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    act(() => {
      const ev1 = walker.feed('{"leftContent":"前<k');
      const ev2 = walker.feed('w>词</kw>后"}');
      const mevs1 = ev1.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      const mevs2 = ev2.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      result.current.push([...mevs1, ...mevs2]);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const segs = useStreamingPrintStore.getState().segments;
    expect(segs).toEqual([
      { kind: 'text', content: '前' },
      { kind: 'kw', content: '词' },
      { kind: 'text', content: '后' },
    ]);
  });

  it('JSON 转义序列跨 chunk 不破裂', () => {
    const { result } = renderHook(() => useStreamingPrinter());
    const walker = new StreamingJsonWalker();
    const mask = new StreamingTagMask();

    // 反斜杠在第一 chunk 末尾,n 在第二 chunk 开头 → \n 应被解码为换行
    act(() => {
      const ev1 = walker.feed('{"leftContent":"行1\\');
      const ev2 = walker.feed('n行2"}');
      const mevs1 = ev1.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      const mevs2 = ev2.flatMap((e) => e.kind === 'narrativeChar' ? mask.feed(e.ch) : []);
      result.current.push([...mevs1, ...mevs2]);
    });
    act(() => { vi.advanceTimersByTime(40 * 10); });

    const text = useStreamingPrintStore.getState().segments
      .filter((s) => s.kind === 'text').map((s) => s.content ?? '').join('');
    expect(text).toBe('行1\n行2');
  });
});
```

- [ ] **Step 14.2: 跑测试验证 GREEN**

Run: `npx vitest run src/sillytavern/__tests__/streaming-pipeline.integration.test.ts 2>&1 | tail -20`
Expected: PASS — 4 tests pass。

- [ ] **Step 14.3: commit**

```bash
git add src/sillytavern/__tests__/streaming-pipeline.integration.test.ts
git commit -m "test(streaming): 端到端集成测试 walker + mask + printer"
```

---

## Task 15: 全量回归 + push

**目标：** 跑全部测试，确认无回归，push beta。**不 merge master**（按用户工作流，等用户明说「更新」才走 release）。

- [ ] **Step 15.1: 跑全测**

Run: `npx vitest run 2>&1 | tail -20`
Expected: 全 PASS。

如果有 FAIL，按 [[systematic-debugging]] 流程修。

- [ ] **Step 15.2: 跑 build**

Run: `npm run build 2>&1 | tail -10`
Expected: build 成功。

- [ ] **Step 15.3: push beta**

```bash
git push origin beta
```

- [ ] **Step 15.4: 通知用户**

写明：
- 已实现的功能（默认关 Toggle 在「生成与稳定性」section、打开后主推进走 SSE 刻印）
- UI 验证需要用户自己跑（[[user-does-ui-testing]]）：
  1. 设置面板找到「流式刻印」Toggle 打开
  2. 在游戏里推进一次，观察首 chunk 翻页 + leftContent 逐字浮现
  3. 关闭 Toggle 推进一次，验证行为退回非流式
  4. 故意断网/abort，验证不崩

---

## 自检 / 注意事项

**spec 覆盖检查（按 spec § 编号对应）：**
- § 1.1 范围（仅主推进 / 仅 leftHeader+leftContent）→ Task 13 onToken 内判断 `activeField`
- § 1.2 非目标 → 不动 callDsSubagent（本 plan 没碰）
- § 2 现状（sendChatCompletion 已支持 SSE）→ Task 13 复用现有 API
- § 3 架构 → Task 4/6/9 三层管线
- § 4 时序 → t2/t3/t4 在 Task 13.5 onToken 首 chunk 翻页落地（queueMicrotask 推迟到 appendPage 后）
- § 4 中断兜底 → **Task 13.7 显式清掉 printer + store，由 sendWithJsonRetry 既有重试路径承载后续非流式回灌**
- § 4 SSE 不可用降级 → **Task 13.4 unsupportedStreamingEndpoints Set + Task 13.5 catch 探测 + Task 13.6 命中后跳过 wantStreamingPrint**
- § 5.1 walker → Task 3/4
- § 5.2 mask → Task 5/6（**含 spec § 6 边界硬约束：kw 段最长 30 字强行 closeKw**）
- § 5.3 printer → Task 8/9 — **设计偏离**：spec § 5.3 让 hook 直接返回 segments/headerText/reset，本 plan 把状态外置到 useStreamingPrintStore（Task 7），让 Storybook 三处 LeftPage 调用点直接订阅 store，避免 prop 透传地狱。hook 只返回 push/reset。这是合理扩展，需在后续 spec 修订时回填
- § 5.4 LeftPage 改造 → Task 11（**含 PageBanner 流式期间不渲染 + SanityBubble placeholder + Props 优先级注释**）
- § 5.5 useChatPipeline 改造 → Task 13（覆盖 submit 路径；**regenerate 路径暂不动**，与 spec § 1.1「仅主推进」一致 — 注：regenerate 通常被理解为「主推进的回滚重做」，严格按 spec 也应支持。本 plan 把它留作后续 PR 以控制本 PR 范围；执行人可视复杂度选择并入或拆出）
- § 5.6 callMainApi 改造 → **依据 workflow #1 研究 D：现有 `sendChatCompletion(messages, preset, baseUrl, apiKey, model, useStream, onToken, signal, lane, extraParams)` 已完整支持 stream + onToken + abort，本 plan 不动 api-router**
- § 5.7 useSettingsStore 改造 → Task 1
- § 5.8 SettingsModal Toggle → Task 2
- § 6 边界表 → Task 6 mask 状态机处理大部分（孤立标签、隐藏块、kw 嵌套、kw 段最长 N 字、未识别标签透传）；abort 由 sendChatCompletion 既有路径承载 + Task 13.7 清 store
- § 7 测试 → Task 3/5/8/14（**Task 14 加 chunk 边界 + JSON 转义跨 chunk 用例**）

**类型一致性自检：**
- `WalkerEvent` 在 Task 4 与 Task 14 引用一致
- `MaskEvent` 在 Task 6 定义，Task 9（import 行）/ 13.2（import 行）/ 14 引用一致
- `PrintSegment` 在 Task 7 定义，Task 9/11/14 引用一致
- `streamingPrintEnabled` 字段名在 Task 1/13 一致
- `useStreamingPrintStore` 方法名（startStreamingPrint / endStreamingPrint / reset / `_setSegments` / `_setHeaderText`）在 Task 7/9/13 一致；下划线前缀表「hook 协议层」，外部代码（Task 13）也允许调以维持纯函数 store

**两个开关同时打开的语义：**
- `streamingPrintEnabled=true` + `allowStreamRender=true` → SSE 仍走流；onToken 同时跑【raw 回显】(useStreamingRenderer.onToken) 与【刻印管线】(walker→mask→printer)。两条路径互相独立，开销叠加但只多一个 setState 调用，可接受
- `streamingPrintEnabled=true` + `allowStreamRender=false` → SSE 走流；只跑刻印管线。**主流程**
- `streamingPrintEnabled=false` + `allowStreamRender=true` → SSE 走流；只跑 raw 回显（现有行为，未改）
- `streamingPrintEnabled=false` + `allowStreamRender=false` → 非流式（现有行为，未改）

**已知妥协与未来工作：**
- Task 11 renderStreamingSegment 在 segments 增长时整段重新生成 span tree（每帧约 几十-几百 span）；可接受，因为 React 用 key=index 复用旧节点，新字符触发动画，旧字符不重播。如未来发现卡顿可在 LeftPage 外包 `React.memo` 或把 segments 切成「已稳定段 + 末尾增长段」分别 memo
- 流式期间 SanityBubble 用简单 placeholder 占位（opacity 0.6 + pointer-events:none），t6 后切完整组件由 Storybook 在 `isStreamingPrint=false` 时退回常规 LeftPage 路径自动恢复
- kw 高亮在流式期间没有 tooltip（keywords 字典 t6 才到），t6 切回常规渲染时才有
- regenerate 路径未接入流式（plan 范围控制）；想接入照搬 Task 13.5 思路改 regenerate 内的第二次 sendChatCompletion 调用即可
- 翻页二次防护用 `alreadyFlipped` closure 变量；每次 submit 都是新 closure，无跨回合污染风险
