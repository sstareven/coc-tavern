/**
 * Slash command system — inspired by SillyTavern's STScript and
 * N0VI028/JS-Slash-Runner (AFPL License).
 *
 * Provides command registration, parsing, and execution for in-chat commands.
 */

// ── Types ──

export interface SlashCommand {
  name: string;
  description: string;
  /** Execute the command. Receives the raw argument string. Returns output text or '' */
  execute: (args: string) => string | Promise<string>;
}

// ── Registry ──

const registry = new Map<string, SlashCommand>();

export function registerCommand(cmd: SlashCommand): void {
  registry.set(cmd.name.toLowerCase(), cmd);
}

export function getCommands(): SlashCommand[] {
  return [...registry.values()];
}

// ── Parser ──

/** Split argument string respecting quoted strings */
export function parseArgs(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

// ── Executor ──

/**
 * Process a slash command from user input.
 * Returns the processed text (with command output replacing the command).
 */
export async function processSlashCommands(input: string): Promise<string> {
  const lines = input.split('\n');
  const processed: string[] = [];

  for (const line of lines) {
    if (line.startsWith('/')) {
      const spaceIdx = line.indexOf(' ');
      const eqIdx = line.indexOf('=');
      const splitIdx = spaceIdx === -1 ? eqIdx : (eqIdx === -1 ? spaceIdx : Math.min(spaceIdx, eqIdx));
      const cmdName = (splitIdx === -1 ? line.slice(1) : line.slice(1, splitIdx)).toLowerCase();
      const args = splitIdx === -1 ? '' : line.slice(splitIdx);

      const cmd = registry.get(cmdName);
      if (cmd) {
        try {
          const result = await cmd.execute(args);
          processed.push(result);
        } catch (err) {
          processed.push(`[命令错误: ${err instanceof Error ? err.message : String(err)}]`);
        }
      } else {
        // Unknown command — pass through unchanged
        processed.push(line);
      }
    } else {
      processed.push(line);
    }
  }

  return processed.join('\n');
}

// ── Built-in Commands ──

/** Initialize built-in commands. Call once during app startup. */
export function initBuiltinCommands(): void {
  // /roll [dice] — roll dice
  registerCommand({
    name: 'roll',
    description: '掷骰子。用法: /roll d100 或 /roll 3d6',
    execute: (args) => {
      const parsed = parseArgs(args);
      const diceExpr = parsed[0] || 'd100';
      const match = diceExpr.match(/^(\d+)?d(\d+)$/i);
      if (!match) return '[无效的骰子表达式]';
      const count = parseInt(match[1] || '1');
      const sides = parseInt(match[2]);
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
      }
      const total = rolls.reduce((a, b) => a + b, 0);
      return count > 1
        ? `[${rolls.join(' + ')} = ${total}]`
        : `[${rolls[0]}]`;
    },
  });

  // /var <name> — get variable value
  registerCommand({
    name: 'var',
    description: '查看变量。用法: /var <变量名>',
    execute: (args) => {
      const parsed = parseArgs(args);
      const name = parsed[0];
      if (!name) return '[用法: /var <变量名>]';
      try {
        const { useVariableStore } = require('../stores/useVariableStore');
        const v = useVariableStore.getState().variables[name];
        return v ? `[${name} = ${v.value}]` : `[变量 "${name}" 不存在]`;
      } catch {
        return '[变量系统不可用]';
      }
    },
  });

  // /set <name> <value> — set variable
  registerCommand({
    name: 'set',
    description: '设置变量。用法: /set <变量名> <值>',
    execute: (args) => {
      const parsed = parseArgs(args);
      if (parsed.length < 2) return '[用法: /set <变量名> <值>]';
      try {
        const { useVariableStore } = require('../stores/useVariableStore');
        useVariableStore.getState().setVariable(parsed[0], parsed.slice(1).join(' '), 'manual');
        return `[变量 "${parsed[0]}" 已设置]`;
      } catch {
        return '[变量系统不可用]';
      }
    },
  });

  // /rd=<N> or /rd <N> — test dice animation
  registerCommand({
    name: 'rd',
    description: '测试骰子动画。用法: /rd=100 或 /rd 1',
    execute: (args) => {
      const raw = args.trim();
      // Parse /rd=100 or /rd 100
      const match = raw.match(/^(?:=)?\s*(\d+)/);
      if (!match) return '[用法: /rd=100 (大失败) 或 /rd=1 (大成功)]';
      const roll = parseInt(match[1]);
      if (roll < 1 || roll > 100) return '[骰值需在 1-100 之间]';
      const target = 50;
      const fifth = Math.floor(target / 5), half = Math.floor(target / 2);
      let resultType = 'failure';
      if (roll === 100 || (target < 50 && roll >= 96)) resultType = 'crit-failure';
      else if (roll === 1) resultType = 'crit-success';
      else if (roll <= fifth) resultType = 'extreme-success';
      else if (roll <= half) resultType = 'hard-success';
      else if (roll <= target) resultType = 'success';
      const labels: Record<string, string> = {
        'crit-success': '大成功', 'extreme-success': '极难成功', 'hard-success': '困难成功',
        'success': '成功', 'failure': '失败', 'crit-failure': '大失败',
      };
      // Dispatch dice animation
      document.dispatchEvent(new CustomEvent('dice-roll-animate', {
        detail: { skillName: '调试骰子', target, roll, resultType, inputText: '' },
      }));
      return `[调试骰子: d100=${roll}/${target} ${labels[resultType] || resultType}]`;
    },
  });

  // /testbonus [技能名] [目标值] — test bonus dice animation
  registerCommand({
    name: 'testbonus',
    description: '测试奖励骰动画。用法: /testbonus 侦查 60',
    execute: (args) => {
      const parsed = parseArgs(args);
      const skillName = parsed[0] || '侦查';
      const target = parseInt(parsed[1] || '50') || 50;
      const d10 = () => Math.floor(Math.random() * 10);
      const t1 = d10(), t2 = d10(), o = d10();
      const t = Math.min(t1, t2);
      const roll = (t === 0 && o === 0) ? 100 : t * 10 + o;
      const fifth = Math.floor(target / 5), half = Math.floor(target / 2);
      let resultType = 'failure';
      if (roll === 100 || (target < 50 && roll >= 96)) resultType = 'crit-failure';
      else if (roll === 1) resultType = 'crit-success';
      else if (roll <= fifth) resultType = 'extreme-success';
      else if (roll <= half) resultType = 'hard-success';
      else if (roll <= target) resultType = 'success';
      document.dispatchEvent(new CustomEvent('dice-roll-animate', {
        detail: { skillName, target, roll, resultType, inputText: '', bonus: 'bonus', bonusTens: Math.max(t1, t2) },
      }));
      return `[奖励骰: ${skillName} d100=${roll}/${target} (十位:${t1},${t2}→${t}) ]`;
    },
  });

  // /testpenalty [技能名] [目标值] — test penalty dice animation
  registerCommand({
    name: 'testpenalty',
    description: '测试惩罚骰动画。用法: /testpenalty 侦查 60',
    execute: (args) => {
      const parsed = parseArgs(args);
      const skillName = parsed[0] || '侦查';
      const target = parseInt(parsed[1] || '50') || 50;
      const d10 = () => Math.floor(Math.random() * 10);
      const t1 = d10(), t2 = d10(), o = d10();
      const t = Math.max(t1, t2);
      const roll = (t === 0 && o === 0) ? 100 : t * 10 + o;
      const fifth = Math.floor(target / 5), half = Math.floor(target / 2);
      let resultType = 'failure';
      if (roll === 100 || (target < 50 && roll >= 96)) resultType = 'crit-failure';
      else if (roll === 1) resultType = 'crit-success';
      else if (roll <= fifth) resultType = 'extreme-success';
      else if (roll <= half) resultType = 'hard-success';
      else if (roll <= target) resultType = 'success';
      document.dispatchEvent(new CustomEvent('dice-roll-animate', {
        detail: { skillName, target, roll, resultType, inputText: '', bonus: 'penalty', bonusTens: Math.min(t1, t2) },
      }));
      return `[惩罚骰: ${skillName} d100=${roll}/${target} (十位:${t1},${t2}→${t}) ]`;
    },
  });

  // /thvar <name> — get macro variable value
  registerCommand({
    name: 'thvar',
    description: '查看宏变量。用法: /thvar <变量名>',
    execute: (args) => {
      const parsed = parseArgs(args);
      const name = parsed[0];
      if (!name) return '[用法: /thvar <变量名>]';
      try {
        const { useTavernHelperStore } = require('../stores/useTavernHelperStore');
        const val = useTavernHelperStore.getState().getMacroVar(name);
        return val ? `[${name} = ${val}]` : `[宏变量 "${name}" 不存在]`;
      } catch {
        return '[酒馆助手不可用]';
      }
    },
  });

  // /thset <name> <value> — set macro variable
  registerCommand({
    name: 'thset',
    description: '设置宏变量。用法: /thset <变量名> <值>',
    execute: (args) => {
      const parsed = parseArgs(args);
      if (parsed.length < 2) return '[用法: /thset <变量名> <值>]';
      try {
        const { useTavernHelperStore } = require('../stores/useTavernHelperStore');
        useTavernHelperStore.getState().setMacroVar(parsed[0], parsed.slice(1).join(' '));
        return `[宏变量 "${parsed[0]}" 已设置]`;
      } catch {
        return '[酒馆助手不可用]';
      }
    },
  });

  // /thvars — list all macro variables
  registerCommand({
    name: 'thvars',
    description: '列出所有宏变量。用法: /thvars',
    execute: () => {
      try {
        const { useTavernHelperStore } = require('../stores/useTavernHelperStore');
        const vars = useTavernHelperStore.getState().macroVars;
        const entries = Object.entries(vars);
        if (entries.length === 0) return '[无宏变量]';
        return entries.map(([k, v]) => `[${k} = ${v}]`).join('\n');
      } catch {
        return '[酒馆助手不可用]';
      }
    },
  });

  // /help — list all commands
  registerCommand({
    name: 'help',
    description: '列出所有可用命令',
    execute: () => {
      const cmds = getCommands();
      return cmds.map((c) => `/${c.name} — ${c.description}`).join('\n');
    },
  });
}
