import { useEffect, useState } from 'react';
import { getRpmCooldownSec } from '../sillytavern/rpm-limiter';

/**
 * 每秒轮询 rpm-limiter 桶,反馈 60s 滑动窗口里最早 timestamp 还有多久过期。
 * cooldownSec === 0 → 桶完全空,可以发起下一次推进。
 *
 * 实现说明:rpm-limiter histories 是 module-level 可变数组,无 subscribe 机制。
 * 用 setInterval 轮询;setState 相同值不会触发 re-render,性能可接受。
 * 多个组件挂载会跑多个 interval(InputBar + RightPage),损耗忽略不计。
 */
export function useRpmCooldown(): { cooldownSec: number; ready: boolean } {
  // lazy initializer 挂载瞬间就拿一次值,避免 useState(0) + interval 第一帧前的 1s 空窗
  const [cooldownSec, setCooldownSec] = useState(() => getRpmCooldownSec());
  useEffect(() => {
    const tick = () => setCooldownSec(getRpmCooldownSec());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { cooldownSec, ready: cooldownSec === 0 };
}
