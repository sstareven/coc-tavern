/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RightPage } from './RightPage';

describe('RightPage narration 段', () => {
  afterEach(() => cleanup());

  it('narration 非空 → 渲染每行', () => {
    render(
      <RightPage
        header="测试"
        content="正文"
        choices={[]}
        pageNum=""
        isFlipping={false}
        narration={['Alice 离队而去。', 'Bob 在窗边静坐。']}
      />,
    );
    expect(screen.getByText(/Alice 离队而去/)).toBeTruthy();
    expect(screen.getByText(/Bob 在窗边静坐/)).toBeTruthy();
  });

  it('narration 空 → 不渲染旁白容器', () => {
    const { container } = render(
      <RightPage header="h" content="c" choices={[]} pageNum="" isFlipping={false} />,
    );
    expect(container.querySelector('[data-testid="rp-narration"]')).toBeNull();
  });
});
