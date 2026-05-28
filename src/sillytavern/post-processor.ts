import type { AssembledMessage } from './prompt-assembler';

export function applyPostProcessing(messages: AssembledMessage[], mode: string): AssembledMessage[] {
  if (!mode) return messages;

  // Merge consecutive messages from the same role
  const mergeSameRole = (msgs: AssembledMessage[]): AssembledMessage[] => {
    const result: AssembledMessage[] = [];
    for (const m of msgs) {
      const last = result[result.length - 1];
      if (last && last.role === m.role) {
        last.content += '\n' + m.content;
      } else {
        result.push({ ...m });
      }
    }
    return result;
  };

  switch (mode) {
    case 'merge':
    case 'merge_with_tools':
      return mergeSameRole(messages);

    case 'semi_strict':
    case 'semi_strict_with_tools': {
      // Merge roles + allow only one optional system message
      const merged = mergeSameRole(messages);
      const systemMsgs = merged.filter((m) => m.role === 'system');
      if (systemMsgs.length <= 1) return merged;
      // Keep only first system message, merge rest into it
      const firstSys = systemMsgs[0];
      const rest = systemMsgs.slice(1).map((m) => m.content).join('\n');
      firstSys.content += '\n' + rest;
      return merged.filter((m) => m.role !== 'system' || m === firstSys);
    }

    case 'strict':
    case 'strict_with_tools': {
      // Merge roles, one system, require user first
      let result = mergeSameRole(messages);
      // Keep only one system message
      const sysIdx = result.findIndex((m) => m.role === 'system');
      if (sysIdx >= 0) {
        const allSys = result.filter((m) => m.role === 'system');
        if (allSys.length > 1) {
          const mergedSys = allSys[0];
          mergedSys.content = allSys.map((m) => m.content).join('\n');
          result = result.filter((m) => m.role !== 'system' || m === mergedSys);
        }
      }
      // Ensure user message is first (move system after first user)
      if (result.length > 0 && result[0].role !== 'user') {
        const firstUser = result.findIndex((m) => m.role === 'user');
        if (firstUser > 0) {
          const user = result.splice(firstUser, 1)[0];
          result.unshift(user);
        }
      }
      return result;
    }

    case 'single_user': {
      // Merge ALL into a single user message
      const combined = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
      return [{ role: 'user', content: combined }];
    }

    default:
      return messages;
  }
}
