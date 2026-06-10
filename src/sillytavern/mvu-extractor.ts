import { extractAllVariables, parseStatChanges, stripVariableMarkup } from './variables';
import { callDsSubagent } from './subagent-call';
import type { TokenUsage } from './stream-parser';

const EXTRACTOR_PROMPT = `你是一个MVU（Model-View-Update）变量提取引擎。从以下COC跑团叙事文本中提取所有游戏状态变量。

提取规则：
1. 识别所有 <var name="变量名" value="变量值" /> 标签
2. 识别所有 {{set:变量名=变量值}} 命令
3. 从叙事中识别属性变化（HP、SAN、幸运、MP等数值变化）
4. 识别场景状态（地点变化、时间推移、天气变化等）

请以严格的JSON格式回复，不要包含其他文字：
{
  "variables": [
    {"name": "变量名1", "value": "变量值1"},
    {"name": "变量名2", "value": "变量值2"}
  ]
}

以下是需要分析的文本：`;

/**
 * Decide whether an LLM round-trip is worth it for variable extraction.
 *
 * The local regex extractors (`extractAllVariables` / `parseStatChanges`) always
 * run and already cover explicit `<var .../>` tags and `{{set:...}}` commands.
 * The LLM only adds value when the narrative *implies* a numeric change (e.g.
 * "感到眩晕" hints at SAN loss) WITHOUT an explicit tag the regex could catch.
 *
 * COC 项目主回合实际输出 `<UpdateVariable><JSONPatch>[...]</JSONPatch></UpdateVariable>`
 * 风格的补丁块——这也属于「显式标签」, 走本地 JSON Patch 应用器而非 LLM 提取。
 * 历史上正则只检测 `<var>`/`{{set:}}` 漏识别 JSONPatch 形式 → 每页都冗余触发
 * MVU 提取 (8-25s)。这里把两类显式标签都纳入,主回合产出补丁块时直接跳过 MVU。
 *
 * @returns true only when there is a narrative numeric clue AND no explicit tag.
 */
export function shouldUseLlmExtraction(text: string): boolean {
  const hasExplicitTags = /<var\s|\{\{set:|<UpdateVariable\b|<JSONPatch\b/.test(text);
  const hasNarrativeStatHints =
    /(理智|SAN|生命|HP|MP|幸运|受伤|眩晕|恐惧|疯狂|损失|恢复)/.test(text);
  return hasNarrativeStatHints && !hasExplicitTags;
}

/**
 * Use an independent LLM API to extract variables from the response text.
 * Returns the extracted variables and the cleaned text (with markup stripped).
 */
export async function extractVariablesWithLLM(
  text: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 1,
  /** 总尝试次数(>=1):1=单次不重试,N=最多 N 次直到任一次成功。 */
  maxAttempts = 1,
  // 思考型模型(deepseek-v4-pro)会把预算耗在 reasoning 上,给足余量防 JSON 截断(项目硬下限 20000)
  maxTokens = 32768,
  /** 上层取消信号; mvu-megaagent fallback 路径透传, 用户中止时这里立即抛 AbortError 不再跑第二次 LLM. */
  signal?: AbortSignal,
): Promise<{ variables: Record<string, string>; cleanedText: string; usage?: TokenUsage }> {
  if (signal?.aborted) throw new Error('aborted');
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      // RPM 限流走 mvu 桶(关闭「每个API独立RPM」时仍归全局 main);helper 内部已含 rpmAcquire+headers+coerceJsonObject。
      const { content, usage } = await callDsSubagent({
        apiBaseUrl, apiKey, model, temperature, maxTokens, rpmLane: 'mvu',
        label: 'MVU 变量提取',
        signal,
        messages: [
          { role: 'system', content: EXTRACTOR_PROMPT },
          { role: 'user', content: text },
        ],
      });

      // Try to parse the LLM's JSON response —— 这里沿用原始 content.match 而不用 helper 的 parsed,
      // 因为 mvu 输出可能用 {variables:[{name,value}]} 也可能更松散,自己抓首个 {...} 块更稳。
      let variables: Record<string, string> = {};
      try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.variables)) {
            for (const v of parsed.variables) {
              if (v.name && v.value !== undefined) {
                variables[v.name] = String(v.value);
              }
            }
          }
        }
      } catch {
        // Fallback to regex extraction
      }

      // Always run regex extraction as fallback/complement
      const regexVars = extractAllVariables(text);
      const statVars = parseStatChanges(text);
      variables = { ...variables, ...regexVars, ...statVars };

      // Strip variable markup from text（含畸形 var 兜底，由 stripVariableMarkup 统一处理）
      const cleanedText = stripVariableMarkup(text);

      return { variables, cleanedText, usage };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        // Wait briefly before retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastError ?? new Error('MVU extraction failed');
}
