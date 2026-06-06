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

// 仅供 MVU 种子合并使用的 deep merge：
//   - 已存在的路径/键一律保留（base 优先），seed 仅补齐 missing 的字段；
//   - 仅 plain object 递归，数组/原始值视为叶子直接由 base 接管（base 缺时才取 seed）；
//   - 不修改入参，纯函数返回新对象。
// 这样 seed 里的 {剧情:{已解锁:{}}} 不会盖掉已有 /剧情/已解锁 子树，只是在该枝缺失时建空字典。
// A1: isPlainObject 跨 realm 失效修复——iframe / worker / vm context 创建的 object 其
// Object.getPrototypeOf(v) !== 主 realm 的 Object.prototype,严判会把它们误判为叶子,导致
// 深合并退化为顶层 spread,seed 的 {剧情:{已解锁:{}}} 直接覆盖已有子树。改为宽松判断：
// 所有 typeof 'object' 且非 null/数组/常见内置类型 (Date/Map/Set/RegExp) 都视为可递归 plain object。
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof Map) &&
    !(v instanceof Set) &&
    !(v instanceof RegExp)
  );
}
export function deepMergePreserve(
  base: Record<string, unknown>,
  seed: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(seed)) {
    const bv = base[k];
    const sv = seed[k];
    if (isPlainObject(bv) && isPlainObject(sv)) {
      out[k] = deepMergePreserve(bv, sv);
    } else if (bv === undefined) {
      // base 没有该键 → 补 seed 值（含基本量/数组/空字典）。
      // A1: seed 内对象先 JSON 深克隆切断引用共享——避免 seed 树被多个 base 共享同一引用,
      // 后续某处 mutate statData 时另一处会被串改。基本量/不可序列化值原样赋值。
      if (isPlainObject(sv) || Array.isArray(sv)) {
        try {
          out[k] = JSON.parse(JSON.stringify(sv));
        } catch {
          // 含 BigInt / 循环引用等不可序列化结构 → 退化为原引用(seed 本就是新建对象,风险低)
          out[k] = sv;
        }
      } else {
        out[k] = sv;
      }
    }
    // 其它情况 base 已存在叶子 → 保持 base，不被 seed 覆盖
  }
  return out;
}

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

  // A3 — 同会话二次激活幂等守卫：
  // 防止 upsertBook 覆盖玩家手改的 lorebook 条目 / extractInitialItems 双倍入库到背包
  // / replacePage 砸掉玩家已经推进的 page0 进度。若想换剧本必须先 startNewConversation。
  const currentScn = useChatStore.getState().sessions.find(
    (s) => s.id === useChatStore.getState().activeId,
  )?.scenarioId;
  if (currentScn === scenarioId) {
    console.log('[scenario-engine] 剧本', scenarioId, '已激活在当前会话,跳过重复激活');
    return;
  }

  // ── 1. 角色卡 + NPC ─────────────────────────────────────────────────
  if (mode === 'preset') {
    // preset 模式必须显式指定主角索引；不允许 undefined 默默兜底到 0，
    // 否则一旦上游路由没传 charIdx，玩家会被随机分配第 0 号角色（可能是 npc_only）。
    if (charIdx === undefined) {
      throw new Error('[scenario-engine] preset 模式必须显式传 charIdx');
    }
    const idx = charIdx;
    const proto = scn.characters[idx];
    if (!proto) throw new Error(`[scenario-engine] preset 模式 charIdx=${idx} 越界`);
    // 仅 protagonist_candidate 可被玩家扮演；npc_only / 其它角色不可作为主角。
    if (proto.role !== 'protagonist_candidate') {
      throw new Error(`[scenario-engine] charIdx=${idx} 指向的角色不可扮演 (role=${proto.role})`);
    }
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

  // ── 2. MVU 种子（剧情.*/世界.* 等） — 与现有 statData 深合并，已有路径保留，seed 仅补 missing。─
  // 注意：buildScenarioStatDataSeed 返回嵌套树（项目 statData 走点分路径 getTreePath）；
  // 历史曾用 spread 顶层 shallow merge，会让 seed 的 {剧情:{已解锁:{}}} 把已有 /剧情/已解锁 子树吞掉，
  // 故改用 deepMerge：仅在目标缺路径时填入 seed 值，已存在的子树/键一律保留。
  const seed = buildScenarioStatDataSeed(scn);
  if (seed && Object.keys(seed).length > 0) {
    const cur = useVariableStore.getState().statData;
    useVariableStore.getState().setStatData(deepMergePreserve(cur, seed));
  }

  // ── 3-6 包成 try/catch：任一步抛错都把已挂载的 scenarioBook 卸掉、把 sessionScenarioId 清空，
  //     避免「book 留挂、id 没写」造成下一会话仍命中剧本条目的幽灵态。
  //     注：step 1-2(sheet/NPC/MVU seed) 的回滚不在此处兜底，由 clearAllGameState 在用户回主菜单时处理。
  const scenarioBookId = SCENARIO_BOOK_PREFIX + scn.id;
  let bookMounted = false;
  let sessionScenarioWritten = false;
  // A2: replacePage/appendPage 之前先抓 page0 快照,出错时能把玩家原本的 page0 还回去——
  // 否则 catch 块只回滚 lorebook+sessionId,玩家会看到一个被剧本 LLM 扩写半截、又因抛错没写
  // sessionScenarioId 的「幽灵 page0」。pages 为空时 originalPage0 = null,catch 走 resetToPrologue。
  const originalPage0 = useBookStore.getState().pages[0] ?? null;
  let page0Replaced = false;
  try {
    // ── 3. 挂载剧本条目到 lorebook（独立 book，priority +1000 防撞键） ──
    useLorebookStore.getState().upsertBook(scenarioBookId, {
      name: '[剧本] ' + scn.meta.name,
      enabled: true,
      entries: scenarioEntriesToLoreEntries(scn.entries),
    });
    bookMounted = true;

    // ── 4. 初始物品（两种模式统一处理，序章生成之前完成入库，玩家第一眼看到序章背包就已有物品）──
    // newChar: CharCreator Step 5 填的 initialItemsRaw 已通过 setSheet 写到 useCharSheetStore
    // preset:  step 1 setSheet(proto.sheet) 已把预设角色的 initialItemsRaw 写到 useCharSheetStore
    // 统一从 useCharSheetStore 取，两种模式一致处理
    const raw = (useCharSheetStore.getState().sheet.initialItemsRaw ?? '').trim();
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

    // ── 5. 写当前会话的 scenarioId（持久化随 chat blob）─────────────────
    useChatStore.getState().setSessionScenario(scn.id);
    sessionScenarioWritten = true;

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
      // 绕开 useBookStore.setPages 的「序章自动刷新」逻辑：
      // setPages 内部对 leftHeader === '序章' 的首页会强制替换为 defaultPages[0]，
      // 这会把刚刚 LLM 扩写出来的 page0 内容刷成「做梦开场」，只剩 id。
      // 改用 replacePage / appendPage（纯 set，无序章替换分支） + goToPage。
      const bookStore = useBookStore.getState();
      if (bookStore.pages.length > 0) {
        bookStore.replacePage(0, page0);
      } else {
        bookStore.appendPage(page0);
      }
      // A2: 标记 page0 已被剧本扩写覆盖,catch 块据此决定是否还原原 page0。
      page0Replaced = true;
      bookStore.goToPage(0);
    }
  } catch (err) {
    // 非原子回滚：把 step 3-5 已经写出的副作用撤掉。
    // 不动 step 1-2 是因为 sheet/NPC/MVU 没有 per-scenario 标识、无法精确还原，
    // 让 clearAllGameState 在用户从错误页面回主菜单时整体清理更可靠。
    if (bookMounted) {
      try {
        useLorebookStore.getState().removeBook(scenarioBookId);
      } catch (rollbackErr) {
        console.warn('[scenario-engine] 回滚 lorebook 失败：', rollbackErr);
      }
    }
    if (sessionScenarioWritten) {
      try {
        useChatStore.getState().setSessionScenario(null);
      } catch (rollbackErr) {
        console.warn('[scenario-engine] 回滚 sessionScenario 失败：', rollbackErr);
      }
    }
    // A2: page0 已被替换 → 还原玩家原本的 page0;若原本没有(全新存档)则回退到默认序章,
    // 避免幽灵 page0 残留(剧本 LLM 扩写一半但 scenarioId 没写,UI 会看到半成品序章)。
    if (page0Replaced) {
      try {
        if (originalPage0) {
          useBookStore.getState().replacePage(0, originalPage0);
        } else {
          useBookStore.getState().resetToPrologue();
        }
      } catch (rollbackErr) {
        console.warn('[scenario-engine] 回滚 page0 失败：', rollbackErr);
      }
    }
    throw err;
  }
}

