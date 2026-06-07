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
import { useMapStore } from '../stores/useMapStore';
import { renderTemplate } from '../sillytavern/ejs-template';
import { scenarioCharacterToNpc, scenarioEntriesToLoreEntries, buildScenarioStatDataSeed } from './scenario-injection';
import { subscribeRelationLorebook } from './relation-lorebook';
import { canJoinParty, hasHostileEdge } from './relation-graph';
import { extractInitialItems } from './initial-items-extractor';
import { expandPrologueToPage } from './expand-prologue';
import type { BookPage } from '../types';
import type { InventoryChange } from '../types';

export type ScenarioActivateMode = 'newChar' | 'preset';

const SCENARIO_BOOK_PREFIX = '__scenario_';

// B6: 卸载剧本是 fire-and-forget(unloadScenario 调用方多为 clearAllGameState 内的动态 import,
// 微任务完成时机不受调用方控制)。若玩家紧接着重新激活同一 scenarioId,activateScenario 的 A2 守卫
// 会读到「还挂着的旧 book」直接早退;紧接着排队的 unloadScenario 才执行 removeBook,把刚被守卫
// 「认作已挂」的 book 拔掉——新会话进游戏后没有 world-info 条目。
// 解决:用 pendingUnloads 记录每个 bookId 正在进行/排队中的卸载 Promise,activateScenario 入口
// 等所有 pending 卸载 settle 再读 A2 状态,杜绝读写竞争。
const pendingUnloads = new Map<string, Promise<void>>();

// 关系 lorebook 实时订阅句柄：activateScenario / mountScenarioBook 挂上,
// unloadScenario 解挂。同一 scenarioId 重复挂载时先 unsubscribe 旧的再注册新的,
// 防止订阅泄漏导致多次 upsertEntries 写同一 book。
const relationUnsubscribes = new Map<string, () => void>();

