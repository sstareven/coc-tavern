/**
 * DeepSeek 前缀缓存优化器 —— 消息三区重组 + 静态/动态分桶（移植自 SillyTavern 插件
 * deepseek-cache-optimizer by @kousakayou，仅迁移算法，不引入 ST 运行时依赖）。
 *
 * 核心原理：DeepSeek 前缀缓存按【messages 序列化后的逐字节最长公共前缀】计费。
 * 单纯把多条 system 合并为一条 user 只是减少消息条数 → 内容字节稳定性不变；
 * 真正让前缀稳定的关键是【静态前置、动态尾置】，把每回合变化的内容物理推到合并文本末尾。
 *
 * 本模块核心函数：
 *   restructureMessages —— 把 [system×N, user×1, assistant×M, user] 三区重组：
 *      ┌────────────────────────────────────────────────────────────────────┐
 *      │ 顶部缓存区: 全部 system + 首 user 合并成 ONE user，含 <role==X> 标签 │
 *      │ 中间对话区: 多轮场景保留原 history                                  │
 *      │ 底部高注意力区: greenContents/extracted-system/postHistory prepend │
 *      │                到末 user 内容前                                     │
 *      └────────────────────────────────────────────────────────────────────┘
 *      本项目通常 history=[] → 走 isSingleMessage 路径，输出 1 条 user。
 *
 * 仅当当前模型源在 targetSources 命中时启用；其他模型零副作用。
 */

import type { AssembledMessage } from './prompt-assembler';

const JOINER = '\n\n';

export interface DsRestructureConfig {
  /** 整体重组开关（dsCache.restructure 镜像）。 */
  enabled: boolean;
  /** 给合并后的每组加 <role==X> 标签包裹，保留原 role 语义。 */
  roleTags: boolean;
  /** 调试日志：把重组前/后的 messages 结构打到 console。 */
  debugLog: boolean;
  /** postHistory 末尾若是 assistant（伪思维链/prefill），保留为独立 message，不合并进 user。 */
  keepTailAssistant: boolean;
  /** 在最末尾追加一条自定义 assistant message（预填充）。 */
  customPrefillEnabled: boolean;
  /** 自定义 prefill 文本（trim 后非空才生效）。 */
  customPrefillContent: string;
  /** 启用 WI 蓝绿灯分离（绿灯下沉到高注意力区）。 */
  separateWiLights: boolean;
}

/**
 * 判定当前 API 模型/来源是否在 targetSources 中（命中才启用重组）。
 * targetSources 是逗号分隔字符串，常见值: 'deepseek' / 'custom' / 'openai' / 'openrouter'。
 * 现实策略：本项目走中转站为主，默认 'deepseek,custom' 命中绝大多数 DS 场景；用户可自定义。
 *
 * 由于本项目用单一 baseUrl，没有 ST 的 chat_completion_source 字段，这里用模型名启发式推断：
 *   modelId 含 'deepseek' / 'ds' / 模型名以 'ep-' 开头(火山引擎中转) → 命中 'deepseek'
 *   其它 → 命中 'custom'（中转站统一归为 custom，用户开启时通常已知道走的是 DS 中转）
 */
