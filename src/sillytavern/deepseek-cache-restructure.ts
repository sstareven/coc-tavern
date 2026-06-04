/**
 * DeepSeek 前缀缓存优化器 —— 消息三区重组（移植自 SillyTavern 插件 deepseek-cache-optimizer
 * by @kousakayou；仅迁移算法，不引入 ST 运行时依赖）。
 *
 * 原理：把 SillyTavern 风格的 [system×N, user×1, assistant×M, user...] 数组重组成三个区域，
 * 使 DeepSeek API 的"逐字节最长公共前缀"缓存最大化命中：
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ 顶部（缓存区） — 第一条 user 之前所有 system 设定 + 首条 user 内容       │
 *   │   按相邻同 role 分组、可加 <role==X> 标签包裹；合并成 ONE role:'user'。  │
 *   │   这是【字节稳定的长前缀】，每回合不变 → 命中缓存。                       │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ 中间（对话区） — 第二条起的 chat history，按原样保留；内联 system 抽到底部 │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ 底部（高注意力区） — 抽出的 system + 绿灯 lore + postHistory 拼到最后    │
 *   │   user.content 的【前面】（不是末尾），等效 D1 深度的高注意力位          │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * 本项目通常 history=[]（每回合 stateless 重构 prompt），走 isSingleMessage 路径：
 * 所有 system + 当前 user 拍平成【一条 user 消息】，messages.length 通常变为 1。
 *
 * 仅当当前模型源在 targetSources 命中时启用（默认 'deepseek,custom'）；其他模型零副作用。
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

export const DEFAULT_RESTRUCTURE_CONFIG: DsRestructureConfig = {
  enabled: false,
  roleTags: true,
  debugLog: false,
  keepTailAssistant: true,
  customPrefillEnabled: false,
  customPrefillContent: '',
  separateWiLights: false,
};

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
