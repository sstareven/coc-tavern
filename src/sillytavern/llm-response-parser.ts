import { computeNextPageNumber, computeNextRightPageNumber } from './context-builder';
import { pushLog } from '../stores/useLogStore';
import { useBookStore } from '../stores/useBookStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useKeywordStore } from '../stores/useKeywordStore';
import type { BookPage, SceneInfo, InventoryChange, InventoryAction, ItemCategory, RewriteBlock, ChoiceItem } from '../types';
import { CLUE_TAGS } from '../types';
import type { ClueInput } from '../stores/useClueStore';
import type { NpcUpdate } from '../stores/useNpcStore';
import type { MapUpdates } from '../stores/useMapStore';

const VALID_ITEM_CATEGORIES = new Set<ItemCategory>(['weapon', 'tool', 'consumable', 'clue', 'key_item', 'misc']);

export interface DarkThreadData {
  development: string;
  progress: number;
  threatLevel: string;
  foreshadowing: string;
}

export interface ParsedLlmResult {
  page: BookPage;
  darkThread?: DarkThreadData;
  /** 开局一次性生成的「坏结局」描述（守秘人机密，玩家不可见） */
  badEnding?: string;
  clues?: ClueInput[];
  npcUpdates?: NpcUpdate[];
  mapUpdates?: MapUpdates;
}

function extractVarTags(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  let m;
  const re = /<var\s+name=['"]([^"']+)['"]\s+value=['"]([^"']*)['"]\s*\/>/gi;
  while ((m = re.exec(text)) !== null) {
    if (m[2]) vars[m[1]] = m[2];
  }
  return vars;
}

/** 把 JSON 双重转义残留的字面 \n \r \t 还原为真实字符（仅作用于已 JSON.parse 解码后的字符串）。
 *  只匹配「反斜杠+字母」这种转义残体；真实换行字符(U+000A)不含反斜杠，不会被误伤。
 *  根因：LLM 偶尔产出双重转义 JSON（值内是两个字面字符 \ + n），JSON.parse 解码后残留字面 \n。 */
export function unescapeLiteralNewlines(s: string): string {
  return s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t');
}

export function stripMvu(s: string): string {
  return s
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '{{$2}}')
    .replace(/<(em)>([\s\S]*?)<\/\1>/gi, '{{$2}}')
    .replace(/<i(?!\s+data-)(?:\s[^>]*)?>([\s\S]*?)<\/i>/gi, '{{$1}}')
    .replace(/<var\s+name=['"][^"']+['"]\s+value=['"][^"']*['"]\s*\/>/gi, '')
    .replace(/<i\s+data-(?:var|set|val)="[^"]*"[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{set:[^}]+\}\}/gi, '')
    // LLM 偶尔把关键词写成单层花括号 {词}（应为 {{词}}），规范化以便高亮、
    // 避免原始花括号直接暴露给玩家。已有的 {{词}} 整体匹配后原样保留，不会被误改。
    .replace(/\{\{[^{}]*\}\}|\{([^{}:=,]+)\}/g, (m, kw) => (kw ? `{{${kw}}}` : m))
    .trim();
}

/**
 * 宽松剥除 var 标签——兼容 LLM 偶发的「畸形」写法。
 *
 * 正常格式: <var name='x' value='y'/>。但 LLM 有时漏空格/漏关键字/引号错配，
 * 产出如 <Varname=lastAction'value='追踪'/> 或 <varname="lastCheck'value='追踪'/>，
 * 这些都过不了严格的 <var\s+name=... 正则而泄漏到选项里。本正则只要求
 * 「< + var(大小写,后可接任意字母) + ... + value= ... + />」即整体删除，覆盖畸形标签。
 */
export function stripVarTagsLoose(s: string): string {
  return s
    // 正常 / 畸形 self-closing var 标签：<var.../> | <Varname=.../>（要求含 value= 以避免误删普通 <varint> 之类）
    .replace(/<\s*var[A-Za-z]*\b[^<>]*?value\s*=[^<>]*?\/?>/gi, '')
    // 兜底：任何 <var.../> 自闭合标签（无 value= 的残体）
    .replace(/<\s*var[A-Za-z]*\b[^<>]*?\/>/gi, '');
}

/**
 * 清理选项字段（text / action）：剥除 var 标签（含畸形）、stripMvu、移除裸露的
 * 「(普通难度)/(困难难度)/(极难难度)」难度文字残留。
 *
 * 注意：合法检定标记 `进行XX检定(普通)` 不带「难度」二字，故不会被难度清理误删，
 * 掷骰判定（parseCheckAction）依旧正常工作。
 */
export function cleanChoiceField(s: string): string {
  return stripMvu(
    stripVarTagsLoose(s)
      // LLM 误写到叙事里的裸难度文字（非检定标记）。仅匹配带「难度」后缀者，保护 检定(普通) 标记。
      .replace(/[(（]\s*(?:普通|困难|极难)难度\s*[)）]/g, ''),
  )
    // 选项不展示关键词高亮花括号：{{梦}} → 梦（仅正文保留 {{}} 做悬停关键词）。
    // stripMvu 会把粗体转成 {{}}，故须在其之后剥除；再清掉任何残留的孤立花括号。
    .replace(/\{\{\s*([^{}]*?)\s*\}\}/g, '$1')
    .replace(/[{}]/g, '')
    // 清理标签/文字删除后遗留的连续空白与孤立标点
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，、。；：,.!?;:\s]+/, '')
    .trim();
}

