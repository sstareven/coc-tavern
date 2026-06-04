import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiceStore } from '../useDiceStore';
import type { DiceResultType } from '../../types';

describe('useDiceStore.openCheck (A1.7)', () => {
  beforeEach(() => {
    useDiceStore.setState({
      isOpen: false, history: [], pending: [],
      tens: 0, ones: 0, finalTens: 0, bonusTens: 0, oppTens: 0, oppOnes: 0,
      originalRoll: 0, finalRoll: 0, resultType: null,
      target: 65, bonusDice: 0, sanCheck: false, mode: 'check',
      isProgrammatic: false, programmaticSkill: undefined,
      programmaticContext: undefined, onProgrammaticResolve: undefined,
    } as any);
  });

  it('opens panel in programmatic mode with target/skill', () => {
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '聆听', target: 60, onResolve: resolve });
    const s = useDiceStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.target).toBe(60);
    expect(s.isProgrammatic).toBe(true);
    expect(s.programmaticSkill).toBe('聆听');
  });

  it('rolling fires onResolve(level, roll) and closes panel', () => {
    // Seeded RNG: force d100 = 23 (tens=2, ones=3) -> target 50 -> hard-success (50/2=25, 23<=25)
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.2)   // tens=2
       .mockReturnValueOnce(0.3);  // ones=3
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '潜行', target: 50, onResolve: resolve });
    useDiceStore.getState().roll();
    expect(resolve).toHaveBeenCalledTimes(1);
    const [level, roll] = resolve.mock.calls[0];
    expect(roll).toBe(23);
    expect(level as DiceResultType).toBe('hard-success');
    expect(useDiceStore.getState().isOpen).toBe(false);
    expect(useDiceStore.getState().isProgrammatic).toBe(false);
    rng.mockRestore();
  });

  it('addRecord receives context override (e.g. combat) on programmatic check', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({
      skill: '近战', target: 70, context: 'combat', onResolve: resolve,
    });
    useDiceStore.getState().roll();
    const hist = useDiceStore.getState().history;
    expect(hist.length).toBe(1);
    expect(hist[0].skill).toBe('近战');
    expect(hist[0].context).toBe('combat');
    expect(hist[0].target).toBe('70');
    rng.mockRestore();
  });

  it('bonus dice flag carries into programmatic roll', () => {
    const rng = vi.spyOn(Math, 'random');
    rng.mockReturnValueOnce(0.7) // tens=7
       .mockReturnValueOnce(0.2) // ones=2
       .mockReturnValueOnce(0.1); // bonus tens=1 -> min(7,1)=1, d100=12
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '侦察', target: 50, bonus: true, onResolve: resolve });
    useDiceStore.getState().roll();
    const [, roll] = resolve.mock.calls[0];
    expect(roll).toBe(12);
    rng.mockRestore();
  });

  it('panel close without rolling does NOT fire onResolve', () => {
    const resolve = vi.fn();
    useDiceStore.getState().openCheck({ skill: '历史', target: 40, onResolve: resolve });
    useDiceStore.getState().close();
    expect(resolve).not.toHaveBeenCalled();
    expect(useDiceStore.getState().isProgrammatic).toBe(false);
  });
});
