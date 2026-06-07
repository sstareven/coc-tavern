/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RelationEditor } from './RelationEditor';
import type { ScenarioDoc, ScenarioCharacter, ScenarioRelation } from '../../types/scenario';

function makeChar(id: string, name: string, role: ScenarioCharacter['role'] = 'optional'): ScenarioCharacter {
  return {
    id,
    role,
    sheet: {
      characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
      halfFifth: {} as never,
      secondary: { hp: { current: 10, max: 10 }, san: { current: 50, max: 50 }, mp: { current: 10, max: 10 }, luck: 50, mov: 8, db: '0', build: 0 },
      skills: {},
      identity: { name, occupation: '侦探', age: 30, gender: '男', birthplace: '', residence: '', id },
      greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
      posture: '站立', statusConditions: [], dailySanLoss: 0,
      temporaryInsanity: { active: false, roundsLeft: 0 },
      indefiniteInsanity: { active: false, daysLeft: 0 },
      permanentInsanity: false, phobias: [], manias: [], known_spells: [], recovery: {},
    },
    npcAttrs: {
      identityTag: '', attitudeDefault: 0, relationshipDefault: '',
      locationDefault: '', publicBio: '', hiddenBio: '',
    },
  };
}

function makeDoc(chars: ScenarioCharacter[]): ScenarioDoc {
  return {
    id: 'sc1', meta: { name: 't', type: '调查', durationHint: '1-2h', difficulty: 1, headcountHint: '', sanLossHint: '低', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: chars,
    customOccupations: [], customSkills: [], skillBlacklist: [],
    entries: [], darkTimeline: [], badEndings: [], authorNotes: '',
    schemaVersion: 1, createdAt: 0, updatedAt: 0,
  };
}

describe('RelationEditor', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('排除 currentCharId 本人，列出其他 character', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const b = makeChar('b', '哈丽特');
    const doc = makeDoc([me, a, b]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    expect(screen.queryByText('我')).toBeNull();
    expect(screen.getByText('以利亚')).toBeTruthy();
    expect(screen.getByText('哈丽特')).toBeTruthy();
  });

  it('选行后侧栏显示该 NPC 的关系下拉与备注框', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const doc = makeDoc([me, a]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('以利亚'));
    expect(screen.getByLabelText('关系类型')).toBeTruthy();
    expect(screen.getByLabelText('备注')).toBeTruthy();
    expect(screen.getByLabelText('开场和他一起在场')).toBeTruthy();
  });

  it('修改关系类型触发 onChange 并合并 relations', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '以利亚');
    const doc = makeDoc([me, a]);
    const onChange = vi.fn();
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('以利亚'));
    fireEvent.change(screen.getByLabelText('关系类型'), { target: { value: 'friend' } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const [nextRelations] = lastCall as [ScenarioRelation[], string[]];
    expect(nextRelations.find(r => r.targetId === 'a')?.type).toBe('friend');
  });

  it('勾选 presentAtStart + 关系为 enemy → 显示红色警告', () => {
    const me = makeChar('me', '我');
    const a = makeChar('a', '哈丽特');
    const doc = makeDoc([me, a]);
    render(
      <RelationEditor
        scenarioDoc={doc}
        currentCharId="me"
        relations={[{ targetId: 'a', type: 'enemy' }]}
        presentAtStart={['a']}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('哈丽特'));
    expect(screen.getByText('与敌对者不能开场同场')).toBeTruthy();
  });

  it('locked_npc 行 presentAtStart 复选框 disabled', () => {
    const me = makeChar('me', '我');
    const locked = makeChar('lk', '布兰登神父', 'locked_npc');
    const doc = makeDoc([me, locked]);
    render(<RelationEditor scenarioDoc={doc} currentCharId="me" relations={[]} presentAtStart={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('布兰登神父'));
    const checkbox = screen.getByLabelText('开场和他一起在场') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
