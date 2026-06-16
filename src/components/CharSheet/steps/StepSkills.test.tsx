/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StepSkills } from './StepSkills';
import { useScenarioStore } from '../../../stores/useScenarioStore';
import type { ScenarioDoc } from '../../../types/scenario';

function makeScenario(): ScenarioDoc {
  return {
    id: 'free',
    builtin: true,
    meta: { name: '自由探索', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '1人', sanLossHint: '低', blurb: '' },
    prologueSeed: '',
    recommendedSkills: [],
    recommendedOccupations: [],
    characters: [],
    customOccupations: [],
    customSkills: [],
    skillBlacklist: [],
    entries: [],
    darkTimeline: [],
    badEndings: [],
    authorNotes: '',
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('StepSkills 职业选择', () => {
  beforeEach(() => {
    useScenarioStore.setState({ builtins: [], userScenarios: [], activeId: null, lastPicked: null, forkMap: {} });
  });
  afterEach(() => cleanup());

  it('选择职业不抛出 insertBefore 类 DOM 错误', async () => {
    const scn = makeScenario();
    useScenarioStore.setState({ builtins: [scn], lastPicked: scn.id });

    const onSetOccupation = vi.fn();
    const props = {
      occupation: '',
      onSetOccupation,
      occSkills: [],
      interestSkills: [],
      occPoints: {},
      interestPoints: {},
      creditRating: 0,
      onSetCreditRating: vi.fn(),
      filterCat: null as null,
      onSetFilterCat: vi.fn(),
      editingSkill: null as null,
      editingType: null as null,
      charValues: { STR: 50, CON: 50, SIZ: 50, DEX: 50, APP: 50, INT: 50, POW: 50, EDU: 50 } as Record<'STR' | 'CON' | 'SIZ' | 'DEX' | 'APP' | 'INT' | 'POW' | 'EDU', number>,
      occRemaining: 200,
      intRemaining: 100,
      occPointPool: 200,
      intPointPool: 100,
      onToggleOccSkill: vi.fn(),
      onToggleInterestSkill: vi.fn(),
      onReEnterEdit: vi.fn(),
      onAdjOccPoint: vi.fn(),
      onAdjIntPoint: vi.fn(),
      onClearOccSkill: vi.fn(),
      onClearIntSkill: vi.fn(),
      onSaveAndExit: vi.fn(),
    };

    const { container } = render(<StepSkills {...props} />);
    expect(container).toBeTruthy();

    // 打开 DarkSelect 下拉
    const trigger = screen.getByText('选择…');
    fireEvent.click(trigger);

    // 选择第一个职业（DarkSelect portal 到 body，用 class 限定）
    const menu = document.querySelector('.darkselect-menu');
    expect(menu).toBeTruthy();
    const firstOption = menu!.querySelector('div > div');
    expect(firstOption).toBeTruthy();
    fireEvent.click(firstOption!);

    // DarkSelect 现在把 onChange 延迟到下一微任务,等待它执行
    await waitFor(() => expect(onSetOccupation).toHaveBeenCalledWith('会计'));
  });
});
