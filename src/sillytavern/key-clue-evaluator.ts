import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { wrapSubagentMessages } from './subagent-shared';
import { pushLog } from '../stores/useLogStore';
import type { TokenUsage } from './stream-parser';

/**
 * 关键线索评估提示词：判断本回合新线索是否【实质揭示】了某个未揭示的「真相支柱(守秘人机密)」。
 * 独立 LLM 调用，绝不混入主回合输出（与起始物品/坏结局/地点元素同理——内联进 FORMAT_INSTRUCTION
 * 会被主指令压过而整体丢失，见 inline-llm-fields-truncate-trailing）。
 */
const KEY_CLUE_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出【未揭示的真相支柱(守秘人机密, 含 id/title/secret)】与【调查员本回合新获得的线索】。

请判断：哪些线索【实质揭示/坐实】了某个支柱的真相——即让玩家真正得知该支柱的核心事实，而不是泛泛相关、隐约暗示或仅触及边缘。

要求：
1. 只有当线索让玩家【确凿得知】某支柱的核心机密时才算揭示；模棱两可、仅有关联或铺垫不算。
2. 每个支柱最多匹配一条线索（取最直接坐实那一条）。
3. 没有任何线索揭示某支柱，就不要为它输出。本回合若全无揭示，输出空数组。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "matches": [
    {"pillarId": "<支柱id>", "clueName": "<线索名>"}
  ]
}
本回合无揭示则输出：{"matches":[]}`;

/** 单条匹配：某未揭示支柱被某条线索实质揭示。 */
export interface KeyClueMatch {
  pillarId: string;
  clueName: string;
}

export interface EvaluateKeyCluesResult {
  matches: KeyClueMatch[];
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用评估本回合新线索是否揭示了某个【未揭示】真相支柱。
 * 与主回合生成完全解耦，不占用主输出的 token/结构。复用 extractLocationElements
 * 同款独立调用范式（rpmAcquire + appIdHeaders + 容错 JSON 解析 + 仅对截断/空响应重试）。
 *
 * @param pillars      仅传【未揭示】支柱（含机密 secret），用于让模型判断揭示并做合法性校验
 * @param clues        本回合新获得的线索（name/summary/可选 discoveryNarrative）
 */
export async function evaluateKeyClues(
  pillars: { id: string; title: string; secret: string }[],
  clues: { name: string; summary: string; discoveryNarrative?: string }[],
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.4,
  maxTokens = 20000, // 思考型模型把预算耗在 reasoning 上，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,       // API 层重试：仅对「截断/空响应」重试（coerceJsonObject 内部重试只是清洗同一份脏文本，救不了真截断）
): Promise<EvaluateKeyCluesResult> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  pushLog('info', `[关键线索] 开始评估，未揭示支柱 ${pillars.length} 个、新线索 ${clues.length} 条，模型=${model}`, 'api');

  // 合法 pillarId 集合：模型只能匹配传入的未揭示支柱，越界 id 一律过滤。
  const validPillarIds = new Set(pillars.map((p) => String(p.id).trim()).filter(Boolean));

  // 无支柱或无线索时无需调用 LLM，直接返回空匹配。
  if (validPillarIds.size === 0 || clues.length === 0) {
    pushLog('info', `[关键线索] 无未揭示支柱或无新线索，跳过评估`, 'api');
    return { matches: [] };
  }

  const pillarsText = pillars
    .map((p) => `- id=${p.id}｜标题：${p.title}｜机密：${p.secret}`)
    .join('\n');
  const cluesText = clues
    .map((c) => `- ${c.name}：${c.summary}${c.discoveryNarrative ? `（${c.discoveryNarrative}）` : ''}`)
    .join('\n');

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
        messages: wrapSubagentMessages([
          { role: 'system', content: KEY_CLUE_PROMPT },
          {
            role: 'user',
            content:
              `未揭示的真相支柱：\n${pillarsText}\n\n` +
              `本回合新获得的线索：\n${cluesText}`,
          },
        ], '关键线索评估'),
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      pushLog('error', `[关键线索] API 返回错误 ${response.status}`, 'api');
      throw new Error(`关键线索评估 API 错误 ${response.status}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage | undefined = json.usage;

    // 健壮解析：兼容 {"matches":[...]} / 顶层数组 [...]。
    const { parsed, error } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;
    let raw: Record<string, unknown>[] = [];
    if (pObj && Array.isArray(pObj.matches)) raw = pObj.matches as Record<string, unknown>[];
    else {
      const m = content.match(/\[[\s\S]*\]/);
      if (m) { try { const a = JSON.parse(m[0]); if (Array.isArray(a)) raw = a as Record<string, unknown>[]; } catch { /* 顶层数组兜底失败，留空 */ } }
    }

    const seen = new Set<string>();
    const matches: KeyClueMatch[] = raw
      .filter((x) => x && typeof x.pillarId === 'string' && typeof x.clueName === 'string')
      .map((x) => ({ pillarId: String(x.pillarId).trim(), clueName: String(x.clueName).trim() }))
      .filter((x) => x.pillarId && x.clueName)
      .filter((x) => validPillarIds.has(x.pillarId)) // 越界 id 过滤：只保留传入的未揭示支柱
      .filter((x) => {                               // 同一 pillarId 只保留第一条
        if (seen.has(x.pillarId)) return false;
        seen.add(x.pillarId);
        return true;
      });

    if (matches.length > 0) {
      pushLog('info', `[关键线索] 第 ${attempt + 1}/${retries} 次成功，揭示 ${matches.length} 个支柱：${matches.map((m) => `${m.pillarId}←${m.clueName}`).join('、')}`, 'api');
      return { matches, usage };
    }

    // 失败分流：JSON 根本没解析出来(parsed=null：空/截断/畸形) → 重试；
    // JSON 解析成功但无匹配 → 合法的「本回合无揭示」，重试无益，直接返回空数组。
    const retryable = !content.trim() || parsed === null;
    lastError = error || '解析为空';
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'info',
      `[关键线索] 解析: parsed=${parsed ? 'ok' : 'null'} 错误=${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '空/截断/畸形，将重试' : '已解析但本回合无揭示，停止重试'}），匹配 0 个`,
      'api',
    );
    if (!retryable) return { matches: [], usage };
  }

  pushLog('error', `[关键线索] ${retries} 次重试后仍失败（${lastError}），本回合无揭示`, 'api');
  return { matches: [] };
}
