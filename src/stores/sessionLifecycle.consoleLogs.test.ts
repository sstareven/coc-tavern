import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { deleteConversation } from './sessionLifecycle';
import { useChatStore } from './useChatStore';

describe('deleteConversation 删除该会话的 consoleLogs', () => {
  beforeEach(async () => {
    await db.consoleLogs.clear();
    await db.conversations.clear();
  });

  it('删会话同步删它的日志,不影响其他会话', async () => {
    await db.conversations.put({
      id: 'sA', name: 'A', presetId: null, lorebookIds: [],
      messages: [], pageCount: 0, createdAt: 0, updatedAt: 0,
    });
    await db.conversations.put({
      id: 'sB', name: 'B', presetId: null, lorebookIds: [],
      messages: [], pageCount: 0, createdAt: 0, updatedAt: 0,
    });
    await db.consoleLogs.bulkAdd([
      { sessionId: 'sA', pageIndex: 1, ts: 1, level: 'log', message: 'a' },
      { sessionId: 'sA', pageIndex: 2, ts: 2, level: 'log', message: 'a2' },
      { sessionId: 'sB', pageIndex: 1, ts: 3, level: 'log', message: 'b' },
    ]);

    // 让 useChatStore 知道有这两个会话(activeId=sB,避免 deleteConversation 误判 orphan)
    useChatStore.setState({
      sessions: [
        { id: 'sA', name: 'A', messages: [], pages: [], pageCount: 0, presetId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 } as unknown as ReturnType<typeof useChatStore.getState>['sessions'][number],
        { id: 'sB', name: 'B', messages: [], pages: [], pageCount: 0, presetId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 } as unknown as ReturnType<typeof useChatStore.getState>['sessions'][number],
      ],
      activeId: 'sB',
    });

    await deleteConversation('sA');

    expect(await db.consoleLogs.where('sessionId').equals('sA').count()).toBe(0);
    expect(await db.consoleLogs.where('sessionId').equals('sB').count()).toBe(1);
  });
});
