// 剧本编辑器作者伙伴 LLM 子调用 — 见 docs/specs/2026-06-06-scenario-system-design.md §5.3
// 7 命令:返回 ScenarioPatch 的子集片段,由 CompanionChat applyPatch 应用
import { callDsSubagent } from '../sillytavern/subagent-call';
import { hasDynamicMarker } from '../sillytavern/dynamic-markers';
import { useSettingsStore } from '../stores/useSettingsStore';
import type {
  ScenarioEntry,
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioMeta,
  DarkPhase,
  BadEnding,
} from '../types/scenario';

// M9 — system message 拆为静态共享段,跨命令共享以吃满 prompt 缓存(7 命令同一 hash)。
// 身份描述不再 inline 进 system;调用方在 user message 顶部以「【本次任务】xxx」起首。
const SHARED_SYSTEM_PROMPT = [
  '你是 COC 调查员叙事游戏(Call of Cthulhu)的【剧本编辑助手】,辅助守秘人构建/调整跑团剧本。',
  '严格遵守:',
  '1. 仅返回单个合法 JSON 对象,不要外层 markdown 围栏、不要解释、不要任何前缀后缀文本。',
  '2. 字符串字段使用简体中文。',
  '3. 不要发明字段;严格按用户给出的 schema 输出。',
  '4. EJS 标签按 <% %> 原样保留,不要转义。',
].join('\n');

// 把身份描述拼到 user message 顶部,跨命令同一份 system 共享缓存。
function buildUserHeader(role: string): string {
  return `【本次任务】${role}\n\n`;
}

