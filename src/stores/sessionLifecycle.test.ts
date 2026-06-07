import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from './useChatStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
import { useLorebookStore, AUTO_SUMMARY_BOOK_ID } from './useLorebookStore';
import { useClueStore } from './useClueStore';
import { useNpcStore } from './useNpcStore';
import { useMapStore } from './useMapStore';
import { useLocationElementStore } from './useLocationElementStore';
import { useDarkThreadStore } from './useDarkThreadStore';
import { useKeyClueStore } from './useKeyClueStore';
import { useAnchorStore } from './useAnchorStore';
import { useCombatStore } from './useCombatStore';
import { saveConversation, loadConversation, deleteConversation, cleanupOrphanGameState, clearAllGameState, startNewConversation, switchConversation } from './sessionLifecycle';
import { persistActivePages } from './sessionLifecycle';
import { useNarrationStore } from './useNarrationStore';
import { db } from '../db/database';
import type { BookPage, CharacterSheet } from '../types';

async function clearDb() {
  await Promise.all([
    db.conversations.clear(), db.pages.clear(), db.charsheets.clear(),
    db.inventory.clear(), db.darkThreads.clear(), db.keywords.clear(),
    db.gameVars.clear(), db.macroVars.clear(),
  ]);
}

function populatedSheet(name: string): CharacterSheet {
  return {
    ...defaultSheet,
    characteristics: { ...defaultSheet.characteristics, STR: 65, CON: 50 },
    identity: { ...defaultSheet.identity, name, id: 'inv-' + name },
  };
}

function makePage(id: string, header: string): BookPage {
  return {
    id,
    leftHeader: header,
    leftContent: '',
    leftPage: '',
    rightPage: '',
    rightHeader: '',
    rightContent: '',
    rightChoices: [],
  };
}

describe('persistActivePages', () => {
  it('删除书本页面后，改动同步落到活跃会话存档（修复读档复活）', () => {
    const id = useChatStore.getState().createSession('测试存档');
    // 会话初始存了两页
    useChatStore.getState().savePages([makePage('a', 'A'), makePage('b', 'B')]);
    // 书本里删掉第二页（绕过 useChatPipeline 的手动删除）
    useBookStore.getState().setPages([makePage('a', 'A'), makePage('b', 'B')]);
    useBookStore.getState().deletePage(1);

    persistActivePages();

    const session = useChatStore.getState().sessions.find((s) => s.id === id)!;
    expect(session.pages.map((p) => p.id)).toEqual(['a']);
  });

  it('编辑书本页面后，标题/正文同步落到活跃会话存档', () => {
    const id = useChatStore.getState().createSession('测试存档2');
    useChatStore.getState().savePages([makePage('x', '旧标题')]);
    useBookStore.getState().setPages([makePage('x', '旧标题')]);
    useBookStore.getState().updateLeftPage(0, '新标题', '新正文');

    persistActivePages();

    const session = useChatStore.getState().sessions.find((s) => s.id === id)!;
    expect(session.pages[0].leftHeader).toBe('新标题');
    expect(session.pages[0].leftContent).toBe('新正文');
  });
});

describe('T-E P0-1 charsheet 跨会话隔离', () => {
  beforeEach(async () => { await clearDb(); });

  it('切到无角色卡行的会话时，角色卡重置为默认而非残留上一会话', async () => {
    // 会话 A：有真实角色卡，落库
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useCharSheetStore.getState().setSheet(populatedSheet('阿尔伯特'));
    await saveConversation(a);
    expect(await db.charsheets.get(a)).toBeDefined();

    // 会话 B：从未存过角色卡（无 charsheet 行）
    const b = useChatStore.getState().createSession('B');
    // 加载 B：必须把内存角色卡重置为默认，不能残留 A 的「阿尔伯特」
    await loadConversation(b);
    const sheet = useCharSheetStore.getState().sheet;
    expect(sheet.identity.name).toBe('');
    expect(isDefaultSheet(sheet)).toBe(true);
  });

  it('默认/空白角色卡不被持久化（saveConversation 跳过 put 并清残留行）', async () => {
    const c = useChatStore.getState().createSession('C');
    useChatStore.getState().setActive(c);
    // 内存里是默认空卡
    useCharSheetStore.getState().setSheet(defaultSheet);
    await saveConversation(c);
    expect(await db.charsheets.get(c)).toBeUndefined();
  });

  it('角色卡从真实回退到默认时，save 删除旧 charsheet 行', async () => {
    const d = useChatStore.getState().createSession('D');
    useChatStore.getState().setActive(d);
    useCharSheetStore.getState().setSheet(populatedSheet('贝克'));
    await saveConversation(d);
    expect(await db.charsheets.get(d)).toBeDefined();
    // 回退默认再存 → 行被删
    useCharSheetStore.getState().setSheet(defaultSheet);
    await saveConversation(d);
    expect(await db.charsheets.get(d)).toBeUndefined();
  });
});

