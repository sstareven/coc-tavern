import { rpmAcquire } from './rpm-limiter';
import { appIdHeaders } from './api-router';
import { coerceJsonObject } from './llm-response-parser';
import { pushLog } from '../stores/useLogStore';
import type { InventoryChange, ItemCategory } from '../types';
import type { TokenUsage } from './stream-parser';

/** 合法物品分类，用于校验 LLM 给出的 category；非法值回落 misc。 */
const VALID_CATEGORIES = new Set<ItemCategory>(['weapon', 'tool', 'consumable', 'clue', 'key_item', 'misc']);

/**
 * 起始装备生成提示词：据职业+开场情境生成 3-6 件起始随身物品。独立调用，绝不混入主回合输出。
 * 与坏结局同理——曾内联进 FORMAT_INSTRUCTION，被主指令「无变化则省略 inventoryChanges」压过而整体丢失，
 * 故解耦为独立 LLM 调用（见 inline-llm-fields-truncate-trailing）。
 */
const STARTING_ITEMS_PROMPT = `你是一位克苏鲁的呼唤(COC)跑团的资深守秘人。下面给出本局调查员的职业背景与开场情境。这是冒险的开端，调查员尚无任何随身物品，请你据此为其配备一套【起始随身物品】（在身上携带或穿戴之物）。

要求：
1. 生成【3 到 6 件】贴合调查员职业身份与当前开场处境的随身物品。
2. 必须符合 1920 年代背景，避免与情境无关的现代或奇幻物品。
3. 每件物品都要给出 category 与 description（15-40 字的物品简介）。category 只能取：weapon(武器)/tool(工具)/consumable(消耗品)/key_item(关键剧情物品)/misc(杂物)。
4. 信件、笔记、线索等「信息类发现」不属于随身装备，不要列入。

只输出严格 JSON，不要任何额外文字、解释或代码围栏：
{
  "items": [
    {"name": "怀表", "category": "misc", "description": "祖传的银质怀表，表盖内侧刻着一行已磨损的字迹", "quantity": 1}
  ]
}`;

export interface GenerateStartingItemsResult {
  changes: InventoryChange[];
  usage?: TokenUsage;
}

/**
 * 用独立 LLM 调用据职业+开场情境生成 3-6 件起始随身物品（全部为 add 变更）。
 * 与主回合生成完全解耦，不占用主输出的 token/结构。复用 integrateClues / generateBadEnding
 * 同款独立调用范式（rpmAcquire + appIdHeaders + 容错 JSON 解析）。
 */
export async function generateStartingItems(
  context: string,
  apiBaseUrl: string,
  apiKey: string,
  model: string,
  temperature = 0.8,
  maxTokens = 20000, // 思考型模型(deepseek-v4-pro)把预算耗在 reasoning 上，给足余量防 JSON 截断（用户要求 max_tokens≥20000）
  retries = 3,       // API 层重试：仅对「截断/空响应」重试（coerceJsonObject 内部重试只是清洗同一份脏文本，救不了真截断）
): Promise<GenerateStartingItemsResult> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  pushLog('info', `[起始物品] 开始生成，模型=${model}`, 'api');

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
          { role: 'system', content: STARTING_ITEMS_PROMPT },
          { role: 'user', content: `本局调查员背景与开场情境：\n${context}` },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      pushLog('error', `[起始物品] API 返回错误 ${response.status}`, 'api');
      throw new Error(`起始物品生成 API 错误 ${response.status}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage | undefined = json.usage;

    // 健壮解析：兼容 {"items":[...]} / {"inventoryChanges":[...]} / 顶层数组 [...]。
    const { parsed, error } = coerceJsonObject(content);
    const pObj = parsed as Record<string, unknown> | null;
    let raw: Record<string, unknown>[] = [];
    if (pObj && Array.isArray(pObj.items)) raw = pObj.items as Record<string, unknown>[];
    else if (pObj && Array.isArray(pObj.inventoryChanges)) raw = pObj.inventoryChanges as Record<string, unknown>[];
    else {
      const m = content.match(/\[[\s\S]*\]/);
      if (m) { try { const a = JSON.parse(m[0]); if (Array.isArray(a)) raw = a as Record<string, unknown>[]; } catch { /* 顶层数组兜底失败，留空 */ } }
    }

    const changes: InventoryChange[] = raw
      .filter((x) => x && typeof x.name === 'string' && String(x.name).trim())
      .map((x) => {
        const cat = typeof x.category === 'string' && VALID_CATEGORIES.has(x.category as ItemCategory)
          ? (x.category as ItemCategory)
          : 'misc';
        const qty = typeof x.quantity === 'number' && x.quantity > 0 ? x.quantity : 1;
        return {
          action: 'add' as const,
          name: String(x.name).trim(),
          category: cat,
          quantity: qty,
          description: typeof x.description === 'string' ? x.description : '',
        };
      });

    if (changes.length > 0) {
      pushLog('info', `[起始物品] 第 ${attempt + 1}/${retries} 次成功，产出 ${changes.length} 件：${changes.map((c) => c.name).join('、')}`, 'api');
      return { changes, usage };
    }

    // 失败分流：JSON 根本没解析出来(parsed=null：空/截断/畸形) → 重试；JSON 解析成功但无可用物品 → 重试无益，放弃。
    const retryable = !content.trim() || parsed === null;
    lastError = error || '解析为空';
    pushLog(
      attempt + 1 < retries && retryable ? 'warn' : 'error',
      `[起始物品] 解析: parsed=${parsed ? 'ok' : 'null'} 错误=${lastError}（第 ${attempt + 1}/${retries} 次，${retryable ? '空/截断/畸形，将重试' : '已解析但无物品，停止重试'}），产出 0 件`,
      'api',
    );
    if (!retryable) return { changes: [], usage };
  }

  pushLog('error', `[起始物品] ${retries} 次重试后仍失败（${lastError}），本局无起始装备`, 'api');
  return { changes: [] };
}
