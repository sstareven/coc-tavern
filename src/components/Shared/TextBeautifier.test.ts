import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { beautifyText } from './TextBeautifier';

const ORANGE = '#e8a040';

function nodes(text: string) {
  return beautifyText(text);
}

function findDialogueSpans(out: ReturnType<typeof nodes>): ReactElement[] {
  return out.filter(
    (n): n is ReactElement =>
      typeof n === 'object' &&
      n !== null &&
      (n as ReactElement).type === 'span' &&
      (n as ReactElement).props?.style?.color === ORANGE,
  );
}

describe('beautifyText — 对话橘色高亮', () => {
  it('「」对话包成橘色 span', () => {
    const spans = findDialogueSpans(nodes('他低声说「主人终将归来」，随即转身'));
    expect(spans).toHaveLength(1);
    expect(spans[0].props.children).toEqual(['「主人终将归来」']);
  });

  it('对话 span 带暗色辉光 textShadow 提升对比', () => {
    const spans = findDialogueSpans(nodes('他说「快走」'));
    expect(spans[0].props.style.textShadow).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  it('中文弯引号 “” 也高亮', () => {
    const spans = findDialogueSpans(nodes('扉页写着“深渊”二字'));
    expect(spans).toHaveLength(1);
    expect(spans[0].props.children).toEqual(['“深渊”']);
  });

  it('『』与 ASCII "" 均高亮', () => {
    expect(findDialogueSpans(nodes('牌匾上刻着『沃特雷』'))).toHaveLength(1);
    expect(findDialogueSpans(nodes('他喊道"快跑"'))).toHaveLength(1);
  });

  it('一段里多句对话各自高亮', () => {
    const spans = findDialogueSpans(nodes('「你来了」她说，「别再回头」'));
    expect(spans).toHaveLength(2);
  });

  it('无对话时原样返回纯文本', () => {
    expect(nodes('阿卡姆的街道笼在死寂里')).toEqual(['阿卡姆的街道笼在死寂里']);
  });

  it('对话内部仍解析 {{keyword}}', () => {
    const spans = findDialogueSpans(nodes('他说「去过{{阿卡姆}}吗」'));
    expect(spans).toHaveLength(1);
    const children = spans[0].props.children as unknown[];
    // 应含一个 KeywordTooltip 元素（非纯字符串）
    expect(children.some((c) => typeof c === 'object' && c !== null)).toBe(true);
  });

  it('对话外的 {{keyword}} 不受影响仍生成 tooltip', () => {
    const out = nodes('我走向{{密斯卡塔尼克大学}}');
    expect(findDialogueSpans(out)).toHaveLength(0);
    expect(out.some((n) => typeof n === 'object' && n !== null)).toBe(true);
  });
});
