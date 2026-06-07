/**
 * DS 缓存优化器(C) —— "看似动态实则稳定"的下沉项前置回收。
 *
 * 背景
 * ====
 * autoSinkDynamicPromptItem + autoDetectDynamicConstant 把"原始模板含动态宏"(`{{getvar}}`、
 * `{{setvar}}`、`{{lastusermessage}}`、`<%...%>` 等) 的 promptItem / lore 条目下沉到
 * dynamicTail，避免污染前缀缓存。
 *
 * 但有些项虽然原始模板含动态宏,**渲染结果跨回合稳定**:
 *   - 注释类 `{{//xxx}}` `{{trim}}`         → 渲染后空字符串
 *   - 未赋值的 `{{getvar::X}}`              → 渲染后空字符串
 *   - 纯赋值 `{{setvar::X::常量}}`          → 渲染后空字符串(setvar 不输出值)
 *   - 引用了"跨回合不变"变量的 getvar/EJS  → 渲染后稳定文本
 *
 * 这些项**被下沉到 dynamicTail 等于白白浪费缓存命中** —— 它们本来可以留在静态前缀里。
 *
 * 方案
 * ====
 * 跨回合记录每项渲染后内容的 hash:
 *   - 首次渲染: 记录 hash,保守留在 dynamicTail (本回合 cache write 反正都 miss,不亏)
 *   - 第 2 回合起: hash 与上回合一致 → 视为稳定,可前置到静态前缀(resolvedFormat 尾部)
 *   - hash 变化 → 视为不稳定,保留在 dynamicTail
 *
 * 不动用户预设内容,纯运行时检测。
 */

// 每会话每项渲染后 hash 缓存(单进程内存,不入库)。
// key = `${sessionId}/${itemKind}/${itemId}`
const renderHashCache = new Map<string, string>();

// 防御性上限: 超过 10k 项就重置(避免无限增长;真实场景 1 会话 ~30 项,远低于此)。
const MAX_HASH_ENTRIES = 10000;

/** djb2 hash —— 字节级稳定,适合检测内容变化(无需密码学强度)。 */
function djb2(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * 检查渲染后内容是否跨回合稳定。
 *
 * @returns true 仅当本次 hash 与上次记录一致(即第 2 次及之后的连续相同渲染)。
 *          首次调用永远返回 false (保守: 没历史样本不视为稳定)。
 */
export function isRenderStable(
  sessionId: string,
  itemKind: string,
  itemId: string,
  content: string,
): boolean {
  if (renderHashCache.size > MAX_HASH_ENTRIES) renderHashCache.clear();
  const key = `${sessionId}/${itemKind}/${itemId}`;
  const hash = djb2(content);
  const prev = renderHashCache.get(key);
  renderHashCache.set(key, hash);
  return prev !== undefined && prev === hash;
}

/** 清空全部 hash 缓存 (测试 / 全局重置)。 */
export function clearRenderHashCache(): void {
  renderHashCache.clear();
}

/** 仅清空某会话的 hash (会话切换时可调,但不调也不影响正确性 —— key 已带 sessionId 隔离)。 */
export function clearSessionRenderHashCache(sessionId: string): void {
  const prefix = `${sessionId}/`;
  for (const key of Array.from(renderHashCache.keys())) {
    if (key.startsWith(prefix)) renderHashCache.delete(key);
  }
}

/** 仅供调试: 返回当前缓存条数。 */
export function getRenderHashCacheSize(): number {
  return renderHashCache.size;
}
