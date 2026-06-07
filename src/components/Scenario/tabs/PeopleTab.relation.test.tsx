/** @vitest-environment jsdom */
// PeopleTab — M6 Task 3 测试
// 覆盖: 右栏【人际关系】折叠段渲染 + 内嵌 RelationEditor 接通 currentCharId
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

describe('PeopleTab 右栏 — 人际关系折叠段', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });
  afterEach(() => cleanup());

  it('选中角色后右栏有【人际关系】折叠段标题，默认折叠（RelationEditor 不渲染）', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '哈丽特', 'optional'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    render(<PeopleTab scn={doc} onChange={() => {}} />);

    // 先选中 c1
    fireEvent.click(screen.getByText('以利亚'));
    // 标题渲染
    expect(screen.getByText('人际关系')).toBeTruthy();
    // 默认折叠 — RelationEditor 不渲染
    expect(screen.queryByTestId('relation-editor')).toBeNull();
  });

  it('展开后渲染 RelationEditor，data-current-char-id 等于当前选中角色 id', () => {
    const doc = makeDoc([
      makeChar('c1', '以利亚', 'protagonist'),
      makeChar('c2', '哈丽特', 'optional'),
    ]);
    useScenarioStore.setState({ userScenarios: [doc] });
    const onChange = vi.fn();
    render(<PeopleTab scn={doc} onChange={onChange} />);

    fireEvent.click(screen.getByText('以利亚'));
    // 点击折叠头展开
    fireEvent.click(screen.getByText('人际关系'));

    const editor = screen.getByTestId('relation-editor');
    expect(editor).toBeTruthy();
    expect(editor.getAttribute('data-current-char-id')).toBe('c1');
  });
});
