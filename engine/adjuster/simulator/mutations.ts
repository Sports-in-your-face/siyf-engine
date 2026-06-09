import { deepGet } from '../fieldResolver';

export type MutationPath = readonly (string | number)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep clone for safe in-memory mutation (fixtures only). */
export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}

function walkParent(root: unknown, path: MutationPath): { parent: Record<string, unknown>; key: string | number } | null {
  if (path.length === 0) return null;
  const key = path[path.length - 1];
  let cur: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isRecord(cur) && !Array.isArray(cur)) return null;
    cur = (cur as Record<string | number, unknown>)[path[i]];
  }
  if (!isRecord(cur) && !Array.isArray(cur)) return null;
  return { parent: cur as Record<string, unknown>, key };
}

function ensureContainer(
  parent: Record<string, unknown>,
  key: string | number,
  nextKey: string | number | undefined,
): Record<string, unknown> | unknown[] {
  const existing = parent[key];
  if (existing != null && (isRecord(existing) || Array.isArray(existing))) {
    return existing as Record<string, unknown> | unknown[];
  }
  const created = typeof nextKey === 'number' ? [] : {};
  parent[key] = created;
  return created;
}

export function setAt(root: unknown, path: MutationPath, value: unknown): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    if (!isRecord(root) && !Array.isArray(root)) return;
    (root as Record<string | number, unknown>)[path[0]] = value;
    return;
  }

  let cur: Record<string, unknown> | unknown[] = root as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (Array.isArray(cur)) {
      const idx = key as number;
      if (cur[idx] == null || (typeof cur[idx] !== 'object')) {
        cur[idx] = typeof nextKey === 'number' ? [] : {};
      }
      cur = cur[idx] as Record<string, unknown> | unknown[];
      continue;
    }
    cur = ensureContainer(cur, key, nextKey) as Record<string, unknown> | unknown[];
  }

  const leaf = walkParent(root, path);
  if (!leaf) return;
  leaf.parent[leaf.key] = value;
}

export function deleteAt(root: unknown, path: MutationPath): void {
  const leaf = walkParent(root, path);
  if (!leaf) return;
  delete leaf.parent[leaf.key];
}

export function getAt(root: unknown, path: MutationPath): unknown {
  return deepGet(root, path);
}

/** Move a leaf value from one path to another (deletes source). */
export function moveField(root: unknown, from: MutationPath, to: MutationPath): void {
  const value = getAt(root, from);
  if (value === undefined) return;
  setAt(root, to, value);
  deleteAt(root, from);
}

/** Replace a primitive leaf with `{ [wrapperKey]: value }`. */
export function wrapInObject(root: unknown, path: MutationPath, wrapperKey = 'displayValue'): void {
  const value = getAt(root, path);
  if (value === undefined || value === null) return;
  if (typeof value === 'object') return;
  setAt(root, path, { [wrapperKey]: value });
}

/** Rename a key under parent path (e.g. displayName → shortDisplayName). */
export function renameKey(
  root: unknown,
  parentPath: MutationPath,
  oldKey: string,
  newKey: string,
): void {
  const parent = getAt(root, parentPath);
  if (!isRecord(parent)) return;
  if (!(oldKey in parent)) return;
  parent[newKey] = parent[oldKey];
  delete parent[oldKey];
}

/** First away competitor in standard ESPN team event layout. */
export const AWAY_COMP = ['competitions', 0, 'competitors', 0] as const;
export const HOME_COMP = ['competitions', 0, 'competitors', 1] as const;

export function awayScorePath(): MutationPath {
  return [...AWAY_COMP, 'score'];
}

export function awayTeamNamePath(): MutationPath {
  return [...AWAY_COMP, 'team', 'displayName'];
}

export function awayTeamAbbrPath(): MutationPath {
  return [...AWAY_COMP, 'team', 'abbreviation'];
}

export function awayTeamParentPath(): MutationPath {
  return [...AWAY_COMP, 'team'];
}

export function eventIdPath(): MutationPath {
  return ['id'];
}
