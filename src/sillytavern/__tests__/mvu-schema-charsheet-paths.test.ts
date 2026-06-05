import { describe, it, expect } from 'vitest';
import { COC_MVU_SCHEMA, matchRule, validateValue } from '../mvu-schema';
import { defaultSheet } from '../../stores/useCharSheetStore';

/**
 * A2.1 — 调查员.* 理智/疯狂受控路径 schema 校验单测。
 *
 * 这些路径在 applyCharsheetRedirect 处被 REDIRECT 改道（永不落 statData），
 * 但 LLM 写入值仍走 schema 的「写前校验」环节，故必须在 schema 内有规则可命中。
 * 注意：恐惧症 / 狂躁症 是 string[]，由 redirect 内部 add/insert/remove 语义守门，
 * 不在此声明 → matchRule 返回 undefined → 调用方放行。
 */

describe('COC_MVU_SCHEMA — 调查员.临时疯狂.* 受控路径', () => {
  it('临时疯狂.active 命中 boolean 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.active');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('boolean');
    expect(validateValue(rule!, true)).toEqual({ ok: true });
    expect(validateValue(rule!, false)).toEqual({ ok: true });
    expect(validateValue(rule!, 'true')).toEqual({ ok: true });
    expect(validateValue(rule!, 1).ok).toBe(false);
  });

  it('临时疯狂.roundsLeft 命中 number(min=0) 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.roundsLeft');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('number');
    expect(validateValue(rule!, 0)).toEqual({ ok: true });
    expect(validateValue(rule!, 5)).toEqual({ ok: true });
    expect(validateValue(rule!, '3')).toEqual({ ok: true }); // 数字字符串 coerce
    expect(validateValue(rule!, -1).ok).toBe(false); // 越界
  });

  it('临时疯狂.bout.mode 命中 enum(summary|realtime) 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.bout.mode');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('enum');
    expect(validateValue(rule!, 'summary')).toEqual({ ok: true });
    expect(validateValue(rule!, 'realtime')).toEqual({ ok: true });
    expect(validateValue(rule!, 'unknown').ok).toBe(false);
  });

  it('临时疯狂.bout.table 命中 enum(VII|VIII) 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.bout.table');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('enum');
    expect(validateValue(rule!, 'VII')).toEqual({ ok: true });
    expect(validateValue(rule!, 'VIII')).toEqual({ ok: true });
    expect(validateValue(rule!, 'IX').ok).toBe(false);
  });

  it('临时疯狂.bout.entry 命中 number(min=1,max=10) 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.临时疯狂.bout.entry');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('number');
    expect(validateValue(rule!, 1)).toEqual({ ok: true });
    expect(validateValue(rule!, 10)).toEqual({ ok: true });
    expect(validateValue(rule!, 5)).toEqual({ ok: true });
    expect(validateValue(rule!, 0).ok).toBe(false); // 下界外
    expect(validateValue(rule!, 11).ok).toBe(false); // 上界外
  });

  it('不定性疯狂.active/daysLeft 命中 boolean/number 规则', () => {
    const ruleActive = matchRule(COC_MVU_SCHEMA, '调查员.不定性疯狂.active');
    expect(ruleActive?.kind).toBe('boolean');
    expect(validateValue(ruleActive!, true)).toEqual({ ok: true });

    const ruleDays = matchRule(COC_MVU_SCHEMA, '调查员.不定性疯狂.daysLeft');
    expect(ruleDays?.kind).toBe('number');
    expect(validateValue(ruleDays!, 30)).toEqual({ ok: true });
    expect(validateValue(ruleDays!, 0)).toEqual({ ok: true });
    expect(validateValue(ruleDays!, -5).ok).toBe(false);
  });

  it('永久疯狂 命中 boolean 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.永久疯狂');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('boolean');
    expect(validateValue(rule!, true)).toEqual({ ok: true });
    expect(validateValue(rule!, false)).toEqual({ ok: true });
    expect(validateValue(rule!, 'maybe').ok).toBe(false);
  });

  it('每日理智损失 命中 number(min=0) 规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '调查员.每日理智损失');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('number');
    expect(validateValue(rule!, 0)).toEqual({ ok: true });
    expect(validateValue(rule!, 5)).toEqual({ ok: true });
    expect(validateValue(rule!, '7')).toEqual({ ok: true });
    expect(validateValue(rule!, -1).ok).toBe(false);
  });
});

describe('A0.1 migrateSheet defaults — 新疯狂字段', () => {
  // 校验 A0.1 已把这些字段做进 defaultSheet。本测试若失败说明 A0.1 回退。
  it('defaultSheet 包含 temporaryInsanity/indefiniteInsanity/permanentInsanity/phobias/manias/dailySanLoss 默认值', () => {
    expect(defaultSheet.temporaryInsanity).toEqual({ active: false, roundsLeft: 0 });
    expect(defaultSheet.indefiniteInsanity).toEqual({ active: false, daysLeft: 0 });
    expect(defaultSheet.permanentInsanity).toBe(false);
    expect(defaultSheet.phobias).toEqual([]);
    expect(defaultSheet.manias).toEqual([]);
    expect(defaultSheet.dailySanLoss).toBe(0);
  });
});
