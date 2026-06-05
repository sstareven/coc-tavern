import { describe, it, expect } from 'vitest';
import { buildChoiceInput, cleanChoiceText, hasCheckMarker } from '../choice-input-builder';
import type { ChoiceItem } from '../../../types';

function ch(text: string, action: string, num = '1'): ChoiceItem {
  return { num, text, action };
}

describe('cleanChoiceText', () => {
  it('剥 [检定:XX 难度] 前缀', () => {
    expect(cleanChoiceText('[检定:聆听 普通] 倾听门外')).toBe('倾听门外');
  });
  it('剥裸难度文字', () => {
    expect(cleanChoiceText('翻找抽屉(普通难度)')).toBe('翻找抽屉');
  });
  it('压缩连续空白 + trim', () => {
    expect(cleanChoiceText('  翻找   抽屉  ')).toBe('翻找 抽屉');
  });
});

describe('hasCheckMarker', () => {
  it('「进行XX检定(普通)」识别为检定', () => {
    expect(hasCheckMarker('进行聆听检定(普通)')).toBe(true);
    expect(hasCheckMarker('进行图书馆使用检定(困难)')).toBe(true);
  });
  it('「进行XX对抗(对手目标值:NN)」识别为对抗（仍属检定）', () => {
    expect(hasCheckMarker('进行力量对抗(对手目标值:45)')).toBe(true);
  });
  it('「[检定:XX 难度]」识别', () => {
    expect(hasCheckMarker('[检定:聆听 普通]')).toBe(true);
  });
  it('「进行XX检定」无括号兜底识别', () => {
    expect(hasCheckMarker('进行聆听检定，仔细听')).toBe(true);
  });
  it('纯叙事行动不被识别', () => {
    expect(hasCheckMarker('翻找抽屉')).toBe(false);
    expect(hasCheckMarker('打开木箱查看化石')).toBe(false);
    expect(hasCheckMarker('暂时离开地下室')).toBe(false);
  });
});

describe('buildChoiceInput — 检定选项 input 只用 text', () => {
  it('用户的真实失败 case—text 末尾 ？ + action 含「进行聆听检定」 → 只返回 text', () => {
    const c = ch(
      '侧耳倾听屋内的动静——除了老人之外，还有别的呼吸声吗？',
      '进行聆听检定(普通)，侧耳倾听屋内动静',
    );
    // 旧行为: "...呼吸声吗？。进行聆听检定(普通)，侧耳倾听屋内动静" — 双标点 + 描述重复
    // 新行为: 只用 text — 检定标记由顶部 [skill d100=NN/T 结果] 行携带
    expect(buildChoiceInput(c)).toBe('侧耳倾听屋内的动静——除了老人之外，还有别的呼吸声吗？');
  });

  it('一般检定选项 → text 即 input', () => {
    const c = ch('翻找抽屉里的旧信件', '进行图书馆使用检定(普通)');
    expect(buildChoiceInput(c)).toBe('翻找抽屉里的旧信件');
  });

  it('对抗检定选项 → text 即 input', () => {
    const c = ch('与守卫扭打', '进行力量对抗(对手目标值:55)');
    expect(buildChoiceInput(c)).toBe('与守卫扭打');
  });

  it('检定选项 text 为空 → fallback 用 action（不能没东西喂 LLM）', () => {
    const c = ch('', '进行聆听检定(普通)，仔细听');
    expect(buildChoiceInput(c)).toBe('进行聆听检定(普通)，仔细听');
  });
});

describe('buildChoiceInput — 非检定选项保留 text+action 合并语义', () => {
  it('action 已含 text → 只返回 action', () => {
    const c = ch('翻找抽屉', '翻找抽屉里的旧信件');
    expect(buildChoiceInput(c)).toBe('翻找抽屉里的旧信件');
  });

  it('text 末尾无标点 → 「t。a」加句号衔接', () => {
    const c = ch('打开木箱', '搬开杂物');
    expect(buildChoiceInput(c)).toBe('打开木箱。搬开杂物');
  });

  it('text 末尾是句号 → 「ta」不加双标点', () => {
    const c = ch('打开木箱。', '搬开杂物');
    expect(buildChoiceInput(c)).toBe('打开木箱。搬开杂物');
  });

  it('text 末尾是问号 → 「ta」不加双标点', () => {
    const c = ch('谁在里面？', '推门进去');
    expect(buildChoiceInput(c)).toBe('谁在里面？推门进去');
  });

  it('text 末尾是感叹号 → 不加双标点', () => {
    const c = ch('快跑！', '冲向门口');
    expect(buildChoiceInput(c)).toBe('快跑！冲向门口');
  });

  it('text 末尾是省略号 → 不加双标点', () => {
    const c = ch('他迟疑着……', '最终上前一步');
    expect(buildChoiceInput(c)).toBe('他迟疑着……最终上前一步');
  });

  it('text 末尾是破折号 → 不加双标点', () => {
    const c = ch('他想说什么——', '却被打断了');
    expect(buildChoiceInput(c)).toBe('他想说什么——却被打断了');
  });

  it('text 为空 → 用 action', () => {
    const c = ch('', '搬开杂物');
    expect(buildChoiceInput(c)).toBe('搬开杂物');
  });

  it('action 为空 → 用 text', () => {
    const c = ch('翻找抽屉', '');
    expect(buildChoiceInput(c)).toBe('翻找抽屉');
  });

  it('双空 → 空串', () => {
    expect(buildChoiceInput(ch('', ''))).toBe('');
  });
});
