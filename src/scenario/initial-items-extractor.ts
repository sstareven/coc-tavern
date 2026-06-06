// 起始物品抽取器 — 把玩家在 CharacterCreator Step 5 输入的自然语言起始物品文本
// 经一次独立 LLM 子调用解析为结构化 InventoryChange[] 入库;失败兜底返回 []
// (由 scenario-engine / CharacterCreator 完成后调用方拼 action:'add' 套 applyChanges)。

import { callDsSubagent, type DsSubagentRequest } from '../sillytavern/subagent-call';
import { useSettingsStore } from '../stores/useSettingsStore';

/** 受控类别白名单 — LLM 越界时调用方应过滤(此处不再硬卡,保留 LLM 写入兼容老存档) */
const CATEGORY_ENUM = ['weapon', 'medical', 'misc', 'key_item', 'clothing'] as const;
type CategoryHint = (typeof CATEGORY_ENUM)[number];

export interface ExtractedInitialItem {
  name: string;
  quantity: number;
  category?: CategoryHint;
  description?: string;
}

const SYSTEM_PROMPT = [
  '你是 Call of Cthulhu 7e 跑团的【起始物品抽取器】。',
  '玩家用自然语言描述了调查员开局随身物品(可能含数量/类别/简短描述),你的工作是抽出每件物品的结构化条目。',
  '',
  '【输出格式】仅输出严格 JSON,顶层 { "items": [...] };不要 markdown 围栏、不要解释。',
  '每个 item: { "name": string, "quantity": number(>=1,默认1), "category"?: "weapon"|"medical"|"misc"|"key_item"|"clothing", "description"?: string }',
  '',
  '【规则】',
  '- 同名物品合并 quantity,不要重复条目。',
  '- category 推断:武器(weapon)、医药/绷带/药品(medical)、关键道具/钥匙/信件(key_item)、衣物(clothing),其余 misc。',
  '- description 限 30 字内,仅当玩家原文给出明显附加描述时填写,否则省略。',
  '- 玩家文本里出现的非物品内容(如背景/职业自述)一律忽略。',
  '- 字符串值内如需引用,统一用「」或『』,严禁未转义双引号。',
].join('\n');

/**
 * 抽取玩家自然语言起始物品文本为结构化条目。
 * 失败(网络/HTTP/JSON 解析)一律兜底返回 [],不抛 — 调用方据此决定是否回落空背包。
 */
export async function extractInitialItems(raw: string): Promise<ExtractedInitialItem[]> {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const s = useSettingsStore.getState();
  const req: DsSubagentRequest = {
    apiBaseUrl: s.apiBaseUrl,
    apiKey: s.apiKey,
    model: s.apiModel,
    temperature: 0.2,
    maxTokens: 20000,
    rpmLane: 'rewrite',
    label: 'scenario:initial-items',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: trimmed },
    ],
  };

  try {
    const { parsed } = await callDsSubagent(req);
    if (!parsed || typeof parsed !== 'object') return [];
    const rawList = (parsed as { items?: unknown }).items;
    if (!Array.isArray(rawList)) return [];
    const out: ExtractedInitialItem[] = [];
    for (const r of rawList) {
      if (!r || typeof r !== 'object') continue;
      const rec = r as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) continue;
      const qRaw = rec.quantity;
      const quantity =
        typeof qRaw === 'number' && Number.isFinite(qRaw) && qRaw >= 1 ? Math.floor(qRaw) : 1;
      const cat = typeof rec.category === 'string' ? rec.category : undefined;
      const category = cat && (CATEGORY_ENUM as readonly string[]).includes(cat)
        ? (cat as CategoryHint)
        : undefined;
      const desc = typeof rec.description === 'string' ? rec.description.trim() : '';
      out.push({
        name,
        quantity,
        ...(category ? { category } : {}),
        ...(desc ? { description: desc } : {}),
      });
    }
    return out;
  } catch (err) {
    // 兜底:网络/HTTP/JSON 任意失败 → 空数组,不阻塞起新游戏
    console.warn('[initial-items-extractor] 抽取失败,已回落空背包:', err);
    // C5 — toast 告知玩家手动补救路径(浏览器环境才 dispatch,SSR/测试环境 window 可能未定义)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('coc:toast', {
          detail: { type: 'warning', message: '起始物品抽取失败, 请到角色卡背包页手动添加' },
        }),
      );
    }
    return [];
  }
}
