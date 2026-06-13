import type { FieldPath } from './fieldResolver';
import { deepGet, pathKey } from './fieldResolver';

export type HotPathSource = 'sniff' | 'fuzzy';

export interface HotPathEntry {
  canonicalField: string;
  scopeKey: string;
  path: FieldPath;
  pathKey: string;
  source: HotPathSource;
  promotedAt: number;
  hitCount: number;
}

export interface HotPathStats {
  entries: number;
  promotions: number;
  hits: number;
  evictions: number;
  cap: number;
}

const MAX_ENTRIES = 500;
const DEFAULT_SCOPE = 'global';

const store = new Map<string, HotPathEntry>();
const evictionOrder: string[] = [];

let promotions = 0;
let hits = 0;
let evictions = 0;

function entryKey(scopeKey: string, canonicalField: string, path: FieldPath): string {
  return `${scopeKey}:${canonicalField}:${pathKey(path)}`;
}

function scopeFieldPrefix(scopeKey: string, canonicalField: string): string {
  return `${scopeKey}:${canonicalField}:`;
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES && evictionOrder.length) {
    const key = evictionOrder.shift();
    if (key && store.delete(key)) evictions += 1;
  }
}

function isValidPromotedValue(canonicalField: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (canonicalField === 'score' || canonicalField === 'linescoreValue') {
    return typeof value === 'number' || typeof value === 'string';
  }
  if (canonicalField === 'displayClock') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (canonicalField === 'teamName' || canonicalField === 'teamAbbr' || canonicalField === 'record') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (canonicalField === 'teamId') {
    return typeof value === 'string' || typeof value === 'number';
  }
  return true;
}

/** Promote a sniff/fuzzy discovery to the fast-path registry overlay. */
export function promoteToRegistry(
  canonicalField: string,
  discoveredPath: FieldPath,
  source: HotPathSource,
  value: unknown,
  scopeKey = DEFAULT_SCOPE,
): boolean {
  if (!isValidPromotedValue(canonicalField, value)) return false;

  const key = entryKey(scopeKey, canonicalField, discoveredPath);
  const existing = store.get(key);
  if (existing) {
    existing.hitCount += 0;
    existing.promotedAt = Date.now();
    return true;
  }

  store.set(key, {
    canonicalField,
    scopeKey,
    path: [...discoveredPath],
    pathKey: pathKey(discoveredPath),
    source,
    promotedAt: Date.now(),
    hitCount: 0,
  });
  evictionOrder.push(key);
  promotions += 1;
  evictIfNeeded();
  return true;
}

/** Hot-path aliases prepended ahead of bundled registry + CDN. */
export function getHotPathPaths(canonicalField: string, scopeKey = DEFAULT_SCOPE): FieldPath[] {
  const prefix = scopeFieldPrefix(scopeKey, canonicalField);
  const paths: FieldPath[] = [];
  for (const [key, entry] of store) {
    if (!key.startsWith(prefix)) continue;
    paths.push(entry.path);
  }
  paths.sort((a, b) => {
    const ea = store.get(entryKey(scopeKey, canonicalField, a));
    const eb = store.get(entryKey(scopeKey, canonicalField, b));
    return (eb?.promotedAt ?? 0) - (ea?.promotedAt ?? 0);
  });
  return paths;
}

export function isHotPath(canonicalField: string, path: FieldPath, scopeKey = DEFAULT_SCOPE): boolean {
  return store.has(entryKey(scopeKey, canonicalField, path));
}

export function recordHotPathHit(canonicalField: string, path: FieldPath, scopeKey = DEFAULT_SCOPE): void {
  const entry = store.get(entryKey(scopeKey, canonicalField, path));
  if (!entry) return;
  entry.hitCount += 1;
  hits += 1;
}

/** Remove hot paths that no longer resolve on the current payload. */
export function evictStaleHotPaths(
  root: unknown,
  canonicalField: string,
  scopeKey = DEFAULT_SCOPE,
): void {
  const prefix = scopeFieldPrefix(scopeKey, canonicalField);
  for (const [key, entry] of [...store.entries()]) {
    if (!key.startsWith(prefix)) continue;
    const value = deepGet(root, entry.path);
    if (value === undefined || value === null) {
      store.delete(key);
      const idx = evictionOrder.indexOf(key);
      if (idx >= 0) evictionOrder.splice(idx, 1);
      evictions += 1;
    }
  }
}

export function evictHotPath(canonicalField: string, path: FieldPath, scopeKey = DEFAULT_SCOPE): void {
  const key = entryKey(scopeKey, canonicalField, path);
  if (store.delete(key)) {
    const idx = evictionOrder.indexOf(key);
    if (idx >= 0) evictionOrder.splice(idx, 1);
    evictions += 1;
  }
}

export function getHotPathStats(): HotPathStats {
  return {
    entries: store.size,
    promotions,
    hits,
    evictions,
    cap: MAX_ENTRIES,
  };
}

export function getHotPathEntries(limit = 20): HotPathEntry[] {
  return [...store.values()]
    .sort((a, b) => b.promotedAt - a.promotedAt)
    .slice(0, limit);
}

export function resetHotPathRegistry(): void {
  store.clear();
  evictionOrder.length = 0;
  promotions = 0;
  hits = 0;
  evictions = 0;
}

declare global {
  interface Window {
    __siyfHotPath?: {
      getStats: typeof getHotPathStats;
      getEntries: typeof getHotPathEntries;
      reset: typeof resetHotPathRegistry;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfHotPath = {
    getStats: getHotPathStats,
    getEntries: getHotPathEntries,
    reset: resetHotPathRegistry,
  };
}
