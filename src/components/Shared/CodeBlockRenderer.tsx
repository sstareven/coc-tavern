import { useState, useRef, useEffect, useCallback } from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';

const HTML_BLOCK_RE = /```html\s*([\s\S]*?)```/g;
const JS_BLOCK_RE = /```(?:js|javascript)\s*([\s\S]*?)```/g;
const CSS_BLOCK_RE = /```css\s*([\s\S]*?)```/g;

interface CodeBlock {
  index: number;
  lang: 'html' | 'js' | 'css';
  code: string;
  start: number;
  end: number;
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const [re, lang] of [[HTML_BLOCK_RE, 'html'], [JS_BLOCK_RE, 'js'], [CSS_BLOCK_RE, 'css']] as const) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      blocks.push({ index: blocks.length, lang, code: m[1].trim(), start: m.index, end: m.index + m[0].length });
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

/** Replace code blocks with rendered iframes, keeping surrounding text */
export function renderContentWithCodeBlocks(
  text: string,
  renderSettings?: { enabled?: boolean; collapse?: string; noHighlight?: boolean; codeBlocks?: boolean },
): React.ReactNode[] {
  const blocks = extractCodeBlocks(text);
  if (blocks.length === 0) return [text];

  const enabled = renderSettings?.enabled !== false;
  const collapse = renderSettings?.collapse ?? 'disable';
  const noHighlight = renderSettings?.noHighlight ?? false;
  const codeBlocks = renderSettings?.codeBlocks ?? true;
  // If codeBlocks is disabled, skip all block rendering
  if (!codeBlocks) return [text];

  const nodes: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const block of blocks) {
    // Text before this block
    if (block.start > lastEnd) {
      nodes.push(text.slice(lastEnd, block.start));
    }

    // Render the code block
    if (enabled && block.lang === 'html') {
      nodes.push(
        <RenderedIframe key={`iframe-${block.index}`} code={block.code} collapsed={collapse === 'all'} />,
      );
    } else if (!noHighlight) {
      nodes.push(
        <CodeBlock key={`code-${block.index}`} code={block.code} lang={block.lang} collapsed={collapse === 'all'} />,
      );
    } else {
      nodes.push(<span key={`code-${block.index}`}>{block.code}</span>);
    }

    lastEnd = block.end;
  }

  // Remaining text
  if (lastEnd < text.length) {
    nodes.push(text.slice(lastEnd));
  }

  return nodes;
}

/** Sandboxed iframe renderer */
function RenderedIframe({ code, collapsed }: { code: string; collapsed: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobRef = useRef<string | null>(null);
  const thRender = useTavernHelperStore((s) => s.render);
  const useBlob = thRender.blobUrlRendering;

  // Build a complete HTML document from the code
  const buildSrcdoc = useCallback((src: string) => {
    const hasHtmlTag = /<html/i.test(src);
    const hasBodyTag = /<body/i.test(src);
    const hasHeadTag = /<head/i.test(src);

    let html = src;
    if (!hasHtmlTag) {
      const head = hasHeadTag ? '' : '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
      html = `<!DOCTYPE html><html><head>${head}<style>body{margin:0;padding:8px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#d4c8b8;background:transparent;}*{box-sizing:border-box}</style></head><body>${hasBodyTag ? src.replace(/<\/?body[^>]*>/g, '') : src}</body></html>`;
    }
    return html;
  }, []);

  useEffect(() => {
    if (!expanded || !iframeRef.current) return;

    const iframe = iframeRef.current;
    const srcdoc = buildSrcdoc(code);

    if (useBlob) {
      // Revoke old blob URL if any
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const blob = new Blob([srcdoc], { type: 'text/html' });
      blobRef.current = URL.createObjectURL(blob);
      iframe.src = blobRef.current;
    } else {
      iframe.srcdoc = srcdoc;
    }

    // Height adjustment via message listener
    const handler = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.type === 'resize' && typeof e.data.height === 'number') {
        iframe.style.height = Math.max(60, e.data.height) + 'px';
      }
    };
    window.addEventListener('message', handler);

    // Inject auto-resize script after load
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const script = doc.createElement('script');
          script.textContent = `
            (function(){
              function post(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);parent.postMessage({type:'resize',height:h},'*');}
              new ResizeObserver(post).observe(document.body);
              post();
            })();
          `;
          doc.head.appendChild(script);
        }
      } catch { /* cross-origin */ }
    };
    iframe.addEventListener('load', onLoad);

    // Fallback: periodic height check
    const interval = setInterval(() => {
      try {
        if (iframe.contentDocument?.body) {
          const h = iframe.contentDocument.body.scrollHeight;
          iframe.style.height = Math.max(60, h) + 'px';
        }
      } catch { /* */ }
    }, 2000);

    return () => {
      window.removeEventListener('message', handler);
      iframe.removeEventListener('load', onLoad);
      clearInterval(interval);
    };
  }, [expanded, code, buildSrcdoc, useBlob]);

  if (!expanded) {
    return (
      <div style={{
        border: '1px solid var(--brass)', borderRadius: 3, margin: '8px 0',
        background: 'rgba(0,0,0,0.15)', overflow: 'hidden',
      }}>
        <div onClick={() => setExpanded(true)} style={{
          padding: '6px 12px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(58,107,90,0.15)', borderLeft: '3px solid var(--success)',
          fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-subtle)',
        }}>
          <span>📄 HTML 渲染块</span>
          <span style={{ fontSize: 9 }}>点击展开</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--brass)', borderRadius: 3, margin: '8px 0',
      background: 'rgba(0,0,0,0.15)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '4px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(58,107,90,0.15)', borderLeft: '3px solid var(--success)',
        fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-subtle)',
      }}>
        <span>📄 HTML 渲染块</span>
        <button onClick={() => setExpanded(false)} style={{
          background: 'transparent', border: 'none', color: 'var(--ink-subtle)',
          cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-ui)',
        }}>收起</button>
      </div>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{
          width: '100%', height: 200, border: 'none',
          background: 'transparent',
        }}
        title="Rendered HTML content"
      />
    </div>
  );
}

/** Syntax-highlighted code block (non-HTML) */
function CodeBlock({ code, lang, collapsed }: { code: string; lang: string; collapsed: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed);
  return (
    <div style={{
      border: '1px solid var(--brass)', borderRadius: 3, margin: '8px 0',
      background: 'rgba(0,0,0,0.2)', overflow: 'hidden',
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{
        padding: '4px 12px', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-subtle)',
        background: 'rgba(196,168,85,0.08)',
      }}>
        <span>{'```' + lang}</span>
        <span style={{ fontSize: 9 }}>{expanded ? '收起' : '展开'}</span>
      </div>
      {expanded && (
        <pre style={{
          margin: 0, padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--text-light)', lineHeight: 1.5, overflowX: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {code}
        </pre>
      )}
    </div>
  );
}
