/**
 * DS 缓存优化器(C) —— "看似动态实则稳定"的下沉项前置回收。
 *
 * 背景
 * ====
 * autoSinkDynamicPromptItem + autoDetectDynamicConstant 把"原始模板含动态宏"(`{{getvar}}`、
 * `{{setvar}}`、`{{lastusermessage}}`、`<%...%>` 等) 的 promptItem / lore 条目下沉到
 * dynamicTail,避免污染前缀缓存。
 *
 * 但有些项虽然原始模板含动态宏,**渲染结果跨回合稳定**:
 *   - 注释类 `{{//xxx}}` `{{trim}}`         → 渲染后空字符串
 *   - 未赋值的 `{{getvar::X}}`              → 渲染后空字符串
 *   - 纯赋值 `{{setvar::X::常量}}`          → 渲染后空字符串(setvar 不输出值)
 *   - 引用了"跨回合不变"变量的 getvar/EJS  → 渲染后稳定文本
 *
 * 这些项**被下沉到 dynamicTail 等于白白浪费缓存命中** —— 它们本来可以留在静态前缀里。
 *
 * 方案 (v2 滞回)
 * ====
 * 跨回合记录每项渲染后内容的 hash + 命中/失配 streak,带滞回防抖:
 *   - 首次渲染: 记录 hash,保守视为不稳定 (本回合 cache write 反正都 miss)
 *   - 连续 STABLE_HITS_REQUIRED (=2) 次 hash 一致 → 入选稳定,前置静态前缀
 *   - 已稳定项: 即便偶发 hash 失配也保留稳定标记,直到连续 UNSTABLE_MISS_TO_EVICT (=2)
 *     次失配才解锁 → 集合不会在边界来回抖动
 *
 * 为何要滞回:
 *   旧版「单次 hash 命中即入选」会让 N 个项在同一回合整组迁移到静态前缀,造成 processedFormat
 *   段单次暴增 → 缓存命中率从 99% 跌到 49%。更严重的是含 `{{lastusermessage}}` 类动态宏的项
 *   会在「入选/踢出」边界每回合反复抖动 → 集合每回合不同 → 命中率持续衰减到 32%。
 *   滞回把「集合振荡」消除,使中长程命中率稳定在 85%+。
 *
 * 不动用户预设内容,纯运行时检测。
 */

// 入选门槛: 需 STABLE_HITS_REQUIRED 次连续 hash 一致才视为稳定。
// 默认 2 = 第 N+1 次渲染时 hash 与第 N 次一致即入选 (保留旧版灵敏度,避免推迟太久)。
const STABLE_HITS_REQUIRED = 2;

// 解锁门槛: 已稳定项需连续 UNSTABLE_MISS_TO_EVICT 次 hash 失配才解除稳定标记 (滞回防抖)。
// 默认 2 = 单次偶发不一致不踢出,防止 lastusermessage 等动态宏在边界反复进出集合。
const UNSTABLE_MISS_TO_EVICT = 2;

interface RenderHashEntry {
  hash: string;        // 最近一次渲染结果的 hash
  hitStreak: number;   // 当前 hash 的连续命中次数 (含本次)
  missStreak: number;  // 自上次稳定以来的连续失配次数
  stable: boolean;     // 当前是否被视为稳定 (滞回锁定状态)
}

// 每会话每项渲染后状态缓存(单进程内存,不入库)。
// key = `${sessionId}/${itemKind}/${itemId}`
const renderHashCache = new Map<string, RenderHashEntry>();

// 防御性上限: 超过 10k 项就重置(避免无限增长;真实场景 1 会话 ~30 项,远低于此)。
const MAX_HASH_ENTRIES = 10000;

// ── sessionStorage 持久化 ──────────────────────────────────────────
const STORAGE_PREFIX = '__ds_render_hash__';

// 已从 sessionStorage 恢复过的 sessionId 集合(避免重复读取)。
const restoredSessions = new Set<string>();

// 脏标记 + debounce: 记录哪些 sessionId 有待写回,300ms 内合并。
const dirtySessions = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY = 300;

/** 安全读 sessionStorage (隐身模式/满时 fallback 纯内存)。 */
function ssGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
/** 安全写 sessionStorage。 */
function ssSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* silent */ }
}
/** 安全删 sessionStorage。 */
function ssRemove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* silent */ }
}

/** 从 sessionStorage 恢复指定 session 的条目到内存 Map (仅首次)。 */
function restoreSession(sessionId: string): void {
  if (restoredSessions.has(sessionId)) return;
  restoredSessions.add(sessionId);
  const raw = ssGet(`${STORAGE_PREFIX}${sessionId}`);
  if (!raw) return;
  try {
    const entries: [string, RenderHashEntry][] = JSON.parse(raw);
    for (const [k, v] of entries) {
      // 只恢复该 session 的 key,且不覆盖内存中已有的更新值
      if (k.startsWith(`${sessionId}/`) && !renderHashCache.has(k)) {
        renderHashCache.set(k, v);
      }
    }
  } catch {
    // JSON 坏了 → 清掉
    ssRemove(`${STORAGE_PREFIX}${sessionId}`);
  }
}

