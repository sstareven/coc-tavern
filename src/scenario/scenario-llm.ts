// 剧本编辑器作者伙伴 LLM 子调用 — 见 docs/specs/2026-06-06-scenario-system-design.md §5.3
// 7 命令:返回 ScenarioPatch 的子集片段,由 CompanionChat applyPatch 应用
import { callDsSubagent } from '../sillytavern/subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';
import type {
  ScenarioEntry,
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioMeta,
  DarkPhase,
  BadEnding,
} from '../types/scenario';

// 动态 marker:命中即视为含 EJS 运行期分支,挂载阶段无法静态缓存
const DYNAMIC_MARKERS = ['getvar(', 'parseInt(', '<%'];

function hasDynamicMarker(content: string): boolean {
  return DYNAMIC_MARKERS.some((m) => content.includes(m));
}

function buildSystemPrompt(role: string): string {
  // 统一中文 system,强调 JSON only/字段保真,role 描述本次任务身份
  return [
    '你是 COC 调查员叙事游戏的剧本编辑助手。',
    `本次任务身份:${role}`,
    '严格遵守:',
    '1. 仅返回单个合法 JSON 对象,不要外层 markdown 围栏、不要解释、不要任何前缀后缀文本。',
    '2. 字符串字段使用简体中文。',
    '3. 不要发明字段;严格按用户给出的 schema 输出。',
    '4. EJS 标签按 <% %> 原样保留,不要转义。',
  ].join('\n');
}

// 截取首个 {...} 块并 JSON.parse;失败抛错带 content snippet(≤200 字)便于排错
function extractFirstJson<T>(label: string, content: string): T {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    const snippet = content.slice(0, 200);
    throw new Error(`[scenario-llm ${label}] 未找到 JSON 块;content snippet=${JSON.stringify(snippet)}`);
  }
  const raw = content.slice(start, end + 1);
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const snippet = raw.slice(0, 200);
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`[scenario-llm ${label}] JSON 解析失败:${reason};snippet=${JSON.stringify(snippet)}`);
  }
}

