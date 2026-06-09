// 因果回响子调用(2026-06-09):
// 主 API done 之后跑一次,从「上回合 page.summary + 下一个未达成节点」抽 1 句因果回响,
// 写入 useAnchorStore.lastCausalEcho,下回合 buildContextInjection 注入。
//
// 设计要点(per spec 2026-06-09-plot-arc-causality-theme-design.md):
//  - 不入主 JSON(规避「主 JSON 加字段会截断末尾」)
//  - 静态 system prefix 前置(提示缓存命中)
//  - rpmLane='mvu'(与 prologue/outfit-extractor 共桶)
//  - 永不 throw,失败回退空串

import { callDsSubagent } from './subagent-call';

const SYSTEM_PROMPT = `你是 COC 守秘人的助手。给你「上回合发生的事」(summary)与「剧情下一个需推动的节点」(nextNode),请用 1 句话(中文,≤40字)描述:上回合玩家的哪个行动可以成为本回合推动该节点的「因」。不要重复 summary,只点出因果钩子。

严格返回 JSON: { "echo": "string" }
不得输出 JSON 之外的任何文本。`;

export interface CausalEchoRequest {
  /** 上一回合 page.summary。空 / 空白 → 早退。 */
  lastSummary: string;
  /** 当前最可能未达成的下一节点 title。 */
  nextNodeTitle: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  /** AbortSignal 透传;abort 时早退。 */
  signal?: AbortSignal;
}

export interface CausalEchoResult {
  /** 1 句话因果钩子;失败 / 空响应时为空串。 */
  echo: string;
}

const EMPTY: CausalEchoResult = { echo: '' };

export async function extractCausalEcho(req: CausalEchoRequest): Promise<CausalEchoResult> {
  if (req.signal?.aborted) return EMPTY;
  if (!req.lastSummary || !req.lastSummary.trim()) return EMPTY;
  if (!req.nextNodeTitle || !req.nextNodeTitle.trim()) return EMPTY;
  if (!req.apiBaseUrl || !req.apiKey || !req.model) return EMPTY;

  const user = `上回合发生:\n${req.lastSummary.trim()}\n\n下一个需推动的节点:\n${req.nextNodeTitle.trim()}\n\n请输出 1 句因果钩子。`;

  try {
    const resp = await callDsSubagent({
      apiBaseUrl: req.apiBaseUrl,
      apiKey: req.apiKey,
      model: req.model,
      signal: req.signal,
      temperature: 0.4,
      maxTokens: 20000,
      rpmLane: 'mvu',
      label: 'causal-echo',
      jsonObject: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });

    const parsed = resp.parsed as { echo?: string } | null;
    if (!parsed) return EMPTY;
    const echo = typeof parsed.echo === 'string' ? parsed.echo.trim() : '';
    return { echo: echo.slice(0, 60) };
  } catch {
    return EMPTY;
  }
}
