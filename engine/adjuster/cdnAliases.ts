import type { FieldPath } from './fieldResolver';
import { fetchCdnFieldAliases, type CdnFieldAliasesFile } from '../../config/siyfCdn';

let cachedOverlay: CdnFieldAliasesFile | null = null;
let lastLoadAt = 0;
const RELOAD_MS = 30_000;

function pathFromStrings(segments: string[]): FieldPath {
  return segments.map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s));
}

async function ensureOverlay(): Promise<CdnFieldAliasesFile | null> {
  const now = Date.now();
  if (cachedOverlay && now - lastLoadAt < RELOAD_MS) return cachedOverlay;
  cachedOverlay = await fetchCdnFieldAliases();
  lastLoadAt = now;
  return cachedOverlay;
}

/** CDN hotfix paths for a canonical field (sync read from in-memory overlay). */
export function getCdnAliasPaths(field: string): readonly FieldPath[] {
  if (!cachedOverlay?.fields?.[field]) return [];
  return cachedOverlay.fields[field].paths.map(pathFromStrings);
}

/** Load or refresh CDN alias overlay (call on engine init or manifest bump). */
export async function loadCdnAliasOverlay(): Promise<CdnFieldAliasesFile | null> {
  return ensureOverlay();
}

export function resetCdnAliasOverlay(): void {
  cachedOverlay = null;
  lastLoadAt = 0;
}

/** Merge bundled registry paths with CDN overlay paths (CDN first for hotfixes). */
export function mergeAliasPaths(
  registryPaths: readonly FieldPath[],
  field: string,
): readonly FieldPath[] {
  const cdn = getCdnAliasPaths(field);
  if (!cdn.length) return registryPaths;
  const seen = new Set<string>();
  const out: FieldPath[] = [];
  for (const path of [...cdn, ...registryPaths]) {
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}
