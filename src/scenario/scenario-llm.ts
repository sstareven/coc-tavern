// 剧本编辑器作者伙伴 LLM 子调用 — 见 docs/specs/2026-06-06-scenario-system-design.md §5.3
// 7 命令:返回 ScenarioPatch 的子集片段,由 CompanionChat applyPatch 应用
import { callDsSubagent } from '../sillytavern/subagent-call';
import { hasDynamicMarker } from '../sillytavern/dynamic-markers';
import { useSettingsStore } from '../stores/useSettingsStore';
import { ALL_SKILLS, type Occupation } from '../sillytavern/coc-data';
import type {
  ScenarioEntry,
  ScenarioCategory,
  ScenarioCachePolicy,
  ScenarioMeta,
  DarkPhase,
  BadEnding,
  ScenarioCustomSkill,
} from '../types/scenario';

// M9 — system message 拆为静态共享段,跨命令共享以吃满 prompt 缓存(7 命令同一 hash)。
// D5 — 身份描述移到 user message **尾部**(原来在头部, user 段首字节就 diverge 致跨命令 cache miss);
//      现 user 段以业务大块(entries 摘要 / outline / 元信息)开头,尾部追加「【本次任务】<role>」,
//      让 entries.json 这种大段在 user 段尽早出现,prefix cache 可命中开头共享部分。
//
// ⚠️ M9 收益依赖 settings.dsCache.experimentalSubagentSharedSystem 关闭。
// 若该开关开启, wrapSubagentMessages 会替换原 system, 本 SHARED 字面量走不到 system 槽,
// 但 messages user 业务大块仍可共享前缀;role 名只在 user 段尾 diverge,不影响开头大段缓存。
// TODO(prompt-cache 实测验证): D5 修改后跨命令 user 段开头是否能在中转站 prompt cache 真正命中,
//      需要在实际 API 后端拉 cached_tokens metric 验证(本次仅做代码逻辑改进)。
const SHARED_SYSTEM_PROMPT = [
  '你是 COC 调查员叙事游戏(Call of Cthulhu)的【剧本编辑助手】,辅助守秘人构建/调整跑团剧本。',
  '严格遵守:',
  '1. 仅返回单个合法 JSON 对象,不要外层 markdown 围栏、不要解释、不要任何前缀后缀文本。',
  '2. 字符串字段使用简体中文。',
  '3. 不要发明字段;严格按用户给出的 schema 输出。',
  '4. EJS 标签按 <% %> 原样保留,不要转义。',
].join('\n');

// D5 — 身份描述拼到 user message **尾部**(尾部 diverge 不影响开头大段共享前缀)。
function buildUserFooter(role: string): string {
  return `\n\n【本次任务】${role}`;
}

// M6 — 直接用 callDsSubagent 已有的 parsed/parseError,不再自己 indexOf('{') 截取;
//      含 EJS <% if ... { %> 的回显里 lastIndexOf('}') 截不准会出错。
// A5 — 子调用抛 AbortError 时不能误诊为「JSON 解析失败」,要透传出去给上游 abort 处理。

// JSON 解析失败专用 error,让 safeCallJson 仅吞这类错(网络/HTTP 5xx/限流继续上抛)
export class ScenarioJsonParseError extends Error {
  readonly label: string;
  readonly snippet: string;
  readonly parseError?: string;
  constructor(label: string, snippet: string, parseError?: string) {
    super(`[scenario-llm ${label}] JSON 解析失败:${parseError || '无 parsed 对象'};snippet=${JSON.stringify(snippet)}`);
    this.name = 'ScenarioJsonParseError';
    this.label = label;
    this.snippet = snippet;
    this.parseError = parseError;
  }
}

