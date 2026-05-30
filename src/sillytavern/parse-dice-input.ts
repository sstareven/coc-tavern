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
 * 从用户输入里解析掷骰结果方括号，支持两种格式：
 *  - 普通检定 "[侦查 d100=42/60 成功]" 或 "[侦查 d100=16/61 奖励骰 困难成功]"
 *  - 对抗检定 "[侦查对抗 玩家d100=16/61(困难成功) vs 对手d100=45/50(失败) → 胜利]"
 *
 * 普通检定结果标签取 `]` 前最后一个空白分隔 token，避免把 "奖励骰/惩罚骰"
 * 误并入结果类型而回退成 failure。
 *
 * 对抗检定记 `技能(胜负)` 作 skill、玩家个人掷骰作 roll/target/type，
 * 让后续回合的 [检定记录] 既能体现对抗输赢、又保留玩家本次掷骰质量。
 */
export function parseDiceResultsFromInput(input: string): DiceRecord[] {
  const out: DiceRecord[] = [];
  const now = Date.now();

  // 对抗格式优先解析，并从串里剥离，避免普通正则误吞其残片
  const opposedRe =
    /\[(.+?对抗)\s+玩家d100=(\d+)\/(\d+)\(([^)]*)\)\s+vs\s+对手d100=\d+\/\d+\([^)]*\)\s*→\s*([^\]]+?)\]/g;
  const remainder = input.replace(
    opposedRe,
    (_m, skill: string, roll: string, target: string, pLabel: string, outcome: string) => {
      out.push({
        skill: `${skill}(${outcome.trim()})`,
        roll,
        target,
        type: LABEL_TO_TYPE[pLabel.trim()] ?? 'failure',
        time: now,
      });
      return '';
    },
  );

  // 普通检定格式（在已剥离对抗块的剩余串上扫描）
  const re = /\[(.+?)\s+d100=(\d+)\/(\d+)\s+(.+?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(remainder)) !== null) {
    const label = m[4].trim().split(/\s+/).pop() ?? '';
    out.push({
      skill: m[1],
      roll: m[2],
      target: m[3],
      type: LABEL_TO_TYPE[label] ?? 'failure',
      time: now,
    });
  }
  return out;
}
