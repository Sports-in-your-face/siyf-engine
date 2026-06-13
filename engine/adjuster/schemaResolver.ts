import type { FieldPath } from './fieldResolver';
import { resolveWithTrace, pathKey as fieldPathKey } from './fieldResolver';
import { getCdnAliasPaths, mergeAliasPaths } from './cdnAliases';
import { fuzzyResolveField } from './fuzzyResolver';
import {
  evictStaleHotPaths,
  getHotPathPaths,
  isHotPath,
  promoteToRegistry,
  recordHotPathHit,
} from './hotPathRegistry';
import { sniffField, CLOCK_RULE } from './valueSniffer';

export type ResolveSource = 'registry' | 'cdn' | 'sniff' | 'fuzzy' | 'none';

export interface ResolveWaterfallResult {
  value: unknown;
  path: FieldPath | null;
  source: ResolveSource;
  pathKey: string | null;
}

export interface ResolveWaterfallOptions {
  canonicalField: string;
  fuzzyParent?: unknown;
  sniffRoot?: unknown;
  enableSniff?: boolean;
  enableFuzzy?: boolean;
  /** Scope for hot-path memoization (e.g. sport id). */
  scopeKey?: string;
}

const SNIFF_FIELDS = new Set(['displayClock']);

function isCdnPath(canonicalField: string, path: FieldPath): boolean {
  const key = fieldPathKey(path);
  return getCdnAliasPaths(canonicalField).some((p) => fieldPathKey(p) === key);
}

function mergeResolutionPaths(
  registryPaths: readonly FieldPath[],
  canonicalField: string,
  scopeKey?: string,
): FieldPath[] {
  const hot = getHotPathPaths(canonicalField, scopeKey);
  const bundled = mergeAliasPaths(registryPaths, canonicalField);
  const seen = new Set<string>();
  const out: FieldPath[] = [];
  for (const path of [...hot, ...bundled]) {
    const key = fieldPathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

/** Full resolution waterfall: hot path → registry (+ CDN) → sniff → fuzzy. */
export function resolveFieldWaterfall(
  root: unknown,
  registryPaths: readonly FieldPath[],
  options: ResolveWaterfallOptions,
): ResolveWaterfallResult {
  const scopeKey = options.scopeKey;
  const merged = mergeResolutionPaths(registryPaths, options.canonicalField, scopeKey);
  const registryHit = resolveWithTrace(root, merged);

  if (registryHit.path) {
    if (isHotPath(options.canonicalField, registryHit.path, scopeKey)) {
      recordHotPathHit(options.canonicalField, registryHit.path, scopeKey);
    }
    return {
      value: registryHit.value,
      path: registryHit.path,
      source: isCdnPath(options.canonicalField, registryHit.path) ? 'cdn' : 'registry',
      pathKey: fieldPathKey(registryHit.path),
    };
  }

  evictStaleHotPaths(root, options.canonicalField, scopeKey);

  if (options.enableSniff !== false && SNIFF_FIELDS.has(options.canonicalField)) {
    const sniffRoot = options.sniffRoot ?? root;
    const { value, candidate } = sniffField(sniffRoot, CLOCK_RULE);
    if (value !== undefined && value !== null && candidate) {
      const segments = candidate.path.split('.').filter(Boolean);
      const path: FieldPath = segments.map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s));
      promoteToRegistry(options.canonicalField, path, 'sniff', value, scopeKey);
      return {
        value,
        path,
        source: 'sniff',
        pathKey: candidate.path,
      };
    }
  }

  if (options.enableFuzzy !== false && options.fuzzyParent != null) {
    const fuzzy = fuzzyResolveField(options.fuzzyParent, options.canonicalField);
    if (fuzzy) {
      const segments = fuzzy.path.split('.').filter(Boolean);
      const path: FieldPath = segments.map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s));
      promoteToRegistry(options.canonicalField, path, 'fuzzy', fuzzy.value, scopeKey);
      return {
        value: fuzzy.value,
        path,
        source: 'fuzzy',
        pathKey: fuzzy.path,
      };
    }
  }

  return { value: undefined, path: null, source: 'none', pathKey: null };
}
