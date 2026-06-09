// 领受赐福（作弊系统）核心算法 — 从「期望档位」反推一个合法 d100 点数，
// 让 determineResult() 回判时落到同一档。算法为纯函数 + 可注入 rng（默认 Math.random），
// 单测固定 rng 后可断言确定行为；运行时不固定 → 玩家连按 3 次「成功」不会永远看到同一个 d100 值。

import type { DiceResultType } from '../types';

/** 6 档结果常量 — DicePanel 与 OptionResolutionOverlay 的 grid 渲染共享。
 *  顺序按「从最好到最坏」展示，方便玩家瞄准目标档。 */
export const CHEATING_RESULT_TYPES: readonly DiceResultType[] = [
  'crit-success', 'extreme-success', 'hard-success', 'success', 'failure', 'crit-failure',
] as const;

/** 在闭区间 [lo, hi] 内取一个整数；rng 必须返回 [0,1) */
function randInt(lo: number, hi: number, rng: () => number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * 从目标档位反推一个 d100 点数，保证 determineResult() 回判同一档。
 * 没有合法点数（target 过小让区间空）返回 null。
 *
 * 边界：
 * - 大成功固定 1（区间唯一）；大失败 SAN 检定 96-100、target<50 时 96-100、target>=50 时仅 100
 * - 极难成功需要 fifth >= 2（否则只剩 1）
 * - 困难成功需要 (fifth, half] 非空 → target >= 3
 * - 成功需要 (half, target] 非空 → target >= 2
 * - 失败需要 (target, maxFail]，maxFail 因 sanCheck/target 分档
 *
 * @param rng 可注入随机源（单测注入固定 rng）
 */
export function pickRollForResult(
  type: DiceResultType,
  target: number,
  sanCheck: boolean,
  rng: () => number = Math.random,
): number | null {
  const fifth = Math.floor(target / 5);
  const half = Math.floor(target / 2);

  switch (type) {
    case 'crit-success':
      return 1;

    case 'extreme-success': {
      // 区间 [2, fifth]（避开 1 防被判为 crit-success）
      if (fifth < 2) return null;
      return randInt(2, fifth, rng);
    }

    case 'hard-success': {
      // 区间 [max(fifth+1, 2), half]
      const lo = Math.max(fifth + 1, 2);
      if (half < lo) return null;
      return randInt(lo, half, rng);
    }

    case 'success': {
      // 区间 [max(half+1, 2), target]；SAN 检定时 96-100 是大失败区，要避开
      const lo = Math.max(half + 1, 2);
      const hi = sanCheck ? Math.min(target, 95) : target;
      if (hi < lo) return null;
      return randInt(lo, hi, rng);
    }

    case 'failure': {
      const lo = target + 1;
      const hi = sanCheck || target < 50 ? 95 : 99;
      if (lo > hi) return null;
      return randInt(lo, hi, rng);
    }

    case 'crit-failure': {
      // SAN 检定 96-100 都是大失败；其余情况只有 100
      if (sanCheck) return randInt(96, 100, rng);
      return 100;
    }

    default: {
      // exhaustive check — 若 DiceResultType 联合类型新增成员，TS 立刻在这里失败
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * 预检每个档位在当前 target/sanCheck 下是否可生成合法点数。
 * 返回一个 Set，包含不可用的档位（pickRollForResult 会返回 null）。
 * 在 UI 渲染前调用，以便 CheatingGrid 禁用不可用档位。
 * 用 rng=0 取区间最小值验证合法性（区间是否非空不依赖随机值）。
 */
export function getCheatingDisabledTypes(
  target: number,
  sanCheck: boolean,
): Set<DiceResultType> {
  const disabled = new Set<DiceResultType>();
  const rng = () => 0; // 任意固定值，只关心 null 与否
  for (const type of CHEATING_RESULT_TYPES) {
    if (pickRollForResult(type, target, sanCheck, rng) === null) {
      disabled.add(type);
    }
  }
  return disabled;
}
