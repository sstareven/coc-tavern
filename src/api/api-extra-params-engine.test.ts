// api-extra-params-engine 单测:覆盖语法 + 类型识别 + 应用顺序 + 错误处理
import { describe, it, expect, vi } from 'vitest';
import {
  parseExtraParamsRules,
  applyExtraParamsRules,
  summarizeExtraParamsRules,
} from './api-extra-params-engine';

describe('parseExtraParamsRules — 基础', () => {
  it('空串 → 空 rules + 空 errors', () => {
    const r = parseExtraParamsRules('');
    expect(r.rules).toEqual([]);
    expect(r.errors).toEqual([]);
  });
  it('全是空行 + 注释 → 空 rules', () => {
    const r = parseExtraParamsRules('\n# hello\n\n  # comment\n');
    expect(r.rules).toEqual([]);
  });
});

describe('parseExtraParamsRules — value 类型判断', () => {
  const cases: Array<[string, unknown]> = [
    ['+ top_p 0.9', 0.9],
    ['+ count 5', 5],
    ['+ neg -3', -3],
    ['+ stream true', true],
    ['+ disabled false', false],
    ['+ stop null', null],
    ['+ obj {"a":1}', { a: 1 }],
    ['+ arr [1,2]', [1, 2]],
    ['+ name "abc"', 'abc'],
    ['+ name plain', 'plain'],
  ];
  for (const [line, expected] of cases) {
    it(`${line} → ${JSON.stringify(expected)}`, () => {
      const r = parseExtraParamsRules(line);
      expect(r.rules.length).toBe(1);
      expect(r.rules[0]).toMatchObject({ kind: 'set', value: expected });
    });
  }
});

describe('parseExtraParamsRules — 删除/嵌套路径', () => {
  it('- field → remove 规则', () => {
    const r = parseExtraParamsRules('- top_p');
    expect(r.rules).toEqual([{ kind: 'remove', path: ['top_p'], line: 1 }]);
  });
  it('- a.b.c → 嵌套删除', () => {
    const r = parseExtraParamsRules('- stream_options.include_usage');
    expect(r.rules[0]).toMatchObject({ kind: 'remove', path: ['stream_options', 'include_usage'] });
  });
  it('+ a.b val → 嵌套 set', () => {
    const r = parseExtraParamsRules('+ stream_options.include_usage true');
    expect(r.rules[0]).toMatchObject({ kind: 'set', path: ['stream_options', 'include_usage'], value: true });
  });
});

describe('parseExtraParamsRules — 兼容裸语法', () => {
  it('不带 + 的覆盖 `field value` 同样识别为 set', () => {
    const r = parseExtraParamsRules('top_p 0.95');
    expect(r.rules[0]).toMatchObject({ kind: 'set', path: ['top_p'], value: 0.95 });
  });
});

describe('parseExtraParamsRules — 错误处理', () => {
  it('- 后无字段 → errors', () => {
    const r = parseExtraParamsRules('-');
    expect(r.rules).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
  it('+ field 无 value → errors', () => {
    const r = parseExtraParamsRules('+ top_p');
    expect(r.rules).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
  it('字段名含空格/中文 → errors', () => {
    const r = parseExtraParamsRules('+ 温度 0.9');
    expect(r.rules).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
  it('- field value → errors(remove 不接受 value)', () => {
    const r = parseExtraParamsRules('- top_p 0.5');
    expect(r.rules).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
  it('单坏行不影响其他行', () => {
    const r = parseExtraParamsRules('+ top_p 0.9\n+ 温度 1\n- frequency_penalty');
    expect(r.rules.length).toBe(2);
    expect(r.errors.length).toBe(1);
  });
});

describe('applyExtraParamsRules — 实际应用', () => {
  it('空规则 → 返回原 body 浅拷贝', () => {
    const body = { a: 1, b: 2 };
    const out = applyExtraParamsRules(body, '');
    expect(out).toEqual(body);
    expect(out).not.toBe(body);
  });
  it('- top_p 删除字段', () => {
    const out = applyExtraParamsRules({ temperature: 1, top_p: 0.9 }, '- top_p');
    expect(out).toEqual({ temperature: 1 });
  });
  it('+ top_p 覆盖', () => {
    const out = applyExtraParamsRules({ top_p: 0.9 }, '+ top_p 0.5');
    expect(out).toEqual({ top_p: 0.5 });
  });
  it('+ 不存在字段 → 添加', () => {
    const out = applyExtraParamsRules({ a: 1 }, '+ seed 42');
    expect(out).toEqual({ a: 1, seed: 42 });
  });
  it('嵌套写时复制不污染原对象', () => {
    const original = { stream_options: { include_usage: false, other: 1 } };
    const out = applyExtraParamsRules(original, '+ stream_options.include_usage true');
    expect(out.stream_options).toEqual({ include_usage: true, other: 1 });
    expect((original.stream_options as Record<string, unknown>).include_usage).toBe(false);
  });
  it('应用顺序:后行覆盖前行', () => {
    const out = applyExtraParamsRules({}, '+ top_p 0.5\n+ top_p 0.9');
    expect(out).toEqual({ top_p: 0.9 });
  });
  it('删后再加', () => {
    const out = applyExtraParamsRules({ top_p: 0.5 }, '- top_p\n+ top_p 0.9');
    expect(out).toEqual({ top_p: 0.9 });
  });
  it('加后再删', () => {
    const out = applyExtraParamsRules({}, '+ top_p 0.9\n- top_p');
    expect(out).toEqual({});
  });
  it('删不存在字段 → 不报错', () => {
    const out = applyExtraParamsRules({}, '- nonexistent');
    expect(out).toEqual({});
  });
  it('JSON 对象覆盖', () => {
    const out = applyExtraParamsRules({}, '+ response_format {"type":"json_object"}');
    expect(out).toEqual({ response_format: { type: 'json_object' } });
  });
});

describe('summarizeExtraParamsRules', () => {
  it('正常 + 错误混合 → ok / skipped 计数正确', () => {
    const s = summarizeExtraParamsRules('+ top_p 0.9\n# 注释\n+ 温度 1');
    expect(s.ok).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.firstError).toBeTruthy();
  });
  it('空串 → 0/0', () => {
    expect(summarizeExtraParamsRules('')).toEqual({ ok: 0, skipped: 0, firstError: undefined });
  });
});

describe('坏行 console.warn 行为不抛错', () => {
  it('单坏行 + 应用 → 静默跳过', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = applyExtraParamsRules({ top_p: 0.5 }, '+ 温度 1\n- top_p');
    expect(out).toEqual({});
    warnSpy.mockRestore();
  });
});
