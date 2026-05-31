import type { RegexScript, RegexPlacement } from '../types';

// ===== RegexProvider — LRU-cached compiled regex =====
export class RegexProvider {
  #cache = new Map<string, RegExp>();
  #maxSize = 1000;

  static instance = new RegexProvider();

  get(regexString: string): RegExp | null {
    const isCached = this.#cache.has(regexString);
    const regex = isCached ? this.#cache.get(regexString)! : regexFromString(regexString);
    if (!regex) return null;

    if (isCached) {
      this.#cache.delete(regexString);
      this.#cache.set(regexString, regex);
    } else {
      if (this.#cache.size >= this.#maxSize) {
        const firstKey = this.#cache.keys().next().value;
        if (firstKey !== undefined) this.#cache.delete(firstKey);
      }
      this.#cache.set(regexString, regex);
    }
    if (regex.global || regex.sticky) regex.lastIndex = 0;
    return regex;
  }

  clear(): void {
    this.#cache.clear();
  }
}

// ===== Parse /pattern/flags strings =====
export function regexFromString(str: string): RegExp | null {
  if (!str) return null;
  const m = str.match(/^\/(.+)\/([gimsuy]*)$/);
  if (m) {
    try {
      return new RegExp(m[1], m[2]);
    } catch {
      return null;
    }
  }
  // Treat as literal pattern
  try {
    return new RegExp(str, 'gm');
  } catch {
    return null;
  }
}

const SubstituteFindRegexValues = {
  NONE: 0 as const,
  RAW: 1 as const,
  ESCAPED: 2 as const,
};

// ===== Run a single regex script on a string =====
export function runRegexScript(
  script: RegexScript,
  rawString: string,
  variableResolver?: (text: string) => string,
): string {
  if (!script || script.disabled || !script.findRegex || !rawString) {
    return rawString;
  }

  const getRegexString = (): string => {
    switch (script.substituteRegex) {
      case SubstituteFindRegexValues.NONE:
        return script.findRegex;
      case SubstituteFindRegexValues.RAW:
        return variableResolver ? variableResolver(script.findRegex) : script.findRegex;
      case SubstituteFindRegexValues.ESCAPED: {
        if (!variableResolver) return script.findRegex;
        return variableResolver(script.findRegex);
      }
      default:
        return script.findRegex;
    }
  };

  const regexString = getRegexString();
  const findRegex = RegexProvider.instance.get(regexString);
  if (!findRegex) return rawString;

  const resolve = (text: string) => (variableResolver ? variableResolver(text) : text);

  return rawString.replace(findRegex, function (this: string, ...args: (string | number | undefined)[]) {
    const matched = args[0] as string;
    // String.prototype.replace 回调实参：有命名组时末位(len-1)才是 groups 对象，
    // len-2 是输入字符串；无命名组时末位是输入字符串、len-2 是 offset 数字。
    // 故取末位并在下方用 typeof === 'object' 守卫（无命名组时末位为 string，自动跳过）。
    const groups = args[args.length - 1];

    let replaceString = script.replaceString.replace(/{{match}}/gi, matched);

    // Handle capture groups $1, $2, ..., $<name>
    replaceString = replaceString.replace(/\$(\d+)|\$<([^>]+)>/g, (_, num: string, groupName: string) => {
      let groupMatch: string | undefined;
      if (num) {
        groupMatch = args[Number(num)] as string | undefined;
      } else if (groupName && groups && typeof groups === 'object') {
        groupMatch = (groups as Record<string, string>)[groupName];
      }
      if (!groupMatch) return '';

      // Apply trim strings
      let filtered = groupMatch;
      for (const trimStr of script.trimStrings) {
        const resolvedTrim = resolve(trimStr);
        filtered = filtered.replaceAll(resolvedTrim, '');
      }
      return filtered;
    });

    return resolve(replaceString);
  });
}

// ===== Run all active regex scripts on a string =====
export function runAllRegexScripts(
  rawString: string,
  placement: RegexPlacement,
  scripts: RegexScript[],
  options?: {
    variableResolver?: (text: string) => string;
    isMarkdown?: boolean;
    isPrompt?: boolean;
    depth?: number;
  },
): string {
  if (!rawString || !scripts.length) return rawString;

  let result = rawString;

  const active = scripts.filter((s) => !s.disabled);
  // Sort by script type priority: global > scoped > preset
  active.sort((a, b) => {
    return (a.substituteRegex ?? 0) - (b.substituteRegex ?? 0);
  });

  const isMd = options?.isMarkdown ?? false;
  const isPm = options?.isPrompt ?? false;

  for (const script of active) {
    // Determine if this script should run based on its display options:
    // - If neither markdownOnly nor promptOnly is checked → ALWAYS run (general)
    // - If markdownOnly is checked → only run when isMarkdown=true
    // - If promptOnly is checked → only run when isPrompt=true
    // - If BOTH are checked → run when EITHER matches
    const shouldRun =
      (!script.markdownOnly && !script.promptOnly) ||  // always
      (script.markdownOnly && isMd) ||                   // markdown match
      (script.promptOnly && isPm);                       // prompt match

    if (shouldRun) {
      if (typeof options?.depth === 'number') {
        if (script.minDepth != null && script.minDepth >= -1 && options.depth < script.minDepth) continue;
        if (script.maxDepth != null && script.maxDepth >= 0 && options.depth > script.maxDepth) continue;
      }
      if (script.placement.includes(placement)) {
        result = runRegexScript(script, result, options?.variableResolver);
      }
    }
  }

  return result;
}
