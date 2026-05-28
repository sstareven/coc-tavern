/**
 * Context window manager — intelligent trimming for LLM context budget.
 * When the prompt exceeds the model's context limit, older content is
 * trimmed and optionally summarized to keep within budget.
 */
import { estimateTokens } from './token-counter';
import type { AssembledMessage } from './prompt-assembler';

// ── Config ──

export interface ContextBudget {
  /** Max total tokens allowed */
  maxTokens: number;
  /** Start trimming when usage exceeds this fraction (0-1) */
  trimThreshold: number;
  /** Minimum number of most recent messages to keep */
  preserveRecent: number;
  /** Whether to insert a summary of trimmed content */
  summarizeTrims: boolean;
}

export const DEFAULT_BUDGET: ContextBudget = {
  maxTokens: 65536,
  trimThreshold: 0.85,
  preserveRecent: 3,
  summarizeTrims: true,
};

// ── Token counting ──

function countMessages(messages: AssembledMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

// ── Trimming ──

/**
 * Trim the assembled messages to fit within the token budget.
 * Returns trimmed messages and an optional summary string.
 *
 * Strategy:
 * 1. System messages (index 0 + lore entries) are always preserved
 * 2. Format instruction is preserved
 * 3. Oldest chat history messages are trimmed first
 * 4. User message is always preserved
 * 5. If summarize mode is on, trimmed messages are summarized
 */
export function trimToBudget(
  messages: AssembledMessage[],
  budget: ContextBudget = DEFAULT_BUDGET,
): { trimmed: AssembledMessage[]; summary: string; trimmedCount: number } {
  const totalTokens = countMessages(messages);
  if (totalTokens <= budget.maxTokens * budget.trimThreshold) {
    return { trimmed: messages, summary: '', trimmedCount: 0 };
  }

  // Identify message types
  // system messages: role === 'system' (prompt + lore + format)
  // user messages: role === 'user'
  // assistant messages: role === 'assistant'

  const systemMessages: AssembledMessage[] = [];
  const chatMessages: AssembledMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemMessages.push(m);
    } else {
      chatMessages.push(m);
    }
  }

  const systemTokens = countMessages(systemMessages);
  const budgetForChat = Math.max(0, budget.maxTokens - systemTokens);

  // Find the last user message (current input) — must preserve
  let lastUserIdx = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  // Preserve: last user + recent messages after it
  const preserved: AssembledMessage[] = [];
  let preservedTokens = 0;

  if (lastUserIdx >= 0) {
    // Keep last user message
    const lastUser = chatMessages[lastUserIdx];
    preserved.push(lastUser);
    preservedTokens += estimateTokens(lastUser.content);

    // Keep messages after last user (typically assistant replies)
    for (let i = lastUserIdx + 1; i < chatMessages.length; i++) {
      preserved.push(chatMessages[i]);
      preservedTokens += estimateTokens(chatMessages[i].content);
    }
  }

  // Keep recent messages before last user, working backward
  const beforeUser: AssembledMessage[] = [];
  for (let i = lastUserIdx - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(chatMessages[i].content);
    if (preservedTokens + msgTokens + countMessages(beforeUser) <= budgetForChat * 0.7) {
      beforeUser.unshift(chatMessages[i]);
      preservedTokens += msgTokens;
    } else {
      break;
    }
  }

  // Build trimmed list
  const trimmedChat = [...beforeUser, ...preserved.slice(-budget.preserveRecent * 2)];
  const trimmedMessages = [...systemMessages, ...trimmedChat];

  // Generate summary for trimmed content
  const trimmedCount = chatMessages.length - trimmedChat.length;
  let summary = '';

  if (budget.summarizeTrims && trimmedCount > 0) {
    const trimmedContent = chatMessages
      .slice(0, chatMessages.length - trimmedChat.length)
      .map((m) => `[${m.role === 'user' ? '玩家' : 'AI'}]: ${m.content.slice(0, 200)}`)
      .join('\n');

    summary = `[上下文摘要 — 以下 ${trimmedCount} 条较旧消息已被裁剪]\n${trimmedContent}\n[摘要结束]`;
  }

  return { trimmed: trimmedMessages, summary, trimmedCount };
}

// ── Budget calculator ──

/** Get a recommended budget for a given model name */
export function getModelBudget(modelName: string): ContextBudget {
  const modelLower = modelName.toLowerCase();
  let maxTokens = 65536;

  if (modelLower.includes('claude')) maxTokens = 200000;
  else if (modelLower.includes('gpt-4')) maxTokens = 128000;
  else if (modelLower.includes('deepseek-v4')) maxTokens = 131072;
  else if (modelLower.includes('deepseek-r1')) maxTokens = 131072;
  else if (modelLower.includes('deepseek-chat')) maxTokens = 65536;
  else if (modelLower.includes('gpt-3.5')) maxTokens = 16384;
  else if (modelLower.includes('qwen')) maxTokens = 131072;

  return { ...DEFAULT_BUDGET, maxTokens };
}
