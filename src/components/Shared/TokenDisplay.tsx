import { useBookStore } from '../../stores/useBookStore';

export function TokenDisplay() {
  const pageIndex = useBookStore((s) => s.pageIndex);
  const pages = useBookStore((s) => s.pages);

  // Simulate token count based on page content length
  const page = pages[pageIndex];
  const contentLength = page
    ? (page.leftContent.length + page.rightContent.length)
    : 0;
  const estimatedTokens = Math.max(1, Math.floor(contentLength / 2.5));

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--ink-faded)',
        letterSpacing: 0.5,
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    >
      ~{estimatedTokens} tokens
    </div>
  );
}
