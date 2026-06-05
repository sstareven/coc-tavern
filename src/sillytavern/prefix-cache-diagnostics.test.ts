import { afterEach, describe, expect, it } from 'vitest';
import {
  diagnosePrefixDrift,
  clearDiagnosticsFor,
  clearAllDiagnostics,
  getDiagnosticsSnapshot,
  formatDiagnosticLine,
} from './prefix-cache-diagnostics';

afterEach(() => clearAllDiagnostics());

describe('diagnosePrefixDrift', () => {
  it('首次发送 → isFirstSend=true 且 prefixStable=true（记录基线）', () => {
    const r = diagnosePrefixDrift('AAA', 'session-1');
    expect(r.isFirstSend).toBe(true);
    expect(r.prefixStable).toBe(true);
    expect(r.sendCount).toBe(1);
    expect(r.driftCount).toBe(0);
  });

  it('两次相同字节 → prefixStable=true，sendCount 累加，driftCount 不变', () => {
    diagnosePrefixDrift('AAA', 'session-1');
    const r2 = diagnosePrefixDrift('AAA', 'session-1');
    expect(r2.isFirstSend).toBe(false);
    expect(r2.prefixStable).toBe(true);
    expect(r2.sendCount).toBe(2);
    expect(r2.driftCount).toBe(0);
  });

  it('字节漂移 → prefixStable=false，输出 driftPosition + 上下文', () => {
    diagnosePrefixDrift('AAA BBB CCC DDD EEE', 'session-1');
    const r2 = diagnosePrefixDrift('AAA BBB XXX DDD EEE', 'session-1');
    expect(r2.prefixStable).toBe(false);
    expect(r2.driftPosition).toBe(8); // 第一处 X 在 "AAA BBB X" 的下标 8
    expect(r2.prevSnippet).toContain('CCC');
    expect(r2.currSnippet).toContain('XXX');
    expect(r2.driftCount).toBe(1);
    expect(r2.sendCount).toBe(2);
  });

  it('连续多次漂移 → driftCount 持续累加', () => {
    diagnosePrefixDrift('A', 'session-1');
    diagnosePrefixDrift('B', 'session-1');
    diagnosePrefixDrift('C', 'session-1');
    const snap = getDiagnosticsSnapshot('session-1');
    expect(snap?.sendCount).toBe(3);
    expect(snap?.driftCount).toBe(2);
  });

  it('会话隔离：不同 sessionId 独立计数', () => {
    diagnosePrefixDrift('A', 'session-1');
    diagnosePrefixDrift('B', 'session-1');
    const r = diagnosePrefixDrift('Z', 'session-2');
    expect(r.isFirstSend).toBe(true);
    expect(r.sendCount).toBe(1);
    expect(getDiagnosticsSnapshot('session-1')?.sendCount).toBe(2);
  });

  it('clearDiagnosticsFor 清单个会话', () => {
    diagnosePrefixDrift('A', 'session-1');
    diagnosePrefixDrift('B', 'session-1');
    clearDiagnosticsFor('session-1');
    const r = diagnosePrefixDrift('A', 'session-1');
    expect(r.isFirstSend).toBe(true);
  });

  it('启发式段定位：driftPosition 落在 wbBefore 区间 → suspectedSegment=wbBefore', () => {
    const offsets = { systemPrompt: 0, wbBefore: 100, processedFormat: 200, wbAfter: 300 };
    const a = 'a'.repeat(150) + 'X' + 'a'.repeat(150);
    const b = 'a'.repeat(150) + 'Y' + 'a'.repeat(150);
    diagnosePrefixDrift(a, 'session-1', offsets);
    const r = diagnosePrefixDrift(b, 'session-1', offsets);
    expect(r.driftPosition).toBe(150);
    expect(r.suspectedSegment).toBe('wbBefore');
  });

  it('启发式段定位：driftPosition 落在 processedFormat 区间 → suspectedSegment=processedFormat', () => {
    const offsets = { systemPrompt: 0, wbBefore: 100, processedFormat: 200, wbAfter: 300 };
    const a = 'a'.repeat(250) + 'X';
    const b = 'a'.repeat(250) + 'Y';
    diagnosePrefixDrift(a, 'session-1', offsets);
    const r = diagnosePrefixDrift(b, 'session-1', offsets);
    expect(r.suspectedSegment).toBe('processedFormat');
  });

  it('启发式段定位：offsets 未给 → suspectedSegment=unknown', () => {
    diagnosePrefixDrift('AAA', 'session-1');
    const r = diagnosePrefixDrift('BBB', 'session-1');
    expect(r.suspectedSegment).toBe('unknown');
  });

  it('formatDiagnosticLine 三态产出可读字符串', () => {
    expect(formatDiagnosticLine({ isFirstSend: true, prefixStable: true, sendCount: 1, driftCount: 0, driftBySegment: {} }))
      .toContain('首次发送');
    expect(formatDiagnosticLine({ isFirstSend: false, prefixStable: true, sendCount: 5, driftCount: 1, driftBySegment: { wbBefore: 1 } }))
      .toContain('稳定');
    const drift = formatDiagnosticLine({
      isFirstSend: false, prefixStable: false, sendCount: 5, driftCount: 1,
      driftPosition: 42, prevSnippet: 'old text', currSnippet: 'new text', suspectedSegment: 'wbBefore',
      driftBySegment: { wbBefore: 1 },
    });
    expect(drift).toContain('漂移');
    expect(drift).toContain('wbBefore');
    expect(drift).toContain('old text');
    expect(drift).toContain('new text');
  });

  it('driftBySegment 多次漂移按段累计 + 日志输出分布', () => {
    const offsets = { systemPrompt: 0, wbBefore: 100, processedFormat: 200, wbAfter: 300 };
    const a = 'X'.repeat(50);                              // systemPrompt 段
    const b = 'Y'.repeat(100);                             // wbBefore 段
    const c = 'Z'.repeat(150);                             // processedFormat 段
    diagnosePrefixDrift(a + b + c, 'session-seg', offsets);  // baseline
    // 第二次：wbBefore 段变 → driftBySegment 应记 wbBefore=1
    const r1 = diagnosePrefixDrift(a + 'Y'.repeat(99) + 'Z' + c, 'session-seg', offsets);
    expect(r1.prefixStable).toBe(false);
    expect(r1.driftBySegment.wbBefore).toBe(1);
    // 第三次：wbBefore 段又变（与第二次比） → driftBySegment.wbBefore 应累计到 2
    const r2 = diagnosePrefixDrift(a + 'Y'.repeat(98) + 'ZZ' + c, 'session-seg', offsets);
    expect(r2.prefixStable).toBe(false);
    expect(r2.driftBySegment.wbBefore).toBe(2);
    // 稳定一次：driftBySegment 不变化、仍随结果带出
    const r3 = diagnosePrefixDrift(a + 'Y'.repeat(98) + 'ZZ' + c, 'session-seg', offsets);
    expect(r3.prefixStable).toBe(true);
    expect(r3.driftBySegment.wbBefore).toBe(2);
    // formatDiagnosticLine 输出段分布
    const line = formatDiagnosticLine(r3);
    expect(line).toContain('wbBefore=2');
  });
});
