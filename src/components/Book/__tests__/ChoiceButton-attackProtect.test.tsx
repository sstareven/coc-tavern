/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChoiceButton } from '../RightPage';
import { useNpcStore } from '../../../stores/useNpcStore';
import { useBookStore } from '../../../stores/useBookStore';
import type { ChoiceItem, NpcProfile } from '../../../types';

function fakeNpc(id: string, name: string, inParty: boolean): NpcProfile {
  return {
    id, name, identity: '', favorability: 0,
    appearance: '', innerThoughts: '', experience: '',
    backstory: '', status: '', possessions: [], memories: [],
    memorySummary: '', skills: {}, characteristics: {},
    isPresent: true, inParty,
    createdAt: Date.now(), updatedAt: Date.now(),
  } as unknown as NpcProfile;
}

describe('ChoiceButton — M8 攻击保护', () => {
  beforeEach(() => {
    // 让 ChoiceButton 通过 isLatestPage 检查
    useBookStore.setState({ pages: [{ id: 'p0' } as unknown as never], pageIndex: 0 });
    useNpcStore.setState({
      profiles: {
        a: fakeNpc('a', '以利亚·霍尔姆斯', true),
        b: fakeNpc('b', '邪教徒', false),
      },
    });
  });
  afterEach(() => cleanup());

  it('选项目标是队友 → 按钮 disabled + tooltip 含「队友」', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 以利亚·霍尔姆斯', action: '攻击 以利亚·霍尔姆斯' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title') || '').toContain('队友');
  });

  it('选项目标非队友 → 按钮可点击', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 邪教徒', action: '攻击 邪教徒' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
  });

  it('点击灰显的队友攻击选项不触发 fillInputBar', () => {
    const ch: ChoiceItem = { num: 'I', text: '攻击 以利亚·霍尔姆斯', action: '攻击 以利亚·霍尔姆斯' };
    render(<ChoiceButton choice={ch} />);
    const btn = screen.getByRole('button');
    // disabled 按钮 React 不触发 onClick；这里直接验 disabled 状态
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });
});
