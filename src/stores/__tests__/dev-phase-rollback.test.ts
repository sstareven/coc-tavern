import { describe, it, expect, beforeEach } from 'vitest';
import { useCharSheetStore, defaultSheet, migrateSheet } from '../useCharSheetStore';
import { useVariableStore } from '../useVariableStore';
import { useBookStore } from '../useBookStore';
import type { CharacterSheet, BookPage } from '../../types';
import { buildDevelopmentOps } from '../../sillytavern/skill-improvement';

// ============================================================
// A3.6 — 删页快照回滚回归
// ----------------------------------------------------------
// 目的：
//   1. 老存档（缺 ticked 字段的 sheet）经 migrateSheet 不崩，默认 ticked=false。
//   2. 发展期 ops（applyCorrectiveOps）改写 sheet.skills.X.current 后，
//      页面里持久化的 sheetSnapshot 仍保留发展前的 current（删页回溯时还能恢复）。
//   3. Storybook 的回滚机制（[...remaining].reverse().find(p => p.sheetSnapshot) → setSheet）
//      在删除后段页面后，能拿回 kept 页的 snapshot 把 current 还原。
// ============================================================

function pageWith(id: string, sheetSnap: CharacterSheet, leftHeader = ''): BookPage {
  return {
    id,
    leftPage: '0',
    rightPage: '1',
    leftHeader,
    leftContent: '',
    rightHeader: '',
    rightContent: '',
    rightChoices: [],
    sheetSnapshot: sheetSnap,
  } as unknown as BookPage;
}

describe('A3.6 — 老存档迁移：缺 ticked 字段不崩', () => {
  it('migrateSheet 给所有技能补 ticked=false', () => {
    const legacy = {
      skills: {
        侦查: { base: 25, current: 40 }, // 无 ticked
        历史: { base: 5, current: 50 },
      },
    } as unknown as CharacterSheet;
    const migrated = migrateSheet(legacy);
    expect(migrated.skills.侦查.ticked).toBe(false);
    expect(migrated.skills.历史.ticked).toBe(false);
  });

  it('完全空 sheet → defaultSheet（不崩）', () => {
    expect(() => migrateSheet({})).not.toThrow();
    expect(() => migrateSheet(undefined)).not.toThrow();
    expect(() => migrateSheet(null)).not.toThrow();
  });

  it('UI 计算 hasTickedDevelopmentSkill 在 legacy sheet 上 → false（无 ticked）', () => {
    const legacy = migrateSheet({
      skills: { 侦查: { base: 25, current: 40 } },
    } as unknown as CharacterSheet);
    // 模拟 CharSheetOverlay 的判定路径：所有 ticked 默认 false → hasTicked false
    expect(Object.values(legacy.skills).every((s) => !s.ticked)).toBe(true);
  });
});

