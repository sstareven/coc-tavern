import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { wrapSubagentMessages } from './subagent-shared';
import { pushLog } from '../stores/useLogStore';
import { CLUE_TAGS } from '../types';
import type { ClueInput } from '../types';
import type { TokenUsage } from './stream-parser';

/** 线索整合提示词：把一堆线索归纳/提炼成 1-3 条更概括、更明显指向幕后真相的总结线索。仅基于已知线索，不窥探隐藏暗线。 */
const INTEGRATOR_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人助手。下面给出调查员【目前已掌握的全部线索】。线索太多太碎会让玩家难以抓住重点，请你把它们【归纳、提炼、合并】成只有【1 到 3 条】更概括、更清晰、更明显指向幕后真相的「总结线索」，让调查员一眼就能看懂当前的关键脉络与调查方向。

严格要求：
1. 只能基于上面给出的线索做归纳，绝不能凭空捏造线索里没有的人物、地点或事实。
2. 把零碎、重复、彼此关联的线索合并到同一条总结里；总结要比原线索更高层、更概括，点明它们【共同】指向什么（幕后黑手、真正目的、下一步该查的方向）。
3. 总数控制在 1-3 条——线索越多越要狠狠收敛，绝不要逐条复述。语气是调查员的推断，可带不确定性（"种种迹象表明……"）。
4. 若实在只有一个主线，产出 1 条即可；若线索过少或毫无关联，可不产出（insights 为空数组）。

只输出严格 JSON，不要任何额外文字：
{
  "insights": [
    {
      "name": "总结：……（简短标题）",
      "summary": "一句话点明这条总结的核心判断与指向",
      "discoveryNarrative": "2-4 句说明你归纳了哪些线索、它们如何共同指向这一点",
      "relatedTo": ["关联的人/地/事关键词"],
      "tags": ["从【人物/地点/物证/事件/组织/超自然/推理】中选 1-3 个，必须包含「推理」"]
    }
  ]
}`;

export interface ClueForIntegration {
  name: string;
  summary?: string;
  discoveryNarrative?: string;
  relatedTo?: string[];
  tags?: string[];
}

export interface IntegrateCluesResult {
  clues: ClueInput[];
  usage?: TokenUsage;
}

/**
 * 让独立 LLM 把玩家已掌握的线索归纳成 1-3 条更清晰、指向幕后真相的「推理线索」。
 * 仅基于传入线索（不读取隐藏暗线/坏结局，保持解谜公平）。产出标 synthesized 且必带「推理」标签。
 * 复用 mvu-extractor 同款独立调用范式（rpmAcquire + appIdHeaders + 容错 JSON 解析）。
 */
export async function integrateClues(
  clues: ClueForIntegration[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.7,
  maxTokens = 2048,
): Promise<IntegrateCluesResult> {
  const list = clues
    .map((c, i) => {
      const parts = [`${i + 1}. ${c.name}`];
      if (c.summary) parts.push(`：${c.summary}`);
      if (c.discoveryNarrative) parts.push(`（${c.discoveryNarrative}）`);
      if (c.relatedTo?.length) parts.push(` [关联：${c.relatedTo.join('、')}]`);
      return parts.join('');
    })
    .join('\n');

  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  pushLog('info', `[线索整合] 开始：输入 ${clues.length} 条线索，模型=${model}`, 'api');
  await rpmAcquire('main');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...appIdHeaders(),
    },
    body: JSON.stringify({
      model,
      messages: wrapSubagentMessages([
        { role: 'system', content: INTEGRATOR_PROMPT },
        { role: 'user', content: `调查员目前已掌握的线索：\n${list}` },
      ], '线索整合'),
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    pushLog('error', `[线索整合] API 返回错误 ${response.status}`, 'api');
    throw new Error(`线索整合 API 错误 ${response.status}`);
  }

  const json = await response.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';
  const usage: TokenUsage | undefined = json.usage;
  pushLog('debug', `[线索整合] 原始响应(${content.length}字${usage?.total_tokens ? `, ${usage.total_tokens} tokens` : ''}): ${content.slice(0, 500)}`, 'api');

  // 健壮解析：兼容 {"insights":[...]} / {"clues":[...]} / 顶层数组 [...]。
  const { parsed, error } = coerceJsonObject(content);
  const pObj = parsed as Record<string, unknown> | null;
  let insights: Record<string, unknown>[] = [];
  if (pObj && Array.isArray(pObj.insights)) insights = pObj.insights as Record<string, unknown>[];
  else if (pObj && Array.isArray(pObj.clues)) insights = pObj.clues as Record<string, unknown>[];
  else {
    const m = content.match(/\[[\s\S]*\]/);
    if (m) { try { const a = JSON.parse(m[0]); if (Array.isArray(a)) insights = a as Record<string, unknown>[]; } catch { /* 顶层数组兜底失败，留空 */ } }
  }
  pushLog(
    insights.length === 0 ? 'warn' : 'debug',
    `[线索整合] 解析: parsed=${parsed ? 'ok' : 'null'}${error ? ` 错误=${error}` : ''}, 候选 ${insights.length} 条`,
    'api',
  );

  const tagSet = new Set<string>(CLUE_TAGS);
  const out: ClueInput[] = insights
    .filter((x) => x && typeof x.name === 'string' && String(x.name).trim())
    .map((x) => {
      const tags = Array.isArray(x.tags)
        ? [...new Set((x.tags as unknown[]).map(String).filter((t) => tagSet.has(t)))]
        : [];
      if (!tags.includes('推理')) tags.push('推理'); // 整合线索必带「推理」标签
      return {
        name: String(x.name).trim(),
        summary: typeof x.summary === 'string' ? x.summary : '',
        discoveryNarrative: typeof x.discoveryNarrative === 'string' ? x.discoveryNarrative : '',
        relatedTo: Array.isArray(x.relatedTo) ? (x.relatedTo as unknown[]).map(String) : undefined,
        tags,
        synthesized: true,
      };
    });

  pushLog('info', `[线索整合] 产出 ${out.length} 条推理线索${out.length ? '：' + out.map((c) => c.name).join('、') : '（无）'}`, 'api');
  return { clues: out, usage };
}
