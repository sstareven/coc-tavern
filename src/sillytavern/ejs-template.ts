/**
 * Lightweight EJS template engine — inspired by SillyTavern's
 * zonde306/ST-Prompt-Template (AGPL v3 License).
 *
 * Processes <% %> JavaScript blocks, <%= %> and <%- %> output tags
 * in prompt text, with built-in getvar/setvar API for variable management.
 */

// ── Template API (injected into execution context) ──

export interface TemplateAPI {
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
      } catch {
        return fallback;
      }
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
      } catch {
        return '';
      }
    },
  };
}

// ── Template Compiler ──

interface TemplatePart {
  type: 'text' | 'code' | 'output' | 'unescaped';
  content: string;
}

/** Parse template text into parts */
function parseTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let remaining = text;
  let idx = 0;

  while (idx < remaining.length) {
    const openIdx = remaining.indexOf('<%', idx);
    if (openIdx === -1) {
      // No more tags — rest is text
      parts.push({ type: 'text', content: remaining.slice(idx) });
      break;
    }

    // Text before the tag
    if (openIdx > idx) {
      parts.push({ type: 'text', content: remaining.slice(idx, openIdx) });
    }

    const closeIdx = remaining.indexOf('%>', openIdx + 2);
    if (closeIdx === -1) {
      // Unclosed tag — treat rest as text
      parts.push({ type: 'text', content: remaining.slice(openIdx) });
      break;
    }

    const inner = remaining.slice(openIdx + 2, closeIdx).trim();

    // Determine type: <%= %> = escaped output, <%- %> = unescaped output, <% %> = code
    let type: TemplatePart['type'] = 'code';
    let content = inner;

    if (inner.startsWith('=')) {
      type = 'output';
      content = inner.slice(1).trim();
    } else if (inner.startsWith('-')) {
      type = 'unescaped';
      content = inner.slice(1).trim();
    }

    parts.push({ type, content });
    idx = closeIdx + 2;
  }

  return parts;
}

// ── Simple HTML escape ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Template Executor ──

/**
 * Process EJS template text with the given API context.
 * Returns the rendered string.
 */
export function renderTemplate(text: string): string {
  const parts = parseTemplate(text);
  if (parts.every((p) => p.type === 'text')) {
    return text; // No templates to process
  }

  const api = createAPI();
  const output: string[] = [];
  const codeAccumulator: string[] = [];

  // Collect all code into a single script context
  for (const part of parts) {
    if (part.type === 'code') {
      codeAccumulator.push(part.content);
    }
  }

  // Execute accumulated code in order
  // For each text part, push directly; for output parts, evaluate
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        output.push(part.content);
        break;
      case 'output':
        try {
          const fn = new Function('api', `with(api){ return (${part.content}); }`);
          const val = fn(api);
          output.push(val != null ? escapeHtml(String(val)) : '');
        } catch {
          output.push(`[模板错误: ${part.content}]`);
        }
        break;
      case 'unescaped':
        try {
          const fn = new Function('api', `with(api){ return (${part.content}); }`);
          const val = fn(api);
          output.push(val != null ? String(val) : '');
        } catch {
          output.push(`[模板错误: ${part.content}]`);
        }
        break;
      case 'code':
        try {
          const fn = new Function('api', `with(api){ ${part.content} }`);
          fn(api);
        } catch {
          // Silently ignore code errors
        }
        break;
    }
  }

  return output.join('');
}
