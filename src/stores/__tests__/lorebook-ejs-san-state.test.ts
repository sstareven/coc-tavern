/**
 * A2.7 — ejs_san_state 世界书条目按 sheet.{temporaryInsanity, indefiniteInsanity, permanentInsanity}
 * 渲染条件文本。优先级 永久 > 不定 > 临时 > SAN 数值档位 fallback。
 *
 * EJS 模板通过 getvar('调查员.临时疯狂.active' 等) 读取角色卡——这些键由 useVariableStore.
 * buildFullSubstitutionMap 注入(A2.7 同提交一并扩展)。本套件设置角色卡后调 renderTemplate,
 * 验证条件分支正确切换。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderTemplate } from '../../sillytavern/ejs-template';
import { useLorebookStore } from '../useLorebookStore';
import { useCharSheetStore, migrateSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';

function ejsContent(): string {
  return useLorebookStore.getState().books.coc_lore.entries.ejs_san_state.content;
}

function setSheet(over: Partial<Parameters<typeof migrateSheet>[0]>): void {
  useCharSheetStore.getState().setSheet(migrateSheet({
    identity: { name: '测试', occupation: '', age: 30, gender: '男', birthplace: '', residence: '', id: '' },
    characteristics: { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 70, EDU: 50 },
    secondary: {
      hp: { current: 12, max: 12 }, san: { current: 50, max: 99 }, mp: { current: 10, max: 10 },
      luck: 50, mov: 8, db: '0', build: 0,
    },
    ...over,
  }));
}

beforeEach(() => {
  useVariableStore.getState().clearAll();
});

describe('ejs_san_state lorebook entry', () => {
  it('temporaryInsanity.active=true 时渲染 [临时疯狂中: <entry>]', () => {
    setSheet({
      temporaryInsanity: { active: true, roundsLeft: 3, bout: { mode: 'realtime', table: 'VII', entry: 5 } },
      indefiniteInsanity: { active: false, daysLeft: 0 },
      permanentInsanity: false,
    });
    const out = renderTemplate(ejsContent());
    expect(out).toContain('[临时疯狂中:');
    expect(out).toContain('剩 3 轮');
  });

  it('indefiniteInsanity.active=true 时渲染 [不定性疯狂中] (+剩 N 日 if any)', () => {
    setSheet({
      temporaryInsanity: { active: false, roundsLeft: 0 },
      indefiniteInsanity: { active: true, daysLeft: 30 },
      permanentInsanity: false,
    });
    const out = renderTemplate(ejsContent());
    expect(out).toContain('[不定性疯狂中]');
    expect(out).toContain('剩 30 日');
  });

  it('permanentInsanity=true 渲染 [永久疯狂] 且优先于其他状态', () => {
    setSheet({
      // 多个状态同开,永久必须胜出
      temporaryInsanity: { active: true, roundsLeft: 5, bout: { mode: 'summary', table: 'VIII', entry: 7 } },
      indefiniteInsanity: { active: true, daysLeft: 10 },
      permanentInsanity: true,
    });
    const out = renderTemplate(ejsContent());
    expect(out).toContain('[永久疯狂]');
    expect(out).not.toContain('[临时疯狂中:');
    expect(out).not.toContain('[不定性疯狂中]');
  });

  it('三个 flag 均为 false 时回退到 SAN 档位文本 (50/99 命中 ratio>=0.6 → 数字 fallback)', () => {
    setSheet({
      temporaryInsanity: { active: false, roundsLeft: 0 },
      indefiniteInsanity: { active: false, daysLeft: 0 },
      permanentInsanity: false,
      secondary: {
        hp: { current: 12, max: 12 }, san: { current: 80, max: 99 }, mp: { current: 10, max: 10 },
        luck: 50, mov: 8, db: '0', build: 0,
      },
    });
    const out = renderTemplate(ejsContent());
    expect(out).toMatch(/SAN\s+80\/99/);
    expect(out).not.toContain('精神崩溃');
    expect(out).not.toContain('[临时疯狂中:');
  });
});
