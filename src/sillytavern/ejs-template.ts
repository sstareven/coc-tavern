/**
 * Lightweight EJS template engine — inspired by SillyTavern's
 * zonde306/ST-Prompt-Template (AGPL v3 License).
 *
 * Processes <% %> JavaScript blocks, <%= %> and <%- %> output tags
 * in prompt text, with built-in getvar/setvar/getwi API for variable management.
 * Supports with/without context modes and LRU template compilation cache.
 */

import { useVariableStore } from '../stores/useVariableStore';
import { useLorebookStore } from '../stores/useLorebookStore';

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
        const v = useVariableStore.getState().variables[name];
        return v?.value ?? fallback;
      } catch { return fallback; }
    },
    setvar(name, value) {
      try {
        useVariableStore.getState().setVariable(name, value, 'llm');
      } catch { /* ignore */ }
    },
    getwi(keyword) {
      try {
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
  fn: Function;
  size: number;
  source: string;
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

function getFromCache(key: string, text: string): CacheEntry | null {
  const entry = templateCache.get(key);
  if (entry && entry.source === text) {
    templateCache.delete(key);
    templateCache.set(key, entry);
    return entry;
  }
  if (entry) {
    templateCache.delete(key);
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
    cacheEntry = getFromCache(cacheKey, text);
  } else if (cacheConf?.enabled === 2 && options?.onlyWorldinfo) {
    cacheEntry = getFromCache(cacheKey, text);
  }

  const api = createAPI();
  const sandbox = buildSandboxProxy(api);

  // Compile all parts into ONE function so that <% if %>/<% for %> blocks
  // truly control text emission (a block spans multiple parts: the opening
  // `<% if(x){ %>`, the text between, and the closing `<% } %>`).
  let fn: Function | null = cacheEntry?.fn ?? null;
  if (!fn) {
    let body = 'let __o = "";\n';
    for (const part of parts) {
      if (part.type === 'text') {
        body += `__o += ${JSON.stringify(part.content)};\n`;
      } else if (part.type === 'output') {
        body += `try { __o += __esc(String((${part.content}) ?? "")); } catch (e) {}\n`;
      } else if (part.type === 'unescaped') {
        body += `try { __o += String((${part.content}) ?? ""); } catch (e) {}\n`;
      } else {
        // code block — emitted verbatim so control flow spans parts
        body += `${part.content}\n`;
      }
    }
    body += 'return __o;';
    try {
      fn = disableWith
        ? new Function('getvar', 'setvar', 'getwi', '__esc', body)
        : new Function('api', '__esc', `with(api){ ${body} }`);
    } catch {
      return text; // compilation failed (bad EJS) — fall back to raw text
    }
    if (cacheConf?.enabled && (!options?.onlyWorldinfo || cacheConf.enabled === 2)) {
      setCache(cacheKey, { fn, size: text.length, source: text }, cacheConf.size || 64);
    }
  }

  try {
    const out = disableWith
      ? (fn as Function)(api.getvar, api.setvar, api.getwi, escapeHtml)
      : (fn as Function)(sandbox, escapeHtml);
    return typeof out === 'string' ? out : String(out ?? '');
  } catch {
    return text;
  }
}
