/**
 * Deep path resolver for upstream schema drift.
 * When ESPN moves a field, add a new alias path to registry.ts — not a parser rewrite.
 */

export type FieldPath = readonly (string | number)[];

export function deepGet(root: unknown, path: FieldPath): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Walk alias paths in order; return first defined, non-null value. */
export function resolveFirst(root: unknown, aliases: readonly FieldPath[]): unknown {
  for (const path of aliases) {
    const value = deepGet(root, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** Which alias path produced a value (for drift telemetry). */
export function resolveWithTrace(
  root: unknown,
  aliases: readonly FieldPath[],
): { value: unknown; path: FieldPath | null } {
  for (const path of aliases) {
    const value = deepGet(root, path);
    if (value !== undefined && value !== null) return { value, path };
  }
  return { value: undefined, path: null };
}

export function pathKey(path: FieldPath): string {
  return path.join('.');
}