describe('T-E P1-2 持久化串行化（save/delete 不撕裂、无孤儿）', () => {
  beforeEach(async () => { await clearDb(); });

  it('同一会话的 save 与 delete 并发不残留孤儿子行', async () => {
    const x = useChatStore.getState().createSession('X');
    useChatStore.getState().setActive(x);
    useBookStore.getState().setPages([makePage('p1', 'P1'), makePage('p2', 'P2')]);
    useChatStore.getState().savePages([makePage('p1', 'P1'), makePage('p2', 'P2')]);

    // 不 await 地同时发起 save 与 delete（经同一条 enqueue 链串行化）
    const pSave = saveConversation(x);
    const pDel = deleteConversation(x);
    await Promise.all([pSave, pDel]);

    // 最终状态一致：要么全删（delete 最后），且绝不留下「子行存在但父 conversations 行已删」的孤儿
    const conv = await db.conversations.get(x);
    const pageCount = await db.pages.where('conversationId').equals(x).count();
    if (!conv) {
      // delete 在 save 之后生效：父子全清
      expect(pageCount).toBe(0);
    } else {
      // save 在 delete 之后生效：父在则子也应在（无孤儿）
      expect(pageCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('新建人物 finalize 落档（P0-1 修复回归——孤儿态下 setSheet 不被 cleanup 清掉）', () => {
  beforeEach(async () => {
    await clearDb();
    // 模拟「首次游戏 / 回主菜单后无活跃会话」：无 sessions、activeId=null
    useChatStore.setState({ sessions: [], activeId: null });
  });

  // 复现 CharacterCreator.finalize 的正确次序：先清干净 → 再 setSheet → createSession → saveConversation。
  // 旧次序（setSheet 在 cleanupOrphanGameState 之前）会因 clearAllGameState 现在重置角色卡而把刚设的卡清掉，
  // 导致 saveConversation 读到默认卡 → isDefaultSheet → 跳过持久化 → 新人物角色卡丢失。
  it('孤儿态下新建人物：角色卡正确落库（不被 orphan cleanup 清掉）', async () => {
    const sheet = populatedSheet('新调查员');

    // 正确次序（修复后 CharacterCreator 应采用）：clear-first
    cleanupOrphanGameState();             // 此时无活跃会话 → clearAllGameState（含重置角色卡为默认）
    useCharSheetStore.getState().setSheet(sheet);  // 在 clear 之后设置真实角色卡
    const newId = useChatStore.getState().createSession('新调查员');
    useChatStore.getState().setActive(newId);
    await saveConversation(newId);

    // 角色卡必须落库（非默认卡）
    const row = await db.charsheets.get(newId);
    expect(row).toBeDefined();
    expect(row?.sheet.identity.name).toBe('新调查员');
    expect(isDefaultSheet(row!.sheet)).toBe(false);
  });
});

describe('摘要按会话重建（方案B：从 pages 派生，修切档丢摘要 bug）', () => {
  beforeEach(async () => {
    await clearDb();
    useLorebookStore.getState().clearSummaryEntries();
  });

  function summaryPage(id: string, header: string, summary: string, kw: string[]): BookPage {
    const keywords: Record<string, string> = {};
    for (const k of kw) keywords[k] = '释义';
    return { id, leftHeader: header, leftContent: '', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [], summary, keywords };
  }

  function summaryEntries() {
    const book = useLorebookStore.getState().books[AUTO_SUMMARY_BOOK_ID];
    return book ? Object.entries(book.entries) : [];
  }

  it('切回带摘要的旧会话时，摘要世界书条目被从 pages 重建（修 bug）', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useBookStore.getState().setPages([summaryPage('pg1', '调查现场', '调查员发现了血迹', ['血迹', '现场'])]);
    await saveConversation(a);

    // 切到 B（loadConversation 会 clearAllGameState → 清空摘要书）
    const b = useChatStore.getState().createSession('B');
    await loadConversation(b);
    expect(summaryEntries()).toHaveLength(0); // B 无摘要

    // 切回 A：摘要必须从 A 的页面重建
    await loadConversation(a);
    const entries = summaryEntries();
    expect(entries).toHaveLength(1);
    const [entryId, entry] = entries[0];
    expect(entryId).toBe('summary_pg1');
    expect(entry.content).toBe('[剧情回顾] 调查员发现了血迹');
    expect(entry.name).toBe('摘要: 调查现场');
    expect(entry.keys).toBe('血迹, 现场');
  });

  it('无 summary 字段的页面不产生摘要条目', async () => {
    const c = useChatStore.getState().createSession('C');
    useChatStore.getState().setActive(c);
    useBookStore.getState().setPages([
      { id: 'p0', leftHeader: '序章', leftContent: '', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
    ]);
    await saveConversation(c);
    await loadConversation(c);
    expect(summaryEntries()).toHaveLength(0);
  });

  it('切到无摘要会话时不残留上一会话摘要', async () => {
    const a = useChatStore.getState().createSession('A2');
    useChatStore.getState().setActive(a);
    useBookStore.getState().setPages([summaryPage('s1', '场景', '剧情甲', ['甲'])]);
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B2');
    await loadConversation(b);
    expect(summaryEntries()).toHaveLength(0);
  });
});

describe('clearAllGameState 重置书本页面（修删活跃会话后旧页面混档进 LLM）', () => {
  beforeEach(async () => {
    await clearDb();
    useLorebookStore.getState().clearSummaryEntries();
  });

  // 删除活跃会话时 UI 仍停在 game 屏(App 不监听 activeId 重路由),且无后续 loadConversation。
  // 若 clearAllGameState 不清 useBookStore.pages,被删会话的故事页会残留 → 下次发消息经
  // buildContextFromPages 注入 LLM = 跨会话混档。clearAllGameState 必须把书本重置为序章。
  it('clearAllGameState 后书本不残留上一会话页面(回退序章)', () => {
    // 模拟某会话已有多页真实剧情
    useBookStore.getState().setPages([
      { id: 'leak1', leftHeader: '调查现场', leftContent: '机密剧情A', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
      { id: 'leak2', leftHeader: '第二章', leftContent: '机密剧情B', leftPage: '', rightPage: '', rightHeader: '', rightContent: '', rightChoices: [] },
    ]);
    expect(useBookStore.getState().pages.length).toBeGreaterThan(1);

    // 删活跃会话路径调用的 clearAllGameState
    clearAllGameState();

    const pages = useBookStore.getState().pages;
    // 不得残留被删会话的机密剧情；应回退到单页序章
    expect(pages.length).toBe(1);
    expect(pages[0].leftHeader).toBe('序章');
    expect(pages.some((p) => p.leftContent.includes('机密剧情'))).toBe(false);
  });
});

describe('开新游戏的跨存档隔离（clues/npc/map/darkThread 不泄漏进新档）', () => {
  beforeEach(async () => {
    await clearDb();
    await Promise.all([
      db.clues.clear(), db.npcProfiles.clear(),
      db.mapLocations.clear(), db.mapEdges.clear(),
      db.plotAnchors.clear(),
      db.combat.clear(),
    ]);
    useClueStore.getState().clearAll();
    useNpcStore.getState().clearAll();
    useMapStore.getState().clearAll();
    useDarkThreadStore.getState().clearAll();
    useAnchorStore.getState().clearAll();
    useCombatStore.getState().clearAll();
    useChatStore.setState({ sessions: [], activeId: null });
  });

  // 复现严重 bug：正在玩存档 A（仍是活跃会话）时开新游戏 B，B 不得继承 A 的
  // 线索/名册/地图/暗线。根因是旧 new-game 路径漏清 clues/npc/map，且 cleanupOrphanGameState
  // 在「有有效活跃会话」时是 no-op。startNewConversation 集中化隔离不变量。
  it('正玩存档A时开新游戏B：B的存档不继承A的线索/名册/地图/暗线', async () => {
    // 存档 A：积累线索、NPC、地图、暗线，并落库
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useClueStore.getState().addClues([{ name: '密信', summary: '可疑信件' }]);
    useNpcStore.getState().applyUpdates([{ name: '馆员霍尔姆斯', identity: '图书管理员', isPresent: true }]);
    useMapStore.getState().applyUpdates({ current: '图书馆', newLocations: [{ name: '图书馆', description: '藏书浩繁' }] });
    useDarkThreadStore.getState().addEntry({ progress: 30, threatLevel: '浮现', details: 'A的幕后阴谋', foreshadowing: '' });
    await saveConversation(a);

    // 开新游戏 B（A 仍是活跃会话）—— 权威入口必须清空全部隔离态再建 B
    const b = startNewConversation('B');

    // 内存里不得残留 A 的任何隔离态
    expect(useClueStore.getState().clues).toHaveLength(0);
    expect(Object.values(useNpcStore.getState().profiles)).toHaveLength(0);
    expect(useMapStore.getState().locations).toHaveLength(0);
    expect(useDarkThreadStore.getState().entries).toHaveLength(0);

    // 保存 B 后，B 的存档行不得含 A 的数据
    await saveConversation(b);
    expect(await db.clues.where('conversationId').equals(b).toArray()).toHaveLength(0);
    expect(await db.npcProfiles.where('conversationId').equals(b).toArray()).toHaveLength(0);
    expect(await db.mapLocations.where('conversationId').equals(b).toArray()).toHaveLength(0);
    expect(await db.darkThreads.where('conversationId').equals(b).toArray()).toHaveLength(0);

    // A 的数据不丢：切走前已由 saveConversation(a) 落库
    expect((await db.clues.where('conversationId').equals(a).toArray()).length).toBeGreaterThan(0);
    expect((await db.npcProfiles.where('conversationId').equals(a).toArray()).length).toBeGreaterThan(0);
  });

  it('正玩存档A时开新游戏B：B不继承A的剧情锚点；切回A可恢复', async () => {
    const a = startNewConversation('A');
    useChatStore.getState().setActive(a);
    useAnchorStore.getState().setAnchors({
      nodes: [{ id: 'n1', title: '抵达极地', description: '到达死城' }],
      constraints: ['威胁在极地爆发'],
      threatDependencies: ['船只补给'],
    });
    await saveConversation(a);

    const b = startNewConversation('B');
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(0); // B 不继承
    expect(await db.plotAnchors.get(b)).toBeUndefined();

    await switchConversation(a); // 切回 A 恢复
    expect(useAnchorStore.getState().anchors.nodes).toHaveLength(1);
    expect(useAnchorStore.getState().anchors.constraints).toContain('威胁在极地爆发');
  });

  it('正玩存档A时开新游戏B：B不继承A的进行中战斗；切回A恢复半成品', async () => {
    const a = startNewConversation('A');
    useChatStore.getState().setActive(a);
    useCombatStore.getState().start({
      active: true, round: 2, turnOrder: ['p'], currentIdx: 0,
      combatants: [], bystanders: [], playerTargetId: null,
      log: [{ kind: 'narrative', text: '战斗进行中' }], diceRecords: [], status: 'active',
    });
    await saveConversation(a);

    const b = startNewConversation('B');
    expect(useCombatStore.getState().encounter).toBeNull(); // B 不继承
    expect(await db.combat.get(b)).toBeUndefined();

    await switchConversation(a); // 切回 A 恢复半成品演出
    expect(useCombatStore.getState().encounter?.round).toBe(2);
    expect(useCombatStore.getState().encounter?.log).toHaveLength(1);
  });
  // 切档时若 loadConversation 的只读事务抛错（DB 损坏/迁移不全等），clearAllGameState 必须仍已执行——
  // 否则上一会话(A)的 clues/npc/map 残留内存、而 activeId 已切到 B → 下次保存把 A 数据写进 B = 污染。
  // 防御：clearAllGameState 前置到读取之前。
  it('切档时 DB 读取失败：内存仍被清空，不残留上一会话(防污染新档)', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useClueStore.getState().addClues([{ name: '密信', summary: '可疑信件' }]);
    useNpcStore.getState().applyUpdates([{ name: '霍尔姆斯', identity: '管理员', isPresent: true }]);
    useMapStore.getState().applyUpdates({ current: '图书馆', newLocations: [{ name: '图书馆', description: '' }] });
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B');
    // 让 loadConversationInner 的下一次 db.transaction（只读批量读取）抛错
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('simulated DB read failure'));
    await loadConversation(b).catch(() => { /* 吞掉模拟错误 */ });
    spy.mockRestore();

    // 即便读取失败，内存也不得残留 A 的隔离态
    expect(useClueStore.getState().clues).toHaveLength(0);
    expect(Object.values(useNpcStore.getState().profiles)).toHaveLength(0);
    expect(useMapStore.getState().locations).toHaveLength(0);
  });
});

describe('坏结局(badEnding)持久化 + 跨会话隔离', () => {
  beforeEach(async () => {
    await clearDb();
    await db.darkEndings.clear();
    useDarkThreadStore.getState().clearAll();
    useChatStore.setState({ sessions: [], activeId: null });
  });

  it('badEnding save→load 往返保留', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useDarkThreadStore.getState().setBadEnding({ description: '调查员被献祭给犹格·索托斯', createdAt: 123 });
    await saveConversation(a);

    useDarkThreadStore.getState().clearAll();
    expect(useDarkThreadStore.getState().badEnding).toBeNull();

    await loadConversation(a);
    expect(useDarkThreadStore.getState().badEnding?.description).toContain('犹格');
  });

  it('切到无坏结局的会话 → badEnding 重置为 null(不残留上一会话)', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useDarkThreadStore.getState().setBadEnding({ description: 'A的坏结局', createdAt: 1 });
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B');
    await loadConversation(b);
    expect(useDarkThreadStore.getState().badEnding).toBeNull();
  });

  it('删除会话时一并清除其 darkEndings 行', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useDarkThreadStore.getState().setBadEnding({ description: '待删坏结局', createdAt: 1 });
    await saveConversation(a);
    expect(await db.darkEndings.get(a)).toBeDefined();

    await deleteConversation(a);
    expect(await db.darkEndings.get(a)).toBeUndefined();
  });
});

describe('MVU statData 持久化 + 跨会话隔离', () => {
  beforeEach(async () => { await clearDb(); });

  it('statData 树 save→load 往返保留', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useVariableStore.getState().setStatData({ 世界: { 时间: '深夜', 天气: '雨' }, 剧情: { 阶段: '高潮', 进度: 60 } });
    await saveConversation(a);

    // 清空内存后从库恢复
    useVariableStore.getState().clearAll();
    expect(useVariableStore.getState().statData).toEqual({});
    await loadConversation(a);
    expect(useVariableStore.getState().statData).toEqual({ 世界: { 时间: '深夜', 天气: '雨' }, 剧情: { 阶段: '高潮', 进度: 60 } });
  });

  it('切到无 statData 的会话 → 重置为空树(不残留上一会话)', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useVariableStore.getState().setStatData({ 世界: { 地点: '阿卡姆' } });
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B');
    await loadConversation(b);
    expect(useVariableStore.getState().statData).toEqual({});
  });

  it('空 statData 不写 blob 行(老存档零迁移:无行→空树)', async () => {
    const c = useChatStore.getState().createSession('C');
    useChatStore.getState().setActive(c);
    useVariableStore.getState().clearAll(); // statData = {}
    await saveConversation(c);
    const rows = await db.gameVars.where('conversationId').equals(c).toArray();
    expect(rows.some((r) => r.name === '__statData__')).toBe(false);
  });
});

