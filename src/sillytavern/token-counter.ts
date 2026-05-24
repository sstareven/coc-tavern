/**
 * Token estimation for mixed Chinese/English text.
 * Chinese chars ≈ 0.6 tokens each, English ≈ 0.25 tokens each (average).
 * This is a character-based heuristic — accurate enough for context budgeting.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0xf900 && code <= 0xfaff)    // CJK Compatibility
    ) {
      tokens += 0.65;
    } else if (code <= 0x7f) {
      tokens += 0.25;
    } else {
      tokens += 0.4;
    }
  }
  return Math.max(1, Math.round(tokens));
}

export interface TokenBreakdown {
  systemPrompt: number;
  loreEntries: number;
  formatInstruction: number;
  chatHistory: number;
  userMessage: number;
  total: number;
}

export function computeBreakdown(
  systemPrompt: string,
  loreEntryContents: string[],
  formatInstruction: string,
  chatHistoryMessages: string[],
  userMessage: string,
): TokenBreakdown {
  const sp = estimateTokens(systemPrompt);
  const le = loreEntryContents.reduce((sum, c) => sum + estimateTokens(c), 0);
  const fi = formatInstruction ? estimateTokens(formatInstruction) : 0;
  const ch = chatHistoryMessages.reduce((sum, m) => sum + estimateTokens(m), 0);
  const um = estimateTokens(userMessage);
  return {
    systemPrompt: sp,
    loreEntries: le,
    formatInstruction: fi,
    chatHistory: ch,
    userMessage: um,
    total: sp + le + fi + ch + um,
  };
}
