/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RosterPicker } from './RosterPicker';
import { useScenarioStore } from '../../stores/useScenarioStore';
import type { ScenarioDoc, ScenarioCharacter } from '../../types/scenario';
import { defaultSheet } from '../../stores/useCharSheetStore';

function makeChar(id: string, name: string, role: ScenarioCharacter['role'], createdAt?: number): ScenarioCharacter {
  return {
    id,
    role,
    sheet: { ...JSON.parse(JSON.stringify(defaultSheet)), identity: { ...defaultSheet.identity, name, id } },
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
    createdAt,
  };
}

function makeScenario(chars: ScenarioCharacter[]): ScenarioDoc {
  const now = Date.now();
  return {
    id: 'test-scn-roster-1',
    builtin: false,
    meta: { name: '测试剧本', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1人', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: chars,
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('RosterPicker', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });
  afterEach(() => {
    cleanup();
  });

  it('分组渲染：作者预设 + 你创建的（不显示 locked_npc）', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('o1', '哈丽特', 'optional'),
      makeChar('l1', '布兰登', 'locked_npc'),
      makeChar('u1', '约翰·肯特', 'player_created', 1000),
      makeChar('u2', '萨拉·林', 'player_created', 2000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    expect(screen.getByText('以利亚')).toBeInTheDocument();
    expect(screen.getByText('哈丽特')).toBeInTheDocument();
    expect(screen.queryByText('布兰登')).toBeNull();
    expect(screen.getByText('约翰·肯特')).toBeInTheDocument();
    expect(screen.getByText('萨拉·林')).toBeInTheDocument();
    expect(screen.getByText('作者预设')).toBeInTheDocument();
    expect(screen.getByText('你创建的')).toBeInTheDocument();
  });

  it('player_created 按 createdAt 倒序排列', () => {
    const scn = makeScenario([
      makeChar('u1', '老卡', 'player_created', 1000),
      makeChar('u2', '新卡', 'player_created', 5000),
      makeChar('u3', '中卡', 'player_created', 3000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    const names = screen.getAllByTestId('roster-row-name').map((el) => el.textContent);
    const userNames = names.filter((n) => n === '新卡' || n === '老卡' || n === '中卡');
    expect(userNames).toEqual(['新卡', '中卡', '老卡']);
  });

  it('点选 protagonist 行触发 onPickChar(charIdx, mode=preset)', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onPick = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={onPick}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByText('选这个角色 →')[0]);
    expect(onPick).toHaveBeenCalledWith(0, 'preset');
  });

  it('点选 player_created 行触发 onPickChar(charIdx, mode=newChar)', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onPick = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={onPick}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    const buttons = screen.getAllByText('选这个角色 →');
    // 第二个按钮 = 自创卡(u1)，对应原 characters[] index 1
    fireEvent.click(buttons[1]);
    expect(onPick).toHaveBeenCalledWith(1, 'newChar');
  });

  it('返回按钮触发 onBack', () => {
    const scn = makeScenario([makeChar('p1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onBack = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={onBack}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('返回选剧本'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('新建调查员按钮触发 onAddNewCharacter', () => {
    const scn = makeScenario([makeChar('p1', '以利亚', 'protagonist')]);
    useScenarioStore.setState({ userScenarios: [scn] });
    const onAdd = vi.fn();
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={onAdd}
      />,
    );
    fireEvent.click(screen.getByText('新建调查员'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('player_created 行带编辑+删除按钮，预设行不带', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('roster-row-edit')).toHaveLength(1);
    expect(screen.getAllByTestId('roster-row-delete')).toHaveLength(1);
  });

  it('点删除按钮调用 applyPatch 移除该自创卡', () => {
    const scn = makeScenario([
      makeChar('p1', '以利亚', 'protagonist'),
      makeChar('u1', '约翰', 'player_created', 1000),
    ]);
    useScenarioStore.setState({ userScenarios: [scn] });
    // 删除会走 window.confirm,需 stub 返回 true 避免被 prompt 拦截
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <RosterPicker
        scenarioId={scn.id}
        onPickChar={vi.fn()}
        onBack={vi.fn()}
        onAddNewCharacter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('roster-row-delete'));
    const next = useScenarioStore.getState().getById(scn.id);
    expect(next?.characters.find((c) => c.id === 'u1')).toBeUndefined();
    expect(next?.characters.find((c) => c.id === 'p1')).toBeDefined();
  });
});
