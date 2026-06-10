# 时间管理系统设计

## 概述

COC 跑团时间管理系统：LLM 输出结构化时间增量，系统累加防倒流，暗线按剧本时长自动节奏引导，数天冒险后 UI 提示休息成长。

## 1. 数据模型 & 存储

内部时间存于 `statData.世界.时间`：

```typescript
{
  epoch: number,        // 自冒险开始以来的总分钟数（内部计算用）
  display: string,      // 格式化显示："1930年1月2日 15:00"
  startDate: string,    // 冒险起始日期 ISO 格式："1930-01-01T08:00"
  lastRestEpoch: number // 上次休息时的 epoch（用于休息提示判定）
}
```

- **epoch 用分钟整数**：累加简单（`epoch += days*1440 + hours*60 + minutes`），防倒流一个 `>=0` 判断
- **display 由系统计算**：`new Date(startDate).getTime() + epoch * 60000` 换算后格式化为中文
- **startDate 初始化**：
  - 剧本模式：`ScenarioDoc.startDateTime`（新增可选字段）
  - 自由模式：首回合由 megaagent 从叙事推断并设置

## 2. megaagent 输出 & 解析

### MegaAgentResult 新增字段

```typescript
timeDelta: { days: number; hours: number; minutes: number } | null;
```

### megaagent prompt 新增 schema 说明

```
"timeDelta": { "days": number, "hours": number, "minutes": number }
  本回合叙事流逝的剧情时间增量。根据叙事内容的活动类型估算：
  - 战斗/紧张对峙：1~10 分钟
  - 对话/搜索房间/检查物证：10~30 分钟
  - 图书馆查阅/大范围搜索/长途步行：1~4 小时
  - 城际旅行/等待：数小时到 1 天
  - 休息/过夜：8~12 小时
  必须 ≥ 0。即使叙事是回忆/闪回，时间仍然向前走（0 分钟即可）。
```

### 触发矩阵

`trigger.timeDelta: true`（永远触发，每回合都有时间流逝）。

### 解析 & 累加（dispatchMegaAgentResult 内）

```typescript
const td = parsed.timeDelta;
if (td && typeof td === 'object') {
  const days = Math.max(0, Number(td.days) || 0);
  const hours = Math.max(0, Number(td.hours) || 0);
  const minutes = Math.max(0, Number(td.minutes) || 0);
  const deltaMinutes = days * 1440 + hours * 60 + minutes;

  const prev = getTreePath(statData, '世界.时间.epoch') ?? 0;
  const newEpoch = prev + deltaMinutes;
  setTreePath(statData, '世界.时间.epoch', newEpoch);

  const startDate = getTreePath(statData, '世界.时间.startDate');
  if (startDate) {
    setTreePath(statData, '世界.时间.display', formatEpochDisplay(startDate, newEpoch));
  }
}
```

### megaagent 输入动态段

```
- 当前剧情已过时间: epoch=2580分钟 (1天19小时) display="1930年1月2日 15:00"
```

## 3. 暗线节奏引导

### 剧本数据新增字段

```typescript
// ScenarioDoc
storyDurationMinutes?: number; // 剧本推荐剧情时间跨度（分钟），如 3 天 = 4320
```

### 系统计算期望暗线进度

```typescript
const storyDuration = scenarioDoc?.storyDurationMinutes ?? 0;
const currentEpoch = getTreePath(statData, '世界.时间.epoch') ?? 0;

let expectedProgress: number | null = null;
if (storyDuration > 0) {
  expectedProgress = Math.min(100, Math.round((currentEpoch / storyDuration) * 100));
}
```

### 注入 megaagent prompt

```
- 暗线节奏引导: 剧本推荐时长 4320 分钟(3天)，当前已过 2580 分钟(60%)，
  期望暗线进度 ≈ 60%，当前实际进度 45%。
  规则：progress 不应低于 期望值-15，不应高于 期望值+10。
  若调查员成功干预可减缓，但不得倒退。
```

### 系统侧硬钳位

```typescript
if (expectedProgress !== null && megaResult.darkThread) {
  const floor = Math.max(currentProgress, expectedProgress - 15);
  const ceiling = expectedProgress + 10;
  megaResult.darkThread.progress = Math.max(floor, Math.min(ceiling, megaResult.darkThread.progress));
}
```

- **下限** = `max(当前进度, 期望值-15)`：暗线不倒退，且不严重落后于时间线
- **上限** = `期望值+10`：防止一回合跳到 90%
- 无 `storyDurationMinutes` 时不做钳位，保持现有行为

### 节奏举例（3 天剧本）

