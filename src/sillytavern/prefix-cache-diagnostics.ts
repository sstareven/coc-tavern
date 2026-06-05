/**
 * 前缀缓存漂移诊断器 —— 借鉴 claude-code-best 的 PROMPT_CACHE_BREAK_DETECTION（feature flag）。
 *
 * 原理：DeepSeek 隐式前缀缓存按"逐字节最长公共前缀"匹配；任何静态前缀里的【一字节】变化
 * 都会让缓存边界点前移、之后所有内容按未命中计费。本模块跨回合保存"理论应该稳定"的静态前缀
 * 内容，本回合发送前对比，找出第一处字节差异及其前后 80 字符上下文——让用户自助定位污染源。
 *
 * 用法：
 *   const result = diagnosePrefixDrift(staticPrefix, sessionId);
 *   if (!result.prefixStable) {
 *     // 用 result.driftPosition / prevSnippet / currSnippet 输出诊断报告
 *   }
 *   // 函数自动用本次 staticPrefix 覆盖上次快照，下回合继续诊断
 *
 * 会话隔离：sessionId 通常用 useChatStore.activeId。会话切换由调用方负责调 clearDiagnosticsFor。
 */

export interface PrefixDiagnosticResult {
  /** 首次发送（无上回合快照对比）→ 默认认为 stable */
  isFirstSend: boolean;
  /** 静态前缀字节是否相等 */
  prefixStable: boolean;
  /** 累计在本会话内已发生的漂移次数（含本次） */
  driftCount: number;
  /** 本会话内总发送次数 */
  sendCount: number;
  /** 第一处字节差异位置（仅 prefixStable=false 时有） */
  driftPosition?: number;
  /** 上回合在 driftPosition 附近的 80 字符上下文 */
  prevSnippet?: string;
  /** 本回合在 driftPosition 附近的 80 字符上下文 */
  currSnippet?: string;
  /** 启发式定位漂移源：根据 driftPosition 落在哪个 segment marker 范围 */
  suspectedSegment?: 'systemPrompt' | 'wbBefore' | 'processedFormat' | 'wbAfter' | 'unknown';
  /**
   * 累计每个段的漂移次数（按 suspectedSegment 分桶）。让用户/排查者在每条日志里都能
   * 看到「累计漂移 1/6（wbBefore=1）」之类的细化分布，下次再漂时知道针对哪段排查。
   * 稳定日志里也有（沿用上次状态），方便长会话累积观察。
   */
  driftBySegment: Record<string, number>;
}

interface DiagnosticState {
  /** 上回合静态前缀完整内容 */
  prefix: string;
  /** 本会话累计发送次数 */
  sendCount: number;
  /** 本会话累计漂移次数 */
  driftCount: number;
  /** 用于 suspectedSegment 启发式定位：调用方提供的 segment offset 表 */
  segmentOffsets?: Record<string, number>;
  /**
   * 累计每个段的漂移次数。给 formatDiagnosticLine 加段分布，让用户/排查者一眼看出
   * 「累计漂移 1/6」里那 1 次是哪段污染。键来自 PrefixDiagnosticResult.suspectedSegment。
   */
  driftBySegment: Record<string, number>;
}

const stateBySession = new Map<string, DiagnosticState>();

/** 上下文窗口：差异点前后各 ~40 字符（共 80）。 */
const WINDOW = 40;

