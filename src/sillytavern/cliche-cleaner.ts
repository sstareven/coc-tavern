// ===== Cliché Cleaner Pipeline Integration =====
// Applies cliché cleaning to narrative text fields of parsed LLM output.
// Fail-open: any error returns the input unchanged.

import { cleanClicheText } from './cliche-cleaner-engine';
import { DEFAULT_CLEANER_RULES } from './cliche-cleaner-rules';

/**
 * Clean cliché phrasing from a single narrative text string.
 * Returns the original text unchanged if cleaning errors.
 */
export function cleanNarrativeCliche(text: string): string {
  try {
    return cleanClicheText(text, DEFAULT_CLEANER_RULES);
  } catch {
    return text;
  }
}
