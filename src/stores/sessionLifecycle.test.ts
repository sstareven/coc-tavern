import { describe, it, expect } from 'vitest';
import { useChatStore } from './useChatStore';
import { useBookStore } from './useBookStore';
import { persistActivePages } from './sessionLifecycle';
import type { BookPage } from '../types';

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
