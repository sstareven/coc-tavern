/** Strip function-valued fields from a Zustand state object for persistence.
 *  Use as the `partialize` callback in `persist()` middleware:
 *    partialize: (state) => stripFunctions(state as unknown as Record<string, unknown>),
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripFunctions(state: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  for (const key of Object.keys(state)) {
    if (typeof state[key] !== 'function') {
      data[key] = state[key];
    }
  }
  return data;
}