// M6 — 直接用 callDsSubagent 已有的 parsed/parseError,不再自己 indexOf('{') 截取;
//      含 EJS <% if ... { %> 的回显里 lastIndexOf('}') 截不准会出错。
async function callJson<T>(label: string, user: string): Promise<T> {
  const { apiBaseUrl, apiKey, apiModel } = useSettingsStore.getState();
  const { parsed, parseError, content } = await callDsSubagent({
    apiBaseUrl,
    apiKey,
    model: apiModel,
    temperature: 0.7,
    maxTokens: 20000,
    rpmLane: 'rewrite', // 作者侧编辑,走 rewrite 桶,不挤主输出
    label: 'scenario:' + label,
    messages: [
      { role: 'system', content: SHARED_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
  });
  if (!parsed) {
    const snippet = (content || '').slice(0, 200);
    throw new Error(
      `[scenario-llm ${label}] JSON 解析失败:${parseError || '无 parsed 对象'};snippet=${JSON.stringify(snippet)}`,
    );
  }
  return parsed as unknown as T;
}

// 1) 按 category + outline 生成 n 条新条目
export async function generateEntries(
  category: ScenarioCategory,
  outline: string,
  n = 5,
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  // M7 — schema 字面量给真实 JSON 例子;类型/枚举/范围放【规则】段。
  const user = [
    buildUserHeader(`为「${category}」类别批量生成 ${n} 条剧本条目`),
    `请基于以下大纲生成 ${n} 条「${category}」类别的剧本条目:`,
    '',
    outline,
    '',
    '【输出 JSON 示例】',
    '{ "upsertEntries": [ { "id": "loc_lighthouse", "category": "' + category + '", "comment": "灯塔", "keys": "灯塔,守塔人", "content": "<条目正文>", "constant": false, "position": 0, "priority": 50, "cachePolicy": "auto" } ] }',
    '',
    '【规则】',
    '- id: 短 slug(仅小写字母/数字/下划线),如 loc_lighthouse / npc_keeper。',
    '- category: 必须等于 "' + category + '"。',
    '- keys: 逗号分隔的关键词字符串(不是数组),用于命中匹配。',
    '- constant: boolean。是否常驻注入(true=蓝灯,false=按关键词激活)。',
    '- position: 整数 0|1|2|3|4(0=system 前,1=system 后,2=user 前,3=user 后,4=@D 注入)。',
    '- priority: 0~100 的数字。',
    '- cachePolicy: 固定 "auto"(后续由 decideCachePolicy 重判)。',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('generateEntries', user);
}

// 2) 自动重新分类 — LLM 给每条 id → 新 category
export async function autoCategorize(
  entries: ScenarioEntry[],
): Promise<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }> {
  const summary = entries.map((e) => ({ id: e.id, comment: e.comment, currentCategory: e.category, contentPreview: e.content.slice(0, 200) }));
  // M7 — schema 字面量给真实 JSON 例子;枚举值放【规则】段。
  const user = [
    buildUserHeader('对剧本全部条目进行自动分类调整'),
    '以下是当前剧本所有条目摘要,请判断每条最合适的分类:',
    JSON.stringify(summary, null, 2),
    '',
    '【输出 JSON 示例】',
    '{ "recategorize": [ { "id": "loc_lighthouse", "category": "地点" } ] }',
    '',
    '【规则】',
    '- category 取值只能是:地点 / 人物 / 势力 / 物品线索 / 暗线 / 秘密与解锁。',
    '- 只列出需要变更的条目;分类已合适的条目不要包含。',
  ].join('\n');
  return callJson<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }>('autoCategorize', user);
}

// 3) 缓存策略判定 — MVP 直接本地启发式;TODO 让 LLM 二级判定边缘案例
export async function decideCachePolicy(
  entries: ScenarioEntry[],
): Promise<{ setCachePolicies: Array<{ id: string; cachePolicy: ScenarioCachePolicy }> }> {
  // M8 — 复用 src/sillytavern/dynamic-markers.ts 的 hasDynamicMarker(覆盖 getvar/setvar/_.get/parseInt 等)。
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
  const hints = entries
    .filter((e) => e.category === '暗线' || e.category === '秘密与解锁')
    .map((e) => `- [${e.category}] ${e.comment}:${e.content.slice(0, 120)}`)
    .join('\n');
  // M7 — schema 字面量给真实 JSON 例子;数量/范围/语义放【规则】段。
  const user = [
    buildUserHeader('基于剧本背景与现有条目生成暗线时间线'),
    '剧本元信息:',
    JSON.stringify(meta, null, 2),
    '',
    '现有暗线与秘密相关条目摘要:',
    hints || '(无)',
    '',
    '【输出 JSON 示例】',
    '{ "upsertDarkTimeline": [ { "id": "phase_dawn", "threshold": 0, "title": "黎明序章", "triggers": ["调查员抵达渔村"], "directorNote": "灯塔仍未熄,海雾尚薄。", "autoUnlockKeys": ["渔村秘密"] } ] }',
    '',
    '【规则】',
    '- 生成 3~5 个 DarkPhase,按 threshold 0→100 递增。',
    '- threshold: 数字 0~100。',
    '- triggers / autoUnlockKeys: 字符串数组。autoUnlockKeys 用于条件解锁(写入 /剧情/已解锁/<key>)。',
  ].join('\n');
  return callJson<{ upsertDarkTimeline: DarkPhase[] }>('generateDarkTimeline', user);
}

// 5) 坏结局矩阵生成
export async function generateBadEndings(
  darkTimeline: DarkPhase[],
  entries: ScenarioEntry[],
): Promise<{ upsertBadEndings: BadEnding[] }> {
  const phaseSummary = darkTimeline.map((p) => `- ${p.title}(threshold ${p.threshold}):${p.directorNote.slice(0, 100)}`).join('\n');
  const clueSummary = entries
    .filter((e) => e.category === '物品线索' || e.category === '秘密与解锁')
    .map((e) => `- ${e.comment}`)
    .join('\n');
  // M7 — schema 字面量给真实 JSON 例子;数量与语义放【规则】段。
  const user = [
    buildUserHeader('基于暗线时间线和现有线索生成坏结局矩阵'),
    '暗线时间线:',
    phaseSummary || '(空)',
    '',
    '已有线索/秘密条目:',
    clueSummary || '(无)',
    '',
    '【输出 JSON 示例】',
    '{ "upsertBadEndings": [ { "id": "be_drowned", "condition": "SAN<20 且 暗线进度>60 且 守塔人NPC死亡", "narrative": "<结局正文>", "accelerators": ["失去理智","深潜召唤"] } ] }',
    '',
    '【规则】',
    '- 生成 3~6 个 BadEnding。',
    '- condition: 自然语言描述触发组合(SAN/暗线进度/NPC 状态等)。',
    '- accelerators: 字符串数组,列出会加速此结局的因素。',
  ].join('\n');
  return callJson<{ upsertBadEndings: BadEnding[] }>('generateBadEndings', user);
}

// 6) 单条目重写 — 同 id 改 content,保留其他字段
export async function rewriteEntry(
  entry: ScenarioEntry,
  instruction: string,
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  // M7 — schema 字面量给真实 JSON 例子;字段保留/EJS 处理放【规则】段。
  const user = [
    buildUserHeader('按指令重写单个剧本条目正文'),
    '原条目:',
    JSON.stringify(entry, null, 2),
    '',
    `重写指令:${instruction}`,
    '',
    '【输出 JSON 示例】',
    '{ "upsertEntries": [ { "id": "<原 id>", "category": "<原 category>", "comment": "<原 comment>", "keys": "<原 keys>", "content": "<重写后的正文>", "constant": false, "position": 0, "priority": 50, "cachePolicy": "auto" } ] }',
    '',
    '【规则】',
    '- 仅改写 content 字段;其余字段(id/category/comment/keys/constant/position/priority/cachePolicy/hidden)保持原值。',
    '- EJS <% %> 块若存在,保留语义。',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('rewriteEntry', user);
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
  // M7 — schema 字面量给真实 JSON 例子;包装格式/字段保留放【规则】段。
  const user = [
    buildUserHeader('为剧本条目添加 EJS 条件解锁包装'),
    '原条目:',
    JSON.stringify(entry, null, 2),
    '',
    '请自动决定 1~3 个最合适的解锁 key(写入 /剧情/已解锁/<key>),并将 content 包装为 EJS if 块。',
    '',
    '【包装格式示例】',
    "<% if (getvar('剧情.已解锁.K1')==='true' || getvar('剧情.已解锁.K2')==='true') { %>\n原 content\n<% } %>",
    '',
    '【输出 JSON 示例】',
    '{ "upsertEntries": [ { "id": "<原 id>", "category": "<原 category>", "comment": "<原 comment>", "keys": "<原 keys>", "content": "<包装后的正文>", "constant": false, "position": 0, "priority": 50, "cachePolicy": "auto" } ] }',
    '',
    '【规则】',
    '- 仅改写 content(包装为上述 EJS if 块);其余字段保持原值。',
    '- key 用简体中文短语,1~3 个,反映条目所属秘密/解锁条件。',
  ].join('\n');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('injectEjsUnlock', user);
}
