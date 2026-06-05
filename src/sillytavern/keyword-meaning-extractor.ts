import { callDsSubagent } from './subagent-call';
import { pushLog } from '../stores/useLogStore';
import type { TokenUsage } from './stream-parser';

/**
 * 关键词释义补全提示词：扫描叙事中 `<kw>X</kw>` 标签的关键词，给未知词补 10-30 字释义。
 *
 * 主回合 LLM 可能漏写 keywords 字段（主 JSON 末尾字段在长 prompt 下易截断/省略），
 * 导致渲染端 KeywordTooltip.getMeaning 查不到释义、tooltip 显示不出来。本子调用
 * 与主回合彻底解耦，只负责为未知关键词补释义，让玩家看到完整 hover 提示。
 *
 * 与 location-element-extractor / bad-ending-generator 同范式：独立 Flash 调用 +
 * rpmAcquire + appIdHeaders + 容错 JSON 解析 + 仅对 parsed===null 重试。
 */
const KEYWORD_MEANINGS_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人助手。下面给出本回合的【叙事正文】与一份【需要补充释义的关键词列表】。请基于叙事中对每个关键词的描述与上下文，给出简短释义。

要求：
1. 每个释义控制在 10-30 字之间，不要太长。
2. 释义须基于叙事中的具体描述与上下文——如「<kw>沃特雷</kw>」在叙事中被提及「敦威治当地古老家族，与山丘巨石圆环有关」，释义就应反映这点。
3. 若叙事对某个关键词信息不足，可结合 COC 7e 通用克苏鲁神话设定推断；地名/术语若属经典 COC 词条（阿卡姆、印斯茅斯、奈克特抄本、克苏鲁等），直接按通用知识给释义。
4. 释义应是【中性的、客观的】事实描述，不要把玩家视角的"你"或叙事评价带进释义。
5. 列表中每一个关键词都必须给出释义，不得遗漏；不在列表中的词不必给。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "关键词1": "10-30字简短释义",
  "关键词2": "..."
}
若叙事过短或没有可补释义的词，输出空对象 {}。`;

export interface ExtractKeywordMeaningsResult {
  /** 补全的释义字典：{关键词: 10-30 字释义}；未补到的词不出现在结果里。 */
  meanings: Record<string, string>;
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用为本回合 `<kw>X</kw>` 标签里的未知关键词补释义。与主回合生成完全解耦，
 * 不占用主输出的 token 预算。复用 location-element-extractor 同款独立调用范式。
 *
 * @param narrative          本回合叙事正文（leftContent + rightContent 拼接）
 * @param unknownKeywords    需要补释义的关键词列表（调用方已去重 + 过滤掉 useKeywordStore/page.keywords 已有的）
 * @returns meanings 字典；解析失败或列表为空时返回 {}
 */
export async function extractKeywordMeanings(
  narrative: string,
  unknownKeywords: string[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.5,
  maxTokens = 20000, // 思考型模型把预算耗在 reasoning 上，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,       // API 层重试：仅对「截断/空响应/parsed===null」重试
): Promise<ExtractKeywordMeaningsResult> {
  if (unknownKeywords.length === 0) return { meanings: {} };

  pushLog('info', `[关键词释义] 开始为 ${unknownKeywords.length} 个未知关键词补释义，模型=${model}：${unknownKeywords.join('、')}`, 'api');

  let lastError = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500)); // 截断/空响应退避后重试
    let resp;
    try {
      resp = await callDsSubagent({
        apiBaseUrl, apiKey, model, temperature, maxTokens, rpmLane: 'main',
        label: '关键词释义补全',
        messages: [
          { role: 'system', content: KEYWORD_MEANINGS_PROMPT },
          {
            role: 'user',
            content:
              `需要补充释义的关键词列表（共 ${unknownKeywords.length} 个）：${unknownKeywords.join('、')}\n` +
              `本回合叙事正文：\n${narrative}`,
          },
        ],
      });
    } catch (err) {
      pushLog('error', `[关键词释义] API 返回错误 ${err instanceof Error ? err.message : String(err)}`, 'api');
      throw err;
    }
    const { content, parsed, parseError, usage } = resp;

    // 健壮解析：期望 {关键词: 释义, ...} 顶层对象。
    let meanings: Record<string, string> = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        const key = String(k).trim();
        const val = typeof v === 'string' ? v.trim() : '';
        if (key && val && unknownKeywords.includes(key)) {
          meanings[key] = val;
        }
      }
    }

    if (Object.keys(meanings).length > 0) {
      const missed = unknownKeywords.filter((k) => !(k in meanings));
      pushLog(
        'info',
        `[关键词释义] 第 ${attempt + 1}/${retries} 次成功，补出 ${Object.keys(meanings).length}/${unknownKeywords.length} 个释义${missed.length ? `（遗漏：${missed.join('、')}）` : ''}`,
        'api',
      );
      return { meanings, usage };
    }

    // 失败分流：parsed=null（空/截断/畸形） → 重试；parsed 是对象但无匹配键 → 重试一次（也许 LLM 给的键不在列表里）。
    const retryable = !content.trim() || parsed === null || Object.keys(meanings).length === 0;
    lastError = parseError || '解析为空或键不匹配';
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'info',
      `[关键词释义] 解析: parsed=${parsed ? 'ok' : 'null'} 错误=${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '将重试' : '已穷尽'}），产出 0 个`,
      'api',
    );
    if (!retryable) return { meanings: {}, usage };
  }

  pushLog('error', `[关键词释义] ${retries} 次重试后仍失败（${lastError}），${unknownKeywords.length} 个关键词无释义`, 'api');
  return { meanings: {} };
}

/**
 * 从叙事文本中扫出所有 `<kw>X</kw>` 标签里的关键词（去重、保持首见顺序）。
 * 用于：调用方先扫，过滤掉 useKeywordStore + page.keywords 已有的，剩余即未知列表。
 * 不识别孤立 `<kw>` 或 `</kw>`——那些由 stripOrphanKwTags 兜底清理。
 */
export function extractKwTaggedKeywords(narrative: string): string[] {
  if (!narrative) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<kw>([^<]+)<\/kw>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative)) !== null) {
    const k = m[1].trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
