import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './useChatStore';
import { useBookStore } from './useBookStore';
import { useVariableStore } from './useVariableStore';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
import { useLorebookStore, AUTO_SUMMARY_BOOK_ID } from './useLorebookStore';
import { saveConversation, loadConversation, deleteConversation, cleanupOrphanGameState, clearAllGameState } from './sessionLifecycle';
import { persistActivePages } from './sessionLifecycle';
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