async function callJson<T>(label: string, user: string, signal?: AbortSignal): Promise<T> {
  // 调用前先检查 abort,避免无意义发起
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const { baseUrl: apiBaseUrl, apiKey, model: apiModel } = useSettingsStore.getState().getEffectiveMainApi();
  let parsed: Record<string, unknown> | null = null;
  let parseError: string | undefined;
  let content = '';
  // A5 — callDsSubagent 自己已经处理 abort 透传,这里不再额外包 try/catch
  //      (原 catch 两个分支都是 throw err,语义无意义)。
  const resp = await callDsSubagent({
    apiBaseUrl,
    apiKey,
    model: apiModel,
    temperature: 0.7,
    maxTokens: 20000,
    rpmLane: 'rewrite', // 作者侧编辑,走 rewrite 桶,不挤主输出
    label: 'scenario:' + label,
    signal,
    messages: [
      { role: 'system', content: SHARED_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
  });
  parsed = resp.parsed;
  parseError = resp.parseError;
  content = resp.content;
  // A5 — 解析失败前再检查一次 abort(防 fetch 完成但调用方已 abort)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!parsed) {
    const snippet = (content || '').slice(0, 600);
    throw new ScenarioJsonParseError(label, snippet, parseError);
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
  // D5 — 业务大块(outline / schema 示例 / 规则)在前共享,「【本次任务】<role>」尾追。
  const user = [
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
  ].join('\n') + buildUserFooter(`为「${category}」类别批量生成 ${n} 条剧本条目`);
  return callJson<{ upsertEntries: ScenarioEntry[] }>('generateEntries', user);
}

// 2) 自动重新分类 — LLM 给每条 id → 新 category
// C4 — 全量 entries 会撞 context window;> 20 条时拆批,每批 ≤ 20 条,结果合并。
export async function autoCategorize(
  entries: ScenarioEntry[],
  signal?: AbortSignal,
): Promise<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }> {
  const BATCH_SIZE = 20;
  if (entries.length > BATCH_SIZE) {
    const merged: Array<{ id: string; category: ScenarioCategory }> = [];
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const partial = await autoCategorizeBatch(batch, signal);
      merged.push(...partial.recategorize);
    }
    return { recategorize: merged };
  }
  return autoCategorizeBatch(entries, signal);
}

async function autoCategorizeBatch(
  entries: ScenarioEntry[],
  signal?: AbortSignal,
): Promise<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }> {
  const summary = entries.map((e) => ({ id: e.id, comment: e.comment, currentCategory: e.category, contentPreview: e.content.slice(0, 200) }));
  // M7 — schema 字面量给真实 JSON 例子;枚举值放【规则】段。
  // D5 — 业务大块 summary 在前共享, role 名尾追。
  const user = [
    '以下是当前剧本所有条目摘要,请判断每条最合适的分类:',
    JSON.stringify(summary, null, 2),
    '',
    '【输出 JSON 示例】',
    '{ "recategorize": [ { "id": "loc_lighthouse", "category": "地点" } ] }',
    '',
    '【规则】',
    '- category 取值只能是:地点 / 人物 / 势力 / 物品线索 / 暗线 / 秘密与解锁。',
    '- 只列出需要变更的条目;分类已合适的条目不要包含。',
  ].join('\n') + buildUserFooter('对剧本全部条目进行自动分类调整');
  return callJson<{ recategorize: Array<{ id: string; category: ScenarioCategory }> }>('autoCategorize', user, signal);
}

// 3) 缓存策略判定 — MVP 直接本地启发式;TODO 让 LLM 二级判定边缘案例
export async function decideCachePolicy(
  entries: ScenarioEntry[],
  _signal?: AbortSignal,
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
  // D5 — 元信息 / hints / 示例 / 规则共享前缀, role 名尾追。
  const user = [
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
  ].join('\n') + buildUserFooter('基于剧本背景与现有条目生成暗线时间线');
  return callJson<{ upsertDarkTimeline: DarkPhase[] }>('generateDarkTimeline', user);
}

