import { describe, it, expect } from 'vitest';
import { coerceJsonObject } from '../llm-response-parser';

describe('coerceJsonObject - 健康路径', () => {
  it('完好 JSON 直通', () => {
    const raw = `{"leftHeader":"探索","leftContent":"abc","choices":[{"num":"1","text":"go"}]}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('探索');
    expect(Array.isArray(parsed?.choices)).toBe(true);
  });

  it('带 ```json 代码围栏', () => {
    const raw = '```json\n{"leftHeader":"H","choices":[]}\n```';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed?.leftHeader).toBe('H');
  });

  it('带 <thinking> 块', () => {
    const raw = '<thinking>plan...</thinking>\n{"leftHeader":"H","choices":[]}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed?.leftHeader).toBe('H');
  });
});

describe('coerceJsonObject - 缺外层 { 修复', () => {
  it('JSON 缺最外层 { 但有 }——主回合典型畸形（曾导致右页全是「继续探索」）', () => {
    // 还原 6 月 5 日真实 case：模型直接以 "sceneInfo": ... 开头、有结尾 }
    const raw = `  "sceneInfo": {
    "date": "1925-01-01",
    "location": "地下室"
  },
  "leftHeader": "化石与笔记",
  "leftContent": "短叙事",
  "rightHeader": "余震",
  "rightContent": "右页",
  "choices": [
    {"num": "I", "text": "打开木箱", "action": "open"},
    {"num": "II", "text": "重读笔记", "action": "reread"}
  ]
}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('化石与笔记');
    expect(parsed?.rightHeader).toBe('余震');
    expect(Array.isArray(parsed?.choices)).toBe(true);
    expect((parsed?.choices as unknown[]).length).toBe(2);
    expect((parsed?.sceneInfo as Record<string, unknown>)?.location).toBe('地下室');
  });

  it('缺外层 { 且缺外层 }——容错也能补齐', () => {
    const raw = `  "leftHeader": "H",
  "choices": [{"num":"1","text":"a"}]`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('H');
    expect(Array.isArray(parsed?.choices)).toBe(true);
  });

  it('JSON 前缀夹带模型思维链（中文 + ---）但不带 {', () => {
    // 还原真实 case：开头有大段中文思维链 + 小说正文，然后才是无 { 的字段段
    const raw = `【问题】非传统写作:
这不是传统的文字游戏创作。

---

这时我才真正翻开它。教授的笔迹算不上工整。

  "leftHeader": "化石",
  "leftContent": "正文",
  "choices": [{"num":"1","text":"看","action":"a"}]
}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('化石');
    expect(Array.isArray(parsed?.choices)).toBe(true);
  });
});

describe('coerceJsonObject - 字符串值含真实换行修复', () => {
  it('leftContent 含真实 LF 换行——不再炸 Bad control char', () => {
    const raw = `{"leftHeader":"H","leftContent":"line1
line2

line3","choices":[]}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftContent).toBe('line1\nline2\n\nline3');
  });

  it('多字段都含真实换行', () => {
    const raw = `{
"leftHeader":"段
落",
"leftContent":"a
b",
"rightContent":"c
d",
"choices":[]
}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftContent).toBe('a\nb');
    expect(parsed?.rightContent).toBe('c\nd');
  });

  it('字符串内含 Tab 字符', () => {
    const raw = `{"leftContent":"col1\tcol2"}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftContent).toBe('col1\tcol2');
  });

  it('字符串外的换行格式化空白不受影响', () => {
    const raw = `{
  "leftHeader": "H",
  "choices": []
}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('H');
  });
});

describe('coerceJsonObject - 缺外层 { + 字符串含换行 联合修复（真实失败现场）', () => {
  it('两类畸形叠加——leftContent 长正文 + 缺 {，能恢复所有字段', () => {
    const raw = `  "sceneInfo": {
    "date": "1925-01-01",
    "location": "地下室"
  },
  "leftHeader": "化石与笔记",
  "leftContent": "这时我才真正翻开它。

教授的笔迹算不上工整，甚至谈不上稳定。

我不得不闭了闭眼。",
  "rightHeader": "余震",
  "rightContent": "不是说化石真的发出了任何可以听见的声响——它没有。

我看见了。",
  "choices": [
    {"num": "I", "text": "打开木箱", "action": "open"},
    {"num": "II", "text": "重读笔记", "action": "reread"},
    {"num": "III", "text": "检查封条", "action": "inspect"},
    {"num": "IV", "text": "暂时离开", "action": "leave"}
  ]
}`;
    const { parsed, error } = coerceJsonObject(raw);
    expect(error).toBe('');
    expect(parsed?.leftHeader).toBe('化石与笔记');
    expect(parsed?.rightHeader).toBe('余震');
    expect(typeof parsed?.leftContent).toBe('string');
    expect((parsed?.leftContent as string).includes('教授的笔迹算不上工整')).toBe(true);
    expect(Array.isArray(parsed?.choices)).toBe(true);
    expect((parsed?.choices as unknown[]).length).toBe(4);
  });
});

describe('coerceJsonObject - 沉默错误防护（旧 bug 回归保护）', () => {
  it('严禁回归到「只提取出 sceneInfo 子对象当顶层」的旧行为', () => {
    // 此即 6/5 真实失败现场：parser 曾把 sceneInfo 的内部当成顶层，导致 leftHeader/choices 全丢
    // 修复后必须能拿到 leftHeader/choices；若拿不到说明又退化了
    const raw = `  "sceneInfo": {"date":"1925-01-01"},
  "leftHeader": "正确",
  "choices": [{"num":"1","text":"a","action":"a"}]
}`;
    const { parsed } = coerceJsonObject(raw);
    // 修复前：parsed = {date: "1925-01-01"}（错误地把 sceneInfo 内部当顶层）
    // 修复后：parsed.leftHeader = "正确", parsed.choices 是数组
    expect(parsed?.date).toBeUndefined(); // 不应该把 sceneInfo 的字段提到顶层
    expect(parsed?.leftHeader).toBe('正确');
    expect(Array.isArray(parsed?.choices)).toBe(true);
  });
});
