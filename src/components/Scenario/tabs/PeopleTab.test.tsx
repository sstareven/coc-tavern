/** @vitest-environment jsdom */
// PeopleTab — M6 Task 2 测试
// 覆盖:列表首位 @创建调查员 占位 + player_created 行右上角删除按钮
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PeopleTab } from './PeopleTab';
import type { ScenarioDoc, ScenarioCharacter } from '../../../types/scenario';
import { defaultSheet } from '../../../stores/useCharSheetStore';
import { useScenarioStore } from '../../../stores/useScenarioStore';

function makeChar(id: string, name: string, role: ScenarioCharacter['role']): ScenarioCharacter {
  const sheet = JSON.parse(JSON.stringify(defaultSheet));
  sheet.identity.name = name;
  return {
    id, role, sheet,
    npcAttrs: { identityTag: id, attitudeDefault: 0, relationshipDefault: '', locationDefault: '', publicBio: '', hiddenBio: '' },
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'scn-test', builtin: false,
    meta: { name: '测试', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: chars,
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 1, updatedAt: 1,
  };
}

describe('PeopleTab 列表 — 玩家位占位 + 自创卡删除按钮', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });
  afterEach(() => cleanup());

  it('列表里渲染 "@创建调查员" 玩家位占位（disabled + tooltip）', () => {
    const doc = makeDoc([makeChar('c1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    const placeholder = screen.getByText('@创建调查员');
    expect(placeholder).toBeDefined();
    const btn = placeholder.closest('button');
    expect(btn).not.toBeNull();
    expect(btn!.hasAttribute('disabled')).toBe(true);
    expect(btn!.getAttribute('title')).toContain('CharCreator');
  });

  it('player_created 角色行右上角渲染删除按钮，点击调用 applyPatch removeCharacterIds', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '约翰·肯特', 'player_created'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    const onChange = vi.fn();
    render(<PeopleTab scn={doc} onChange={onChange} />);

    const playerCard = screen.getByText('约翰·肯特').closest('button')!;
    const delBtn = within(playerCard.parentElement as HTMLElement).getByRole('button', { name: '删除自创卡' });
    expect(delBtn).toBeDefined();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const applyPatchSpy = vi.spyOn(useScenarioStore.getState(), 'applyPatch');
    fireEvent.click(delBtn);
    expect(applyPatchSpy).toHaveBeenCalledWith('scn-test', { removeCharacterIds: ['c2'] });
    confirmSpy.mockRestore();
  });

  it('protagonist / optional / locked_npc 行不渲染删除按钮', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '哈丽特', 'optional'),
      makeChar('c3', '布兰登', 'locked_npc'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);
    expect(screen.queryAllByRole('button', { name: '删除自创卡' })).toHaveLength(0);
  });
});
