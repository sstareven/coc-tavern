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

export function unregisterCommand(name: string): void {
  registry.delete(name.toLowerCase());
}

export function getCommands(): SlashCommand[] {
  return [...registry.values()];
}

export function getCommand(name: string): SlashCommand | undefined {
  return registry.get(name.toLowerCase());
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
      const cmdName = (spaceIdx === -1 ? line.slice(1) : line.slice(1, spaceIdx)).toLowerCase();
      const args = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1);

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
