import { describe, it, expect } from 'vitest';
import { resolveSwipe } from './swipe';

describe('resolveSwipe', () => {
  it('明显向左 → left', () => {
    expect(resolveSwipe(-80, 5)).toBe('left');
  });
  it('明显向右 → right', () => {
    expect(resolveSwipe(80, -10)).toBe('right');
  });
  it('位移不足阈值 → null', () => {
    expect(resolveSwipe(20, 0)).toBeNull();
  });
  it('垂直为主（纵向滚动）→ null', () => {
    expect(resolveSwipe(60, 120)).toBeNull();
  });
  it('自定义阈值生效', () => {
    expect(resolveSwipe(40, 0, { threshold: 30 })).toBe('right');
    expect(resolveSwipe(40, 0, { threshold: 50 })).toBeNull();
  });
});
