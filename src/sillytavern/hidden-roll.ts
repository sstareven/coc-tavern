/**
 * 暗骰（hidden roll）机制：某些技能（如心理学）掷骰时对玩家隐藏结果，
 * 输入栏只显示掩码 token，提交时再把 token 换回真实结果交给 LLM。
 */

/** 暗骰技能：掷骰结果对玩家隐藏。 */
const HIDDEN_ROLL_SKILLS = ['心理学'];

export function isHiddenRollSkill(skill: string): boolean {
  return HIDDEN_ROLL_SKILLS.some((s) => skill.includes(s));
}

let pending: { token: string; real: string } | null = null;

/** 暂存一次暗骰：token 为输入栏可见掩码，real 为提交给 LLM 的真实结果行。 */
export function stashHiddenRoll(token: string, real: string): void {
  pending = { token, real };
}

/** 提交时把输入里的暗骰掩码 token 替换为真实结果（供 LLM），返回替换后的文本。 */
export function revealHiddenRolls(input: string): string {
  if (pending && input.includes(pending.token)) {
    const out = input.split(pending.token).join(pending.real);
    pending = null;
    return out;
  }
  return input;
}

/** 测试用：清空暂存。 */
export function _clearHiddenRoll(): void {
  pending = null;
}
