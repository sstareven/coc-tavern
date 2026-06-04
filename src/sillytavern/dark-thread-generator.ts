import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { wrapSubagentMessages } from './subagent-shared';
import type { TokenUsage } from './stream-parser';

/**
 * 暗线「定向补生成」提示词：当主回合 JSON 遗漏 darkThread 字段、而剧情本应推进暗线时，
 * 用独立调用据近期叙事 + 当前暗线进度 + 本局坏结局（守秘人机密）补出本回合暗线应有的一步推进。
 * 与主回合输出彻底解耦，绝不向玩家泄露坏结局或暗线机密。
 */
const DARK_THREAD_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出本回合的近期叙事、当前暗线进度，以及本局注定的坏结局（守秘人最高机密）。上一次主生成遗漏了暗线推进，请你据此补出本回合暗线应有的【一步推进】，让幕后阴谋朝坏结局自然逼近。

字段说明：
- development：本回合幕后势力实际推进了什么（玩家不直接可见的暗线动作，1-2 句具体描述）。
- progress：0-100 的整数，当前暗线逼近坏结局的进度，须【不低于】给出的当前进度，通常较当前略增 5-20。
- threatLevel：威胁等级，只能取 潜伏 / 浮现 / 紧迫 / 爆发 之一，须与 progress 协调（75+ 趋于爆发）。
- foreshadowing：可在叙事中向玩家露出的细微伏笔线索（不泄露机密本身，1 句即可，可留空字符串）。

约束：坏结局与暗线机密【绝对禁止】以任何形式向玩家透露。只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "development": "……",
  "progress": 15,
  "threatLevel": "潜伏",
  "foreshadowing": "……"
}`;

const THREAT_LEVELS = ['潜伏', '浮现', '紧迫', '爆发'];

export interface GenerateDarkThreadResult {
  development: string;
  progress: number;
  threatLevel: string;
  foreshadowing: string;
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用补出本回合遗漏的暗线推进。与主回合生成完全解耦，复用 bad-ending-generator
 * 同款独立调用范式（rpmAcquire + appIdHeaders + coerceJsonObject 健壮解析 + 仅对无效解析重试）。
 * 关键：走 'mvu' RPM 桶——撞上限时 rpmAcquire 自动排队等待（不报错），故重试可能慢但绝不超发；
 * 透传 signal 让玩家中止/重新生成时能中断在途请求。穷尽重试仍无有效 development → 返回 null。
 */
export async function generateDarkThread(
  context: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.8,
  maxTokens = 20000, // 思考型模型防截断（项目要求 max_tokens≥20000）
  retries = 3,
): Promise<GenerateDarkThreadResult | null> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    await rpmAcquire('mvu');
    if (signal?.aborted) return null;
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
          { role: 'system', content: DARK_THREAD_PROMPT },
          { role: 'user', content: `本回合情境与当前暗线状态：\n${context}` },
        ], '暗线生成'),
        temperature,
        max_tokens: maxTokens,
      }),
      signal,
    });

    if (!response.ok) throw new Error(`暗线补生成 API 错误 ${response.status}`);

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage | undefined = json.usage;

    const { parsed } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;
    if (pObj) {
      const development = typeof pObj.development === 'string' ? pObj.development.trim() : '';
      const rawProgress = typeof pObj.progress === 'number' ? pObj.progress : Number(pObj.progress);
      const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.round(rawProgress))) : 0;
      const rawLevel = typeof pObj.threatLevel === 'string' ? pObj.threatLevel.trim() : '';
      const threatLevel = THREAT_LEVELS.includes(rawLevel) ? rawLevel : '潜伏';
      const foreshadowing = typeof pObj.foreshadowing === 'string' ? pObj.foreshadowing.trim() : '';
      if (development) return { development, progress, threatLevel, foreshadowing, usage };
    }
    // parsed 为 null（空/截断/畸形）或无 development → 继续下一次重试。
  }

  return null;
}