describe('A3.6 — sheetSnapshot 持久化在 applyCorrectiveOps 之后仍保留发展前值', () => {
  beforeEach(() => {
    useVariableStore.getState().clearAll();
    useBookStore.setState({ pages: [], pageIndex: 0 } as any);
    useCharSheetStore.getState().setSheet({
      ...defaultSheet,
      skills: {
        ...defaultSheet.skills,
        心理学: { base: 10, current: 35, ticked: true },
      },
    });
  });

  it('appendPage 后 applyCorrectiveOps 修改 current — 页内 snapshot 不被波及', () => {
    // 1) 拍 snapshot：发展前 current=35
    const beforeSheet = structuredClone(useCharSheetStore.getState().sheet);
    expect(beforeSheet.skills.心理学.current).toBe(35);

    useBookStore.getState().appendPage(pageWith('p-pre-dev', beforeSheet, '第一章·尾声'));
    expect(useBookStore.getState().pages).toHaveLength(1);

    // 2) 发展期：心理学 35 → 50 + clear ticked
    const ops = buildDevelopmentOps([
      { name: '心理学', before: 35, after: 50, d100: 80, d10: 7, improved: true, crossed90: false },
    ]);
    useVariableStore.getState().applyCorrectiveOps(ops);
    expect(useCharSheetStore.getState().sheet.skills.心理学.current).toBe(50);
    expect(useCharSheetStore.getState().sheet.skills.心理学.ticked).toBe(false);

    // 3) 页面里 snapshot 仍是发展前的 35（structuredClone 隔离了引用）
    const pageSnap = useBookStore.getState().pages[0].sheetSnapshot;
    expect(pageSnap?.skills.心理学.current).toBe(35);
    expect(pageSnap?.skills.心理学.ticked).toBe(true);
  });

  it('多页 + applyCorrectiveOps：每页 snapshot 保留当时角色卡', () => {
    // p1: 35, ticked=true
    const snap1 = structuredClone(useCharSheetStore.getState().sheet);
    useBookStore.getState().appendPage(pageWith('p-1', snap1));

    // 发展 35 → 50
    useVariableStore.getState().applyCorrectiveOps(buildDevelopmentOps([
      { name: '心理学', before: 35, after: 50, d100: 80, d10: 7, improved: true, crossed90: false },
    ]));

    // p2: 50, ticked=false
    const snap2 = structuredClone(useCharSheetStore.getState().sheet);
    useBookStore.getState().appendPage(pageWith('p-2', snap2));

    expect(useBookStore.getState().pages[0].sheetSnapshot?.skills.心理学.current).toBe(35);
    expect(useBookStore.getState().pages[0].sheetSnapshot?.skills.心理学.ticked).toBe(true);
    expect(useBookStore.getState().pages[1].sheetSnapshot?.skills.心理学.current).toBe(50);
    expect(useBookStore.getState().pages[1].sheetSnapshot?.skills.心理学.ticked).toBe(false);
  });

  it('deletePage 后剩余末页 snapshot 是回滚源（Storybook 流程：setSheet(lastSnap)）', () => {
    // 序章 + 第一章 + 发展后
    const snap0 = structuredClone(useCharSheetStore.getState().sheet); // 35 ticked
    useBookStore.getState().appendPage(pageWith('序章', snap0));  // index 0
    useBookStore.getState().appendPage(pageWith('第一章·尾声', snap0));  // index 1 (still pre-dev)

    // 发展后再加一页
    useVariableStore.getState().applyCorrectiveOps(buildDevelopmentOps([
      { name: '心理学', before: 35, after: 50, d100: 80, d10: 7, improved: true, crossed90: false },
    ]));
    const snapPost = structuredClone(useCharSheetStore.getState().sheet); // 50 ticked=false
    useBookStore.getState().appendPage(pageWith('第二章', snapPost));  // index 2

    expect(useBookStore.getState().pages).toHaveLength(3);

    // 删除 index 2（第二章及之后）→ 剩 [序章, 第一章·尾声]，末页 snapshot 是发展前 35
    useBookStore.getState().deletePage(2);
    const remaining = useBookStore.getState().pages;
    expect(remaining).toHaveLength(2);
    const lastSnap = [...remaining].reverse().find((p) => p.sheetSnapshot)?.sheetSnapshot;
    expect(lastSnap).toBeDefined();
    expect(lastSnap!.skills.心理学.current).toBe(35);
    expect(lastSnap!.skills.心理学.ticked).toBe(true);

    // 模拟 Storybook 回滚路径
    useCharSheetStore.getState().setSheet(lastSnap!);
    expect(useCharSheetStore.getState().sheet.skills.心理学.current).toBe(35);
    expect(useCharSheetStore.getState().sheet.skills.心理学.ticked).toBe(true);
  });

  it('迁移防御：发展前 snapshot 缺 ticked 字段，回滚后经 setSheet 不崩', () => {
    // 模拟极老的存档：snapshot 里技能无 ticked
    const legacySnap = migrateSheet({
      skills: { 心理学: { base: 10, current: 35 } } as any,
    } as unknown as CharacterSheet);
    // 即使 legacySnap.skills.心理学.ticked = false（migrate 补默认），
    // 直接 setSheet 也不应崩。
    expect(() => useCharSheetStore.getState().setSheet(legacySnap)).not.toThrow();
    expect(useCharSheetStore.getState().sheet.skills.心理学.ticked).toBe(false);
  });
});