// 5) 坏结局矩阵生成
// C4 — darkTimeline 取前 8 phase / clue 摘要前 30 条;若 user payload > 12000 字符,追加截断说明。
export async function generateBadEndings(
  darkTimeline: DarkPhase[],
  entries: ScenarioEntry[],
): Promise<{ upsertBadEndings: BadEnding[] }> {
  const DARK_LIMIT = 8;
  const CLUE_LIMIT = 30;
  const darkTrimmed = darkTimeline.slice(0, DARK_LIMIT);
  const phaseSummary = darkTrimmed.map((p) => `- ${p.title}(threshold ${p.threshold}):${p.directorNote.slice(0, 100)}`).join('\n');
  const clueAll = entries.filter((e) => e.category === '物品线索' || e.category === '秘密与解锁');
  const clueTrimmed = clueAll.slice(0, CLUE_LIMIT);
  const clueSummary = clueTrimmed.map((e) => `- ${e.comment}`).join('\n');
  // M7 — schema 字面量给真实 JSON 例子;数量与语义放【规则】段。
  // D5 — 业务大块在前共享, role 名 / 截断说明都在尾部。
  const lines: string[] = [
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
  ];
  let user = lines.join('\n');
  const wasDarkTrimmed = darkTimeline.length > DARK_LIMIT;
  const wasClueTrimmed = clueAll.length > CLUE_LIMIT;
  if (user.length > 12000 || wasDarkTrimmed || wasClueTrimmed) {
    const notes: string[] = [];
    if (wasDarkTrimmed) notes.push(`darkTimeline 仅取前 ${DARK_LIMIT}/${darkTimeline.length}`);
    if (wasClueTrimmed) notes.push(`clue 摘要仅取前 ${CLUE_LIMIT}/${clueAll.length}`);
    user += `\n\n[已截断,仅取前 N 项:${notes.join(';') || '上下文过长'}]`;
  }
  user += buildUserFooter('基于暗线时间线和现有线索生成坏结局矩阵');
  return callJson<{ upsertBadEndings: BadEnding[] }>('generateBadEndings', user);
}

// 6) 单条目重写 — 同 id 改 content,保留其他字段
export async function rewriteEntry(
  entry: ScenarioEntry,
  instruction: string,
  signal?: AbortSignal,
): Promise<{ upsertEntries: ScenarioEntry[] }> {
  // M7 — schema 字面量给真实 JSON 例子;字段保留/EJS 处理放【规则】段。
  // D5 — 业务大块在前共享, role 名尾追。
  const user = [
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
  ].join('\n') + buildUserFooter('按指令重写单个剧本条目正文');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('rewriteEntry', user, signal);
}

// 7) 给条目套 EJS 解锁条件 — 包装 content 为 <% if (getvar('剧情.已解锁.X')==='true') %> 块
//    unlockKeys 显式给则本地包装(不走 LLM);为空则让 LLM 决策合适的 key
export async function injectEjsUnlock(
  entry: ScenarioEntry,
  unlockKeys?: string[],
  signal?: AbortSignal,
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
  // D5 — 原条目 / 示例 / 规则共享前缀, role 名尾追。
  const user = [
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
  ].join('\n') + buildUserFooter('为剧本条目添加 EJS 条件解锁包装');
  return callJson<{ upsertEntries: ScenarioEntry[] }>('injectEjsUnlock', user, signal);
}

// ============================================================================
// 时代化职业/技能池命令(Section 5)— spec §6
//
// 与前 7 命令的区别:
// - JSON 解析失败 → 返回空 patch + console.warn,不抛错(spec §6.4: "JSON 解析失败 →
//   不应用 patch + toast 报错；返回空数组合法")。前端 toast 由调用方根据 upsert*
//   是否为空判断,本层不破坏 await 链。
// - 共享 SHARED_SYSTEM_PROMPT + buildUserFooter(role) 走 prefix cache。
// ============================================================================

