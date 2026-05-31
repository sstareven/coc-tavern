# ExtManager 扩展运行时（复用 TH 脚本沙箱）— 设计文档

**日期:** 2026-05-31
**状态:** 待实现
**关联:** 审计 needs_review 项「ExtManager 是非功能桩」；用户选定方向 A。

## 背景与问题

- `ExtManager.tsx` 能导入/启用/持久化「扩展」（`coc_extensions_v2` KV），但**无任何运行时**按 `entryPoint` 加载执行——「已启用」是纯摆设。
- 项目已有 `th-script-engine.ts`：在 `new Function` + `with(沙箱)` 里执行用户脚本，黑名单屏蔽 `window/fetch/eval/localStorage` 等（`BLOCKED_GLOBALS`），脚本可定义 `init()/onSend(text)/onReceive(text)`，由 `loadThScripts` 收集、`runSendHooks/runReceiveHooks` 在管道里执行。ExtManager 是与之**重复且未接线**的第二套。
- `entryPoint` 现接受「路径或URL」；若按字面用 `import(url)` 实现 = 从任意网址下载执行代码（RCE / 供应链风险）。**明确不做。**

## 方向（用户已确认：A）

扩展**复用现有 TH 脚本沙箱**：Extension 携带**内联脚本代码**，转成 TH 脚本形状喂给同一个 `loadThScripts` 执行，**禁止远程 URL 加载**。保留 ExtManager 入口。零新增沙箱代码。

## 架构

### 组件

1. **`src/types/index.ts` — `Extension`** 新增可选字段 `code?: string`（内联脚本内容）。`entryPoint` 保留为可选元数据（不再触发任何网络/文件加载）。

2. **`src/sillytavern/extension-runtime.ts`（新，纯计算层）**
   ```ts
   export function extensionsToScripts(exts: Extension[]): THScriptTree[];
   ```
   把 `enabled === true` 且 `code` 非空的扩展，映射成 TH 脚本节点 `{ type: 'script', id, name, enabled: true, content: code, ... }`。其余跳过。纯函数、零副作用、可测。

3. **`src/hooks/useChatPipeline.ts`** — 加载 hooks 处（`:149` `loadThScripts(thGlobalScripts, thPresetScripts)`）改为并入扩展脚本：
   ```ts
   loadThScripts([...thGlobalScripts, ...extensionsToScripts(loadEnabledExtensions())], thPresetScripts)
   ```
   `loadEnabledExtensions()` 经已 import 的 `kvGet('coc_extensions_v2')` 读取并 JSON.parse（容错返回 []）。扩展脚本与 TH 全局脚本走**同一沙箱、同一 onSend/onReceive 生命周期**。

4. **`src/components/Settings/ExtManager.tsx`** — 详情面板「入口文件」下方新增「脚本代码」`textarea`（编辑 `ext.code`，等宽字体、可纵向拉伸）；导入弹窗从「路径/URL」改为可粘贴代码 + 名称。`entryPoint` 输入保留为可选备注并标注「仅元数据，运行时执行下方脚本代码」。「已启用」徽标此后真实生效。

### 数据流

```
ExtManager 编辑 ext.code + 启用 → kv coc_extensions_v2
       │
useChatPipeline 加载 hooks
  └─ loadThScripts([...TH全局脚本, ...extensionsToScripts(已启用扩展)], TH预设脚本)
       └─ 同一 new Function 沙箱执行，收集扩展定义的 onSend/onReceive/init
            ├─ 发送前 runSendHooks 处理用户输入
            └─ 接收后 runReceiveHooks 处理 AI 响应
```

## 安全

- 复用 `th-script-engine` 的 `BLOCKED_GLOBALS` 沙箱：扩展脚本内 `window/fetch/eval/Function/localStorage/indexedDB` 等为 `undefined`。
- 扩展能力 = 与 TH 脚本相同的白名单 API：`getvar/setvar/getwi/macroVars/console`。
- **不**做远程 URL 加载、不做 `import(url)`、不做文件系统读取。
- `code` 为空或 `enabled` 为 false 的扩展不进入执行。

## 边界与限制

- 扩展启用/代码修改在**下次组件重挂载**（重进游戏 / 切换会话）后生效，非热重载——与扩展属低频配置相符，复杂的响应式热重载不在本期范围（YAGNI）。
- 脚本执行失败被 `th-script-engine` 的 try/catch 隔离 + `console.warn`，单个扩展报错不影响其余。

## 测试策略

- `extension-runtime.test.ts`：`extensionsToScripts` 纯函数 —— enabled 过滤、空 code 跳过、字段映射形状、空数组。
- 现有 531 测试须全绿；`tsc -b` + `vitest` + `vite build` 三连。

## 不做（YAGNI）

- 远程 URL / 动态 import 加载（安全）。
- 扩展专属 API、扩展间依赖、版本兼容校验。
- 响应式热重载。
- 不改 `th-script-engine` 沙箱实现（仅复用其导出）。
