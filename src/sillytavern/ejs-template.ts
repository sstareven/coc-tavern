/**
 * Lightweight EJS template engine — inspired by SillyTavern's
 * zonde306/ST-Prompt-Template (AGPL v3 License).
 *
 * Processes <% %> JavaScript blocks, <%= %> and <%- %> output tags
 * in prompt text, with built-in getvar/setvar/getwi API for variable management.
 * Supports with/without context modes and LRU template compilation cache.
 */

// ── Template API (injected into execution context) ──

interface TemplateAPI {
  getvar: (name: string, fallback?: string) => string;
  setvar: (name: string, value: string) => void;
  getwi: (keyword: string) => string;
}

function createAPI(): TemplateAPI {
  return {
    getvar(name, fallback = '') {
      try {
        const { useVariableStore } = require('../stores/useVariableStore');
        const v = useVariableStore.getState().variables[name];
        return v?.value ?? fallback;
      } catch { return fallback; }
    },
    setvar(name, value) {
      try {
        const { useVariableStore } = require('../stores/useVariableStore');
        useVariableStore.getState().setVariable(name, value, 'llm');
      } catch { /* ignore */ }
    },
    getwi(keyword) {
      try {
        const { useLorebookStore } = require('../stores/useLorebookStore');
        const books = useLorebookStore.getState().books;
        const kw = keyword.toLowerCase();
        for (const book of Object.values(books) as Array<{ entries: Record<string, { keys: string; content: string }> }>) {
          for (const entry of Object.values(book.entries)) {
            const keys = entry.keys.split(/[,，]/).map((k) => k.trim().toLowerCase());
            if (keys.some((k) => kw.includes(k) || k.includes(kw))) {
              return entry.content;
            }
          }
        }
        return '';
      } catch { return ''; }
    },
  };
}

// ── Template Parts ──

interface TemplatePart {
  type: 'text' | 'code' | 'output' | 'unescaped';
  content: string;
}

function parseTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let idx = 0;

  while (idx < text.length) {
    const openIdx = text.indexOf('<%', idx);
    if (openIdx === -1) { parts.push({ type: 'text', content: text.slice(idx) }); break; }
    if (openIdx > idx) { parts.push({ type: 'text', content: text.slice(idx, openIdx) }); }
    const closeIdx = text.indexOf('%>', openIdx + 2);
    if (closeIdx === -1) { parts.push({ type: 'text', content: text.slice(openIdx) }); break; }
    const inner = text.slice(openIdx + 2, closeIdx).trim();
    let type: TemplatePart['type'] = 'code';
    let content = inner;
    if (inner.startsWith('=')) { type = 'output'; content = inner.slice(1).trim(); }
    else if (inner.startsWith('-')) { type = 'unescaped'; content = inner.slice(1).trim(); }
    parts.push({ type, content });
    idx = closeIdx + 2;
  }
  return parts;
}

// ── HTML Escape ──

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Template Cache ──

interface CacheEntry {
  compiled: Array<{ type: string; fn?: Function; content?: string }>;
  size: number;
}

const templateCache = new Map<string, CacheEntry>();

