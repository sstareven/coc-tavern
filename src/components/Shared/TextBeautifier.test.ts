import { describe, it, expect } from 'vitest';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { beautifyText } from './TextBeautifier';

const ORANGE = '#a35d18';

type SpanProps = { style: CSSProperties; children: ReactNode };
type DialogueSpan = ReactElement<SpanProps>;
type KeywordEl = ReactElement<{ tone?: string; keyword?: string }>;

function nodes(text: string) {
  return beautifyText(text);
}

function findDialogueSpans(out: ReturnType<typeof nodes>): DialogueSpan[] {
  return out.filter(
    (n): n is DialogueSpan =>
      typeof n === 'object' &&
      n !== null &&
      (n as ReactElement).type === 'span' &&
      (n as DialogueSpan).props?.style?.color === ORANGE,
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

  it('对话内部关键词以红色变体(tone=red)渲染', () => {
    const spans = findDialogueSpans(nodes('他说「去过{{阿卡姆}}吗」'));
    expect(spans).toHaveLength(1);
    const children = spans[0].props.children as KeywordEl[];
    const kw = children.find(
      (c) => typeof c === 'object' && c !== null && c.props?.tone === 'red',
    );
    expect(kw).toBeTruthy();
    expect(kw!.props.keyword).toBe('阿卡姆');
  });

  it('对话外的 {{keyword}} 不受影响仍生成 tooltip', () => {
    const out = nodes('我走向{{密斯卡塔尼克大学}}');
    expect(findDialogueSpans(out)).toHaveLength(0);
    expect(out.some((n) => typeof n === 'object' && n !== null)).toBe(true);
  });
});
