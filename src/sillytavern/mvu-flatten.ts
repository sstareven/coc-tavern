/**
 * Recursively flatten a statData tree into dotted-key string entries for the
 * macro/EJS substitution map (which is a flat Record<string,string> keyed by dotted paths
 * like 世界.时间). Mirrors the project's existing flat dotted-key contract.
 *
 * - Objects recurse, joining keys with '.'.
 * - Arrays (including VWD-looking [value,"desc"] tuples) are emitted as a JSON string at their
 *   path — the dotted-key substitution map is for single scalar macro lookups; full structure
 *   (and VWD display) is provided by the format_message_variable YAML macro. We do NOT try to
 *   collapse [value,"desc"] here because it's structurally indistinguishable from a plain
 *   two-string array (same ambiguity the YAML formatter resolves by not collapsing).
 * - Scalars stringify directly. null/undefined are skipped.
 * - `_`/`$` prefixed keys are skipped (readonly/meta, not exposed as macros).
 */
export function flattenStatData(
  tree: unknown,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  if (tree === null || tree === undefined) return out;

  if (Array.isArray(tree)) {
    if (prefix) out[prefix] = JSON.stringify(tree);
    return out;
  }

  if (isPlainObject(tree)) {
    for (const [key, val] of Object.entries(tree)) {
      if (key.startsWith('_') || key.startsWith('$')) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      flattenStatData(val, path, out);
    }
    return out;
  }

  // scalar
  if (prefix) out[prefix] = scalarToString(tree);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
