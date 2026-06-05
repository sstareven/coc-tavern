import { describe, it, expect } from 'vitest';
import { strictJsonParse } from '../strict-json-parser';

describe('strictJsonParse — 严格解析器（不做启发式修复）', () => {
  it('合法 JSON 直通', () => {
    const r = strictJsonParse('{"a":1,"b":"x"}');
    expect(r.error).toBe('');
    expect(r.parsed).toEqual({ a: 1, b: 'x' });
  });

  it('带 ```json ... ``` 代码围栏 → 剥围栏后解析', () => {
    const r = strictJsonParse('```json\n{"a":1}\n```');
    expect(r.error).toBe('');
    expect(r.parsed).toEqual({ a: 1 });
  });

  it('带 ```（无 json 标记）代码围栏 → 同样剥', () => {
    const r = strictJsonParse('```\n{"a":1}\n```');
    expect(r.error).toBe('');
    expect(r.parsed).toEqual({ a: 1 });
  });

  it('首尾空白 / 换行 → 自动 trim', () => {
    const r = strictJsonParse('\n\n  {"a":1}  \n');
    expect(r.error).toBe('');
    expect(r.parsed).toEqual({ a: 1 });
  });

  it('非法 JSON → parsed=null + error 含 SyntaxError', () => {
    const r = strictJsonParse('{a:1}'); // JSON 不允许 unquoted key
    expect(r.parsed).toBeNull();
    expect(r.error).toMatch(/JSON|Unexpected/);
  });

  it('真实换行混进字符串 → 严格拒绝（不做启发式修复）', () => {
    const r = strictJsonParse('{"a":"line1\nline2"}'); // 真实 LF 不合法 JSON
    expect(r.parsed).toBeNull();
    expect(r.error).not.toBe('');
  });

  it('顶层非对象（数组）→ 拒绝并报错', () => {
    const r = strictJsonParse('[1,2,3]');
    expect(r.parsed).toBeNull();
    expect(r.error).toMatch(/对象|object/);
  });

  it('顶层非对象（字符串字面量）→ 拒绝并报错', () => {
    const r = strictJsonParse('"just a string"');
    expect(r.parsed).toBeNull();
    expect(r.error).toMatch(/对象|object/);
  });

  it('空串 → parsed=null + 明确错误', () => {
    const r = strictJsonParse('');
    expect(r.parsed).toBeNull();
    expect(r.error).toMatch(/空|empty/i);
  });

  it('嵌套结构正常解析', () => {
    const r = strictJsonParse('{"a":{"b":[1,2,{"c":"x"}]}}');
    expect(r.error).toBe('');
    expect(r.parsed).toEqual({ a: { b: [1, 2, { c: 'x' }] } });
  });

  it('error 应携带位置上下文（含 position 或 line 信息）便于诊断', () => {
    const r = strictJsonParse('{"a":1,"b":,"c":3}'); // 缺值
    expect(r.parsed).toBeNull();
    // SyntaxError 字符串通常含 "position N" 或 "line N column N"
    expect(r.error).toMatch(/position|line|column|Unexpected/i);
  });
});
