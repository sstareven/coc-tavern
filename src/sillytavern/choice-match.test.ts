import { describe, it, expect } from 'vitest';
import { normalizeChoiceText, matchesExistingChoice, resolveButtonMode } from './choice-match';
import type { ChoiceItem } from '../types';

const choices: ChoiceItem[] = [
  { num: 'I', text: '仔细搜查书房的每个角落', action: "进行侦查检定(普通)，搜查书房 <var name='lastAction' value='搜查'/>" },
  { num: 'II', text: '翻阅尘封的旧档案', action: '进行图书馆使用检定(普通)，查阅档案' },
];

describe('normalizeChoiceText', () => {
  it('去标点/空白并小写', () => {
    expect(normalizeChoiceText(' 仔细，搜查。 ')).toBe('仔细搜查');
  });
  it('剥离 <var> 标记', () => {
    expect(normalizeChoiceText("查阅 <var name='x' value='y'/> 档案")).toBe('查阅档案');
  });
  it('全角字母数字转半角', () => {
    expect(normalizeChoiceText('ＡＢＣ１２３')).toBe('abc123');
  });
  it('整块剥离骰子结果方括号（含 = / 等内部字符）', () => {
    expect(
      normalizeChoiceText('[攀爬 困难 d100=66/10 惩罚骰 失败]\n进行攀爬检定(困难, 惩罚骰),趁着夜色冒险攀爬'),
    ).toBe('进行攀爬检定困难惩罚骰趁着夜色冒险攀爬');
  });
});

describe('matchesExistingChoice', () => {
  it('与选项 text 规范化相等 → true', () => {
    expect(matchesExistingChoice('仔细搜查书房的每个角落', choices)).toBe(true);
  });
  it('与选项 action 规范化相等（点选项填入 action 的场景）→ true', () => {
    expect(matchesExistingChoice("进行图书馆使用检定(普通)，查阅档案", choices)).toBe(true);
  });
  it('意思相近但措辞不同 → false', () => {
    expect(matchesExistingChoice('我去翻翻那些旧文件', choices)).toBe(false);
  });
  it('空输入 → false', () => {
    expect(matchesExistingChoice('   ', choices)).toBe(false);
  });
  it('掷骰后被前置骰子结果方括号的选项仍能匹配（advance 而非 rewrite）', () => {
    const rolled =
      "[攀爬 困难 d100=66/10 惩罚骰 失败]\n进行图书馆使用检定(普通)，查阅档案 <var name='lastCheck' value='攀爬'/>";
    expect(matchesExistingChoice(rolled, choices)).toBe(true);
  });
  it('提交「叙事text + 机制action」合并形态仍匹配（advance）', () => {
    // 模拟 buildChoiceInput：玩家叙事 text。机制 action
    const combined = '仔细搜查书房的每个角落。进行侦查检定(普通)，搜查书房 <var name=\'lastAction\' value=\'搜查\'/>';
    expect(matchesExistingChoice(combined, choices)).toBe(true);
  });
  it('合并形态 + 掷骰前缀仍匹配（advance）', () => {
    const rolled =
      "[侦查 普通 d100=42/60 成功]\n仔细搜查书房的每个角落。进行侦查检定(普通)，搜查书房 <var name='lastAction' value='搜查'/>";
    expect(matchesExistingChoice(rolled, choices)).toBe(true);
  });
});

describe('resolveButtonMode', () => {
  it('空输入 → advance', () => {
    expect(resolveButtonMode('', choices)).toBe('advance');
  });
  it('斜杠指令 → advance', () => {
    expect(resolveButtonMode('/help', choices)).toBe('advance');
  });
  it('匹配选项 → advance', () => {
    expect(resolveButtonMode('翻阅尘封的旧档案', choices)).toBe('advance');
  });
  it('选项外自定义文字 → rewrite', () => {
    expect(resolveButtonMode('我想点燃这本书', choices)).toBe('rewrite');
  });
});