/** 主诊断入口。本会话首次发送 → 记录基线返回 isFirstSend=true；后续发送 → 对比上回合给出 drift 详情。 */
export function diagnosePrefixDrift(
  staticPrefix: string,
  sessionId: string,
  segmentOffsets?: Record<string, number>,
): PrefixDiagnosticResult {
  const prev = stateBySession.get(sessionId);
  if (!prev) {
    stateBySession.set(sessionId, {
      prefix: staticPrefix,
      sendCount: 1,
      driftCount: 0,
      segmentOffsets,
      driftBySegment: {},
    });
    return { isFirstSend: true, prefixStable: true, driftCount: 0, sendCount: 1, driftBySegment: {} };
  }

  const nextSendCount = prev.sendCount + 1;
  if (prev.prefix === staticPrefix) {
    stateBySession.set(sessionId, {
      prefix: staticPrefix,
      sendCount: nextSendCount,
      driftCount: prev.driftCount,
      segmentOffsets,
      driftBySegment: prev.driftBySegment,
    });
    return {
      isFirstSend: false,
      prefixStable: true,
      driftCount: prev.driftCount,
      sendCount: nextSendCount,
      driftBySegment: prev.driftBySegment,
    };
  }

  // 找第一处字节差异
  let i = 0;
  const minLen = Math.min(prev.prefix.length, staticPrefix.length);
  while (i < minLen && prev.prefix.charCodeAt(i) === staticPrefix.charCodeAt(i)) i++;

  const prevSnippet = prev.prefix.slice(
    Math.max(0, i - WINDOW),
    Math.min(prev.prefix.length, i + WINDOW),
  );
  const currSnippet = staticPrefix.slice(
    Math.max(0, i - WINDOW),
    Math.min(staticPrefix.length, i + WINDOW),
  );

  // 启发式定位：根据 segmentOffsets 判断 i 落在哪个 segment 区间内
  const suspectedSegment = inferSegment(i, segmentOffsets);

  const nextDriftCount = prev.driftCount + 1;
  // 累加按段分布：让 formatDiagnosticLine 在稳定/漂移日志里都能输出 driftBySegment={wbBefore:1, ...}
  const segKey = suspectedSegment ?? 'unknown';
  const nextDriftBySegment = { ...prev.driftBySegment, [segKey]: (prev.driftBySegment[segKey] ?? 0) + 1 };
  stateBySession.set(sessionId, {
    prefix: staticPrefix,
    sendCount: nextSendCount,
    driftCount: nextDriftCount,
    segmentOffsets,
    driftBySegment: nextDriftBySegment,
  });

  return {
    isFirstSend: false,
    prefixStable: false,
    driftCount: nextDriftCount,
    sendCount: nextSendCount,
    driftPosition: i,
    prevSnippet,
    currSnippet,
    suspectedSegment,
    driftBySegment: nextDriftBySegment,
  };
}

/** 启发式段定位：给定 segmentOffsets={systemPrompt: 0, wbBefore: 1500, processedFormat: 3000, wbAfter: 4200}，
 *  返回 driftPosition 落在哪个段。 */
function inferSegment(
  pos: number,
  offsets: Record<string, number> | undefined,
): PrefixDiagnosticResult['suspectedSegment'] {
  if (!offsets) return 'unknown';
  const entries = Object.entries(offsets).sort((a, b) => a[1] - b[1]);
  let suspect: string = 'unknown';
  for (const [name, offset] of entries) {
    if (pos >= offset) suspect = name;
    else break;
  }
  return suspect as PrefixDiagnosticResult['suspectedSegment'];
}

/** 切会话时调；释放上回合快照。 */
export function clearDiagnosticsFor(sessionId: string): void {
  stateBySession.delete(sessionId);
}

/** 重置全部诊断状态（测试用 / 全局新游戏用）。 */
export function clearAllDiagnostics(): void {
  stateBySession.clear();
}

/** 累计统计（不修改状态），用于 stats 面板等。 */
export function getDiagnosticsSnapshot(sessionId: string): {
  sendCount: number;
  driftCount: number;
  hitRate: number; // 1 - drift/send
  driftBySegment: Record<string, number>;
} | null {
  const s = stateBySession.get(sessionId);
  if (!s) return null;
  return {
    sendCount: s.sendCount,
    driftCount: s.driftCount,
    hitRate: s.sendCount > 0 ? 1 - s.driftCount / s.sendCount : 1,
    driftBySegment: s.driftBySegment,
  };
}

/** 格式化诊断结果为可读单行（适合 pushLog/console.log）。 */
export function formatDiagnosticLine(r: PrefixDiagnosticResult): string {
  // 把 driftBySegment 渲染成 「wbBefore=1, wbAfter=0」 简洁后缀。空 map 时不显示。
  const segDist = Object.keys(r.driftBySegment).length > 0
    ? `，按段分布 {${Object.entries(r.driftBySegment).map(([k, v]) => `${k}=${v}`).join(', ')}}`
    : '';
  if (r.isFirstSend) return `[cache-diag] 首次发送，记录基线 (会话内 #${r.sendCount})`;
  if (r.prefixStable) {
    return `[cache-diag] 静态前缀稳定 ✓ (会话内 #${r.sendCount}，累计漂移 ${r.driftCount}/${r.sendCount - 1}${segDist})`;
  }
  return (
    `[cache-diag] ⚠️ 静态前缀漂移 (会话内 #${r.sendCount}，累计 ${r.driftCount}/${r.sendCount - 1}${segDist})\n` +
    `  位置: 字节 ${r.driftPosition} (疑似来自 ${r.suspectedSegment ?? 'unknown'} 段)\n` +
    `  上回合: ...${(r.prevSnippet ?? '').replace(/\n/g, '⏎')}...\n` +
    `  本回合: ...${(r.currSnippet ?? '').replace(/\n/g, '⏎')}...`
  );
}