// 安全解析包装:JSON 解析失败时返回 fallback 并 warn;网络/HTTP 错 / AbortError 继续上抛
// (let 调用方 toast 真实错因,而不是误读成"返回空")
async function safeCallJson<T>(label: string, user: string, fallback: T, signal?: AbortSignal): Promise<T> {
  try {
    return await callJson<T>(label, user, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (err instanceof ScenarioJsonParseError) {
      // eslint-disable-next-line no-console
      console.warn(`[scenario-llm ${label}] JSON 解析失败,使用空 patch fallback;`, err);
      return fallback;
    }
    // 网络 / HTTP 4xx 5xx / 限流 等 — 不掩盖,让 UI 看到真实错因
    throw err;
  }
}

// 8) 时代化职业批量生成 — spec §6.1
//    池外技能名收集到 suggestedNewSkills,UI 可一键加入 customSkills
export async function generateCustomOccupations(
  meta: ScenarioMeta,
  existing: Occupation[],
  n = 10,
  signal?: AbortSignal,
): Promise<{ upsertOccupations: Occupation[]; suggestedNewSkills?: string[] }> {
  const existingNames = existing.map((o) => o.name);
  const skillWhitelist = ALL_SKILLS.map((s) => s.name);
  // D5 — 大块在前共享, role 名尾追。
  const user = [
    '剧本元信息:',
    JSON.stringify(meta, null, 2),
    '',
    `请按时代背景生成 ${n} 个职业(Occupation),严禁与下列已存在职业重名:`,
    JSON.stringify(existingNames),
    '',
    '【技能名白名单】(优先从中选择 8 个推荐技能)',
    JSON.stringify(skillWhitelist),
    '',
    '【输出 JSON 示例】',
    '{ "upsertOccupations": [ { "name": "罗马军团百夫长", "crMin": 30, "crMax": 60, "skills": ["战斗(剑)","聆听","侦查","说服","急救","攀爬","跳跃","聆听"] } ], "suggestedNewSkills": ["战车驾驶","古文献抄写"] }',
    '',
    '【规则】',
    `- 生成数量:约 ${n} 条 Occupation,严格按时代背景(${meta.type}/${meta.blurb})合理化。`,
    '- name: 时代特色职业名(罗马只允许罗马时代职业,禁止"会计/程序员"等现代名)。',
    '- crMin/crMax: 0~99 整数,按时代社会结构合理(贵族 50-90 / 农奴 0-5)。',
    '- skills: 长度为 8 的字符串数组,优先来自技能白名单。',
    '- 若职业必需的技能不在白名单(如罗马的"战车驾驶"),将该技能名收集到 suggestedNewSkills 输出(顶层),职业 skills 字段仍可填入该名(后续由作者一键加入 customSkills)。',
    '- suggestedNewSkills: 字符串数组,可省略或空数组。',
  ].join('\n') + buildUserFooter(`为「${meta.name}」时代背景生成 ${n} 个职业`);
  return safeCallJson<{ upsertOccupations: Occupation[]; suggestedNewSkills?: string[] }>(
    'occ-gen',
    user,
    { upsertOccupations: [], suggestedNewSkills: [] },
    signal,
  );
}

// 9) 时代化自定义技能批量生成 — spec §6.2
//    顺势察觉的不合时代标准技能收集到 suggestedBlacklist
export async function generateCustomSkills(
  meta: ScenarioMeta,
  existing: ScenarioCustomSkill[],
  n = 6,
  signal?: AbortSignal,
): Promise<{ upsertCustomSkills: ScenarioCustomSkill[]; suggestedBlacklist?: string[] }> {
  const existingNames = existing.map((s) => s.name);
  // D5 — 大块在前共享, role 名尾追。
  const user = [
    '剧本元信息:',
    JSON.stringify(meta, null, 2),
    '',
    `请按时代背景生成 ${n} 个 ScenarioCustomSkill,严禁与下列已存在自定义技能重名:`,
    JSON.stringify(existingNames),
    '',
    '【输出 JSON 示例】',
    '{ "upsertCustomSkills": [ { "name": "骑马", "base": 5, "cat": "运动系", "desc": "罗马时代骑乘马匹的技巧。" }, { "name": "古文献抄写", "base": 10, "cat": "侦查系" } ], "suggestedBlacklist": ["汽车驾驶","计算机使用"] }',
    '',
    '【规则】',
    `- 生成数量:约 ${n} 条 ScenarioCustomSkill,严格按时代背景(${meta.type}/${meta.blurb})合理化。`,
    '- name: 时代特色技能名(罗马时代如"骑马"/"古文献抄写"/"战车驾驶"/"短剑投掷")。',
    '- base: 数字(参考 COC 标准 5/10/20/25) 或字符串 "DEX_HALF" 或 "EDU" 三者之一。',
    '- cat: 必须是固定 6 类之一:"侦查系" / "护理系" / "运动系" / "战斗系" / "交涉系" / "生活系"。',
    '- desc: 可选,简体中文一句话描述。',
    '- 若顺带察觉本剧本不应保留的标准 ALL_SKILLS 名(如罗马剧本里的"汽车驾驶"/"电气维修"),收集到 suggestedBlacklist(顶层字符串数组,可省略)。',
  ].join('\n') + buildUserFooter(`为「${meta.name}」时代背景生成 ${n} 个自定义技能`);
  return safeCallJson<{ upsertCustomSkills: ScenarioCustomSkill[]; suggestedBlacklist?: string[] }>(
    'skill-gen',
    user,
    { upsertCustomSkills: [], suggestedBlacklist: [] },
    signal,
  );
}

// 10) 技能黑名单双向判定 — spec §6.3
//     给出应加入/应移除的两组建议 + reasonMap 解释
export async function proposeSkillBlacklist(
  meta: ScenarioMeta,
  currentBlacklist: string[],
  signal?: AbortSignal,
): Promise<{ addToBlacklist: string[]; removeFromBlacklist?: string[]; reasonMap?: Record<string, string> }> {
  const allSkillNames = ALL_SKILLS.map((s) => s.name);
  // D5 — 大块在前共享, role 名尾追。
  const user = [
    '剧本元信息:',
    JSON.stringify(meta, null, 2),
    '',
    '【完整 ALL_SKILLS 列表】(候选黑名单源)',
    JSON.stringify(allSkillNames),
    '',
    '【当前已勾选黑名单】',
    JSON.stringify(currentBlacklist),
    '',
    '【输出 JSON 示例】',
    '{ "addToBlacklist": ["汽车驾驶","电气维修","计算机使用"], "removeFromBlacklist": ["游泳"], "reasonMap": { "汽车驾驶": "罗马时代无汽车", "游泳": "罗马时代仍有渔民,不应禁" } }',
    '',
    '【规则】',
    `- 双向判定:对比剧本背景(${meta.type}/${meta.blurb}),从 ALL_SKILLS 中找出:`,
    '  a) 时代不通应禁但当前未禁 → addToBlacklist。',
    '  b) 当前已禁但实际合理 → removeFromBlacklist。',
    '- addToBlacklist / removeFromBlacklist 中的所有技能名必须出现在 ALL_SKILLS 列表里(否则白勾)。',
    '- reasonMap: 可选 Record<string,string>,对每个建议给一句话简体中文解释,用于 UI hover。',
    '- removeFromBlacklist / reasonMap 可省略或空对象。',
  ].join('\n') + buildUserFooter(`为「${meta.name}」时代背景双向判定技能黑名单`);
  return safeCallJson<{ addToBlacklist: string[]; removeFromBlacklist?: string[]; reasonMap?: Record<string, string> }>(
    'blacklist',
    user,
    { addToBlacklist: [], removeFromBlacklist: [], reasonMap: {} },
    signal,
  );
}