export function isDeepSeekSource(modelId: string | undefined, targetSources: string): boolean {
  if (!modelId) return false;
  const sources = targetSources
    .split(/[,，]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (sources.length === 0) return false;
  const m = modelId.toLowerCase();
  const inferred: string[] = [];
  if (m.includes('deepseek')) inferred.push('deepseek');
  if (m.startsWith('ep-') || m.includes('volc') || m.includes('火山')) inferred.push('deepseek');
  // 其它统一为 custom（中转站通用）
  inferred.push('custom');
  return inferred.some((tag) => sources.includes(tag));
}

/**
 * 启发式：判断一段 lore content 是否含【动态 marker】——含则即使 entry.constant=true 也应视为动态，
 * 否则它会污染"静态前缀"破坏缓存命中。
 *
 * 命中规则（worker 实测的元凶集合，2026-06-04 复盘）：
 * - `<%` / `<%=` / `<%-`        — EJS 代码块（含 ejs_san_state/ejs_hp_state/ejs_combat 等）
 * - `{{getvar`/`{{getwi`/`{{setvar`/`{{$`  — 显式 SillyTavern getvar 类宏
 * - `{{xxx.yyy}}` 形态（双花括号含点路径）— 本项目 statData 引用宏（如 `{{调查员.生命值.当前}}`、`{{世界.时间}}`）
 * - SillyTavern 经典动态宏 `{{time}}/{{date}}/{{isotime}}/{{isodate}}/{{random::..}}/{{roll::..}}/{{newline::N}}/{{format_message_variable::..}}`
 *   — 这些在 unified-macro-engine 里被解析,每次渲染值不同(time/date 跟系统时钟,random/roll 真随机)。
 *
 * 故意不命中：
 * - `{{user}}` / `{{char}}` / `{{charName}}` / `{{newline}}`(无参) 等无参字面宏 — 这些在同一会话内字节稳定。
 */
const DYNAMIC_MARKER_RE = /<%|\{\{\s*(getvar|getwi|setvar|addvar|incvar|decvar|hasvar|deletevar|getglobalvar|setglobalvar|addglobalvar|incglobalvar|decglobalvar|hasglobalvar|deleteglobalvar|weekday|\$|time|date|isotime|isodate|random(?:\s*::|\s*\})|roll\s*::|newline\s*::|format_message_variable\s*::)|\{\{\s*[.$]\w+\s*([=+\-?|}]|\?\?|\|\|)|\{\{[^{}]*[^\s{}|()=+\-]\./;

// SillyTavern 标准角色卡静态点路径宏 — 这些在会话内字节稳定,但点路径分支会误把它们当动态,
// 导致过度下沉。先剥掉再判,避免误判。
const ST_STATIC_DOT_MACRO_RE = /\{\{\s*(char|persona|charName|user|scenario|charDepth|description|personality|first_mes|mes_example)[.\w-]*[^{}]*\}\}/g;

export function hasDynamicMarker(content: string): boolean {
  if (!content) return false;
  const cleaned = content.replace(ST_STATIC_DOT_MACRO_RE, '');
  return DYNAMIC_MARKER_RE.test(cleaned);
}

/**
 * 实验性"statSnapshot 减肥"：把 statData YAML 过滤为【高频变化字段】，丢弃【长但低频字段】。
 * 仅在 dsCache.experimentalLeanSnapshot=true 时调用。
 *
 * 保留（每回合可能变化、且对叙事直接相关）：
 *   /调查员/生命值,/调查员/理智值,/调查员/魔法值,/调查员/姓名,/调查员/职业,/调查员/姿态,/调查员/状态条件,/调查员/幸运
 *   /世界/* (整段——时间/天气/地点/日期都跟叙事强相关)
 *   /战斗/* (战斗状态/回合数/当前 NPC HP——战斗回合密集变化)
 *   /剧情/暗线 (进度/威胁等级——叙事核心)
 *   /剧情/阶段 (调查/高潮/结局)
 *
 * 丢弃（长但低频，且通过 clues/线索面板/世界书等其他途径已记录）：
 *   /剧情/已解锁/* (条件解锁状态——已用世界书 EJS 揭示)
 *   /剧情/线索/* (本就由 clues 字段记录)
 *   /剧情/关键事件/* (由 darkThread/anchorBucket 注入)
 *   /剧情/当前章节 (叙事正文已表达)
 *
 * 副作用：LLM 看不到"已解锁"等状态字面值，需通过叙事推断。一般不影响输出质量。
 */
export function leanStatData(stat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const inv = stat['调查员'];
  if (inv && typeof inv === 'object') {
    const i = inv as Record<string, unknown>;
    const slim: Record<string, unknown> = {};
    const KEEP_INVESTIGATOR_KEYS = ['生命值', '理智值', '魔法值', '姓名', '职业', '姿态', '状态条件', '幸运'];
    for (const k of KEEP_INVESTIGATOR_KEYS) {
      if (k in i) slim[k] = i[k];
    }
    if (Object.keys(slim).length > 0) out['调查员'] = slim;
  }
  if (stat['世界']) out['世界'] = stat['世界'];
  if (stat['战斗']) out['战斗'] = stat['战斗'];
  const plot = stat['剧情'];
  if (plot && typeof plot === 'object') {
    const p = plot as Record<string, unknown>;
    const slim: Record<string, unknown> = {};
    if ('暗线' in p) slim['暗线'] = p['暗线'];
    if ('阶段' in p) slim['阶段'] = p['阶段'];
    if (Object.keys(slim).length > 0) out['剧情'] = slim;
  }
  return out;
}

/**
 * 把动态 lore 内容 + baseFormat 的动态附加段拼成 dynamicTail 字符串。
 * 调用方负责把 dynamicTail prepend 到最后一条 user.content 之前——重组后这段就紧贴用户输入，
 * 成为合并 user 内容的【末段】(动态高注意力区)，前面的内容（静态 system+静态 lore）成为字节稳定前缀。
 */
export function buildDynamicTail(input: {
  /** 已 EJS/宏渲染、按 priority 排序的动态 lore 内容数组 */
  dynamicLoreContents: readonly string[];
  /** baseFormat 拆出的动态附加段（能力/物品/NPC/地点/支柱/saveWorld/序章 等，已渲染） */
  dynamicFormatParts: readonly string[];
}): string {
  const parts: string[] = [];
  const lore = input.dynamicLoreContents.filter((s) => s && s.trim()).join('\n');
  if (lore) parts.push(lore);
  const fmt = input.dynamicFormatParts.filter((s) => s && s.trim()).join(JOINER);
  if (fmt) parts.push(fmt);
  return parts.join(JOINER);
}

interface Entry {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

function normalizeRole(role: string): 'system' | 'user' | 'assistant' {
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  // 'model'(Gemini 风格) → 'assistant'
  return role === 'model' ? 'assistant' : 'system';
}

function groupEntries(entries: Entry[]): Array<{ role: Entry['role']; texts: string[] }> {
  const groups: Array<{ role: Entry['role']; texts: string[] }> = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.role === e.role) last.texts.push(e.text);
    else groups.push({ role: e.role, texts: [e.text] });
  }
  return groups;
}

function buildSections(
  groups: Array<{ role: Entry['role']; texts: string[] }>,
  roleTags: boolean,
): string[] {
  return groups.map((g) => {
    const content = g.texts.join(JOINER);
    return roleTags ? `<role==${g.role}>\n${content}\n</role==${g.role}>` : content;
  });
}

/**
 * 核心重组函数。返回新数组；不修改入参。
 *
 * @param messages 原 messages（按 SillyTavern 顺序: system→user→assistant→...→当前user）
 * @param config 重组配置
 * @param greenContents 可选：要下沉到底部高注意力区的绿灯 lore 内容（项目层从 lore buckets 抽出，按原 priority 顺序）
 */
export function restructureMessages(
  messages: readonly AssembledMessage[],
  config: DsRestructureConfig,
  greenContents?: readonly string[],
): AssembledMessage[] {
  if (!config.enabled || messages.length === 0) return messages.slice();

  // ── 1. 定位首条 user ──
  let firstUserIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (normalizeRole(messages[i].role) === 'user') { firstUserIdx = i; break; }
  }
  if (firstUserIdx < 0) {
    if (config.debugLog) console.log('[ds-cache-restructure] No user message found, skip');
    return messages.slice();
  }

  // ── 2. 切三区: preHistory / chatHistory(首 user 起) / postHistory ──
  const preHistory = messages.slice(0, firstUserIdx);
  const afterFirstUser = messages.slice(firstUserIdx);
  // chatHistory: 从首条 user 到"最后一条 user/tool"为止；postHistory: 之后的尾巴
  let lastConvIdx = 0;
  for (let i = afterFirstUser.length - 1; i >= 0; i--) {
    if (normalizeRole(afterFirstUser[i].role) === 'user') { lastConvIdx = i; break; }
  }
  const chatHistory = afterFirstUser.slice(0, lastConvIdx + 1);
  const postHistoryMessages = afterFirstUser.slice(lastConvIdx + 1);

  if (config.debugLog) {
    console.log('[ds-cache-restructure] Partition:', {
      preHistory: preHistory.length,
      chatHistory: chatHistory.length,
      postHistory: postHistoryMessages.length,
    });
  }

  // ── 3. preHistory 转 entries（剔除空白）──
  const preEntries: Entry[] = [];
  for (const m of preHistory) {
    const t = m.content.trim();
    if (t) preEntries.push({ role: normalizeRole(m.role), text: t });
  }

  // ── 4. postHistory 转 entries；尾部 assistant 可保留独立 ──
  const postEntries: Entry[] = [];
  const tailAssistantMessages: AssembledMessage[] = [];
  for (const m of postHistoryMessages) {
    const role = normalizeRole(m.role);
    const t = m.content.trim();
    if (!t) continue;
    if (role === 'assistant' && config.keepTailAssistant) {
      tailAssistantMessages.push({ role: 'assistant', content: t });
    } else {
      postEntries.push({ role, text: t });
    }
  }

  // ── 5. 首条 user 内容 ──
  const firstUserContent = chatHistory[0]?.content ?? '';
  const firstUserText = firstUserContent.trim();

  const greenEntries: Entry[] = (greenContents ?? [])
    .filter((c) => c && c.trim().length > 0)
    .map((c) => ({ role: 'system' as const, text: c.trim() }));

  const newMessages: AssembledMessage[] = [];
  const isSingleMessage = chatHistory.length <= 1;

  if (isSingleMessage) {
    // 路径 A（本项目常走路径）：合并 preHistory + green + postHistory + 首 user 到 ONE user message
    const allEntries: Entry[] = [...preEntries, ...greenEntries, ...postEntries];
    const sections = buildSections(groupEntries(allEntries), config.roleTags);
    if (firstUserText) sections.push(firstUserText);
    const merged = sections.join(JOINER);
    newMessages.push({ role: 'user', content: merged });
  } else {
    // 路径 B：有 chat history 的多轮场景
    // 顶部缓存区: preHistory + 首 user 合并成一条 user
    const preSections = buildSections(groupEntries(preEntries), config.roleTags);
    if (firstUserText) preSections.push(firstUserText);
    newMessages.push({ role: 'user', content: preSections.join(JOINER) });

    // 中间对话区: 第 2 条起的 chatHistory，按原样保留；内联 system 抽到底部
    const extractedSystems: Entry[] = [];
    for (let i = 1; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      const role = normalizeRole(msg.role);
      if (role === 'system') {
        const t = msg.content.trim();
        if (t) extractedSystems.push({ role: 'system', text: t });
        continue;
      }
      newMessages.push({ ...msg, role });
    }

    // 底部高注意力区: greenEntries + extractedSystems + postEntries → prepend 到最后 user.content 之前
    const bottomEntries = [...greenEntries, ...extractedSystems, ...postEntries];
    if (bottomEntries.length > 0) {
      const bottomText = buildSections(groupEntries(bottomEntries), config.roleTags).join(JOINER);
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (normalizeRole(newMessages[i].role) === 'user') {
          newMessages[i] = {
            ...newMessages[i],
            content: `${bottomText}${JOINER}${newMessages[i].content}`,
          };
          break;
        }
      }
    }
  }

  // ── 6. 尾部 assistant 与自定义 prefill ──
  for (const m of tailAssistantMessages) newMessages.push(m);
  if (config.customPrefillEnabled) {
    const tail = config.customPrefillContent.trim();
    if (tail) newMessages.push({ role: 'assistant', content: tail });
  }

  if (config.debugLog) {
    console.log('[ds-cache-restructure] BEFORE:');
    messages.forEach((m, i) =>
      console.log(`  [${i}] ${m.role}: ${m.content.slice(0, 80).replace(/\n/g, '⏎')}`),
    );
    console.log('[ds-cache-restructure] AFTER:');
    newMessages.forEach((m, i) =>
      console.log(`  [${i}] ${m.role}: ${m.content.slice(0, 80).replace(/\n/g, '⏎')}`),
    );
  }

  return newMessages;
}
