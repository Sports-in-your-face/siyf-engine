import { cachedFetch, cacheKey } from './cache';
import { profileForResource } from './cacheTiers';
import { fetchJsonResilient } from './resilientFetch';

const ODDS_CACHE = profileForResource('odds');

/**
 * Cached fetch for paid /api/odds responses.
 * 10 min fresh TTL, in-flight dedup, caches empty arrays to avoid hammering quota.
 */
export async function fetchCachedPaidOdds<T>(
  cacheSlug: string,
  url: string,
  label: string,
  extraTags: string[] = [],
): Promise<T[]> {
  const key = cacheKey('odds', cacheSlug);
  const raw = await cachedFetch(
    key,
    ODDS_CACHE,
    ({ bypassCache }) =>
      fetchJsonResilient<T[]>(url, undefined, {
        label,
        retries: 1,
        timeout: 8_000,
        bypassCache,
      }),
    ['odds', ...extraTags],
  );
  return Array.isArray(raw) ? raw : [];
}
