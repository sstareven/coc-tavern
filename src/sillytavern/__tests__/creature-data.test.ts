import { describe, it, expect } from 'vitest';
import { matchCreature, CREATURE_TEMPLATES } from '../creature-data';

describe('CREATURE_TEMPLATES', () => {
  it('has 20 creatures', () => {
    expect(CREATURE_TEMPLATES.length).toBe(20);
  });

  it('every template has required fields', () => {
    for (const t of CREATURE_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.aliases.length).toBeGreaterThan(0);
      expect(t.hp).toBeGreaterThan(0);
      expect(t.attacks.length).toBeGreaterThan(0);
      expect(t.sanLoss.success).toBeTruthy();
      expect(t.sanLoss.fail).toBeTruthy();
    }
  });
});

describe('matchCreature', () => {
  it('matches "深潜者" exactly', () => {
    const c = matchCreature('深潜者');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('深潜者');
    expect(c!.hp).toBe(14);
  });

  it('matches English alias "Deep One"', () => {
    expect(matchCreature('Deep One')).not.toBeNull();
  });

  it('matches case-insensitive', () => {
    expect(matchCreature('deep one')).not.toBeNull();
  });

  it('matches partial name in longer string', () => {
    expect(matchCreature('一只食尸鬼')).not.toBeNull();
  });

  it('returns null for unknown creature', () => {
    expect(matchCreature('普通人')).toBeNull();
  });

  it('matches 修格斯 with correct stats', () => {
    const c = matchCreature('修格斯');
    expect(c).not.toBeNull();
    expect(c!.hp).toBe(65);
    expect(c!.armor).toBe(8);
    expect(c!.str).toBe(350);
  });

  it('matches English alias case-insensitive: "shoggoth"', () => {
    const c = matchCreature('shoggoth');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('修格斯');
  });

  it('matches creature in a sentence', () => {
    const c = matchCreature('远处飘来一只拜亚基');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('拜亚基');
  });

  it('matches Chinese alias "邪教徒" for 狂信徒', () => {
    const c = matchCreature('邪教徒');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('狂信徒');
  });

  it('returns null for empty string', () => {
    expect(matchCreature('')).toBeNull();
  });
});