// B6: 把 scn.entries 里 category === '地点' 的条目同步到 useMapStore——抽成共享 helper 后
// activateScenario step 3 后置与 mountScenarioBook(读档重挂)都能复用,避免重复粘贴维护成本。
function applyScenarioMapLocations(entries: { category?: string; keys: string; content: string; comment: string }[]): void {
  const locationEntries = entries.filter((e) => e.category === '地点');
  if (locationEntries.length === 0) return;
  const newLocations = locationEntries
    .map((e) => {
      const firstKey = e.keys.split(',')[0]?.trim();
      const name = firstKey || e.comment;
      // 先 renderTemplate 处理 EJS 条件块(getvar('剧情.已解锁.X')==='true' 路径),
      // 否则 MapOverlay 地点详情面板会显示字面 <% if %>...<% } %> 代码 — bug fix:
      // 之前直接 split content 切前 3 行,EJS 字面文本就渗到 MapLocation.description。
      // renderTemplate 失败时 fallback 到原文本(ejs-template.ts:205),不破坏现有流程。
      const rendered = renderTemplate(e.content, { cache: { enabled: 0, size: 0 } });
      return {
        name,
        description: rendered.split('\n').slice(0, 3).join('\n').trim(),
      };
    })
    .filter((l) => l.name.trim().length > 0);
  if (newLocations.length > 0) {
    useMapStore.getState().applyUpdates({ newLocations });
  }
}

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

  // A2 — 副作用幂等守卫(语义化版本):
  // 旧实现用 sessionScenarioId === scenarioId 兜底,但 newChar/preset 流程在 step 5 才写 sessionId,
  // 故 currentScn 在重复调用时永远 undefined,守卫永不命中,会让 upsertBook 反复覆盖玩家手改条目、
  // extractInitialItems 双倍入库到背包、replacePage 砸掉玩家已推进的 page0 进度。
  // 改为以 lorebook 已挂载且 enabled 作为「真正激活」的指标(副作用必然产物,与 sessionId 写入时序无关)。
  // 若想换剧本必须先 startNewConversation,届时 lorebook 也会被 clearAllGameState 清掉。
  const bookId = SCENARIO_BOOK_PREFIX + scenarioId;
  // B6: 先等待任何针对同一 bookId 的 pending unload 完成,再读 A2 状态。
  // 否则 sessionLifecycle 在 clearAllGameState 里发起的 fire-and-forget unloadScenario 微任务
  // 可能晚于 A2 读取触发,导致「读到挂载 → 早退 → 紧接着 removeBook 拔掉」的竞争,新会话没书。
  const pending = pendingUnloads.get(bookId);
  if (pending) await pending;
  const alreadyMounted = useLorebookStore.getState().books[bookId]?.enabled === true;
  if (alreadyMounted) {
    console.log('[scenario-engine] 剧本', scenarioId, '已挂载,跳过重复激活');
    return;
  }

  // ── A3+B5+B4: 预激活快照(必须在 step 1 setSheet/applyUpdates 之前抓) ─────
  // 若放在 step 1-2 之后,prevSheet 会捕获到 setSheet(proto.sheet) 写入后的剧本预设卡;
  // 之后 step 3-6 抛错走 catch 时,setSheet(prevSheet) 把玩家「恢复」成同一张剧本预设卡,
  // 玩家肉眼看不到回滚,留下混档幽灵。同理 statData / npcProfiles 也必须是 step 1-2 之前的真态。
  // 注:inventory/map 的快照与 page0 快照,本来就在 step 3-4 之前,迁移到 step 1 之前一并集中。
  const prevSheet = useCharSheetStore.getState().sheet;
  const prevStatData = useVariableStore.getState().statData;
  const prevNpcProfiles = useNpcStore.getState().profiles;
  const prevInventoryItems = useInventoryStore.getState().items;
  const prevMapLocations = useMapStore.getState().locations;
  const prevMapEdges = useMapStore.getState().edges;
  const prevMapCurrentId = useMapStore.getState().currentLocationId;
  // A2: replacePage/appendPage 之前先抓 page0 快照,出错时能把玩家原本的 page0 还回去——
  // 否则 catch 块只回滚 lorebook+sessionId,玩家会看到一个被剧本 LLM 扩写半截、又因抛错没写
  // sessionScenarioId 的「幽灵 page0」。pages 为空时 originalPage0 = null,catch 走 resetToPrologue。
  const originalPage0 = useBookStore.getState().pages[0] ?? null;

  // ── 1. 角色卡 + NPC ─────────────────────────────────────────────────
  // M10: playerId 为玩家本人对应的 ScenarioCharacter.id;
  //  - preset 模式 = scn.characters[charIdx].id(玩家扮演该角色)
  //  - newChar 模式 = null(玩家自创卡,关系图中 player_created 角色由 CharCreator M4/M5 写入,
  //    此时尚未指定具体 id;canJoinParty 第 4 参 playerId 类型为 string 不容空,
  //    故 newChar 模式下跳过 R1 入队判定——presentAtStart NPC 仅 isPresent=true 建场,
  //    入队由后续 PeopleTab/post-settle 评估器按真实关系驱动)
  let playerId: string | null = null;
  if (mode === 'preset') {
    // preset 模式必须显式指定主角索引；不允许 undefined 默默兜底到 0，
    // 否则一旦上游路由没传 charIdx，玩家会被随机分配第 0 号角色（可能是 locked_npc）。
    if (charIdx === undefined) {
      throw new Error('[scenario-engine] preset 模式必须显式传 charIdx');
    }
    const idx = charIdx;
    const proto = scn.characters[idx];
    if (!proto) throw new Error(`[scenario-engine] preset 模式 charIdx=${idx} 越界`);
    // protagonist (推荐主角) 和 optional (配角可玩) 都允许玩家扮演;
    // locked_npc 是剧本钉死的不可选角色(反派/序章死者),拒绝。
    if (proto.role === 'locked_npc') {
      throw new Error(`[scenario-engine] charIdx=${idx} 指向的角色被剧本锁定不可扮演 (role=${proto.role})`);
    }
    useCharSheetStore.getState().setSheet(proto.sheet);
    playerId = proto.id;
  }
  // 其他角色全部 NPC 化(preset 模式排除玩家本人;newChar 模式全部 NPC 化)。
  // M10: 开场建场流程——按 characters[] 顺序遍历,跟踪已"在场"NPC 集合,
  //   - presentAtStart!==true → 走原 applyUpdates(scenarioCharacterToNpc),isPresent 由 scenarioCharacterToNpc 决定;
  //   - presentAtStart===true:
  //       1) 与已在场 NPC 互为敌对(hasHostileEdge 任一方向 true) → 强制 isPresent=false + console.warn(spec §4.2 R5);
  //       2) 否则 isPresent=true 建场;再跑 canJoinParty.ok(对方与玩家或队内任意成员有非敌对边) → joinParty 自动入队;
  //          newChar 模式 playerId=null → 跳过 joinParty 判定(canJoinParty 第 4 参不容空);
  //   - 玩家本人(c.id === playerId)跳过,不入 NpcProfile 名册(玩家不在名册;玩家 inParty 由调用方语义保证)。
  const npcStore = useNpcStore.getState();
  const presentIds: string[] = []; // 已 isPresent=true 的 NPC id,用于敌对冲突顺序判定
  const partyIds: string[] = []; // 已入队 NPC id(不含玩家;canJoinParty 第 3 参语义)
  for (let i = 0; i < scn.characters.length; i++) {
    const c = scn.characters[i];
    if (mode === 'preset' && c.id === playerId) continue; // 玩家本人不进名册
    const npc = scenarioCharacterToNpc(c);
    if (c.presentAtStart === true) {
      // R5: 与已在场 NPC 互为敌对 → 后到者强制 isPresent=false
      const conflict = presentIds.find((existingId) => hasHostileEdge(scn, c.id, existingId));
      if (conflict) {
        console.warn(
          `[scenario-engine] 开场冲突(R5): "${c.id}" 与已在场 "${conflict}" 互为敌对边, 强制 isPresent=false`,
        );
        npc.isPresent = false;
        npcStore.applyUpdates([npc]);
        continue;
      }
      npc.isPresent = true;
      npcStore.applyUpdates([npc]);
      presentIds.push(c.id);
      // R1: 与玩家或队内任意成员有非敌对边 → 自动 joinParty
      // newChar 模式 playerId=null → 跳过(无玩家锚点,关系图准入无意义)
      if (playerId !== null && canJoinParty(scn, c.id, partyIds, playerId).ok) {
        npcStore.joinParty(c.id);
        partyIds.push(c.id);
      }
    } else {
      // 未显式 presentAtStart → 走 scenarioCharacterToNpc 默认值(locked_npc 不在场,其余在场)
      npcStore.applyUpdates([npc]);
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
  //     A3+B5: step 1-2 之前已抓快照(prevSheet/prevStatData/prevNpcProfiles 等),
  //     catch 块整体回滚到激活前状态,防止失败留下半成品继续生效造成玩家无感的混档。
  //     注:setSessionScenario 在 try 内已有独立回滚旗标(只在写过时清),不需要预快照。
  const scenarioBookId = bookId; // 复用 A2 守卫中算好的 book id
  let bookMounted = false;
  let sessionScenarioWritten = false;
  let page0Replaced = false;
  try {
    // ── 3. 挂载剧本条目到 lorebook（独立 book，priority +1000 防撞键） ──
    useLorebookStore.getState().upsertBook(scenarioBookId, {
      name: '[剧本] ' + scn.meta.name,
      enabled: true,
      entries: scenarioEntriesToLoreEntries(scn.entries),
    });
    bookMounted = true;

    // B2: entries.category === '地点' 自动写入 useMapStore — 否则 lorebook 里的「地点」条目
    // 只能被世界书匹配引擎按关键词激活,玩家打开地图面板看不到任何节点,与剧本叙事脱节。
    // B6: 抽成 applyScenarioMapLocations helper,mountScenarioBook 读档重挂时复用同一份地点同步逻辑。
    applyScenarioMapLocations(scn.entries);

    // 挂关系图实时订阅:玩家/PeopleTab/post-settle 改 characters[].relations 后,
    // 下一次 LLM 调用前 lorebook 已被 upsertEntries 同步(只替换 rel_* 前缀条目)。
    const prevUnsub = relationUnsubscribes.get(scenarioId);
    if (prevUnsub) prevUnsub();
    relationUnsubscribes.set(scenarioId, subscribeRelationLorebook(scenarioId));

    // ── 4. 初始物品（两种模式统一处理，序章生成之前完成入库，玩家第一眼看到序章背包就已有物品）──
    // newChar: CharCreator Step 5 填的 initialItemsRaw 已通过 setSheet 写到 useCharSheetStore
    // preset:  step 1 setSheet(proto.sheet) 已把预设角色的 initialItemsRaw 写到 useCharSheetStore
    // 统一从 useCharSheetStore 取，两种模式一致处理
    const raw = (useCharSheetStore.getState().sheet.initialItemsRaw ?? '').trim();
    if (raw) {
      try {
        const items = await extractInitialItems(raw);
        if (items.length > 0) {
          // ExtractedInitialItem.category 是 5 元枚举(weapon/medical/misc/key_item/clothing),
          // 与 InventoryStore 用的 ItemCategory(weapon/tool/consumable/clue/key_item/misc) 不一致;
          // 这里做名义映射(medical→consumable,clothing→misc),其余按原值。
          const CAT_MAP: Record<NonNullable<typeof items[number]['category']>, InventoryChange['category']> = {
            weapon: 'weapon',
            medical: 'consumable',
            misc: 'misc',
            key_item: 'key_item',
            clothing: 'misc',
          };
          const changes: InventoryChange[] = items.map((i) => ({
            action: 'add',
            name: i.name,
            quantity: i.quantity,
            category: i.category ? CAT_MAP[i.category] : undefined,
            description: i.description,
          }));
          useInventoryStore.getState().applyChanges(changes);
          // B3: 把入库结果也写回 page0 的 acquiredItems / inventoryChanges,这样:
          //   1) 玩家删除 page0(若未来放开禁删) → useBookStore.deletePage 能用 inventoryChanges
          //      调用 inventoryStore.revertChanges 还原背包,不会留下脱离剧情的孤儿物品;
          //   2) 序章页 UI 显示「本页拾取」标记,与剧本叙事一致(玩家在序章里看到「你获得了...」)。
          const itemNames = items.map((i) => i.name);
          const bookStore = useBookStore.getState();
          if (bookStore.pages.length > 0) {
            bookStore.setPageAcquiredItems(0, itemNames);
            bookStore.setPageInventoryChanges(0, changes);
          }
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

      // 把 LLM 在 page0.sceneInfo 给出的当前地点同步到 useMapStore.currentLocationId，
      // 让玩家序章一进去打开地图就看见金色「所在」徽章；与 useChatPipeline.advanceTurn
      // 末尾的 setCurrentByName 兜底同语义（不用 applyUpdates({current}) 防给陌生地点
      // 自动建空描述节点 — 见 BUG3 修复策略）。fallback page0 无 sceneInfo 自动跳过。
      const sceneLoc = page0.sceneInfo?.location?.trim();
      if (sceneLoc && sceneLoc !== '未知') {
        useMapStore.getState().setCurrentByName(sceneLoc);
      }
    }
  } catch (err) {
    // A3+B5: 整体回滚到激活前快照,防止失败留下半成品继续生效造成玩家无感的混档。
    // 顺序:lorebook(防关键词激活) → sessionScenario → page0 → sheet/MVU/NPC/inventory/map。
    // 每一步独立 try/catch,任一回滚抛错都不应阻止其它回滚(优先把残骸清干净)。
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
    // A3+B5: step 1-2(sheet/NPC/MVU) + step 3 副作用(inventory/map) 一并回滚到 try 前快照,
    // 避免「上半身设定换了/物品入库了/地图节点多了,下半身 lorebook 没挂」的混档幽灵态。
    try {
      useCharSheetStore.getState().setSheet(prevSheet);
    } catch (rollbackErr) {
      console.warn('[scenario-engine] 回滚 sheet 失败：', rollbackErr);
    }
    try {
      useVariableStore.getState().setStatData(prevStatData);
    } catch (rollbackErr) {
      console.warn('[scenario-engine] 回滚 statData 失败：', rollbackErr);
    }
    try {
      // NpcStore 没有 replaceAll(record) 重载,只有 replaceAll(NpcProfile[]); 直接喂 Object.values 即可。
      useNpcStore.getState().replaceAll(Object.values(prevNpcProfiles));
    } catch (rollbackErr) {
      console.warn('[scenario-engine] 回滚 NPC profiles 失败：', rollbackErr);
    }
    try {
      useInventoryStore.getState().replaceAll(prevInventoryItems);
    } catch (rollbackErr) {
      console.warn('[scenario-engine] 回滚 inventory 失败：', rollbackErr);
    }
    try {
      useMapStore.getState().replaceAll({
        locations: prevMapLocations,
        edges: prevMapEdges,
        currentLocationId: prevMapCurrentId,
      });
    } catch (rollbackErr) {
      console.warn('[scenario-engine] 回滚 map 失败：', rollbackErr);
    }
    throw err;
  }
}

export function unloadScenario(scenarioId: string): void {
  // 先解关系图订阅,避免后续 store 变化继续往一个即将被 removeBook 拔掉的 book 上 upsertEntries。
  const unsub = relationUnsubscribes.get(scenarioId);
  if (unsub) {
    unsub();
    relationUnsubscribes.delete(scenarioId);
  }
  const bookId = SCENARIO_BOOK_PREFIX + scenarioId;
  // B6: 把卸载动作包成 Promise 并注册到 pendingUnloads,activateScenario 入口会等它 settle 再
  // 读 A2 状态,杜绝「读到挂载 → 早退 → 紧接着 removeBook 拔掉」的竞争。
  // 注:removeBook 本身是同步的,但 Promise 化能跨微任务边界把 fire-and-forget unload 串起来,
  // 让任何后来的 activateScenario(同一 bookId) 能等到此次 unload 真正生效。
  // 用 definite-assignment !: 绕开 TS 对 IIFE 内引用自身 const 的「used before assigned」误报
  // (运行时 finally 块在 promise 已赋值后才执行)。
  let promise!: Promise<void>;
  promise = (async () => {
    try {
      useLorebookStore.getState().removeBook(bookId);
    } finally {
      // 只在自己仍是当前注册的 promise 时清理映射,避免覆盖更晚 unload 的注册(否则后来的
      // activateScenario 会跳过等待,又落回竞争窗口)。
      if (pendingUnloads.get(bookId) === promise) pendingUnloads.delete(bookId);
    }
  })();
  pendingUnloads.set(bookId, promise);
}

/**
 * B6 — 读档专用:为已加载的会话(从关系表恢复后)重新挂载剧本 lorebook book + 地图地点。
 *
 * 背景:clearAllGameState 会卸掉前一会话的剧本 book(持久化层无 lorebook 表,book 只在内存),
 *       但 loadConversation 的 5+ 个 replaceAll 流程不会回头挂书。结果切到/切回某剧本会话后,
 *       world-info 条目全空,LLM 看不到剧本设定,行为退化成自由模式。
 *
 * 与 activateScenario 的区别:
 *   - 不动 sheet / NPC / inventory / MVU / page0 / sessionScenarioId — 这些已由 loadConversation 还原;
 *   - 不调 extractInitialItems / expandPrologueToPage — 这些是「新游戏」副作用,读档已有结果;
 *   - 仅 step 3(挂 book)。
 *   - 不调 applyScenarioMapLocations:读档时 sessionLifecycle.replaceAll(map)
 *     已恢复玩家编辑后的地图状态;若 mountScenarioBook 再追加默认地点,玩家
 *     游戏中删除/重命名的地点会被悄悄重生。地图同步只在 activateScenario 首激活跑。
 *
 * 也会先等 pendingUnloads 完成(同 activateScenario 的竞争防御):若 clearAllGameState 的
 * fire-and-forget unload 尚未 settle,本函数等它 settle 再 upsert,保证最终态是「book 挂着」。
 *
 * 找不到剧本(被删除/不在 builtins+userScenarios)→ 静默跳过,不抛错(读档 UX 优先);
 * scenarioId === '__free' → 兼容性跳过(自由模式无剧本 book)。
 */
export async function mountScenarioBook(scenarioId: string): Promise<void> {
  if (!scenarioId || scenarioId === '__free') return;
  // D3 race 防御：读档可能早于 onRehydrateStorage 完成,此时 builtins=[],
  // 内置剧本(__scenario_*)会被误判为不存在而静默跳过重挂。同步灌入兜底。
  useScenarioStore.getState().ensureBuiltinsLoaded();
  const scn = useScenarioStore.getState().getById(scenarioId);
  if (!scn) {
    console.warn('[scenario-engine] mountScenarioBook 找不到剧本,跳过重挂:', scenarioId);
    return;
  }
  const bookId = SCENARIO_BOOK_PREFIX + scenarioId;
  const pending = pendingUnloads.get(bookId);
  if (pending) await pending;
  useLorebookStore.getState().upsertBook(bookId, {
    name: '[剧本] ' + scn.meta.name,
    enabled: true,
    entries: scenarioEntriesToLoreEntries(scn.entries),
  });
  // 不调 applyScenarioMapLocations:见上方 mountScenarioBook 注释,地点同步仅在首激活路径。
  // 挂关系图实时订阅(与 activateScenario 同模式):重挂时先 unsubscribe 旧的再注册新的,
  // 防止 unloadScenario 失败/读档跳过 unload 留下的孤儿订阅泄漏。
  const prevUnsub = relationUnsubscribes.get(scenarioId);
  if (prevUnsub) prevUnsub();
  relationUnsubscribes.set(scenarioId, subscribeRelationLorebook(scenarioId));
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
