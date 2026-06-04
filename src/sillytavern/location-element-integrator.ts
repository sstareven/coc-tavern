import { callDsSubagent } from './subagent-call';
import { pushLog } from '../stores/useLogStore';
import { LOCATION_ELEMENT_CATEGORIES } from '../types';
import type { LocationElementInput, LocationElementCategory } from '../types';
import type { TokenUsage } from './stream-parser';

/** 合法地点元素分类，用于校验 LLM 给出的 category；非法值回落「其他」。 */
const VALID_CATEGORIES = new Set<LocationElementCategory>(LOCATION_ELEMENT_CATEGORIES);

/**
 * 地点元素整合提示词：把某地点下太多太碎的元素【归纳合并】成 3-4 个、绝不超过 5 个更概括的元素。
 * 与线索整合(clue-integrator)同理——元素越多越要狠狠收敛，仅基于给出的元素归纳，绝不凭空捏造。
 */
const INTEGRATOR_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人助手。下面给出某地点的【当前全部地点元素】。这些元素太多太碎，会让玩家难以抓住重点，请你把【关联、重复、同类】的元素【归纳合并】成更概括的元素，总数【精简到 3-4 个、绝不超过 5 个】。

严格要求：
1. 只能基于上面给出的元素做归纳，绝不能凭空捏造元素里没有的物件或事实。
2. 把相关、重复、同类的元素合并到同一条里；保留关键的、独特的元素，不要把不相干的强行合并。
3. 每个产出元素都要给出 name、category 与 description。category 只能取：陈设/机关/痕迹/通道/容器/异常/其他。description 为 15-40 字，综合被合并各项的信息。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "elements": [
    {"name": "落地长钟", "category": "陈设", "description": "墙角一座停摆的胡桃木落地钟，钟摆蒙尘"}
  ]
}`;

export interface IntegrateLocationElementsResult {
  elements: LocationElementInput[];
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用把某地点下太碎的地点元素归纳收敛成 3-4 个（绝不超过 5 个）更概括的元素。
 * 仅基于传入元素归纳，不凭空捏造。复用 clue-integrator/location-element-extractor
 * 同款独立调用范式（rpmAcquire + appIdHeaders + 容错 JSON 解析 + 仅对截断/空响应重试）。
 *
 * @param locationName  父地点名称（按名称做父子关联，逐条补到 element.locationName）
 * @param elements      该地点当前全部元素（name/category/description）
 */
export async function integrateLocationElements(
  locationName: string,
  elements: { name: string; category: string; description: string }[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.7,
  maxTokens = 20000, // 思考型模型把预算耗在 reasoning 上，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,       // API 层重试：仅对「截断/空响应」重试（coerceJsonObject 内部重试只是清洗同一份脏文本，救不了真截断）
): Promise<IntegrateLocationElementsResult> {
  pushLog('info', `[地点元素整合] 开始：「${locationName}」输入 ${elements.length} 个元素，模型=${model}`, 'api');

  // 逐条列出当前元素：name（category）：description。
  const list = elements
    .map((e, i) => `${i + 1}. ${e.name}（${e.category}）：${e.description}`)
    .join('\n');

  let lastError = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500)); // 截断/空响应退避后重试
    let resp;
    try {
      resp = await callDsSubagent({
        apiBaseUrl, apiKey, model, temperature, maxTokens, rpmLane: 'main',
        label: '地点元素整合',
        messages: [
          { role: 'system', content: INTEGRATOR_PROMPT },
          { role: 'user', content: `地点名：${locationName}\n当前全部地点元素：\n${list}` },
        ],
      });
    } catch (err) {
      pushLog('error', `[地点元素整合] API 返回错误 ${err instanceof Error ? err.message : String(err)}`, 'api');
      throw err;
    }
    const { content, parsed, parseError, usage } = resp;

    // 健壮解析：兼容 {"elements":[...]} / 顶层数组 [...]。
    let raw: Record<string, unknown>[] = [];
    if (parsed && Array.isArray(parsed.elements)) raw = parsed.elements as Record<string, unknown>[];
    else {
      const m = content.match(/\[[\s\S]*\]/);
      if (m) { try { const a = JSON.parse(m[0]); if (Array.isArray(a)) raw = a as Record<string, unknown>[]; } catch { /* 顶层数组兜底失败，留空 */ } }
    }

    const out: LocationElementInput[] = raw
      .filter((x) => x && typeof x.name === 'string' && String(x.name).trim())
      .map((x) => {
        const cat = typeof x.category === 'string' && VALID_CATEGORIES.has(x.category as LocationElementCategory)
          ? (x.category as LocationElementCategory)
          : '其他';
        return {
          locationName,
          name: String(x.name).trim(),
          category: cat,
          description: typeof x.description === 'string' ? x.description : '',
        };
      })
      .slice(0, 5); // 截断为最多 5 条，防模型超额（提示词要求 3-4、绝不超 5）

    if (out.length > 0) {
      pushLog('info', `[地点元素整合] 第 ${attempt + 1}/${retries} 次成功，「${locationName}」${elements.length} → ${out.length} 个：${out.map((e) => e.name).join('、')}`, 'api');
      return { elements: out, usage };
    }

    // 失败分流：JSON 根本没解析出来(parsed=null：空/截断/畸形) → 重试；
    // JSON 解析成功但归纳出空数组 → 合法结果，重试无益，直接返回空数组。
    const retryable = !content.trim() || parsed === null;
    lastError = parseError || '解析为空';
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'info',
      `[地点元素整合] 解析: parsed=${parsed ? 'ok' : 'null'} 错误=${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '空/截断/畸形，将重试' : '已解析但归纳为空，停止重试'}），产出 0 个`,
      'api',
    );
    if (!retryable) return { elements: [], usage };
  }

  pushLog('error', `[地点元素整合] ${retries} 次重试后仍失败（${lastError}），「${locationName}」归纳为空`, 'api');
  return { elements: [] };
}
