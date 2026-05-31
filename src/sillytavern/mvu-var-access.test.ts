import { describe, it, expect, beforeEach } from 'vitest';
import { readVar, writeVar } from './mvu-var-access';
import { useVariableStore } from '../stores/useVariableStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';

beforeEach(() => {
  useVariableStore.getState().clearAll();
  useCharSheetStore.getState().reset();
});

describe('readVar', () => {
  it('读扁平变量', () => {
    useVariableStore.getState().setVariable('flag', '开', 'manual');
    expect(readVar('flag')).toBe('开');
  });

  it('读 statData 树(点号路径)', () => {
    useVariableStore.getState().setStatData({ 世界: { 时间: '深夜' }, 剧情: { 阶段: '高潮' } });
    expect(readVar('世界.时间')).toBe('深夜');
    expect(readVar('剧情.阶段')).toBe('高潮');
  });

  it('扁平变量优先于 statData 树(locked 手动覆盖)', () => {
    useVariableStore.getState().setStatData({ 世界: { 时间: '深夜' } });
    useVariableStore.getState().setVariable('世界.时间', '白天', 'manual');
    expect(readVar('世界.时间')).toBe('白天');
  });

  it('调查员.* 读角色卡 live 值', () => {
    // defaultSheet 的 hp.current 由 reset 提供;写入后读取
    const sheet = useCharSheetStore.getState().sheet;
    useCharSheetStore.getState().setSheet({ ...sheet, secondary: { ...sheet.secondary, hp: { current: 7, max: 12 } } });
    expect(readVar('调查员.生命值.当前')).toBe('7');
  });

  it('不存在 → fallback', () => {
    expect(readVar('不存在', '默认')).toBe('默认');
  });
});

describe('writeVar', () => {
  it('点号叙事路径 → 写入 statData 树', () => {
    writeVar('世界.天气', '暴雨');
    expect(useVariableStore.getState().statData).toEqual({ 世界: { 天气: '暴雨' } });
    expect(readVar('世界.天气')).toBe('暴雨');
  });

  it('调查员.* → 重定向角色卡(不进 statData)', () => {
    writeVar('调查员.生命值.当前', '5');
    expect(useCharSheetStore.getState().sheet.secondary.hp.current).toBe(5);
    expect(useVariableStore.getState().statData).toEqual({});
  });

  it('非点号 → 写扁平变量', () => {
    writeVar('简单标志', '是');
    expect(useVariableStore.getState().variables['简单标志']?.value).toBe('是');
  });

  it('深层路径自动建中间对象', () => {
    writeVar('剧情.NPC.韦瑟比.态度', '-30');
    expect(readVar('剧情.NPC.韦瑟比.态度')).toBe('-30');
  });
});
