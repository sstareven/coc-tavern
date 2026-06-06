// 剧本激活/卸载引擎 — 见 docs/specs/2026-06-06-scenario-system-design.md §4.2
//
// activateScenario 按模式分流：
//   'preset'  — 玩家选剧本中的预设角色：套该角色卡 + 其他角色 NPC 化 + 跳过 CharacterCreator + LLM 扩首页
//   'newChar' — 玩家自建角色：所有剧本角色 NPC 化；走原 CharacterCreator（初始物品由其 Step 5 填）
//
// 副作用顺序刻意保留：sheet/NPC → MVU 种子 → lorebook 挂载 → 初始物品 LLM 抽取 → 会话 meta 写入 → 首页扩写。
// 失败兜底：扩首页失败时回落到 prologueSeed 原文 + 4 个通用选项（不阻塞进游戏）。

import { useScenarioStore } from '../stores/useScenarioStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useBookStore } from '../stores/useBookStore';
import { useChatStore } from '../stores/useChatStore';
import { scenarioCharacterToNpc, scenarioEntriesToLoreEntries, buildScenarioStatDataSeed } from './scenario-injection';
import { extractInitialItems } from './initial-items-extractor';
import { expandPrologueToPage } from './expand-prologue';
import type { BookPage } from '../types';
import type { InventoryChange } from '../types';

export type ScenarioActivateMode = 'newChar' | 'preset';

const SCENARIO_BOOK_PREFIX = '__scenario_';

// 兜底首页选项（扩首页 LLM 调用失败时使用） — 故意非剧本化，给玩家自由打开局面。
import type { ChoiceItem } from '../types';
const FALLBACK_CHOICES: ChoiceItem[] = [
  { num: 'I', text: '环顾四周', action: '我仔细观察周遭环境，寻找任何不寻常的细节。' },
  { num: 'II', text: '与同伴交谈', action: '我转身与身边的人攀谈，试图了解眼下的处境。' },
  { num: 'III', text: '回忆与思考', action: '我静下心来，回忆此前发生的一切，梳理思绪。' },
  { num: 'IV', text: '主动行动', action: '我决定立刻迈出第一步，打破当下的僵局。' },
];

export async function activateScenario(
  scenarioId: string,
  mode: ScenarioActivateMode,
  charIdx?: number,
): Promise<void> {
  const scn = useScenarioStore.getState().getById(scenarioId);
  if (!scn) throw new Error(`[scenario-engine] 找不到剧本: ${scenarioId}`);

  // ── 1. 角色卡 + NPC ─────────────────────────────────────────────────
  if (mode === 'preset') {
    const idx = charIdx ?? 0;
    const proto = scn.characters[idx];
    if (!proto) throw new Error(`[scenario-engine] preset 模式 charIdx=${idx} 越界`);
    useCharSheetStore.getState().setSheet(proto.sheet);
    // 其他角色全部 NPC 化（排除当前主角索引）
    const npcStore = useNpcStore.getState();
    for (let i = 0; i < scn.characters.length; i++) {
      if (i === idx) continue;
      npcStore.applyUpdates([scenarioCharacterToNpc(scn.characters[i])]);
    }
  } else {
    // newChar：剧本里所有角色全部 NPC 化（玩家走原 CharacterCreator）
    const npcStore = useNpcStore.getState();
    for (const c of scn.characters) {
      npcStore.applyUpdates([scenarioCharacterToNpc(c)]);
    }
  }

  // ── 2. MVU 种子（剧情.*/世界.* 等） — 与现有 statData 合并（顶层 shallow merge）─
  const seed = buildScenarioStatDataSeed(scn);
  if (seed && Object.keys(seed).length > 0) {
    const cur = useVariableStore.getState().statData;
    useVariableStore.getState().setStatData({ ...cur, ...seed });
  }

  // ── 3. 挂载剧本条目到 lorebook（独立 book，priority +1000 防撞键） ──
  const scenarioBookId = SCENARIO_BOOK_PREFIX + scn.id;
  useLorebookStore.getState().upsertBook(scenarioBookId, {
    name: '[剧本] ' + scn.meta.name,
    enabled: true,
    entries: scenarioEntriesToLoreEntries(scn.entries),
  });

  // ── 4. 初始物品（仅 newChar，preset 角色卡已含装备）─────────────────
  if (mode === 'newChar') {
    const raw = (scn.characters[charIdx ?? 0]?.sheet.initialItemsRaw ?? '').trim();
    // 注：若 newChar 模式下尚未走完 CharacterCreator(Step 5 才填 initialItemsRaw)，
    // raw 通常为空——真正的初始物品抽取由 CharacterCreator 完成后再触发；此处仅处理剧本内嵌的默认初始物品。
    if (raw) {
      try {
        const items = await extractInitialItems(raw);
        if (items.length > 0) {
          useInventoryStore.getState().applyChanges(
            items.map((i: Omit<InventoryChange, 'action'>): InventoryChange => ({ action: 'add', ...i })),
          );
        }
      } catch (err) {
        console.warn('[scenario-engine] 初始物品抽取失败，已跳过：', err);
      }
    }
  }

  // ── 5. 写当前会话的 scenarioId（持久化随 chat blob）─────────────────
  useChatStore.getState().setSessionScenario(scn.id);

  // ── 6. LLM 扩写首页 → 替换 page[0] ───────────────────────────────────
  // 两种模式都走（preset / newChar）—— 否则 newChar 模式下 BookStore 会停留在 defaultPages[0]
  // (那是「自由探索」的「你做了一个梦」段),导致玩家选不同剧本却看到同一段开场。
  // 例外：'__free' 剧本本身就是 defaultPages[0] 的 prologueSeed 源,不必扩写也不必替换。
  if (scn.id !== '__free') {
    let page0: BookPage;
    try {
      const expanded = await expandPrologueToPage(scn.prologueSeed, scn);
      page0 = { ...expanded, id: crypto.randomUUID() };
    } catch (err) {
      console.warn('[scenario-engine] 首页扩写失败，回落原 prologueSeed：', err);
      try {
        // UI 层 toast：window.dispatchEvent 通用桥；若无监听则静默
        window.dispatchEvent(
          new CustomEvent('coc:toast', {
            detail: { type: 'warning', message: '剧本首页扩写失败，已使用原始序章文本' },
          }),
        );
      } catch {
        /* SSR / 非浏览器环境忽略 */
      }
      page0 = {
        id: crypto.randomUUID(),
        leftHeader: '序章',
        leftContent: scn.prologueSeed,
        rightHeader: '',
        rightContent: '',
        rightChoices: FALLBACK_CHOICES,
        // leftPage/rightPage 是字符串型页码（"i"/"ii" 等），setPages 会按 index 重写，这里给空即可
        leftPage: '',
        rightPage: '',
      };
    }
    useBookStore.getState().setPages([page0]);
  }
}

export function unloadScenario(scenarioId: string): void {
  useLorebookStore.getState().removeBook(SCENARIO_BOOK_PREFIX + scenarioId);
}
