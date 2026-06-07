import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRenderStable,
  clearRenderHashCache,
  clearSessionRenderHashCache,
  getRenderHashCacheSize,
} from './deepseek-cache-stable-sink';

describe('deepseek-cache-stable-sink', () => {
  beforeEach(() => {
    clearRenderHashCache();
  });

  it('首次调用永远返回 false(无历史样本,保守视为不稳定)', () => {
    expect(isRenderStable('s1', 'pi', 'a', 'hello')).toBe(false);
    expect(isRenderStable('s1', 'pi', 'b', '')).toBe(false);
  });

  it('第 2 次调用且内容一致 → true(稳定)', () => {
    isRenderStable('s1', 'pi', 'a', 'hello');
    expect(isRenderStable('s1', 'pi', 'a', 'hello')).toBe(true);
    expect(isRenderStable('s1', 'pi', 'a', 'hello')).toBe(true);
  });

  it('内容变化 → false,并更新 hash(下回合若再次稳定就 true)', () => {
    isRenderStable('s1', 'pi', 'a', 'hello');
    expect(isRenderStable('s1', 'pi', 'a', 'world')).toBe(false);
    expect(isRenderStable('s1', 'pi', 'a', 'world')).toBe(true);
  });

  it('不同 sessionId 互相隔离', () => {
    isRenderStable('s1', 'pi', 'a', 'hello');
    expect(isRenderStable('s2', 'pi', 'a', 'hello')).toBe(false);
    expect(isRenderStable('s2', 'pi', 'a', 'hello')).toBe(true);
    expect(isRenderStable('s1', 'pi', 'a', 'hello')).toBe(true);
  });

  it('不同 itemKind / itemId 互相隔离', () => {
    isRenderStable('s1', 'pi', 'a', 'x');
    isRenderStable('s1', 'pi', 'b', 'x');
    isRenderStable('s1', 'lore', 'a', 'x');
    expect(isRenderStable('s1', 'pi', 'a', 'x')).toBe(true);
    expect(isRenderStable('s1', 'pi', 'b', 'x')).toBe(true);
    expect(isRenderStable('s1', 'lore', 'a', 'x')).toBe(true);
    expect(isRenderStable('s1', 'pi', 'c', 'x')).toBe(false);
  });

  it('空字符串也算有效内容(setvar 渲染后空 → 稳定)', () => {
    isRenderStable('s1', 'pi', 'setvar1', '');
    expect(isRenderStable('s1', 'pi', 'setvar1', '')).toBe(true);
  });

  it('clearSessionRenderHashCache 只清指定会话', () => {
    isRenderStable('s1', 'pi', 'a', 'x');
    isRenderStable('s2', 'pi', 'a', 'x');
    clearSessionRenderHashCache('s1');
    expect(isRenderStable('s1', 'pi', 'a', 'x')).toBe(false); // 被清,首次
    expect(isRenderStable('s2', 'pi', 'a', 'x')).toBe(true);  // 保留
  });

  it('clearRenderHashCache 全清', () => {
    isRenderStable('s1', 'pi', 'a', 'x');
    isRenderStable('s2', 'pi', 'a', 'x');
    clearRenderHashCache();
    expect(getRenderHashCacheSize()).toBe(0);
  });

  it('lastusermessage 类型场景: 每次内容不同 → 永远 false', () => {
    isRenderStable('s1', 'pi', 'lastmsg', '玩家输入第 1 回合');
    expect(isRenderStable('s1', 'pi', 'lastmsg', '玩家输入第 2 回合')).toBe(false);
    expect(isRenderStable('s1', 'pi', 'lastmsg', '玩家输入第 3 回合')).toBe(false);
  });

  it('看似动态实则稳定场景: 含 {{getvar::未赋值}} 渲染后空 → 第 2 次稳定', () => {
    // 模拟 pi_31bce69e: `嘿嘿... {{getvar::大总结模式}}{{getvar::AI对线}} ...`
    // 渲染后两个 getvar 都是空字符串,实际内容稳定
    const rendered = '嘿嘿,要求阅读完毕!起笔!\n\n<!-- 1·思考开始 -->';
    isRenderStable('s1', 'pi', 'pi_31bce69e', rendered);
    expect(isRenderStable('s1', 'pi', 'pi_31bce69e', rendered)).toBe(true);
    expect(isRenderStable('s1', 'pi', 'pi_31bce69e', rendered)).toBe(true);
  });
});
