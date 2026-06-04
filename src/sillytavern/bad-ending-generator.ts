import { callDsSubagent } from './subagent-call';
import type { TokenUsage } from './stream-parser';

/**
 * 本局「真相」生成提示词：据开场情境一次产出 ①注定的坏结局（灾厄终点）②阻止它必须揭示的 3 个【真相支柱】。
 * 独立调用，绝不混入主回合输出。坏结局与支柱均为守秘人最高机密。
 */
const BAD_ENDING_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出本局冒险的开场情境与背景。请你据此构思本局的「真相」，包含两部分：

1. 注定的坏结局（badEnding）：如果调查员一再失败、或放任幕后阴谋发展到底，最终会酿成的灾难性结局。用 1-3 句话具体描述，须贴合本次冒险的主题、地点与幕后势力，避免空泛套话。这是暗线逐步逼近的终点。

2. 三个真相支柱（pillars）：调查员要阻止上述灾厄、达成好结局，必须揭开的 3 个【核心真相】。三者应彼此不同、共同构成破局的关键（例如：幕后黑手是谁 / 其作恶的手段或仪式 / 它的弱点或阻止之法）。每个支柱含 title(简短标题) 与 secret(该真相的具体机密内容，1-2 句)。

坏结局与三个支柱都是守秘人最高机密，【绝对禁止】以任何形式向玩家透露。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "badEnding": "……",
  "pillars": [
    {"title": "凶手身份", "secret": "……"},
    {"title": "作恶手段", "secret": "……"},
    {"title": "阻止之法", "secret": "……"}
  ]
}`;

export interface GenerateBadEndingResult {
  description: string;
  /** 3 个真相支柱（title+secret，无 id/uncovered，由调用方补全）。解析失败时为空数组。 */
  pillars: { title: string; secret: string }[];
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用据开场情境生成本局隐藏「坏结局 + 3 真相支柱」。与主回合生成完全解耦，
 * 不占用主输出的 token/结构。复用 location-element-extractor 同款独立调用范式（rpmAcquire +
 * appIdHeaders + coerceJsonObject 健壮解析 + 仅对 parsed===null 重试）。
 */
export async function generateBadEnding(
  context: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.9,
  maxTokens = 20000, // 坏结局 + 3 支柱需余量，且思考型模型防截断（项目要求 max_tokens≥20000）
  retries = 3,
): Promise<GenerateBadEndingResult> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    const { parsed, usage } = await callDsSubagent({
      apiBaseUrl, apiKey, model, temperature, maxTokens, rpmLane: 'main',
      label: '坏结局生成',
      messages: [
        { role: 'system', content: BAD_ENDING_PROMPT },
        { role: 'user', content: `本局开场情境与背景：\n${context}` },
      ],
    });
    if (parsed) {
      const description = typeof parsed.badEnding === 'string' ? parsed.badEnding.trim() : '';
      const rawPillars = Array.isArray(parsed.pillars) ? (parsed.pillars as Record<string, unknown>[]) : [];
      const pillars = rawPillars
        .filter((x) => x && (typeof x.title === 'string' || typeof x.secret === 'string'))
        .map((x) => ({
          title: typeof x.title === 'string' && x.title.trim() ? x.title.trim() : '真相',
          secret: typeof x.secret === 'string' ? x.secret.trim() : '',
        }))
        .slice(0, 3);
      if (description) return { description, pillars, usage };
    }
    // parsed 为 null（空/截断/畸形）或无 badEnding → 继续下一次重试。
  }

  return { description: '', pillars: [] };
}
