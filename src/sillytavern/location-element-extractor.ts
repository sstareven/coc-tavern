import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { pushLog } from '../stores/useLogStore';
import { LOCATION_ELEMENT_CATEGORIES } from '../types';
import type { LocationElementInput, LocationElementCategory } from '../types';
import type { TokenUsage } from './stream-parser';

/** 合法地点元素分类，用于校验 LLM 给出的 category；非法值回落「其他」。 */
const VALID_CATEGORIES = new Set<LocationElementCategory>(LOCATION_ELEMENT_CATEGORIES);

/**
 * 地点元素抽取提示词：从本回合叙事中抽取挂在某地点下的环境特征/陈设/可注意之物。独立调用，绝不混入主回合输出。
 * 与起始物品/坏结局同理——内联进 FORMAT_INSTRUCTION 会被主指令压过而整体丢失，
 * 故解耦为独立 LLM 调用（见 inline-llm-fields-truncate-trailing）。
 */
const LOCATION_ELEMENTS_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出【地点名】、【该地点已知元素名清单】、【本回合叙事正文】。请你抽取该地点在本回合叙事中【新出现或被具体描述】的「地点元素」——即挂在这个地点下的环境特征/陈设/机关/痕迹/通道/容器/异常之物。

要求：
1. 只抽取本回合叙事中【新出现或被具体描述】的元素，不要重复已知元素清单里已有的名称。
2. 【只收录有价值的元素，宁缺毋滥】仅抽取真正构成该地点特征、有剧情作用、或调查员很可能去查看/反复互动之物：地标性陈设、关键机关/通道/容器、可疑痕迹或异常之物。明确【排除】无意义的琐碎景物与随处可见的普通背景装饰——如路边一堆杂草、零散落叶、普通砖墙、地上尘土、远处行人等纯氛围铺陈；这类一笔带过、无交互价值、无剧情意义的景物一律不要抽成地点元素。
3. 不要把「线索/知识/信息类发现」当作地点元素——元素是地点本身的环境构成与可注意之物，与线索正交。
4. 每个元素都要给出 name、category 与 description（15-40 字的简介）。category 只能取：陈设/机关/痕迹/通道/容器/异常/其他。
5. 若本回合该地点没有任何新元素，请输出空数组。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "elements": [
    {"name": "落地长钟", "category": "陈设", "description": "墙角一座停摆的胡桃木落地钟，钟摆蒙尘"}
  ]
}
本回合无新元素则输出：{"elements":[]}`;

export interface GenerateLocationElementsResult {
  elements: LocationElementInput[];
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用从本回合叙事中抽取某地点下「新出现/被具体描述」的地点元素。
 * 与主回合生成完全解耦，不占用主输出的 token/结构。复用 generateStartingItems
 * 同款独立调用范式（rpmAcquire + appIdHeaders + 容错 JSON 解析）。
 *
 * @param locationName    父地点名称（按名称做父子关联，逐条补到 element.locationName）
 * @param existingNames   该地点已知元素名清单（用于去重，trim 比较后过滤掉重复名）
 * @param narrative       本回合叙事正文
 */
export async function extractLocationElements(
  locationName: string,
  existingNames: string[],
  narrative: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.7,
  maxTokens = 20000, // 思考型模型把预算耗在 reasoning 上，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,       // API 层重试：仅对「截断/空响应」重试（coerceJsonObject 内部重试只是清洗同一份脏文本，救不了真截断）
): Promise<GenerateLocationElementsResult> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  pushLog('info', `[地点元素] 开始抽取「${locationName}」，模型=${model}`, 'api');

  // 已知名集合（trim 后比较），用于过滤掉 LLM 仍可能吐回的重复元素。
  const existingSet = new Set(existingNames.map((n) => String(n).trim()).filter(Boolean));

  let lastError = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500)); // 截断/空响应退避后重试
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
        messages: [
          { role: 'system', content: LOCATION_ELEMENTS_PROMPT },
          {
            role: 'user',
            content:
              `地点名：${locationName}\n` +
              `该地点已知元素名清单：${existingSet.size ? Array.from(existingSet).join('、') : '（暂无）'}\n` +
              `本回合叙事正文：\n${narrative}`,
          },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      pushLog('error', `[地点元素] API 返回错误 ${response.status}`, 'api');
      throw new Error(`地点元素抽取 API 错误 ${response.status}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage | undefined = json.usage;

    // 健壮解析：兼容 {"elements":[...]} / 顶层数组 [...]。
    const { parsed, error } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;
    let raw: Record<string, unknown>[] = [];
    if (pObj && Array.isArray(pObj.elements)) raw = pObj.elements as Record<string, unknown>[];
    else {
      const m = content.match(/\[[\s\S]*\]/);
      if (m) { try { const a = JSON.parse(m[0]); if (Array.isArray(a)) raw = a as Record<string, unknown>[]; } catch { /* 顶层数组兜底失败，留空 */ } }
    }

    const elements: LocationElementInput[] = raw
      .filter((x) => x && typeof x.name === 'string' && String(x.name).trim())
      .filter((x) => !existingSet.has(String(x.name).trim())) // 去重：已知名直接过滤
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
      });

    if (elements.length > 0) {
      pushLog('info', `[地点元素] 第 ${attempt + 1}/${retries} 次成功，「${locationName}」产出 ${elements.length} 个：${elements.map((e) => e.name).join('、')}`, 'api');
      return { elements, usage };
    }

    // 失败分流：JSON 根本没解析出来(parsed=null：空/截断/畸形) → 重试；
    // JSON 解析成功但无新元素 → 合法的「本回合无新元素」，重试无益，直接返回空数组。
    const retryable = !content.trim() || parsed === null;
    lastError = error || '解析为空';
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'info',
      `[地点元素] 解析: parsed=${parsed ? 'ok' : 'null'} 错误=${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '空/截断/畸形，将重试' : '已解析但本回合无新元素，停止重试'}），产出 0 个`,
      'api',
    );
    if (!retryable) return { elements: [], usage };
  }

  pushLog('error', `[地点元素] ${retries} 次重试后仍失败（${lastError}），「${locationName}」本回合无新元素`, 'api');
  return { elements: [] };
}