export function unloadScenario(scenarioId: string): void {
  useLorebookStore.getState().removeBook(SCENARIO_BOOK_PREFIX + scenarioId);
}

/**
 * M2 — 删页回溯不还原剧本副作用的「禁删 page0」防线说明。
 *
 * 剧本激活时 page[0] 被 LLM 扩写覆盖(见 activateScenario step 6),它承载了序章叙事 + 初始物品文本来源;
 * 同步副作用还包括 extractInitialItems 入库、buildScenarioStatDataSeed 写 statData、scenarioBook 挂载 lorebook。
 * 这些副作用都没有「随 page0 一起回滚」的机制——若允许玩家删除 page0,物品/MVU/lorebook 仍留在内存,
 * 但剧情起点没了,UI 进入残缺态。
 *
 * 不变量靠 useBookStore.deletePage 现有保护实现：
 *   `const start = Math.max(1, index);`
 *   `if (start >= s.pages.length) return s;`
 * 即:index=0 时 start 被夹到 1,若 pages 仅一页(start === pages.length)直接 return;若有多页,实际删除范围
 * 是 [1, end],page0 永远不动。所以「禁删 page0」已是 useBookStore 的硬不变量,scenario-engine 无需再加守卫。
 * 这里留注释钉死该机制,后续若有人改 deletePage 取消这条线请回头补 scenario-engine 的副作用回滚或显式守卫。
 *
 * 配套提供 unloadAndCleanupScenario 入口供 sessionLifecycle / 未来「删会话但保留剧本残留」场景按需清理:
 *   - 卸 lorebook book(同 unloadScenario)
 *   - 当前仅做最小集:lorebook 卸载;sheet/NPC/MVU/inventory 仍由 clearAllGameState 整体清理。
 *     未来若要做「卸剧本但保留进度」的更细粒度操作,在此扩展精确回滚分支。
 */
export function unloadAndCleanupScenario(scenarioId: string): void {
  unloadScenario(scenarioId);
}