/** 清理标题里不该出现的尖括号/花括号等格式残留（如 LLM 给标题套的 <…>）。 */
export function cleanHeader(s: string): string {
  return s.replace(/[<>{}]/g, '').trim();
}

/**
 * 转义 JSON 字符串值内部的"游离"英文直引号。
 *
 * LLM 常在叙事里用英文直引号给词语/对话/外文做注解（如 τὸ ὄνειρον, "梦境"），
 * 这些未转义的 " 会提前终止 JSON 字符串导致解析失败。本函数逐字符扫描，
 * 跟踪 inString 状态：遇到字符串内的 " 时向后看——只有当它后面（跳过空白）
 * 紧跟 : , } ] 或行尾（且 , 之后是合法 JSON 续接 token）时才视为真正的结束引号，
 * 否则当作内容引号转义为 \"。
 *
 * 安全性：合法 JSON 的字符串结束引号永远后接结构字符，故绝不会被误转义；
 * 最坏情况是漏修（仍解析失败，与不调用本函数等价），不会把合法 JSON 改坏。
 */
export function escapeStrayInnerQuotes(s: string): string {
  const isWs = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inString) {
      out += c;
      if (c === '"') inString = true;
      continue;
    }
    if (escaped) { out += c; escaped = false; continue; }
    if (c === '\\') { out += c; escaped = true; continue; }
    if (c !== '"') { out += c; continue; }

    // 字符串内遇到 " —— 判断是真正的结束引号还是游离的内容引号
    let j = i + 1;
    while (j < s.length && isWs(s[j])) j++;
    const nc = j < s.length ? s[j] : '';
    let terminator = false;
    if (nc === '' || nc === '}' || nc === ']' || nc === ':') {
      terminator = true;
    } else if (nc === ',') {
      let k = j + 1;
      while (k < s.length && isWs(s[k])) k++;
      const cc = k < s.length ? s[k] : '';
      // 逗号后必须是合法 JSON 续接：字符串键/元素、对象、数组、数字或字面量
      if (cc === '' || cc === '"' || cc === '{' || cc === '[' || cc === '-'
          || (cc >= '0' && cc <= '9') || cc === 't' || cc === 'f' || cc === 'n') {
        terminator = true;
      }
    }
    if (terminator) { out += '"'; inString = false; }
    else { out += '\\"'; }
  }
  return out;
}

/**
 * 仅在 JSON 结构位置（字符串外）把全角标点归一化为半角：，、→, ：→: ；→, ［］→[] ｛｝→{}。
 * 字符串值内部的中文标点（叙事正文）原样保留——逐字符扫描跟踪 inString/escaped 状态，
 * 与 escapeStrayInnerQuotes 同款状态机。必须在弯引号归一化之后调用（此时分隔符只剩 ASCII "）。
 */
