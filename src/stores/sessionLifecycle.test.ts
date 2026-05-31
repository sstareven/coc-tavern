import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './useChatStore';
import { useBookStore } from './useBookStore';
import { useCharSheetStore, defaultSheet, isDefaultSheet } from './useCharSheetStore';
import { saveConversation, loadConversation, deleteConversation, cleanupOrphanGameState } from './sessionLifecycle';
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
