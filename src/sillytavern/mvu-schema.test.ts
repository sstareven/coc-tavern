import { describe, it, expect } from 'vitest';
import { COC_MVU_SCHEMA, matchRule, validateValue, type MvuSchema } from './mvu-schema';

describe('matchRule', () => {
  it('精确命中：完整 dot-path 直接取规则', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '剧情.暗线.进度');
    expect(rule).toEqual({ kind: 'number', min: 0, max: 100 });
  });

  it('通配命中：单段 * 匹配任意 NPC 名（剧情.NPC.张三.态度）', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '剧情.NPC.张三.态度');
    expect(rule).toEqual({ kind: 'number', min: -100, max: 100 });
  });

  it('通配命中：NPC 存活布尔字段（剧情.NPC.无名氏.是否存活）', () => {
    const rule = matchRule(COC_MVU_SCHEMA, '剧情.NPC.无名氏.是否存活');
    expect(rule).toEqual({ kind: 'boolean' });
  });

  it('段数不等不命中：NPC 态度下多一段返回 undefined', () => {
    // '剧情.NPC.*.态度' 是 4 段，'剧情.NPC.张三.态度.附加' 是 5 段，段数必须相等
    expect(matchRule(COC_MVU_SCHEMA, '剧情.NPC.张三.态度.附加')).toBeUndefined();
  });

  it('未命中：完全无关路径返回 undefined', () => {
    expect(matchRule(COC_MVU_SCHEMA, '不存在.的.路径')).toBeUndefined();
  });

  it('未命中：被 redirect 的 调查员.* 不在 statData schema 内', () => {
    // 调查员.* 整支改道角色卡，永不进 statData，schema 不应声明
    expect(matchRule(COC_MVU_SCHEMA, '调查员.SAN')).toBeUndefined();
    expect(matchRule(COC_MVU_SCHEMA, '调查员.技能.侦查')).toBeUndefined();
  });

  it('多通配取最具体：* 段数最少者胜出', () => {
    // 同一 dotPath 同时匹配 2 个通配 pattern，应取 * 段数较少（更具体）的那条
    const schema: MvuSchema = {
      rules: {
        '剧情.暗线.*.进度': { kind: 'number', min: 0, max: 100 }, // 1 个 *
        '剧情.*.*.进度': { kind: 'number', min: 0, max: 1 }, // 2 个 *（更泛）
      },
    };
    const rule = matchRule(schema, '剧情.暗线.邪教.进度');
    expect(rule).toEqual({ kind: 'number', min: 0, max: 100 });
  });

  it('精确优先于通配：精确 pattern 即便有通配候选也优先', () => {
    const schema: MvuSchema = {
      rules: {
        '剧情.暗线.邪教.进度': { kind: 'number', min: 0, max: 50 }, // 精确
        '剧情.暗线.*.进度': { kind: 'number', min: 0, max: 100 }, // 通配
      },
    };
    expect(matchRule(schema, '剧情.暗线.邪教.进度')).toEqual({ kind: 'number', min: 0, max: 50 });
  });
});

describe('validateValue - number', () => {
  const sanRule = { kind: 'number', min: 0, max: 99 } as const;

  it('范围内数字通过', () => {
    expect(validateValue(sanRule, 50)).toEqual({ ok: true });
  });

  it('低于 min 报 range，expected 形如 0..99', () => {
    expect(validateValue(sanRule, -1)).toEqual({ ok: false, reason: 'range', expected: '0..99' });
  });

  it('高于 max 报 range', () => {
    expect(validateValue(sanRule, 100)).toEqual({ ok: false, reason: 'range', expected: '0..99' });
  });

  it('纯数字字符串通过（防误报，与 coerceNumeric 对齐）', () => {
    expect(validateValue(sanRule, '42')).toEqual({ ok: true });
  });

  it('非数字字符串拒绝，报 type', () => {
    expect(validateValue(sanRule, 'abc')).toEqual({ ok: false, reason: 'type', expected: 'number' });
  });

  it('空白字符串拒绝（trim 后为空，与 coerceNumeric 对齐）', () => {
    expect(validateValue(sanRule, '   ')).toEqual({ ok: false, reason: 'type', expected: 'number' });
  });

  it('只有 min 的规则越界时 expected 右端为空（0..）', () => {
    const hpRule = { kind: 'number', min: 0 } as const;
    expect(validateValue(hpRule, -5)).toEqual({ ok: false, reason: 'range', expected: '0..' });
  });
});

describe('validateValue - enum', () => {
  const weatherRule = { kind: 'enum', values: ['晴', '阴', '雨', '雾', '雪'] } as const;

  it('枚举命中通过', () => {
    expect(validateValue(weatherRule, '雨')).toEqual({ ok: true });
  });

  it('枚举未命中报 enum，expected 用 | 连接', () => {
    expect(validateValue(weatherRule, '冰雹')).toEqual({
      ok: false,
      reason: 'enum',
      expected: '晴|阴|雨|雾|雪',
    });
  });
});

describe('validateValue - VWD 二元组', () => {
  const sanRule = { kind: 'number', min: 0, max: 99 } as const;

  it('VWD 二元组只校验 [0]：[0] 合法即通过（忽略描述串）', () => {
    expect(validateValue(sanRule, [60, '理智值'])).toEqual({ ok: true });
  });

  it('VWD 二元组只校验 [0]：[0] 越界则报 range', () => {
    expect(validateValue(sanRule, [120, '理智值'])).toEqual({
      ok: false,
      reason: 'range',
      expected: '0..99',
    });
  });

  it('VWD 二元组：[0] 为纯数字字符串也通过', () => {
    expect(validateValue(sanRule, ['30', '理智值'])).toEqual({ ok: true });
  });

  it('非 VWD 数组（[1] 不是 string）不被当作二元组，按原值校验', () => {
    // length===2 但 [1] 是数字 → 不是 VWD，整个数组进 number 校验 → 转不出数字
    expect(validateValue(sanRule, [60, 70])).toEqual({ ok: false, reason: 'type', expected: 'number' });
  });
});

describe('validateValue - string / boolean 宽松', () => {
  const strRule = { kind: 'string' } as const;
  const boolRule = { kind: 'boolean' } as const;

  it('string 接受任意可 String 化的值（数字）', () => {
    expect(validateValue(strRule, 123)).toEqual({ ok: true });
  });

  it('string 拒绝 null/undefined', () => {
    expect(validateValue(strRule, null)).toEqual({ ok: false, reason: 'type', expected: 'string' });
  });

  it('boolean 接受真布尔', () => {
    expect(validateValue(boolRule, true)).toEqual({ ok: true });
  });

  it('boolean 宽松接受字符串 true/false', () => {
    expect(validateValue(boolRule, 'false')).toEqual({ ok: true });
  });

  it('boolean 拒绝其他字符串', () => {
    expect(validateValue(boolRule, '是')).toEqual({ ok: false, reason: 'type', expected: 'boolean' });
  });
});
