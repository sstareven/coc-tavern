/**
 * Tavern Helper Script Execution Engine
 *
 * Executes TH script content in sandboxed new Function() contexts,
 * providing the same API as the EJS template engine: getvar, setvar, getwi.
 *
 * Scripts can define hooks:
 *   - init()           called once when scripts are loaded
 *   - onSend(text)     pre-process user input before prompt assembly
 *   - onReceive(text)  post-process AI response before variable extraction
 *
 * Pattern modeled after ejs-template.ts sandbox execution.
 */

import type { THScriptTree, THScript } from '../types';
import { useVariableStore } from '../stores/useVariableStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { useTavernHelperStore } from '../stores/useTavernHelperStore';

// ── Script API (mirrors ejs-template.ts TemplateAPI) ──

function createScriptAPI() {
  return {
    getvar(name: string, fallback = '') {
      try {
        const v = useVariableStore.getState().variables[name];
        return v?.value ?? fallback;
      } catch { return fallback; }
    },
    setvar(name: string, value: string) {
      try {
        useVariableStore.getState().setVariable(name, value, 'llm');
      } catch { /* ignore */ }
    },
    getwi(keyword: string) {
      try {
        const books = useLorebookStore.getState().books;
        const kw = keyword.toLowerCase();
        for (const book of Object.values(books)) {
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

// ── Hook types ──

export interface ThScriptHooks {
  onSend: Array<(text: string) => string>;
  onReceive: Array<(text: string) => string>;
}

// ── Sandbox globals blacklist ──

const BLOCKED_GLOBALS = [
  'window', 'self', 'globalThis', 'document', 'fetch', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'importScripts', 'eval', 'Function',
  'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location',
  'postMessage', 'opener', 'parent', 'top', 'frames',
] as const;

// ── Main engine ──

/** Flatten a THScriptTree[] into enabled THScript[] */
function flattenEnabledScripts(tree: THScriptTree[]): THScript[] {
  const result: THScript[] = [];
  for (const item of tree) {
    if (item.type === 'script' && item.enabled && item.content) {
      result.push(item);
    } else if (item.type === 'folder') {
      result.push(...item.children.filter((s) => s.type === 'script' && s.enabled && s.content) as THScript[]);
    }
  }
  return result;
}

/**
 * Execute all enabled TH scripts (global + preset).
 * Each script runs in its own sandboxed Function context.
 * Hook functions defined by scripts are collected and returned.
 *
 * Scripts can define:
 *   init()          — run once at load time
 *   onSend(text)    — transform user input, return transformed text
 *   onReceive(text) — transform AI response, return transformed text
 *
 * Available globals inside scripts:
 *   getvar(name, fallback?) — read game variable
 *   setvar(name, value)     — write game variable
 *   getwi(keyword)          — world info lookup
 *   macroVars               — read-only macro variables record
 *   console.log(...)        — debug logging
 */
export function loadThScripts(globalScripts: THScriptTree[], presetScripts: THScriptTree[]): ThScriptHooks {
  const hooks: ThScriptHooks = { onSend: [], onReceive: [] };
  const api = createScriptAPI();
  const allScripts = [
    ...flattenEnabledScripts(globalScripts),
    ...flattenEnabledScripts(presetScripts),
  ];

  for (const script of allScripts) {
    try {
      // Sandbox: expose API functions + read-only macro vars + console
      const macroVars = { ...useTavernHelperStore.getState().macroVars };
      const blocked: Record<string, undefined> = {};
      for (const name of BLOCKED_GLOBALS) blocked[name] = undefined;
      const sandbox = {
        ...blocked,
        getvar: api.getvar,
        setvar: api.setvar,
        getwi: api.getwi,
        macroVars,
        console,
        _hooks: hooks,
      };

      // Wrap script content: execute in sandbox context, capture hooks
      const wrappedCode = `
        with (__sandbox) {
          ${script.content}
        }
        // After execution, export hooks if defined
        if (typeof onSend === 'function') __sandbox._hooks.onSend.push(onSend);
        if (typeof onReceive === 'function') __sandbox._hooks.onReceive.push(onReceive);
        if (typeof init === 'function') { try { init(); } catch(e) { console.warn('[TH] init error in "${script.name}":', e); } }
      `;

      const fn = new Function('__sandbox', wrappedCode);
      fn(sandbox);
    } catch (err) {
      console.warn(`[TH] Script "${script.name}" execution failed:`, err);
    }
  }

  return hooks;
}

/**
 * Run all onSend hooks sequentially (pipeline: each hook receives the previous hook's output).
 */
export function runSendHooks(hooks: ThScriptHooks, text: string): string {
  let result = text;
  for (const hook of hooks.onSend) {
    try {
      result = hook(result) ?? result;
    } catch (err) {
      console.warn('[TH] onSend hook failed:', err);
    }
  }
  return result;
}

/**
 * Run all onReceive hooks sequentially.
 */
export function runReceiveHooks(hooks: ThScriptHooks, text: string): string {
  let result = text;
  for (const hook of hooks.onReceive) {
    try {
      result = hook(result) ?? result;
    } catch (err) {
      console.warn('[TH] onReceive hook failed:', err);
    }
  }
  return result;
}
