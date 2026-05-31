import { describe, it, expect } from 'vitest';
import { formatStatDataYaml } from './mvu-format';

// ============================================================
// formatStatDataYaml — statData 子树 → YAML 序列化
// 供 {{format_message_variable::stat_data}} 宏阅读当前状态
// ============================================================

describe('formatStatDataYaml — scalars & nullish', () => {
  it('returns string form for a top-level string scalar', () => {
    expect(formatStatDataYaml('深夜')).toBe('深夜');
  });

  it('returns string form for a top-level number', () => {
    expect(formatStatDataYaml(30)).toBe('30');
  });

  it('returns string form for a top-level boolean', () => {
    expect(formatStatDataYaml(true)).toBe('true');
    expect(formatStatDataYaml(false)).toBe('false');
  });

  it('returns empty string for null input', () => {
    expect(formatStatDataYaml(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(formatStatDataYaml(undefined)).toBe('');
  });
});

describe('formatStatDataYaml — flat objects', () => {
  it('serializes a flat object, one key per line', () => {
    const out = formatStatDataYaml({ 时间: '深夜', 天气: '雨' });
    expect(out).toBe('时间: 深夜\n天气: 雨');
  });

  it('serializes number and boolean values', () => {
    const out = formatStatDataYaml({ 进度: 30, 完成: false });
    expect(out).toBe('进度: 30\n完成: false');
  });

  it('renders null/undefined values as ~', () => {
    const out = formatStatDataYaml({ a: null, b: undefined });
    expect(out).toBe('a: ~\nb: ~');
  });
});

describe('formatStatDataYaml — nested objects', () => {
  it('indents nested objects by 2 spaces recursively', () => {
    const out = formatStatDataYaml({
      世界: { 时间: '深夜', 天气: '雨' },
      剧情: { 阶段: '调查期', 进度: 30 },
    });
    expect(out).toBe(
      '世界:\n  时间: 深夜\n  天气: 雨\n剧情:\n  阶段: 调查期\n  进度: 30',
    );
  });

  it('handles three levels of nesting', () => {
    const out = formatStatDataYaml({ a: { b: { c: 1 } } });
    expect(out).toBe('a:\n  b:\n    c: 1');
  });
});

describe('formatStatDataYaml — arrays', () => {
  it('serializes a scalar array with dash items', () => {
    const out = formatStatDataYaml({ 物品: ['手电筒', '笔记本'] });
    expect(out).toBe('物品:\n  - 手电筒\n  - 笔记本');
  });

  it('serializes a top-level scalar array', () => {
    const out = formatStatDataYaml(['a', 'b', 'c']);
    expect(out).toBe('- a\n- b\n- c');
  });

  it('serializes an array of objects', () => {
    const out = formatStatDataYaml([{ 名: '甲' }, { 名: '乙' }]);
    expect(out).toBe('- 名: 甲\n- 名: 乙');
  });

  it('serializes an object array nested under a key', () => {
    const out = formatStatDataYaml({ 列表: [{ x: 1 }, { x: 2 }] });
    expect(out).toBe('列表:\n  - x: 1\n  - x: 2');
  });
});

describe('formatStatDataYaml — VWD tuple [value, description] (NOT collapsed)', () => {
  // 与上游 MagVarUpdate 一致：format_message_variable 对整树做 YAML 序列化，
  // 不塌缩 VWD 元组——值和描述都原样渲染成 2 元素列表，呈现给 AI。
  it('renders a [number, string] tuple as a 2-element list', () => {
    const out = formatStatDataYaml({ 理智值: [60, '当前理智'] });
    expect(out).toBe('理智值:\n  - 60\n  - 当前理智');
  });

  it('renders a [string, string] tuple as a 2-element list', () => {
    const out = formatStatDataYaml({ 状态: ['清醒', '当前状态'] });
    expect(out).toBe('状态:\n  - 清醒\n  - 当前状态');
  });

  it('renders any 2-element [v, desc] array as a list (no collapse)', () => {
    const out = formatStatDataYaml({ k: ['v', 'desc'] });
    expect(out).toBe('k:\n  - v\n  - desc');
  });

  it('renders a normal 2-element numeric array as a list', () => {
    const out = formatStatDataYaml({ 坐标: [1, 2] });
    expect(out).toBe('坐标:\n  - 1\n  - 2');
  });

  it('renders a 3-element array as a list', () => {
    const out = formatStatDataYaml({ a: ['x', 'y', 'z'] });
    expect(out).toBe('a:\n  - x\n  - y\n  - z');
  });

  it('renders a [object, string] pair as a 2-element list (object item inline)', () => {
    const out = formatStatDataYaml({ 装备: [{ 武器: '刀' }, '当前装备'] });
    expect(out).toBe('装备:\n  - 武器: 刀\n  - 当前装备');
  });

  it('renders a [array, string] pair as a 2-element list (nested array item)', () => {
    const out = formatStatDataYaml({ 物品: [['刀', '盾'], '背包内容'] });
    expect(out).toBe('物品:\n  - - 刀\n    - 盾\n  - 背包内容');
  });
});

describe('formatStatDataYaml — empty containers', () => {
  it('renders empty object as {}', () => {
    expect(formatStatDataYaml({})).toBe('{}');
  });

  it('renders empty array as []', () => {
    expect(formatStatDataYaml([])).toBe('[]');
  });

  it('renders nested empty object as inline {}', () => {
    const out = formatStatDataYaml({ a: {}, b: 1 });
    expect(out).toBe('a: {}\nb: 1');
  });

  it('renders nested empty array as inline []', () => {
    const out = formatStatDataYaml({ a: [], b: 1 });
    expect(out).toBe('a: []\nb: 1');
  });
});

describe('formatStatDataYaml — combined real-world snapshot', () => {
  it('serializes investigator stat tree with VWD tuples (uncollapsed) + arrays', () => {
    const out = formatStatDataYaml({
      调查员: {
        理智值: [60, '心智稳定度'],
        物品: ['手电筒', '笔记本'],
      },
    });
    expect(out).toBe(
      '调查员:\n  理智值:\n    - 60\n    - 心智稳定度\n  物品:\n    - 手电筒\n    - 笔记本',
    );
  });
});

describe('formatStatDataYaml — string quoting', () => {
  it('quotes strings containing a colon-space', () => {
    const out = formatStatDataYaml({ 备注: '时间: 深夜' });
    expect(out).toBe('备注: "时间: 深夜"');
  });

  it('quotes strings containing a newline', () => {
    const out = formatStatDataYaml({ 备注: '第一行\n第二行' });
    expect(out).toBe('备注: "第一行\\n第二行"');
  });

  it('does not quote plain Chinese strings', () => {
    const out = formatStatDataYaml({ 地点: '阿卡姆镇' });
    expect(out).toBe('地点: 阿卡姆镇');
  });
});
