// 装束差分子调用(2026-06-09):
// 主 API done 之后跑一次,从「本回合 leftContent + 当前 outfit 快照」抽 diff,
// 写入 useNpcStore.setProfileOutfitByName / useCharSheetStore.setOutfit。
//
// 设计要点(per spec 2026-06-09-outfit-image-injection-design.md):
//  - 不入主 JSON(规避「主 JSON 加字段会截断末尾」)
//  - 静态 system prefix 前置(提示缓存命中)
//  - rpmLane='mvu'(与 prologue/causal-echo 共桶)
//  - 永不 throw,失败回退空结果
//  - 仅产 diff;快照名单外的 name 静默丢弃

import { callDsSubagent } from './subagent-call';

const SYSTEM_PROMPT = `你是 COC 守秘人的助手。给你「本回合叙事正文」与「当前装束快照」,请仅产出本回合发生过变化的项:
- investigatorOutfit: 调查员的新装束描述(中文短句,≤40字,含穿着+手持/显眼物件)
- npcs[name].outfit: 该 NPC 的新装束(同上)

未变化的项不要输出;快照里没有的 NPC name 不要新增;装束 1 句话整合穿着与显眼物件(怀里揣的不算)。

严格返回 JSON:{
  "investigatorOutfit": "string?",
  "npcs": { "<name>": { "outfit": "string?" } }
}
不得输出 JSON 之外的任何文本。`;

export interface OutfitExtractorRequest {
  /** 本回合叙事正文(BookPage.leftContent),中文。 */
  leftContent: string;
  /** 当前调查员 sheet.outfit 快照;空串=未记录。 */
  investigatorOutfitSnapshot: string;
  /** 当前核心/重要 NPC 快照:[{name, outfit}]。 */
  npcSnapshots: Array<{ name: string; outfit: string }>;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export interface OutfitExtractorResult {
  /** 调查员装束变更;本回合未变 → undefined。 */
  investigatorOutfit?: string;
  /** NPC 装束变更,按 name 分桶;本回合未变 NPC 不出现。 */
  npcs: Record<string, string>;
}

const EMPTY: OutfitExtractorResult = { npcs: {} };

export async function extractOutfitDiff(req: OutfitExtractorRequest): Promise<OutfitExtractorResult> {
  if (req.signal?.aborted) return EMPTY;
  if (!req.leftContent || !req.leftContent.trim()) return EMPTY;
  if (!req.apiBaseUrl || !req.apiKey || !req.model) return EMPTY;

  const snapshotJson = JSON.stringify({
    investigator: req.investigatorOutfitSnapshot || '(未记录)',
    npcs: Object.fromEntries(
      req.npcSnapshots.map((s) => [s.name, s.outfit || '(未记录)']),
    ),
  }, null, 2);

  const truncatedNarrative = req.leftContent.slice(0, 1200).trim();
  // 稳定段(装束快照,跨回合 outfit 不变时不变)前置, 动态段(本回合 narrative)后置;
  // 让 outfit 不变的回合可命中 system + snapshot 共 ~500-800 token 的 user 前缀缓存
  const user = `当前装束快照:\n${snapshotJson}\n\n--- 本回合动态 ---\n本回合叙事正文:\n${truncatedNarrative}\n\n请仅输出 diff。`;

  try {
    const resp = await callDsSubagent({
      apiBaseUrl: req.apiBaseUrl,
      apiKey: req.apiKey,
      model: req.model,
      signal: req.signal,
      temperature: 0.4,
      maxTokens: 20000,
      rpmLane: 'mvu',
      label: 'outfit-extractor',
      jsonObject: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });

    const parsed = resp.parsed as
      | { investigatorOutfit?: string; npcs?: Record<string, { outfit?: string }> }
      | null;
    if (!parsed) return EMPTY;

    const investigatorOutfit =
      typeof parsed.investigatorOutfit === 'string' && parsed.investigatorOutfit.trim()
        ? parsed.investigatorOutfit.trim().slice(0, 40)
        : undefined;

    const allowed = new Set(req.npcSnapshots.map((s) => s.name));
    const npcs: Record<string, string> = {};
    if (parsed.npcs && typeof parsed.npcs === 'object') {
      for (const [name, val] of Object.entries(parsed.npcs)) {
        if (!allowed.has(name)) continue;
        const o = val?.outfit;
        if (typeof o === 'string' && o.trim()) {
          npcs[name] = o.trim().slice(0, 40);
        }
      }
    }

    return {
      ...(investigatorOutfit ? { investigatorOutfit } : {}),
      npcs,
    };
  } catch {
    return EMPTY;
  }
}
