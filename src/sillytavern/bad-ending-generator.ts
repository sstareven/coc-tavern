import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import type { TokenUsage } from './stream-parser';

/** 坏结局生成提示词：据开场情境构思一个隐藏的、暗线注定逼近的坏结局。独立调用，绝不混入主回合输出。 */
const BAD_ENDING_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出本局冒险的开场情境与背景。请你据此构思一个本局【注定要避免的坏结局】——即如果调查员一再失败、或放任幕后阴谋（暗线）发展到底，最终会酿成的灾难性结局。

要求：用 1-3 句话具体描述，须贴合本次冒险的主题、地点与幕后势力，避免空泛套话。这是守秘人的最高机密，暗线将逐步朝它逼近。

只输出坏结局的描述文本本身，不要输出任何解释、标题、前后缀或 JSON。`;

export interface GenerateBadEndingResult {
  description: string;
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用据开场情境生成本局隐藏「坏结局」。与主回合生成完全解耦，
 * 不占用主输出的 token/结构，杜绝其挤占 JSON 末尾的 clues/npcUpdates/mapUpdates。
 * 复用 mvu-extractor 同款独立调用范式（rpmAcquire + appIdHeaders）。
 */
export async function generateBadEnding(
  context: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.9,
  maxTokens = 512,
): Promise<GenerateBadEndingResult> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
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
        { role: 'system', content: BAD_ENDING_PROMPT },
        { role: 'user', content: `本局开场情境与背景：\n${context}` },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) throw new Error(`坏结局生成 API 错误 ${response.status}`);

  const json = await response.json();
  const raw: string = json.choices?.[0]?.message?.content ?? '';
  const usage: TokenUsage | undefined = json.usage;
  // 去掉可能的思考块、代码围栏与多余空白；坏结局是纯文本。
  const description = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/```[a-z]*|```/gi, '')
    .trim();

  return { description, usage };
}
