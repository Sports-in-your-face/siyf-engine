import type { FieldPath } from './fieldResolver';
import { resolveWithTrace } from './fieldResolver';
import { getCdnAliasPaths, mergeAliasPaths } from './cdnAliases';
import { fuzzyResolveField } from './fuzzyResolver';
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
}

const SNIFF_FIELDS = new Set(['displayClock']);

function isCdnPath(canonicalField: string, path: FieldPath): boolean {
  const key = path.join('.');
  return getCdnAliasPaths(canonicalField).some((p) => p.join('.') === key);
}

/** Full resolution waterfall: registry (+ CDN overlay) → sniff → fuzzy. */
export function resolveFieldWaterfall(
  root: unknown,
  registryPaths: readonly FieldPath[],
  options: ResolveWaterfallOptions,
): ResolveWaterfallResult {
  const merged = mergeAliasPaths(registryPaths, options.canonicalField);
  const registryHit = resolveWithTrace(root, merged);

  if (registryHit.path) {
    return {
      value: registryHit.value,
      path: registryHit.path,
      source: isCdnPath(options.canonicalField, registryHit.path) ? 'cdn' : 'registry',
      pathKey: registryHit.path.join('.'),
    };
  }

  if (options.enableSniff !== false && SNIFF_FIELDS.has(options.canonicalField)) {
    const sniffRoot = options.sniffRoot ?? root;
    const { value, candidate } = sniffField(sniffRoot, CLOCK_RULE);
    if (value !== undefined && value !== null && candidate) {
      const segments = candidate.path.split('.').filter(Boolean);
      return {
        value,
        path: segments.map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s)),
        source: 'sniff',
        pathKey: candidate.path,
      };
    }
  }

  if (options.enableFuzzy !== false && options.fuzzyParent != null) {
    const fuzzy = fuzzyResolveField(options.fuzzyParent, options.canonicalField);
    if (fuzzy) {
      const segments = fuzzy.path.split('.').filter(Boolean);
      return {
        value: fuzzy.value,
        path: segments.map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s)),
        source: 'fuzzy',
        pathKey: fuzzy.path,
      };
    }
  }

  return { value: undefined, path: null, source: 'none', pathKey: null };
}
