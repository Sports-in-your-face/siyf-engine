import { dedupeRequest, resetInFlightRequests } from './resilientFetch';
import type { CacheProfile, CacheTier } from './cacheTiers';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt: number;
  tier: CacheTier;
  tags: string[];
}

const store = new Map<string, CacheEntry<unknown>>();
const tagIndex = new Map<string, Set<string>>();
/** Next fetch for these keys skips cache (client + edge via header). */
const bypassNext = new Set<string>();

function indexTags(key: string, tags: string[]): void {
  for (const tag of tags) {
    let keys = tagIndex.get(tag);
    if (!keys) {
      keys = new Set();
      tagIndex.set(tag, keys);
    }
    keys.add(key);
  }
}

function unindexKey(key: string, tags: string[]): void {
  for (const tag of tags) {
    tagIndex.get(tag)?.delete(key);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.staleAt) {
    cacheDelete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Returns expired-but-usable data when live fetch fails */
export function cacheGetStale<T>(key: string): T | undefined {
  const entry = store.get(key);
  return entry?.value as T | undefined;
}

export function cacheIsFresh(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() <= entry.expiresAt;
}

/** True when a (possibly null) value is cached and still within stale window. */
export function cacheHasEntry(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() <= entry.staleAt;
}

export function cacheGetEntry<T>(key: string): T | null | undefined {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.staleAt) return undefined;
  return entry.value as T | null;
}

/** Short TTL for upstream 404 / empty — avoids hammering dead event IDs every poll. */
const NEGATIVE_CACHE_MS = 120_000;

export function cacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p !== undefined && p !== '').join(':');
}

export function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number,
  staleMs = ttlMs * 6,
  tags: string[] = [],
  tier: CacheTier = 'warm',
): void {
  cacheSetWithProfile(key, value, { tier, ttlMs, staleMs }, tags);
}

export function cacheSetWithProfile<T>(
  key: string,
  value: T,
  profile: CacheProfile,
  tags: string[] = [],
): void {
  const existing = store.get(key);
  if (existing) unindexKey(key, existing.tags);

  const now = Date.now();
  store.set(key, {
    value,
    expiresAt: now + profile.ttlMs,
    staleAt: now + profile.staleMs,
    tier: profile.tier,
    tags,
  });
  indexTags(key, tags);
}

export function cacheDelete(key: string): void {
  const entry = store.get(key);
  if (entry) unindexKey(key, entry.tags);
  store.delete(key);
}

/** Drop one entry; next read forces upstream fetch (edge bypass too). */
export function cacheBustKey(key: string): void {
  cacheDelete(key);
  bypassNext.add(key);
}

/** Drop every entry tagged with `tag` (e.g. game:401234, team:LAL, season:2025). */
export function cacheBustTag(tag: string): void {
  const keys = tagIndex.get(tag);
  if (!keys) return;
  for (const key of [...keys]) {
    cacheBustKey(key);
  }
}

/** Drop entries whose keys start with prefix. */
export function cacheBustPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) cacheBustKey(key);
  }
}

export function consumeBypassCache(key: string): boolean {
  if (!bypassNext.has(key)) return false;
  bypassNext.delete(key);
  return true;
}

/** Clear all in-memory cache entries (tests only). */
export function resetCacheForTests(): void {
  store.clear();
  tagIndex.clear();
  bypassNext.clear();
  resetInFlightRequests();
}

export interface CacheOptions<T> {
  ttlMs: number;
  staleMs?: number;
  tier?: CacheTier;
  tags?: string[];
  isFallback?: (data: T) => boolean;
}

async function withCacheFetch<T>(
  key: string,
  options: CacheOptions<T>,
  fetcher: () => Promise<T>,
  bypassCache: boolean,
): Promise<{ data: T; isStale: boolean }> {
  if (!bypassCache && cacheIsFresh(key)) {
    const cached = cacheGet<T>(key);
    if (cached !== undefined) {
      return { data: cached, isStale: false };
    }
  }

  try {
    const data = await fetcher();

    if (options.isFallback?.(data)) {
      const stale = cacheGetStale<T>(key);
      if (stale !== undefined) {
        return { data: stale, isStale: true };
      }
      return { data, isStale: false };
    }

    const staleMs = options.staleMs ?? options.ttlMs * 6;
    cacheSet(key, data, options.ttlMs, staleMs, options.tags ?? [], options.tier ?? 'warm');
    return { data, isStale: false };
  } catch (err) {
    const stale = cacheGetStale<T>(key);
    if (stale !== undefined) {
      return { data: stale, isStale: true };
    }
    throw err;
  }
}

export async function withCache<T>(
  key: string,
  options: CacheOptions<T>,
  fetcher: () => Promise<T>,
): Promise<{ data: T; isStale: boolean }> {
  const bypassCache = consumeBypassCache(key);

  if (!bypassCache && cacheIsFresh(key)) {
    const cached = cacheGet<T>(key);
    if (cached !== undefined) {
      return { data: cached, isStale: false };
    }
  }

  return dedupeRequest(`withCache:${key}`, () =>
    withCacheFetch(key, options, fetcher, bypassCache),
  );
}

export async function withCacheProfile<T>(
  key: string,
  profile: CacheProfile,
  tags: string[],
  fetcher: () => Promise<T>,
): Promise<{ data: T; isStale: boolean }> {
  return withCache(key, {
    ttlMs: profile.ttlMs,
    staleMs: profile.staleMs,
    tier: profile.tier,
    tags,
  }, fetcher);
}

/** Tier-aware fetch with in-flight dedup — used by ESPN/API sources. */
export function cachedFetch<T>(
  key: string,
  profile: CacheProfile,
  fetcher: (ctx: { bypassCache: boolean }) => Promise<T | null>,
  tags: string[] = [],
): Promise<T | null> {
  const bypassCache = consumeBypassCache(key);

  if (!bypassCache && cacheIsFresh(key) && cacheHasEntry(key)) {
    return Promise.resolve(cacheGetEntry<T>(key) ?? null);
  }

  return dedupeRequest(key, async () => {
    if (!bypassCache && cacheIsFresh(key) && cacheHasEntry(key)) {
      const cached = cacheGetEntry<T>(key);
      if (cached !== undefined) return cached;
    }

    const data = await fetcher({ bypassCache });
    if (data != null) {
      cacheSetWithProfile(key, data, profile, tags);
      return data;
    }

    const stale = cacheGetStale<T>(key);
    if (stale != null) return stale;

    if (!bypassCache) {
      cacheSetWithProfile(
        key,
        null as unknown as T,
        { tier: profile.tier, ttlMs: NEGATIVE_CACHE_MS, staleMs: NEGATIVE_CACHE_MS },
        tags,
      );
    }

    return null;
  });
}
