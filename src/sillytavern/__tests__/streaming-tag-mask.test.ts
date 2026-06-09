import { describe, it, expect } from 'vitest';
import { StreamingTagMask } from '../streaming-tag-mask';

describe('StreamingTagMask', () => {
  function feedAll(m: StreamingTagMask, s: string) {
    const events = [];
    for (const ch of s) events.push(...m.feed(ch));
    return events;
  }

  it('普通字符 emit visibleChar', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '调查员');
    const chars = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(chars).toBe('调查员');
  });

  it('<kw>词</kw>:tag 字符不可见,内容 visibleChar,且 emit openKw/closeKw', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a<kw>词</kw>b');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('a词b');
    expect(events.some((e) => e.kind === 'openKw')).toBe(true);
    expect(events.some((e) => e.kind === 'closeKw')).toBe(true);
  });

  it('<san id="p1"/>:自闭合,emit sanBubble(id="p1"),tag 字符不可见', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '正文<san id="p1"/>后续');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('正文后续');
    const sanEvents = events.filter((e) => e.kind === 'sanBubble');
    expect(sanEvents.length).toBe(1);
    expect((sanEvents[0] as { id: string }).id).toBe('p1');
  });

  it('<thinking>:进入后字符全隐藏,直到 </thinking>', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '前<thinking>推演内容</thinking>后');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('前后');
  });

  it('<UpdateVariable>...</UpdateVariable>:进入后字符全隐藏', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '前<UpdateVariable>[补丁]</UpdateVariable>后');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('前后');
  });

  it('孤立 </kw>(无 <kw>) 不崩,作为可见字符或静默吞掉', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a</kw>b');
    // 静默吞掉孤立闭合标签(更接近 stripOrphanKwTags 精神)
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('ab');
  });

  it('未识别的标签(如 <abc>)原文透传为 visibleChar', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, 'a<abc>x</abc>b');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('a<abc>x</abc>b');
  });

  it('kw 段超过 30 字未闭合 → 强行 closeKw(spec § 6 边界硬约束)', () => {
    const m = new StreamingTagMask();
    const longText = '正常字'.repeat(15); // 45 字
    const events = feedAll(m, `<kw>${longText}`);
    const closeCount = events.filter((e) => e.kind === 'closeKw').length;
    expect(closeCount).toBeGreaterThanOrEqual(1);
  });

  it('支持逐字符跨多次 feed 调用 — 状态机 instance 字段保持', () => {
    const m = new StreamingTagMask();
    // 标签拆成多段 feed
    const events = [
      ...m.feed('<'),
      ...m.feed('k'),
      ...m.feed('w'),
      ...m.feed('>'),
      ...m.feed('词'),
      ...m.feed('<'),
      ...m.feed('/'),
      ...m.feed('k'),
      ...m.feed('w'),
      ...m.feed('>'),
    ];
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词');
    expect(events.some((e) => e.kind === 'openKw')).toBe(true);
    expect(events.some((e) => e.kind === 'closeKw')).toBe(true);
  });

  // 回归(2026-06-10):用户报告流式生成时正文偶尔露出 `</k` —— 标签 chunk 边界 + 畸形闭合
  // 多条泄露通道,确保 mask 这一层不再回放 `</k...` 为 visibleChar。

  it('回归:畸形闭合 `</ kw>` 内含空格 → 静默丢弃,不露 `</`', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '词</ kw>余');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词余');
    expect(visible).not.toContain('<');
    expect(visible).not.toContain('/');
  });

  it('回归:畸形闭合 `</kw\\n>` 内含换行 → 静默丢弃', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '<kw>词</kw\n>余');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词余');
    expect(visible).not.toContain('<');
  });

  it('回归:畸形开启 `< kw >` 内含空格 → 仍识别为 openKw,不露 `<`', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '前< kw >词</kw>后');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('前词后');
    expect(events.some((e) => e.kind === 'openKw')).toBe(true);
    expect(events.some((e) => e.kind === 'closeKw')).toBe(true);
  });

  it('回归:tagBuf 超 64 字符仍无 `>` → 静默丢弃,不露 `</k`', () => {
    const m = new StreamingTagMask();
    // `</kw` 接 70 个 ASCII 字符仍无 `>`,模拟 LLM 漏写或畸形输出
    const events = feedAll(m, '</kw' + 'a'.repeat(70));
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).not.toContain('<');
    expect(visible).not.toContain('</k');
  });

  it('回归:近似 kw 的未识别标签(`/kx` 之类)静默丢弃,不露 `</`', () => {
    const m = new StreamingTagMask();
    const events = feedAll(m, '词</kx>余');
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词余');
  });

  it('回归:半截 `</k` 流终止 + finish() → 不露 `</k`', () => {
    const m = new StreamingTagMask();
    const events = [
      ...feedAll(m, '词</k'),
      ...m.finish(),
    ];
    const visible = events.filter((e) => e.kind === 'visibleChar').map((e) => (e as { ch: string }).ch).join('');
    expect(visible).toBe('词');
  });
});
