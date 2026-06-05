import { describe, it, expect } from 'vitest';
import { applyCharsheetRedirect } from '../mvu-charsheet-redirect';
import { applyMvuPatch } from '../mvu-jsonpatch';
import type { CharacterSheet } from '../../types';

/**
 * A2.3 — applyCharsheetRedirect 新增 7 个理智/疯狂分支 + RedirectResult 返回类型 + sanDelta 透出。
 *
 * 受测点：
 *  - 临时疯狂.active/roundsLeft/bout 三条分支（active=boolean, roundsLeft=delta/replace+clamp, bout=结构化对象）
 *  - 不定性疯狂.active/daysLeft 两条分支
 *  - 永久疯狂（裸 boolean）
 *  - 恐惧症/狂躁症 (string[]，add/insert/replace 追加去重、remove 过滤)
 *  - 每日理智损失（delta/replace，clamp ≥0）
 *  - 理智值.当前 增强：sanDelta = next - cur 透出（delta 与 replace 两种 op 都正确）
 *
 * 注意：本测试与 mvu-charsheet-redirect.test.ts 同时存在；那份覆盖 A0/A1 已有路径，
 * 本份只聚焦 A2 新增分支与 sanDelta 通道。
 */
function blankSheet(): CharacterSheet {
  return {
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 },
    halfFifth: {} as never,
    secondary: { hp: { current: 10, max: 10 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 }, luck: 50, mov: 8, db: '0', build: 0 },
    skills: {},
    identity: { name: '', occupation: '', age: 25, gender: '', birthplace: '', residence: '', id: '' },
    greeting: '', description: '', personality: '', scenario: '', personaDescription: '',
    posture: '站立', statusConditions: [],
    dailySanLoss: 0,
    temporaryInsanity: { active: false, roundsLeft: 0 },
    indefiniteInsanity: { active: false, daysLeft: 0 },
    permanentInsanity: false, phobias: [], manias: [],
    known_spells: [], recovery: {},
  } as CharacterSheet;
}

describe('applyCharsheetRedirect — 临时疯狂', () => {
  it('临时疯狂.active=true', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.临时疯狂.active', 'replace', true);
    expect(r?.sheet.temporaryInsanity.active).toBe(true);
    expect(r?.sanDelta).toBeUndefined();
  });

  it('临时疯狂.roundsLeft delta -1 累减', () => {
    const s = blankSheet(); s.temporaryInsanity.roundsLeft = 3;
    const r = applyCharsheetRedirect(s, '调查员.临时疯狂.roundsLeft', 'delta', -1);
    expect(r?.sheet.temporaryInsanity.roundsLeft).toBe(2);
  });

  it('临时疯狂.roundsLeft delta 触底 clamp ≥0', () => {
    const s = blankSheet(); s.temporaryInsanity.roundsLeft = 1;
    const r = applyCharsheetRedirect(s, '调查员.临时疯狂.roundsLeft', 'delta', -5);
    expect(r?.sheet.temporaryInsanity.roundsLeft).toBe(0);
  });

  it('临时疯狂.bout replace 写入 {mode,table,entry}', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.临时疯狂.bout', 'replace',
      { mode: 'realtime', table: 'VII', entry: 5 });
    expect(r?.sheet.temporaryInsanity.bout).toEqual({ mode: 'realtime', table: 'VII', entry: 5 });
  });
});

describe('applyCharsheetRedirect — 不定性疯狂 / 永久疯狂', () => {
  it('不定性疯狂.active boolean', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.不定性疯狂.active', 'replace', true);
    expect(r?.sheet.indefiniteInsanity.active).toBe(true);
  });

  it('不定性疯狂.daysLeft replace 30', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.不定性疯狂.daysLeft', 'replace', 30);
    expect(r?.sheet.indefiniteInsanity.daysLeft).toBe(30);
  });

  it('永久疯狂 boolean', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.永久疯狂', 'replace', true);
    expect(r?.sheet.permanentInsanity).toBe(true);
  });
});

describe('applyCharsheetRedirect — 恐惧症 / 狂躁症 数组语义', () => {
  it('恐惧症 add appends', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'add', '黑暗恐惧症');
    expect(r?.sheet.phobias).toEqual(['深渊恐惧症', '黑暗恐惧症']);
  });

  it('恐惧症 add dedupe（已存在即不变）', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'add', '深渊恐惧症');
    expect(r?.sheet.phobias).toEqual(['深渊恐惧症']);
  });

  it('恐惧症 remove filters', () => {
    const s = blankSheet(); s.phobias = ['深渊恐惧症', '黑暗恐惧症'];
    const r = applyCharsheetRedirect(s, '调查员.恐惧症', 'remove', '深渊恐惧症');
    expect(r?.sheet.phobias).toEqual(['黑暗恐惧症']);
  });

  it('狂躁症 add appends 到空数组', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.狂躁症', 'add', '收集癖');
    expect(r?.sheet.manias).toEqual(['收集癖']);
  });
});

describe('applyCharsheetRedirect — 每日理智损失', () => {
  it('每日理智损失 delta 累计', () => {
    const s = blankSheet(); s.dailySanLoss = 3;
    const r = applyCharsheetRedirect(s, '调查员.每日理智损失', 'delta', 2);
    expect(r?.sheet.dailySanLoss).toBe(5);
  });

  it('每日理智损失 delta 触底 clamp ≥0', () => {
    const s = blankSheet(); s.dailySanLoss = 1;
    const r = applyCharsheetRedirect(s, '调查员.每日理智损失', 'delta', -5);
    expect(r?.sheet.dailySanLoss).toBe(0);
  });
});

describe('applyCharsheetRedirect — sanDelta 透出', () => {
  it('理智值.当前 delta 给出 sanDelta = delta', () => {
    const s = blankSheet(); s.secondary.san.current = 50;
    const r = applyCharsheetRedirect(s, '调查员.理智值.当前', 'delta', -7);
    expect(r?.sheet.secondary.san.current).toBe(43);
    expect(r?.sanDelta).toBe(-7);
  });

  it('理智值.当前 replace 给出 sanDelta = new - old', () => {
    const s = blankSheet(); s.secondary.san.current = 50;
    const r = applyCharsheetRedirect(s, '调查员.理智值.当前', 'replace', 42);
    expect(r?.sheet.secondary.san.current).toBe(42);
    expect(r?.sanDelta).toBe(-8);
  });

  it('其它数值分支不带 sanDelta（HP 当前值）', () => {
    const r = applyCharsheetRedirect(blankSheet(), '调查员.生命值.当前', 'delta', -3);
    expect(r?.sheet.secondary.hp.current).toBe(7);
    expect(r?.sanDelta).toBeUndefined();
  });
});

describe('integration — 调查员.临时疯狂.active 经 applyMvuPatch redirect 不落 statData', () => {
  it('redirect 回调消费 调查员.* 路径，statData 永不出现 "调查员" 键', () => {
    let sheet = blankSheet();
    const tree: Record<string, unknown> = { '世界': {}, '剧情': {}, '战斗': {} };
    applyMvuPatch(
      tree,
      [{ op: 'replace', path: '调查员.临时疯狂.active', value: true }],
      {
        redirect: (dotPath, op, value) => {
          if (!dotPath.startsWith('调查员')) return false;
          const r = applyCharsheetRedirect(sheet, dotPath, op, value);
          if (r) sheet = r.sheet;
          return true; // 始终消费 调查员.*
        },
      },
    );
    expect(tree['调查员']).toBeUndefined();
    expect(sheet.temporaryInsanity.active).toBe(true);
  });
});
