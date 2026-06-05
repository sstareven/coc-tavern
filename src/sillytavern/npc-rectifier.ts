// ===== NPC 缺失「补写 API 重纠」（BUG2 Part 2） =====
// 当主回合 JSON 缺失 npcUpdates 或为空、但叙事里【明显】出现 NPC（称谓/对话）时，
// 走【补写 API】（小模型）独立调用，把叙事里的 NPC 列出来回灌入名册。
// 与主生成彻底解耦：
//  - 走 'rewrite' RPM 桶——撞上限自动排队 1 分钟（rpm-limiter 已实现），不报错；
//  - 透传 AbortSignal，玩家中止/重新生成时能中断；
//  - 穷尽重试仍无有效结果 → 返回 null，pipeline fail-open。

import { callDsSubagent } from './subagent-call';
import type { NpcUpdate } from '../stores/useNpcStore';
import type { TokenUsage } from './stream-parser';

const NPC_RECTIFY_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深助手。下面给出本回合的叙事文本与调查员名字。上一次主生成遗漏了 npcUpdates 字段（或仅返回空数组），但叙事里【明显】出现了 NPC（包括但不限于：被以「先生/女士/医生/教授/警官/管家/船长…」等称谓提及的人、出现对话的人、被调查员搭话的人）。请你据叙事补出本回合【应有的 npcUpdates 数组】。

字段说明（每个 NPC 一项）：
- name：NPC 全名或叙事里出现的最完整称谓。【绝对禁止】把调查员自己列进来。
- identity：叙事里能推断的身份/职业，写不出可省略。
- isPresent：true（本回合在场）。
- appearance / personality：叙事里直接描述的外貌/性格，写不出可省略。
- addMemory：本回合该 NPC 与调查员发生的一次具体互动（1 句，主谓宾），写不出可省略。

约束：
1. 只把叙事【已经写出】的 NPC 列出，不要凭空臆造。
2. 调查员本人【绝对禁止】出现在结果里（用调查员名字过滤）。
3. 只输出严格 JSON，不要任何额外文字、解释或代码围栏。空（叙事里其实无 NPC）则返回 { "npcUpdates": [] }：
{
  "npcUpdates": [
    { "name": "...", "identity": "...", "isPresent": true, "addMemory": "..." }
  ]
}`;

export interface RectifyNpcResult {
  npcUpdates: NpcUpdate[];
  usage?: TokenUsage;
}

/**
 * 用【补写 API】重纠本回合缺失的 npcUpdates。本调用与主回合彻底解耦：
 *  - rpmLane: 'rewrite' —— 走 rewrite 桶，撞 RPM 上限自动排队（rpm-limiter 实现，1 分钟窗口）；
 *  - signal: AbortSignal —— 玩家中止/新一轮主生成可立即中断；
 *  - 穷尽 retries 仍无有效 npcUpdates → 返回 null，pipeline fail-open（绝不阻塞翻页）。
 *
 * 注意：本函数只负责【发请求 + 解析 + 形状校验】，不直接调 useNpcStore——
 * 由调用方在 fire-and-forget 块里拿到结果后再 applyUpdates，便于会话/abort 守卫一致。
 *
 * @param narrative leftContent + rightContent 拼接（已 strip 标签）
 * @param investigatorName 调查员名，用于在 prompt 里显式排除
 */
export async function rectifyMissingNpcs(
  narrative: string,
  investigatorName: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  temperature = 0.4,
  maxTokens = 20000, // 项目要求 max_tokens≥20000，防思考型模型 JSON 截断
  retries = 2,
): Promise<RectifyNpcResult | null> {
  const ctx = `调查员：${investigatorName || '(未命名)'}\n\n本回合叙事：\n${narrative.trim()}`;
  let lastUsage: TokenUsage | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) return null;
    const { parsed, usage } = await callDsSubagent({
      apiBaseUrl, apiKey, model, signal, temperature, maxTokens, rpmLane: 'rewrite',
      label: 'NPC缺失补写',
      messages: [
        { role: 'system', content: NPC_RECTIFY_PROMPT },
        { role: 'user', content: ctx },
      ],
    });
    if (usage) lastUsage = usage;
    if (!parsed) continue;
    const raw = Array.isArray(parsed.npcUpdates) ? parsed.npcUpdates : null;
    if (!raw) continue;
    const investigator = investigatorName.trim();
    const npcUpdates: NpcUpdate[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) continue;
      if (investigator && name === investigator) continue; // 调查员绝不入名册
      const u: NpcUpdate = { name };
      const uRec = u as unknown as Record<string, unknown>;
      const strFields = ['identity', 'faction', 'gender', 'appearanceAge', 'derived',
        'appearance', 'personality', 'innerThoughts', 'experience', 'backstory',
        'status', 'addMemory'] as const;
      for (const f of strFields) {
        if (typeof o[f] === 'string' && String(o[f]).trim()) uRec[f] = String(o[f]);
      }
      if (typeof o.isPresent === 'boolean') u.isPresent = o.isPresent;
      else u.isPresent = true; // 补写出来的默认在场
      npcUpdates.push(u);
    }
    // 命中即返回（即便空数组也算「模型确认本回合无 NPC」，由调用方据情判断；通常 length>0 才有意义）
    return { npcUpdates, usage: lastUsage };
  }
  return null;
}
