import { describe, it, expect, beforeEach } from 'vitest';
import { isHiddenRollSkill, stashHiddenRoll, revealHiddenRolls, _clearHiddenRoll } from './hidden-roll';

describe('hidden-roll', () => {
  beforeEach(_clearHiddenRoll);

  it('心理学是暗骰技能', () => {
    expect(isHiddenRollSkill('心理学')).toBe(true);
    expect(isHiddenRollSkill('心理学(困难)')).toBe(true);
    expect(isHiddenRollSkill('侦查')).toBe(false);
  });

  it('提交时把掩码换回真实结果', () => {
    stashHiddenRoll('[心理学 暗骰]', '[心理学 d100=42/60 成功]');
    const masked = '[心理学 暗骰]\n试图看穿教授的神情';
    expect(revealHiddenRolls(masked)).toBe('[心理学 d100=42/60 成功]\n试图看穿教授的神情');
  });

  it('换回后清空，二次调用不再替换', () => {
    stashHiddenRoll('[心理学 暗骰]', '[心理学 d100=42/60 成功]');
    revealHiddenRolls('[心理学 暗骰]\nX');
    expect(revealHiddenRolls('[心理学 暗骰]\nY')).toBe('[心理学 暗骰]\nY');
  });

  it('无暂存时原样返回', () => {
    expect(revealHiddenRolls('普通输入')).toBe('普通输入');
  });
});
