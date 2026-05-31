import { useState, useEffect } from 'react';

/**
 * 返回当前「可视视口」高度(px)——软键盘弹出时随之收缩。
 * 无 visualViewport（旧浏览器/SSR）时返回 null，调用方回退 CSS 100dvh。
 */
export function useViewportHeight(): number | null {
  const get = () =>
    typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : null;
  const [height, setHeight] = useState<number | null>(get);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const onChange = () => setHeight(vv.height);
    onChange();
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
      vv.removeEventListener('resize', onChange);
      vv.removeEventListener('scroll', onChange);
    };
  }, []);

  return height;
}
