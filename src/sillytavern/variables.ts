export function extractVariables(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const regex = /<var\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars[match[1]] = match[2];
  }
  return vars;
}

export function mergeVariables(current: Record<string, string>, updates: Record<string, string>): Record<string, string> {
  return { ...current, ...updates };
}