function getCacheKey(text: string, disableWith: boolean): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}:${text.length}:${disableWith ? '1' : '0'}`;
}

function getFromCache(key: string): CacheEntry | null {
  const entry = templateCache.get(key);
  if (entry) {
    // Move to end (LRU)
    templateCache.delete(key);
    templateCache.set(key, entry);
    return entry;
  }
  return null;
}

function setCache(key: string, entry: CacheEntry, maxSize: number) {
  if (maxSize <= 0) return;
  // Evict oldest entries if over limit
  while (templateCache.size >= maxSize) {
    const first = templateCache.keys().next();
    if (first.done) break;
    templateCache.delete(first.value);
  }
  templateCache.set(key, entry);
}

// ── Sandbox globals blacklist ──

const BLOCKED_GLOBALS = [
  'window', 'self', 'globalThis', 'document', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'importScripts', 'eval', 'Function',
  'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location',
  'postMessage', 'opener', 'parent', 'top', 'frames',
] as const;

function buildSandboxProxy(api: TemplateAPI): Record<string, unknown> {
  const blocked: Record<string, undefined> = {};
  for (const name of BLOCKED_GLOBALS) blocked[name] = undefined;
  return { ...blocked, getvar: api.getvar, setvar: api.setvar, getwi: api.getwi };
}

// ── Template Executor ──

/**
 * Process EJS template text with the given API context.
 * disableWith: when true, avoids using with() statement (fixes "getvar is not defined").
 * cache: { enabled: 0|1|2, size: number } — 0=off, 1=all, 2=worldinfo only
 */
export function renderTemplate(
  text: string,
  options?: { disableWith?: boolean; cache?: { enabled: number; size: number }; onlyWorldinfo?: boolean },
): string {
  const parts = parseTemplate(text);
  if (parts.every((p) => p.type === 'text')) return text;

  const disableWith = options?.disableWith ?? false;
  const cacheConf = options?.cache;

  // Cache lookup
  const cacheKey = getCacheKey(text, disableWith);
  let cacheEntry: CacheEntry | null = null;
  if (cacheConf?.enabled && !options?.onlyWorldinfo) {
    cacheEntry = getFromCache(cacheKey);
  } else if (cacheConf?.enabled === 2 && options?.onlyWorldinfo) {
    cacheEntry = getFromCache(cacheKey);
  }

  const api = createAPI();
  const sandbox = buildSandboxProxy(api);
  const output: string[] = [];

  if (cacheEntry) {
    for (const c of cacheEntry.compiled) {
      if (c.type === 'text') {
        output.push(c.content ?? '');
      } else if (c.fn) {
        try {
          const val = disableWith ? c.fn(api.getvar, api.setvar, api.getwi) : c.fn(sandbox);
          if (c.type === 'output') {
            output.push(val != null ? escapeHtml(String(val)) : '');
          } else if (c.type === 'unescaped') {
            output.push(val != null ? String(val) : '');
          }
        } catch {
          output.push('');
        }
      }
    }
  } else {
    const compiled: Array<{ type: string; fn?: Function; content?: string }> = [];
    for (const part of parts) {
      switch (part.type) {
        case 'text': {
          output.push(part.content);
          compiled.push({ type: 'text', content: part.content });
          break;
        }
        case 'output':
          try {
            const fn = disableWith
              ? new Function('getvar', 'setvar', 'getwi', `return (${part.content});`)
              : new Function('api', `with(api){ return (${part.content}); }`);
            const val = disableWith ? fn(api.getvar, api.setvar, api.getwi) : fn(sandbox);
            const escaped = val != null ? escapeHtml(String(val)) : '';
            output.push(escaped);
            compiled.push({ type: 'output', fn: disableWith ? fn : fn });
          } catch {
            output.push(`[模板错误: ${part.content}]`);
            compiled.push({ type: 'output' });
          }
          break;
        case 'unescaped':
          try {
            const fn = disableWith
              ? new Function('getvar', 'setvar', 'getwi', `return (${part.content});`)
              : new Function('api', `with(api){ return (${part.content}); }`);
            const val = disableWith ? fn(api.getvar, api.setvar, api.getwi) : fn(sandbox);
            output.push(val != null ? String(val) : '');
            compiled.push({ type: 'unescaped', fn });
          } catch {
            output.push(`[模板错误: ${part.content}]`);
            compiled.push({ type: 'unescaped' });
          }
          break;
        case 'code':
          try {
            const fn = disableWith
              ? new Function('getvar', 'setvar', 'getwi', `{ ${part.content} }`)
              : new Function('api', `with(api){ ${part.content} }`);
            disableWith ? fn(api.getvar, api.setvar, api.getwi) : fn(sandbox);
            compiled.push({ type: 'code', fn });
          } catch {
            compiled.push({ type: 'code' });
          }
          break;
      }
    }
    // Store in cache if enabled
    if (cacheConf?.enabled && (!options?.onlyWorldinfo || cacheConf.enabled === 2)) {
      setCache(cacheKey, { compiled, size: text.length }, cacheConf.size || 64);
    }
  }

  return output.join('');
}
