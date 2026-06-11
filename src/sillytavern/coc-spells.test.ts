import { describe, it, expect } from 'vitest';
import { findSpell, buildSpellCostSummary, COC_SPELLS } from './coc-spells';

// ============================================================
// findSpell — exact name lookup
// ============================================================
describe('findSpell', () => {
  it('returns the spell object for an exact name match', () => {
    const spell = findSpell('远古之眼');
    expect(spell).toBeDefined();
    expect(spell!.mpCost).toBe(3);
    expect(spell!.sanCost).toBe(2);
    expect(spell!.castingTime).toBe('1轮');
  });

  it('returns undefined for an unknown spell', () => {
    expect(findSpell('不存在的法术')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(findSpell('')).toBeUndefined();
  });

  it('finds every spell in COC_SPELLS by name', () => {
    for (const spell of COC_SPELLS) {
      expect(findSpell(spell.name)).toBe(spell);
    }
  });

  it('COC_SPELLS contains exactly 12 spells', () => {
    expect(COC_SPELLS).toHaveLength(12);
  });
});

// ============================================================
// buildSpellCostSummary — format known spells for LLM context
// ============================================================
describe('buildSpellCostSummary', () => {
  it('returns empty string for empty knownSpells array', () => {
    expect(buildSpellCostSummary([])).toBe('');
  });

  it('returns empty string when no names match any spell', () => {
    expect(buildSpellCostSummary(['虚构法术A', '虚构法术B'])).toBe('');
  });

  it('formats a single known spell correctly', () => {
    const result = buildSpellCostSummary(['暗影遮蔽']);
    expect(result).toContain('【已知法术消耗表】');
    expect(result).toContain('暗影遮蔽');
    expect(result).toContain('MP2');
    expect(result).toContain('SAN1');
    expect(result).toContain('1轮');
  });

  it('formats multiple known spells, one per line', () => {
    const result = buildSpellCostSummary(['远古之眼', '尤格索特斯之钥', '死者之语']);
    const lines = result.split('\n');
    expect(lines[0]).toBe('【已知法术消耗表】');
    expect(lines).toHaveLength(4); // header + 3 spells
    expect(lines[1]).toContain('远古之眼');
    expect(lines[1]).toContain('MP3');
    expect(lines[2]).toContain('尤格索特斯之钥');
    expect(lines[2]).toContain('MP12');
    expect(lines[2]).toContain('SAN10');
    expect(lines[3]).toContain('死者之语');
  });

  it('skips unknown names but still formats matched ones', () => {
    const result = buildSpellCostSummary(['远古之眼', '不存在的法术', '精神屏障']);
    expect(result).toContain('远古之眼');
    expect(result).toContain('精神屏障');
    expect(result).not.toContain('不存在的法术');
    const lines = result.split('\n');
    expect(lines).toHaveLength(3); // header + 2 matched
  });
});
