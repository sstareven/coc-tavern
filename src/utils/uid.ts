/**
 * 统一的短 ID 生成器。优先 crypto.randomUUID;不可用时降级为「Date.now + 随机串」。
 * prefix 用于区分调用方（regex_/th-/等）便于在持久化数据里一眼看出来源。
 */
export function genUid(prefix = ''): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix ? `${prefix}${crypto.randomUUID()}` : crypto.randomUUID();
  }
  const tail = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}${tail}` : tail;
}
