import { useTavernHelperStore } from '../stores/useTavernHelperStore';

const MACRO_RE = /\{\{(setvar|getvar|incvar|decvar)::([^:}]+)(?:::([^}]*))?\}\}/g;

/**
 * Process ST-style macro commands in text:
 *   {{setvar::name::value}} — create/update a variable
 *   {{getvar::name}}        — get variable value (returns value or "")
 *   {{incvar::name::N}}     — increment by N
 *   {{decvar::name::N}}     — decrement by N
 *
 * Returns the processed text with macro commands resolved.
 */
export function processMacros(text: string): string {
  const store = useTavernHelperStore.getState();
  MACRO_RE.lastIndex = 0;

  return text.replace(MACRO_RE, (match, cmd: string, name: string, arg: string | undefined) => {
    switch (cmd) {
      case 'setvar': {
        const value = arg ?? '';
        store.setMacroVar(name, value);
        return ''; // setvar produces no output
      }
      case 'getvar': {
        return store.getMacroVar(name);
      }
      case 'incvar': {
        const amount = parseFloat(arg || '1') || 1;
        store.incMacroVar(name, amount);
        return ''; // incvar produces no output
      }
      case 'decvar': {
        const amount = parseFloat(arg || '1') || 1;
        store.decMacroVar(name, amount);
        return ''; // decvar produces no output
      }
      default:
        return match; // unknown — leave as-is
    }
  });
}

/**
 * Resolve only {{getvar::name}} macros without executing commands.
 * Used for prompt viewer previews where we don't want side effects.
 */
export function resolveGetVars(text: string): string {
  const store = useTavernHelperStore.getState();
  return text.replace(/\{\{getvar::([^:}]+)\}\}/g, (_, name: string) => {
    return store.getMacroVar(name);
  });
}
