import { describe, it, expect } from 'vitest';
import { flattenStatData } from './mvu-flatten';

describe('flattenStatData', () => {
  it('扁平嵌套对象 → 点号键', () => {
    const out = flattenStatData({ 世界: { 时间: '深夜', 天气: '雨' }, 剧情: { 阶段: '调查期' } });
    expect(out).toEqual({ '世界.时间': '深夜', '世界.天气': '雨', '剧情.阶段': '调查期' });
  });

  it('标量转字符串(数字/布尔)', () => {
    const out = flattenStatData({ 剧情: { 进度: 30, 完成: true } });
    expect(out['剧情.进度']).toBe('30');
    expect(out['剧情.完成']).toBe('true');
  });

  it('数组(含 VWD 形态)统一序列化为 JSON 字符串(不塌缩,与 YAML 格式器一致)', () => {
    const out = flattenStatData({ 状态: { 理智: [60, '心智稳定度'] } });
    expect(out['状态.理智']).toBe(JSON.stringify([60, '心智稳定度']));
  });

  it('普通字符串数组 → JSON 字符串', () => {
    const out = flattenStatData({ 物品: ['手电筒', '笔记本'] });
    expect(out['物品']).toBe(JSON.stringify(['手电筒', '笔记本']));
  });

  it('跳过 _/$ 开头的只读/元数据键', () => {
    const out = flattenStatData({ 世界: { 时间: '白天' }, _元数据: { 版本: '1' }, $meta: { x: 1 } });
    expect(out).toEqual({ '世界.时间': '白天' });
  });

  it('null/undefined 叶子被跳过', () => {
    const out = flattenStatData({ a: null, b: undefined, c: '有值' });
    expect(out).toEqual({ c: '有值' });
  });

  it('空对象 → 空 map', () => {
    expect(flattenStatData({})).toEqual({});
  });

  it('深层嵌套', () => {
    const out = flattenStatData({ 剧情: { NPC: { 韦瑟比: { 态度: -30 } } } });
    expect(out['剧情.NPC.韦瑟比.态度']).toBe('-30');
  });
});