export function normalizeStructuralPunct(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      out += c;
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    // 字符串外：归一化结构标点
    if (c === '"') { out += c; inString = true; continue; }
    if (c === '，' || c === '、' || c === '；') out += ',';
    else if (c === '：') out += ':';
    else if (c === '［') out += '[';
    else if (c === '］') out += ']';
    else if (c === '｛') out += '{';
    else if (c === '｝') out += '}';
    else out += c;
  }
  return out;
}

export interface JsonCoercion {
  parsed: Record<string, unknown> | null;
  /** 最终用于解析的处理后字符串（供失败诊断）。 */
  jsonStr: string;
  /** 末次解析错误（含位置上下文），成功时为空。 */
  error: string;
}

/**
 * 将"脏" LLM 文本强制解析为 JSON 对象。容错管线提炼自 parseLlmResponse 的清洗步骤，
 * 供整页解析与行动补写共用，避免两条路径的清洗能力分叉（行动补写曾因缺这些清洗而解析失败）。
 * 处理：代码块包裹、外层引号、大括号深度配对提取、中文全角标点/弯引号归一化、
 * 尾随逗号、零宽/控制字符，最多 3 次重试（含游离英文直引号转义）。失败时 parsed=null。
 */
export function coerceJsonObject(raw: string): JsonCoercion {
  // 先剥离思考块（COC 思考链 <thinking>/<think> 与双人成行 Subtext_think 注释），再提取 JSON——
  // 下方用 indexOf('{') 定位 JSON 起点，思考块若残留可能误导起点或破坏解析。
  let jsonStr = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<!--\s*begin_of_Subtext_think[\s\S]*?end_of_Subtext_think\s*-->/gi, '')
    .trim();

  const cbMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cbMatch) jsonStr = cbMatch[1].trim();

  jsonStr = jsonStr.replace(/^"(\s*\{[\s\S]*\}\s*)"$/m, '$1');
  if (jsonStr.startsWith('"') && /^\s*\{/.test(jsonStr.slice(1))) jsonStr = jsonStr.slice(1);
  if (jsonStr.endsWith('"') && /\}\s*$/.test(jsonStr.slice(0, -1))) jsonStr = jsonStr.slice(0, -1);

  const braceStart = jsonStr.indexOf('{');
  if (braceStart >= 0) {
    let depth = 0, inString = false, escaped = false, braceEnd = -1;
    for (let i = braceStart; i < jsonStr.length; i++) {
      const c = jsonStr[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = false; }
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
    }
    if (braceEnd > 0) jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
  }

  // 顺序要求（见 Oracle 复核）：先把弯引号归一化掉，使分隔符只剩 ASCII "，
  // 之后 normalizeStructuralPunct 的 inString 跟踪才可靠；最后清尾随逗号。
  // 重复转义引号清理；中文弯引号→「」（结构外强调，「」非 JSON 分隔符，可 blanket 替换）
  jsonStr = jsonStr.replace(/(\\”){2,}/g, '\\”');
  jsonStr = jsonStr.replace(/“/g, '「').replace(/”/g, '」');
  jsonStr = jsonStr.replace(/([一-鿿　-〿＀-｠。！？、，；：])”([^”]{1,50})”([一-鿿　-〿＀-｠。！？、，；：\n])/g, '$1「$2」$3');
  jsonStr = jsonStr.replace(/<var\s+name=”([^”]*)”\s+value=”([^”]*)”\s*\/>/gi, '<var name=\'$1\' value=\'$2\'/>');

  // 结构标点归一化：仅作用于字符串外，保护叙事正文里的中文标点（，、：；）
  jsonStr = normalizeStructuralPunct(jsonStr);

  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      return { parsed, jsonStr, error: '' };
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      const posMatch = lastErr.match(/position\s+(\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const ctx = jsonStr.substring(Math.max(0, pos - 30), Math.min(jsonStr.length, pos + 30));
        lastErr += ` | 上下文: ...${ctx}...`;
      }
      if (attempt === 0) jsonStr = jsonStr.replace(/[​-‍﻿ -]/g, '');
      else if (attempt === 1) jsonStr = escapeStrayInnerQuotes(jsonStr);
    }
  }
  return { parsed: null, jsonStr, error: lastErr };
}

