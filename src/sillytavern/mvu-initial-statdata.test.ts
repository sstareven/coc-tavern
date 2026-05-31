import { describe, it, expect } from 'vitest';
import { createInitialStatData } from './mvu-initial-statdata';
import { isCharsheetPath } from './mvu-charsheet-redirect';

describe('createInitialStatData', () => {
  it('含 世界/剧情/战斗 叙事命名空间', () => {
    const s = createInitialStatData();
    expect(s.世界).toBeDefined();
    expect(s.剧情).toBeDefined();
    expect(s.战斗).toBeDefined();
  });

  it('排除 调查员.*(归角色卡,不进 statData)', () => {
    const s = createInitialStatData();
    expect(s.调查员).toBeUndefined();
    // 任何顶层键都不属于角色卡命名空间
    for (const key of Object.keys(s)) {
      expect(isCharsheetPath(key)).toBe(false);
    }
  });

  it('初始叙事字段就位', () => {
    const s = createInitialStatData() as { 世界: Record<string, unknown>; 剧情: Record<string, unknown> };
    expect(s.世界.时间).toBe('清晨');
    expect(s.剧情.阶段).toBe('调查期');
  });

  it('每次返回独立对象(不共享引用)', () => {
    const a = createInitialStatData() as { 世界: Record<string, unknown> };
    const b = createInitialStatData() as { 世界: Record<string, unknown> };
    a.世界.时间 = '深夜';
    expect((b.世界 as Record<string, unknown>).时间).toBe('清晨');
  });

  it('_元数据 用 _ 只读前缀(flatten/宏会跳过)', () => {
    const s = createInitialStatData();
    expect(s._元数据).toBeDefined();
    expect(Object.keys(s).every((k) => k === '_元数据' || !k.startsWith('_'))).toBe(true);
  });
});
