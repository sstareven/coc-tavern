import type { DiceRecord, DiceResultType } from '../types';

const LABEL_TO_TYPE: Record<string, DiceResultType> = {
  '大成功！': 'crit-success',
  '大成功': 'crit-success',
  '极难成功': 'extreme-success',
  '困难成功': 'hard-success',
  '成功': 'success',
  '失败': 'failure',
  '大失败！': 'crit-failure',
  '大失败': 'crit-failure',
};

/**
 * 从用户输入里解析掷骰结果方括号，如 "[侦查 d100=42/60 成功]" 或
 * "[侦查 d100=16/61 奖励骰 困难成功]"（带奖励/惩罚骰标记）。
 *
 * 结果标签取 `]` 前最后一个空白分隔 token，避免把 "奖励骰/惩罚骰"
 * 误并入结果类型而回退成 failure。
 */
export function parseDiceResultsFromInput(input: string): DiceRecord[] {
  const re = /\[(.+?)\s+d100=(\d+)\/(\d+)\s+(.+?)\]/g;
  const out: DiceRecord[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const label = m[4].trim().split(/\s+/).pop() ?? '';
    out.push({
      skill: m[1],
      roll: m[2],
      target: m[3],
      type: LABEL_TO_TYPE[label] ?? 'failure',
      time: Date.now(),
    });
  }
  return out;
}