/**
 * 归一化用于「物品名 ↔ 叙事」匹配：去除 {{}} 关键词括号、空白与标点/符号，转小写。
 * CJK 安全（无词边界依赖）。
 */
function normForMatch(s: string): string {
  return s
    .replace(/\{\{|\}\}/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

/**
 * 判定某物品名是否在叙事中被提及（硬执行物品叙事一致性）。
 * 平衡「漏判(误删真实物品)」与「误判(放过幻影物品)」：
 *  - 整名出现 → 命中；
 *  - 短名(≤3字)要求整名出现，避免单字误命中；
 *  - 长名：物品名与叙事的「最长连续公共子串」≥ 名称长度的一半(且≥2) → 命中。
 *    可容忍"泛黄的信件"↔叙事"一封泛黄的信"(公共子串"泛黄的信")这类变体，
 *    又不会被零散单字误命中。CJK 无词边界，故用连续子串而非分词。
 */
function longestCommonSubstr(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let best = 0;
  let prev = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

export function itemNarrated(name: string, narrative: string): boolean {
  const n = normForMatch(name);
  if (!n) return false;
  const hay = normForMatch(narrative);
  if (hay.includes(n)) return true;
  const len = [...n].length;
  if (len <= 3) return false;
  const need = Math.max(2, Math.ceil(len / 2));
  return longestCommonSubstr(n, hay) >= need;
}

export function parseLlmResponse(raw: string, opts?: { skipInventoryNarrativeCheck?: boolean }): ParsedLlmResult | null {
  // 容错清洗与解析统一走 coerceJsonObject（与行动补写共用同一管线，避免清洗能力分叉）。
  const { parsed, jsonStr, error } = coerceJsonObject(raw);

  if (!parsed) {
    pushLog('warn', `[parseLlm] JSON解析失败。原因: ${error}。\n=== 处理后JSON(全部${jsonStr.length}字) ===\n${jsonStr}\n=== 原始文本(全部${raw.length}字) ===\n${raw}`, 'system');
    return null;
  }

  let sceneInfo: SceneInfo | undefined;
    if (parsed.sceneInfo && typeof parsed.sceneInfo === 'object') {
      const si = parsed.sceneInfo as Record<string, unknown>;
      sceneInfo = {
        date: String(si.date ?? ''),
        weekday: String(si.weekday ?? ''),
        time: String(si.time ?? ''),
        weather: String(si.weather ?? ''),
        location: String(si.location ?? ''),
      };
    } else {
      const pages = useBookStore.getState().pages;
      sceneInfo = pages[pages.length - 1]?.sceneInfo;
    }

    const rawTextForVars = JSON.stringify(parsed);
    const allVars = extractVarTags(rawTextForVars);

    const defaultScene: SceneInfo = { date: '', weekday: '', time: '', weather: '', location: '' };
    const base = sceneInfo || defaultScene;
    if (allVars.location) sceneInfo = { ...base, location: allVars.location };
    if (allVars.date) sceneInfo = { ...(sceneInfo || defaultScene), date: allVars.date };
    if (allVars.time) sceneInfo = { ...(sceneInfo || defaultScene), time: allVars.time };
    if (allVars.weather) sceneInfo = { ...(sceneInfo || defaultScene), weather: allVars.weather };
    if (Object.keys(allVars).length > 0) {
      try {
        const st = useVariableStore.getState();
        for (const [k, v] of Object.entries(allVars)) {
          if (v) st.setVariable(k, v, 'llm');
        }
      } catch { /* store not available */ }
    }

    let pageKeywords: Record<string, string> | undefined;
    if (parsed.keywords && typeof parsed.keywords === 'object') {
      const kw = parsed.keywords as Record<string, unknown>;
      const entries: Record<string, string> = {};
      for (const [k, v] of Object.entries(kw)) {
        if (typeof v === 'string') entries[k] = v;
      }
      if (Object.keys(entries).length > 0) {
        pageKeywords = entries;
        useKeywordStore.getState().addKeywords(entries);
        pushLog('debug', `[parseLlm] 新增关键词: ${Object.keys(entries).join(', ')}`, 'system');
      }
    }

    const leftHeader = cleanHeader(String(parsed.leftHeader ?? '探索')) || '探索';
    const leftContent = stripMvu(unescapeLiteralNewlines(String(parsed.leftContent ?? raw)));
    const rightHeader = cleanHeader(String(parsed.rightHeader ?? '行动')) || '行动';
    const rightContent = stripMvu(unescapeLiteralNewlines(String(parsed.rightContent ?? '接下来你打算怎么做？')));

    let choices = Array.isArray(parsed.choices)
      ? parsed.choices.map((c: unknown, i: number) => {
          const item = c as Record<string, unknown>;
          return {
            num: String(item.num ?? String(i + 1)),
            text: cleanChoiceField(String(item.text ?? `选项 ${i + 1}`)),
            action: cleanChoiceField(String(item.action ?? item.text ?? '')),
          };
        })
      : [];

    while (choices.length < 4) {
      choices.push({
        num: String(choices.length + 1),
        text: '继续探索',
        action: '继续探索当前环境',
      });
    }
    choices = choices.slice(0, 4);

    pushLog('debug', `[parseLlm] JSON解析成功 — leftHeader="${leftHeader}", rightHeader="${rightHeader}", choices=${choices.length}条, sceneInfo=${sceneInfo ? '有' : '无'}`, 'system');
    pushLog('debug', `[parseLlm] 左页: ${leftContent}\n[parseLlm] 右页: ${rightContent}\n[parseLlm] 选项: ${choices.map((c: { num: string; text: string }) => c.num+'.'+c.text).join(' | ')}`, 'system');

    const summary = typeof parsed.summary === 'string' ? parsed.summary : undefined;

    const validActions = new Set<InventoryAction>(['add', 'remove', 'update']);
    const validCategories = VALID_ITEM_CATEGORIES;
    let inventoryChanges: InventoryChange[] | undefined;
    if (Array.isArray(parsed.inventoryChanges)) {
      // 物品叙事一致性硬执行：获取(add)/失去(remove)的物品名必须在本回合叙事中被提及，
      // 否则丢弃该变化并告警。update(纯数量增减)不强制点名，避免误删。
      const narrative = leftContent + '\n' + rightContent;
      const skipCheck = opts?.skipInventoryNarrativeCheck === true;
      inventoryChanges = (parsed.inventoryChanges as Record<string, unknown>[])
        .filter((c) => c && typeof c.action === 'string' && typeof c.name === 'string' && validActions.has(c.action as InventoryAction))
        .map((c) => {
          const change: InventoryChange = {
            action: c.action as InventoryAction,
            name: String(c.name).trim(),
          };
          if (c.category && validCategories.has(String(c.category) as ItemCategory)) change.category = String(c.category) as ItemCategory;
          if (typeof c.quantity === 'number') change.quantity = c.quantity;
          if (typeof c.description === 'string') change.description = c.description;
          return change;
        })
        .filter((change) => {
          const enforced = change.action === 'add' || change.action === 'remove';
          if (skipCheck || !enforced) return true;
          if (itemNarrated(change.name, narrative)) return true;
          pushLog('warn', `[parseLlm] 物品变化被丢弃(叙事未提及该物品): ${change.action}:${change.name}`, 'system');
          return false;
        });
      if (inventoryChanges.length > 0) {
        pushLog('debug', `[parseLlm] 物品变化: ${inventoryChanges.map((c) => `${c.action}:${c.name}`).join(', ')}`, 'system');
      } else {
        inventoryChanges = undefined;
      }
    }

    // ── 独立线索库 ──
    const CLUE_TAG_SET = new Set<string>(CLUE_TAGS);
    let clues: ClueInput[] | undefined;
    if (Array.isArray(parsed.clues)) {
      clues = (parsed.clues as Record<string, unknown>[])
        .filter((c) => c && typeof c.name === 'string')
        .map((c) => {
          // 受控分类标签：仅保留落在 CLUE_TAGS 白名单内者；去重；全不合法则省略。
          const tags = Array.isArray(c.tags)
            ? [...new Set((c.tags as unknown[]).map(String).filter((t) => CLUE_TAG_SET.has(t)))]
            : undefined;
          return {
            name: String(c.name).trim(),
            summary: typeof c.summary === 'string' ? c.summary : (typeof c['简述'] === 'string' ? String(c['简述']) : ''),
            discoveryNarrative: typeof c.discoveryNarrative === 'string' ? c.discoveryNarrative : (typeof c['发现细节'] === 'string' ? String(c['发现细节']) : ''),
            relatedTo: Array.isArray(c.relatedTo) ? (c.relatedTo as unknown[]).map(String) : undefined,
            tags: tags && tags.length > 0 ? tags : undefined,
          };
        })
        .filter((c) => c.name);
      if (clues.length === 0) clues = undefined;
      else pushLog('debug', `[parseLlm] 线索: ${clues.map((c) => c.name).join(', ')}`, 'system');
    }

    // ── NPC 更新 ──
    let npcUpdates: NpcUpdate[] | undefined;
    if (Array.isArray(parsed.npcUpdates)) {
      npcUpdates = (parsed.npcUpdates as Record<string, unknown>[])
        .filter((n) => n && typeof n.name === 'string' && String(n.name).trim())
        .map((n) => {
          const u: NpcUpdate = { name: String(n.name).trim() };
          const uRec = u as unknown as Record<string, unknown>;
          const strFields = ['identity', 'faction', 'gender', 'appearanceAge', 'derived', 'appearance', 'personality', 'innerThoughts', 'experience', 'backstory', 'status', 'addMemory'] as const;
          for (const f of strFields) {
            if (typeof n[f] === 'string' && String(n[f]).trim()) uRec[f] = String(n[f]);
          }
          if (n.characteristics && typeof n.characteristics === 'object') u.characteristics = n.characteristics as NpcUpdate['characteristics'];
          if (n.skills && typeof n.skills === 'object') u.skills = n.skills as Record<string, number>;
          if (Array.isArray(n.possessions)) u.possessions = (n.possessions as unknown[]).map(String);
          if (typeof n.favorabilityDelta === 'number') u.favorabilityDelta = n.favorabilityDelta;
          if (typeof n.isPresent === 'boolean') u.isPresent = n.isPresent;
          return u;
        });
      if (npcUpdates.length === 0) npcUpdates = undefined;
      else pushLog('debug', `[parseLlm] NPC: ${npcUpdates.map((n) => n.name).join(', ')}`, 'system');
    }

    // ── 地图更新 ──
    let mapUpdates: MapUpdates | undefined;
    if (parsed.mapUpdates && typeof parsed.mapUpdates === 'object' && !Array.isArray(parsed.mapUpdates)) {
      const m = parsed.mapUpdates as Record<string, unknown>;
      const mu: MapUpdates = {};
      if (typeof m.current === 'string' && m.current.trim()) mu.current = m.current.trim();
      if (Array.isArray(m.newLocations)) {
        mu.newLocations = (m.newLocations as Record<string, unknown>[])
          .filter((l) => l && typeof l.name === 'string' && String(l.name).trim())
          .map((l) => ({ name: String(l.name).trim(), description: typeof l.description === 'string' ? l.description : (typeof l['描述'] === 'string' ? String(l['描述']) : '') }));
      }
      if (Array.isArray(m.newEdges)) {
        mu.newEdges = (m.newEdges as Record<string, unknown>[])
          .filter((e) => e && typeof e.from === 'string' && typeof e.to === 'string')
          .map((e) => ({ from: String(e.from).trim(), to: String(e.to).trim(), type: e.type === 'oneway' ? 'oneway' as const : 'bidirectional' as const, description: typeof e.description === 'string' ? e.description : undefined }));
      }
      if (mu.current || mu.newLocations?.length || mu.newEdges?.length) {
        mapUpdates = mu;
        pushLog('debug', `[parseLlm] 地图: 当前=${mu.current ?? '-'} 新地点=${mu.newLocations?.length ?? 0} 新连线=${mu.newEdges?.length ?? 0}`, 'system');
      }
    }

    let darkThread: DarkThreadData | undefined;
    if (parsed.darkThread && typeof parsed.darkThread === 'object') {
      const dt = parsed.darkThread as Record<string, unknown>;
      darkThread = {
        development: String(dt.development ?? ''),
        progress: Number(dt.progress) || 0,
        threatLevel: String(dt.threatLevel ?? ''),
        foreshadowing: String(dt.foreshadowing ?? ''),
      };
      if (darkThread.development) {
        pushLog('debug', `[parseLlm] 暗线: 进度${darkThread.progress} 威胁=${darkThread.threatLevel}`, 'system');
      }
    }

    // 开局一次性「坏结局」（守秘人机密）：仅取非空字符串。
    const badEnding = typeof parsed.badEnding === 'string' && parsed.badEnding.trim()
      ? parsed.badEnding.trim()
      : undefined;
    if (badEnding) pushLog('debug', '[parseLlm] 坏结局已生成（隐藏，仅守秘人）', 'system');

    return {
      page: {
        id: crypto.randomUUID(),
        leftHeader,
        leftContent,
        leftPage: computeNextPageNumber(),
        rightPage: computeNextRightPageNumber(),
        rightHeader,
        rightContent,
        rightChoices: choices,
        sceneInfo,
        summary,
        keywords: pageKeywords,
        inventoryChanges,
      },
      darkThread,
      badEnding,
      clues,
      npcUpdates,
      mapUpdates,
    };
}

const REWRITE_NUMERALS = ['V', 'VI', 'VII', 'VIII'];

/**
 * 解析「行动补写」返回的精简 JSON：{ text, choices[] }。
 * 选项强制重编号为 V–VIII，截断/补足到恰好 4 个。失败返回 null。
 * sourceInput 由调用方填充。
 */
export function parseRewriteResponse(raw: string): RewriteBlock | null {
  const { parsed, jsonStr, error } = coerceJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    pushLog('warn', `[parseRewrite] JSON解析失败。原因: ${error}。\n=== 处理后JSON(${jsonStr.length}字) ===\n${jsonStr}\n=== 原始文本(${raw.length}字) ===\n${raw}`, 'system');
    return null;
  }

  const text = typeof parsed.text === 'string' ? unescapeLiteralNewlines(parsed.text) : '';
  const rawChoices = Array.isArray(parsed.choices) ? (parsed.choices as Record<string, unknown>[]) : [];
  if (!text && rawChoices.length === 0) return null;

  const choices: ChoiceItem[] = rawChoices.slice(0, 4).map((c, i) => {
    const choice: ChoiceItem = {
      num: REWRITE_NUMERALS[i],
      text: cleanChoiceField(String(c?.text ?? `选项 ${i + 1}`)),
      action: cleanChoiceField(String(c?.action ?? c?.text ?? '')),
    };
    // 拾取物品：仅当 itemGain.name 为非空字符串时保留；category 非法则丢弃（让入库时按 misc 兜底）。
    const ig = c?.itemGain;
    if (ig && typeof ig === 'object') {
      const name = String((ig as Record<string, unknown>).name ?? '').trim();
      if (name) {
        const rawCat = (ig as Record<string, unknown>).category;
        const category = typeof rawCat === 'string' && VALID_ITEM_CATEGORIES.has(rawCat as ItemCategory)
          ? (rawCat as ItemCategory)
          : undefined;
        choice.itemGain = category ? { name, category } : { name };
      }
    }
    return choice;
  });
  while (choices.length < 4) {
    const i = choices.length;
    choices.push({ num: REWRITE_NUMERALS[i], text: '继续当前行动', action: '继续当前行动' });
  }
  return { text, choices, sourceInput: '' };
}