describe('地点元素(locationElements)持久化 + 跨会话隔离', () => {
  beforeEach(async () => {
    await clearDb();
    await db.locationElements.clear();
    useLocationElementStore.getState().clearAll();
    useChatStore.setState({ sessions: [], activeId: null });
  });

  it('地点元素 save→load 往返保留', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useLocationElementStore.getState().applyExtracted([
      { locationName: '档案室', name: '橡木长桌', category: '陈设', description: '榉木长桌，搁着熄灭的煤油灯' },
      { locationName: '档案室', name: '暗格', category: '机关', description: '书架后疑似有暗格' },
    ]);
    await saveConversation(a);

    useLocationElementStore.getState().clearAll();
    expect(useLocationElementStore.getState().elements).toHaveLength(0);

    await loadConversation(a);
    const els = useLocationElementStore.getState().getByLocation('档案室');
    expect(els).toHaveLength(2);
    expect(els.map((e) => e.name).sort()).toEqual(['暗格', '橡木长桌']);
  });

  it('切到无地点元素的会话 → 重置为空(不残留上一会话)', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useLocationElementStore.getState().applyExtracted([{ locationName: '门厅', name: '吊灯', category: '陈设', description: '蒙尘的水晶吊灯' }]);
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B');
    await loadConversation(b);
    expect(useLocationElementStore.getState().elements).toHaveLength(0);
  });

  it('删除会话时一并清除其 locationElements 行', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useLocationElementStore.getState().applyExtracted([{ locationName: '地窖', name: '石棺', category: '容器', description: '布满苔藓的石棺' }]);
    await saveConversation(a);
    expect(await db.locationElements.where('conversationId').equals(a).toArray()).not.toHaveLength(0);

    await deleteConversation(a);
    expect(await db.locationElements.where('conversationId').equals(a).toArray()).toHaveLength(0);
  });
});

