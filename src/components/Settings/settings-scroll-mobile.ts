/**
 * 计算手机端设置面板的像素高度。
 * 用 visualViewport 的实际高度除以当前根 zoom，避免 Safari 对
 * calc(100dvh / var(--auto-zoom)) 的计算不一致导致底部截断。
 */
export function computeMobilePanelHeight(vvHeight: number | null, zoom: number): string {
  if (vvHeight != null && vvHeight > 0 && zoom > 0) {
    return `${Math.floor(vvHeight / zoom)}px`;
  }
  return 'calc(100dvh / var(--auto-zoom, 1))';
}