// 统一往返封装:取 settings → callDsSubagent → 抽 JSON
async function callJson<T>(label: string, system: string, user: string): Promise<T> {
  const { apiBaseUrl, apiKey, apiModel } = useSettingsStore.getState();
  const { content } = await callDsSubagent({
    apiBaseUrl,
    apiKey,
    model: apiModel,
    temperature: 0.7,
    maxTokens: 20000,
    rpmLane: 'rewrite', // 作者侧编辑,走 rewrite 桶,不挤主输出
    label: 'scenario:' + label,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return extractFirstJson<T>(label, content);
}

// 1) 按 category + outline 生成 n 条新条目
export async function generateEntries(
  category: ScenarioCategory,
  outline: string,
  n = 5,
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  const system = buildSystemPrompt(`为「${category}」类别批量生成 ${n} 条剧本条目`);
  const user = [
    `请基于以下大纲生成 ${n} 条「${category}」类别的剧本条目:`,
    '',
    outline,
    '',
    '输出 JSON schema:',
    '{ "upsertEntries": [ { "id": string, "category": "' + category + '", "comment": string, "keys": string(逗号分隔关键词), "content": string, "constant": boolean, "position": 0|1|2|3|4, "priority": number, "cachePolicy": "auto" } ] }',
    'id 用短 slug(如 loc_lighthouse),priority 0~100。',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('generateEntries', system, user);
}

// 2) 自动重新分类 — LLM 给每条 id → 新 category
export async function autoCategorize(
  entries: ScenarioEntry[],
): Promise<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }> {
  const system = buildSystemPrompt('对剧本全部条目进行自动分类调整');
  const summary = entries.map((e) => ({ id: e.id, comment: e.comment, currentCategory: e.category, contentPreview: e.content.slice(0, 200) }));
  const user = [
    '以下是当前剧本所有条目摘要,请判断每条最合适的分类:',
    JSON.stringify(summary, null, 2),
    '',
    '可选分类:地点 / 人物 / 势力 / 物品线索 / 暗线 / 秘密与解锁',
    '仅输出 JSON:{ "recategorize": [ { "id": string, "category": "地点"|"人物"|"势力"|"物品线索"|"暗线"|"秘密与解锁" } ] }',
    '只列出需要变更的条目;分类已合适的条目不要包含。',
  ].join('\n');
  return callJson<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }>('autoCategorize', system, user);
}

// 3) 缓存策略判定 — MVP 直接本地启发式;TODO 让 LLM 二级判定边缘案例
export async function decideCachePolicy(
  entries: ScenarioEntry[],
): Promise<{ setCachePolicies: Array<{ id: string; cachePolicy: ScenarioCachePolicy }> }> {
  // 启发式:含动态 marker → dynamic_suffix;constant=true 且无 marker → static_prefix;其他 auto
  // TODO: 二级 LLM 判定模糊条目(constant=false 且无 marker,可能本质是静态描述但作者忘开 constant)
  const setCachePolicies = entries.map((e) => {
    let policy: ScenarioCachePolicy;
    if (hasDynamicMarker(e.content)) policy = 'dynamic_suffix';
    else if (e.constant && !hasDynamicMarker(e.content)) policy = 'static_prefix';
    else policy = 'auto';
    return { id: e.id, cachePolicy: policy };
  });
  return Promise.resolve({ setCachePolicies });
}

// 4) 暗线时间线生成
export async function generateDarkTimeline(
  meta: ScenarioMeta,
  entries: ScenarioEntry[],
): Promise<{ upsertDarkTimeline: DarkPhase[] }> {
  const system = buildSystemPrompt('基于剧本背景与现有条目生成暗线时间线');
  const hints = entries
    .filter((e) => e.category === '暗线' || e.category === '秘密与解锁')
    .map((e) => `- [${e.category}] ${e.comment}:${e.content.slice(0, 120)}`)
    .join('\n');
  const user = [
    '剧本元信息:',
    JSON.stringify(meta, null, 2),
    '',
    '现有暗线与秘密相关条目摘要:',
    hints || '(无)',
    '',
    '请生成 3~5 个 DarkPhase,按 threshold 0→100 递增。',
    '输出 JSON:{ "upsertDarkTimeline": [ { "id": string, "threshold": number(0~100), "title": string, "triggers": string[], "directorNote": string, "autoUnlockKeys": string[] } ] }',
    'autoUnlockKeys 用于条件解锁,如 ["渔村秘密","灯塔真相"]。',
  ].join('\n');
  return callJson<{ upsertDarkTimeline: DarkPhase[] }>('generateDarkTimeline', system, user);
}

// 5) 坏结局矩阵生成
export async function generateBadEndings(
  darkTimeline: DarkPhase[],
  entries: ScenarioEntry[],
): Promise<{ upsertBadEndings: BadEnding[] }> {
  const system = buildSystemPrompt('基于暗线时间线和现有线索生成坏结局矩阵');
  const phaseSummary = darkTimeline.map((p) => `- ${p.title}(threshold ${p.threshold}):${p.directorNote.slice(0, 100)}`).join('\n');
  const clueSummary = entries
    .filter((e) => e.category === '物品线索' || e.category === '秘密与解锁')
    .map((e) => `- ${e.comment}`)
    .join('\n');
  const user = [
    '暗线时间线:',
    phaseSummary || '(空)',
    '',
    '已有线索/秘密条目:',
    clueSummary || '(无)',
    '',
    '请生成 3~6 个 BadEnding,每个条件用自然语言描述触发组合(SAN/暗线进度/NPC 状态等)。',
    '输出 JSON:{ "upsertBadEndings": [ { "id": string, "condition": string, "narrative": string, "accelerators": string[] } ] }',
  ].join('\n');
  return callJson<{ upsertBadEndings: BadEnding[] }>('generateBadEndings', system, user);
}

// 6) 单条目重写 — 同 id 改 content,保留其他字段
export async function rewriteEntry(
  entry: ScenarioEntry,
  instruction: string,
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  const system = buildSystemPrompt('按指令重写单个剧本条目正文');
  const user = [
    '原条目:',
    JSON.stringify(entry, null, 2),
    '',
    `重写指令:${instruction}`,
    '',
    '仅改写 content 字段;其余字段(id/category/comment/keys/constant/position/priority/cachePolicy/hidden)保持原值。',
    'EJS <% %> 块若存在,保留语义。',
    '输出 JSON:{ "upsertEntries": [ <整个重写后的条目对象> ] }',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('rewriteEntry', system, user);
}

// 7) 给条目套 EJS 解锁条件 — 包装 content 为 <% if (getvar('剧情.已解锁.X')==='true') %> 块
//    unlockKeys 显式给则本地包装(不走 LLM);为空则让 LLM 决策合适的 key
export async function injectEjsUnlock(
  entry: ScenarioEntry,
  unlockKeys?: string[],
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  if (unlockKeys && unlockKeys.length > 0) {
    // 本地包装路径:多 key 用 || 连接;原 content 留作 if 块内
    const cond = unlockKeys
      .map((k) => `getvar('剧情.已解锁.${k}')==='true'`)
      .join(' || ');
    const wrapped = `<% if (${cond}) { %>\n${entry.content}\n<% } %>`;
    return { upsertEntries: [{ ...entry, content: wrapped }] };
  }
  // LLM 决策路径:让模型自选合适 key 并产出包装后的条目
  const system = buildSystemPrompt('为剧本条目添加 EJS 条件解锁包装');
  const user = [
    '原条目:',
    JSON.stringify(entry, null, 2),
    '',
    "请自动决定 1~3 个最合适的解锁 key(写入 /剧情/已解锁/<key>),并将 content 包装为:",
    "<% if (getvar('剧情.已解锁.K1')==='true' || getvar('剧情.已解锁.K2')==='true') { %>\\n原 content\\n<% } %>",
    '',
    '其余字段保持原值。',
    '输出 JSON:{ "upsertEntries": [ <整个包装后的条目对象> ] }',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('injectEjsUnlock', system, user);
}