/** 把指定 session 的内存条目写回 sessionStorage。 */
function persistSession(sessionId: string): void {
  const prefix = `${sessionId}/`;
  const entries: [string, RenderHashEntry][] = [];
  for (const [k, v] of renderHashCache.entries()) {
    if (k.startsWith(prefix)) entries.push([k, v]);
  }
  if (entries.length === 0) {
    ssRemove(`${STORAGE_PREFIX}${sessionId}`);
  } else {
    ssSet(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(entries));
  }
}

/** 标记 session 为脏,调度 debounce 写入。 */
function markDirty(sessionId: string): void {
  dirtySessions.add(sessionId);
  if (flushTimer === null) {
    flushTimer = setTimeout(flushDirty, FLUSH_DELAY);
  }
}

/** 批量写入所有脏 session。 */
function flushDirty(): void {
  flushTimer = null;
  for (const sid of dirtySessions) {
    persistSession(sid);
  }
  dirtySessions.clear();
}

// 页面关闭/刷新前同步 flush,防止最后 300ms 内的脏数据丢失。
// sessionStorage.setItem 是同步的,beforeunload handler 中可安全执行。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushDirty();
  });
}

/** djb2 hash —— 字节级稳定,适合检测内容变化(无需密码学强度)。 */
function djb2(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * 检查渲染后内容是否跨回合稳定(带滞回防抖)。
 *
 * 行为:
 *   - 首次调用: 记录 hash,返回 false (无样本不算稳定)
 *   - hash 与上次一致: hitStreak +1; 达到 STABLE_HITS_REQUIRED 时入选 stable=true
 *   - hash 失配: 若当前 stable=true,允许连续 UNSTABLE_MISS_TO_EVICT-1 次失配仍返回 true;
 *               累积失配≥ UNSTABLE_MISS_TO_EVICT 才解锁返回 false
 *
 * @returns 当前回合是否视为稳定。
 */
export function isRenderStable(
  sessionId: string,
  itemKind: string,
  itemId: string,
  content: string,
): boolean {
  if (renderHashCache.size > MAX_HASH_ENTRIES) {
    renderHashCache.clear();
    restoredSessions.clear(); // 允许后续 restoreSession 从 sessionStorage 重新加载
  }

  // 首次遇到该 session 时尝试从 sessionStorage 恢复
  restoreSession(sessionId);

  const key = `${sessionId}/${itemKind}/${itemId}`;
  const hash = djb2(content);
  const prev = renderHashCache.get(key);

  if (!prev) {
    renderHashCache.set(key, { hash, hitStreak: 1, missStreak: 0, stable: false });
    markDirty(sessionId);
    return false;
  }

  if (prev.hash === hash) {
    const hitStreak = prev.hitStreak + 1;
    // 入选: 连续命中达到门槛 OR 已锁定的稳定项继续保持
    const stable = prev.stable || hitStreak >= STABLE_HITS_REQUIRED;
    renderHashCache.set(key, { hash, hitStreak, missStreak: 0, stable });
    markDirty(sessionId);
    return stable;
  }

  // hash 失配
  const missStreak = prev.missStreak + 1;
  // 滞回: 已稳定项仅在连续失配 < UNSTABLE_MISS_TO_EVICT 时保持 stable,否则解锁。
  // 未稳定项保持 false,hitStreak 归 1 (本次 hash 作为新起点)。
  const stable = prev.stable && missStreak < UNSTABLE_MISS_TO_EVICT;
  renderHashCache.set(key, { hash, hitStreak: 1, missStreak, stable });
  markDirty(sessionId);
  return stable;
}

/** 清空全部 hash 缓存 (测试 / 全局重置)。 */
export function clearRenderHashCache(): void {
  renderHashCache.clear();
  restoredSessions.clear();
  dirtySessions.clear();
  if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
  // 清除 sessionStorage 中所有 DS render hash keys
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
    }
    for (const k of keysToRemove) sessionStorage.removeItem(k);
  } catch { /* silent */ }
}

/** 仅清空某会话的 hash (会话切换时可调,但不调也不影响正确性 —— key 已带 sessionId 隔离)。 */
export function clearSessionRenderHashCache(sessionId: string): void {
  const prefix = `${sessionId}/`;
  for (const key of Array.from(renderHashCache.keys())) {
    if (key.startsWith(prefix)) renderHashCache.delete(key);
  }
  restoredSessions.delete(sessionId);
  dirtySessions.delete(sessionId);
  ssRemove(`${STORAGE_PREFIX}${sessionId}`);
}

/** 仅供调试: 返回当前缓存条数。 */
export function getRenderHashCacheSize(): number {
  return renderHashCache.size;
}
