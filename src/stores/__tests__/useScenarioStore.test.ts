// useScenarioStore: upsert/remove/fork/getById/applyPatch + 内置 fork 路径
import { describe, it, expect, beforeEach } from 'vitest';
import { useScenarioStore } from '../useScenarioStore';
import type { ScenarioDoc } from '../../types/scenario';

function makeUserDoc(id: string, name: string): ScenarioDoc {
  return {
    id, builtin: false,
    meta: { name, type: '调查', durationHint: '3-5h', difficulty: 2, headcountHint: '1人', sanLossHint: '中', blurb: '' },
    prologueSeed: '', recommendedSkills: [], recommendedOccupations: [],
    characters: [], entries: [], darkTimeline: [], badEndings: [],
    authorNotes: '', schemaVersion: 1, createdAt: 1, updatedAt: 1,
  };
}

describe('useScenarioStore', () => {
  beforeEach(() => {
    // builtins 保留(由 onRehydrate 灌入 / 初始常量);只清用户态
    useScenarioStore.setState({ userScenarios: [], activeId: null, lastPicked: null });
  });

  it('builtins 至少包含「自由探索」__free', () => {
    const free = useScenarioStore.getState().getById('__free');
    expect(free).toBeDefined();
    expect(free?.builtin).toBe(true);
  });

  it('upsert 新 doc → 加到 userScenarios,返回原 id', () => {
    const id = useScenarioStore.getState().upsert(makeUserDoc('u1', '我的剧本'));
    expect(id).toBe('u1');
    expect(useScenarioStore.getState().userScenarios.map(d => d.id)).toEqual(['u1']);
  });

  it('upsert 已存在用户 doc → 原地替换,createdAt 保留', () => {
    const s = useScenarioStore.getState();
    s.upsert(makeUserDoc('u1', '旧名'));
    const origCreatedAt = s.getById('u1')!.createdAt;
    s.upsert({ ...makeUserDoc('u1', '新名'), createdAt: 999 });
    const after = useScenarioStore.getState().getById('u1')!;
    expect(after.meta.name).toBe('新名');
    expect(after.createdAt).toBe(origCreatedAt);
  });

  it('upsert 内置 id → fork 出新 id 的用户副本', () => {
    const newId = useScenarioStore.getState().upsert({ ...makeUserDoc('__free', 'X'), id: '__free' });
    expect(newId).not.toBe('__free');
    const forked = useScenarioStore.getState().getById(newId);
    expect(forked?.builtin).toBe(false);
    // A4: upsert 内置 fork 命名为「(修改 YYYYMMDD)」(供多版本区分)
    expect(forked?.meta.name).toMatch(/修改/);
  });

  it('remove 用户 doc → 移除', () => {
    const s = useScenarioStore.getState();
    s.upsert(makeUserDoc('u1', 'X'));
    s.remove('u1');
    expect(useScenarioStore.getState().getById('u1')).toBeUndefined();
  });

  it('remove 内置 doc → 不动', () => {
    useScenarioStore.getState().remove('__free');
    expect(useScenarioStore.getState().getById('__free')).toBeDefined();
  });

  it('remove 时若 activeId / lastPicked 命中 → 清空', () => {
    useScenarioStore.getState().upsert(makeUserDoc('u1', 'X'));
    useScenarioStore.setState({ activeId: 'u1', lastPicked: 'u1' });
    useScenarioStore.getState().remove('u1');
    const s = useScenarioStore.getState();
    expect(s.activeId).toBeNull();
    expect(s.lastPicked).toBeNull();
  });

  it('fork 用户 doc → 新 id + 「(修改 YYYYMMDD)」后缀', () => {
    useScenarioStore.getState().upsert(makeUserDoc('u1', '某'));
    const newId = useScenarioStore.getState().fork('u1');
    expect(newId).not.toBeNull();
    expect(newId).not.toBe('u1');
    expect(useScenarioStore.getState().getById(newId!)?.meta.name).toMatch(/修改/);
  });

  it('fork 不存在 id → null', () => {
    expect(useScenarioStore.getState().fork('nope')).toBeNull();
  });

  it('applyPatch 用户 doc → 原地更新', () => {
    const s = useScenarioStore.getState();
    s.upsert(makeUserDoc('u1', '初'));
    s.applyPatch('u1', { patchMeta: { name: '改后' } });
    expect(useScenarioStore.getState().getById('u1')?.meta.name).toBe('改后');
  });

  it('applyPatch 内置 id → fork + 应用 patch(原内置不动)', () => {
    const before = useScenarioStore.getState().userScenarios.length;
    useScenarioStore.getState().applyPatch('__free', { patchMeta: { name: '改后的自由' } });
    const after = useScenarioStore.getState();
    expect(after.userScenarios.length).toBe(before + 1);
    expect(after.getById('__free')?.meta.name).toBe('自由探索'); // 内置未动
    const forked = after.userScenarios[after.userScenarios.length - 1];
    expect(forked.meta.name).toBe('改后的自由');
  });

  it('applyPatch 不存在 id → no-op', () => {
    const before = useScenarioStore.getState().userScenarios.length;
    useScenarioStore.getState().applyPatch('nope', { patchMeta: { name: 'x' } });
    expect(useScenarioStore.getState().userScenarios.length).toBe(before);
  });

  it('setActive / setLastPicked', () => {
    useScenarioStore.getState().upsert(makeUserDoc('u1', 'X'));
    useScenarioStore.getState().setActive('u1');
    useScenarioStore.getState().setLastPicked('u1');
    expect(useScenarioStore.getState().activeId).toBe('u1');
    expect(useScenarioStore.getState().lastPicked).toBe('u1');
  });
});