| 剧情时间 | 期望进度 | 允许范围 | 含义 |
|---------|---------|---------|-----|
| 第 1 天早 | ~20% | 5%~30% | 铺垫阶段 |
| 第 2 天午 | ~50% | 35%~60% | 压力渐增 |
| 第 3 天早 | ~80% | 65%~90% | 高潮迫近 |
| 超时 | 100% | 85%~100% | 大结局触发 |

## 4. 休息成长机制

### 触发条件

```typescript
const canRest = hoursSinceRest >= 24 && !inCombat;
// hoursSinceRest = (epoch - lastRestEpoch) / 60
```

### UI 呈现

RightPage 选项栏上方出现铜版风提示条：

```
☽ 调查员已连续活动超过 24 小时，可以寻找安全场所休息。  [休息]
```

- 不侵入选项流，可忽略继续冒险
- 休息完成后消失，下次累计 24h 再出现

### 休息流程

1. 时间推进：`epoch += 480`（8 小时）
2. 生命恢复：每天自然恢复 1 HP（COC7e 规则，非重伤状态）
3. `lastRestEpoch = epoch`
4. display 重算

### MVP vs 后续

| 功能 | MVP | 后续 |
|-----|-----|------|
| 休息提示 + 8h 时间推进 | ✓ | |
| HP 自然恢复 1 点 | ✓ | |
| 技能成长检定 | | ✓ |
| 重伤恢复减半 | | ✓ |
| 休息被暗线事件打断 | | ✓ |

### 实现位置

- 检测逻辑：`src/sillytavern/rest-engine.ts`（纯函数 `canRestNow`, `executeRest`）
- UI 组件：`RestHint` 在 RightPage 选项区域上方
- 休息执行：`executeRest(sheet, statData) → { hpRecovered, newEpoch }`

## 5. 主回合时间注入

### 注入方式

`buildPromptMessages` 的动态 format 段注入当前时间上下文：

```typescript
const timeDisplay = getTreePath(statData, '世界.时间.display');
if (timeDisplay) {
  let timeCtx = `[当前剧情时间] ${timeDisplay}`;
  if (hoursSinceRest >= 18) {
    timeCtx += `\n调查员已连续活动 ${Math.floor(hoursSinceRest)} 小时，应在叙事中体现疲劳感。`;
  }
  addFormatPart(timeCtx);
}
```

### StatusBar 时间源

- **权威时间源**：`statData.世界.时间.display`（系统计算的绝对时间）
- StatusBar 优先显示 `statData.世界.时间.display`；无值时回退 LLM 主回合 JSON 的 `time` 字段
- LLM 主回合 `time` 字段降级为氛围描述（page.summary 用），不作为权威时间源

### 叙事一致性

在已有「摘要规范」世界书条目的 time 字段说明中补充：

```
time 字段参考 [当前剧情时间] 注入的绝对时间，
叙事中的光线、温度、人流等环境描写应与时间段一致。
禁止出现与当前时间矛盾的描写。
```

## 6. 按会话隔离

时间数据全部在 `statData` 内，已经随现有 `gameVars` 表持久化/隔离。无需新增 store 或持久化通道。

`lastRestEpoch` 作为 `statData.世界.时间.lastRestEpoch` 的一部分，随 statData 快照一同保存/恢复/删页回溯。

## 7. 文件清单

| 文件 | 改动 |
|-----|------|
| `src/sillytavern/time-engine.ts` | 新建：`parseTimeDelta`, `accumulateTime`, `formatEpochDisplay`, `canRestNow`, `executeRest` |
| `src/sillytavern/mvu-megaagent.ts` | `MegaAgentResult` 加 `timeDelta`；prompt 加 schema 说明；`formatUserPayload` 加时间上下文；`parseMegaAgentResponse` 加解析；`trigger` 加 `timeDelta: true` |
| `src/sillytavern/mvu-megaagent.ts` dispatchMegaAgentResult | 调用 `accumulateTime`；暗线钳位逻辑 |
| `src/hooks/useChatPipeline.ts` buildPromptMessages | 注入 `[当前剧情时间]` format 段 |
| `src/components/Book/StatusBar.tsx` | 时间显示优先读 `statData.世界.时间.display` |
| `src/components/Book/RestHint.tsx` | 新建：休息提示条 UI |
| `src/components/Book/RightPage.tsx` | 挂载 `RestHint` 组件 |
| `src/types/scenario.ts` | `ScenarioDoc` 加 `startDateTime`, `storyDurationMinutes` |
| `src/sillytavern/mvu-initial-statdata.ts` | `createInitialStatData` 种子化 `世界.时间` 空对象 |