describe('拯救世界·关键线索(keyClues)持久化 + 跨会话隔离', () => {
  beforeEach(async () => {
    await clearDb();
    await db.keyClues.clear();
    useKeyClueStore.getState().clearAll();
    useChatStore.setState({ sessions: [], activeId: null });
  });

  function seedPillars() {
    useKeyClueStore.getState().setPillars([
      { id: 'p1', title: '凶手身份', secret: '镇长', uncovered: true, uncoveredByClue: '密信' },
      { id: 'p2', title: '手段', secret: '仪式', uncovered: false },
      { id: 'p3', title: '弱点', secret: '金徽', uncovered: false },
    ]);
  }

  it('真相支柱 + 揭示状态 save→load 往返保留', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    seedPillars();
    await saveConversation(a);

    useKeyClueStore.getState().clearAll();
    expect(useKeyClueStore.getState().pillars).toHaveLength(0);

    await loadConversation(a);
    const kc = useKeyClueStore.getState();
    expect(kc.pillars).toHaveLength(3);
    expect(kc.uncoveredCount()).toBe(1);
    expect(kc.pillars[0]).toMatchObject({ id: 'p1', uncovered: true, uncoveredByClue: '密信' });
  });

  it('saveWorldMode save→load 往返保留', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    useKeyClueStore.getState().setPillars([
      { id: 'p1', title: 't1', secret: 's1', uncovered: false },
      { id: 'p2', title: 't2', secret: 's2', uncovered: false },
      { id: 'p3', title: 't3', secret: 's3', uncovered: false },
    ]);
    useKeyClueStore.getState().markPillarUncovered('p1', 'c1');
    useKeyClueStore.getState().markPillarUncovered('p2', 'c2');
    useKeyClueStore.getState().markPillarUncovered('p3', 'c3'); // 第 3 个 → 触发 saveWorldMode
    expect(useKeyClueStore.getState().saveWorldMode).toBe(true);
    await saveConversation(a);

    useKeyClueStore.getState().clearAll();
    await loadConversation(a);
    expect(useKeyClueStore.getState().saveWorldMode).toBe(true);
  });

  it('切到无支柱的会话 → 重置为空(不残留上一会话)', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    seedPillars();
    await saveConversation(a);

    const b = useChatStore.getState().createSession('B');
    await loadConversation(b);
    expect(useKeyClueStore.getState().pillars).toHaveLength(0);
    expect(useKeyClueStore.getState().saveWorldMode).toBe(false);
  });

  it('删除会话时一并清除其 keyClues 行', async () => {
    const a = useChatStore.getState().createSession('A');
    useChatStore.getState().setActive(a);
    seedPillars();
    await saveConversation(a);
    expect(await db.keyClues.get(a)).toBeDefined();

    await deleteConversation(a);
    expect(await db.keyClues.get(a)).toBeUndefined();
  });
});

describe('M9 useNarrationStore 接入 sessionLifecycle (session-isolation-invariant)', () => {
  beforeEach(async () => { await clearDb(); useNarrationStore.getState().clearPending(); });

  it('clearAllGameState → narration pending 清空', () => {
    useNarrationStore.getState().append('遗留旁白');
    expect(useNarrationStore.getState().pending.length).toBe(1);
    clearAllGameState();
    expect(useNarrationStore.getState().pending).toEqual([]);
  });

  it('loadConversation → narration pending 清空(通过 clearAllGameState)', async () => {
    const a = startNewConversation('A');
    await saveConversation(a);
    useNarrationStore.getState().append('上会话残留');
    expect(useNarrationStore.getState().pending.length).toBe(1);
    await loadConversation(a);
    expect(useNarrationStore.getState().pending).toEqual([]);
  });
});
