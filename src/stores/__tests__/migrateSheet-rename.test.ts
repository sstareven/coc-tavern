import { describe, it, expect } from 'vitest';
import { migrateSheet } from '../useCharSheetStore';

// BUG5：技能名一刀切规则书 canonical（躲闪→闪避；会计学→会计；枪械(手枪)→射击(手枪)；
// 枪械(步枪/霰弹枪)→拆为射击(步枪)+射击(霰弹枪)；快速交谈→话术）。
// migrateSheet 在加载老存档时一次性 rename，避免老存档 sheet.skills 里残留孤儿键。
// 策略：若新名已存在则保留新名值（更近一次的写入）；旧名一律 delete。

describe('migrateSheet — BUG5 技能 rename table', () => {
  it('躲闪 → 闪避', () => {
    const next = migrateSheet({ skills: { '躲闪': { base: 30, current: 45, ticked: true } } });
    expect(next.skills['闪避']).toEqual({ base: 30, current: 45, ticked: true });
    expect(next.skills['躲闪']).toBeUndefined();
  });

  it('会计学 → 会计', () => {
    const next = migrateSheet({ skills: { '会计学': { base: 5, current: 60, ticked: false } } });
    expect(next.skills['会计']).toEqual({ base: 5, current: 60, ticked: false });
    expect(next.skills['会计学']).toBeUndefined();
  });

  it('枪械(手枪) → 射击(手枪)', () => {
    const next = migrateSheet({ skills: { '枪械(手枪)': { base: 20, current: 50, ticked: false } } });
    expect(next.skills['射击(手枪)']).toEqual({ base: 20, current: 50, ticked: false });
    expect(next.skills['枪械(手枪)']).toBeUndefined();
  });

  it('快速交谈 → 话术', () => {
    const next = migrateSheet({ skills: { '快速交谈': { base: 5, current: 40, ticked: false } } });
    expect(next.skills['话术']).toEqual({ base: 5, current: 40, ticked: false });
    expect(next.skills['快速交谈']).toBeUndefined();
  });

  it('枪械(步枪/霰弹枪) 拆为 射击(步枪) + 射击(霰弹枪)（同值复制）', () => {
    const next = migrateSheet({ skills: { '枪械(步枪/霰弹枪)': { base: 25, current: 55, ticked: true } } });
    expect(next.skills['射击(步枪)']).toEqual({ base: 25, current: 55, ticked: true });
    expect(next.skills['射击(霰弹枪)']).toEqual({ base: 25, current: 55, ticked: true });
    expect(next.skills['枪械(步枪/霰弹枪)']).toBeUndefined();
  });

  it('新名已存在 → 保留新名值，旧名 delete (不覆盖更近的写入)', () => {
    const next = migrateSheet({ skills: {
      '躲闪': { base: 30, current: 40, ticked: false }, // 旧名(被丢弃)
      '闪避': { base: 32, current: 70, ticked: true },  // 新名(保留)
    } });
    expect(next.skills['闪避']).toEqual({ base: 32, current: 70, ticked: true });
    expect(next.skills['躲闪']).toBeUndefined();
  });

  it('既无旧名也无新名 → 不影响其它技能', () => {
    const next = migrateSheet({ skills: { '侦查': { base: 25, current: 50, ticked: false } } });
    expect(next.skills['侦查']).toEqual({ base: 25, current: 50, ticked: false });
    expect(next.skills['躲闪']).toBeUndefined();
    expect(next.skills['闪避']).toBeUndefined();
  });
});
