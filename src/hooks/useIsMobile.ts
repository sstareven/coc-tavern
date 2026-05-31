import { useState, useEffect } from 'react';

/** 纯读取：当前是否匹配手机媒体查询。SSR/无 window/无 matchMedia 时回退 false。可单测。 */
export function readMobile(query = '(max-width: 768px)'): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** 监听媒体查询，返回是否处于手机模式（默认 ≤768px）。 */
export function useIsMobile(query = '(max-width: 768px)'): boolean {
  const [isMobile, setIsMobile] = useState(() => readMobile(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange(); // 同步一次，覆盖初值与挂载间的窗口变化
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
