import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, resetCacheForTests, withCache } from '../cache';
import { CACHE_PROFILES } from '../cacheTiers';

describe('withCache in-flight dedupe', () => {
  beforeEach(() => {
    resetCacheForTests();
    vi.restoreAllMocks();
  });

  it('shares one fetcher across concurrent callers', async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { value: 1 };
    });

    const key = cacheKey('test', 'dedupe');
    const opts = { ttlMs: CACHE_PROFILES.warm.ttlMs, staleMs: CACHE_PROFILES.warm.staleMs };

    const [a, b] = await Promise.all([
      withCache(key, opts, fetcher),
      withCache(key, opts, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual({ value: 1 });
    expect(b.data).toEqual({ value: 1 });
  });

  it('returns fresh cache without calling fetcher', async () => {
    const fetcher = vi.fn(async () => ({ value: 2 }));
    const key = cacheKey('test', 'fresh');
    const opts = { ttlMs: 60_000, staleMs: 120_000 };

    await withCache(key, opts, fetcher);
    fetcher.mockClear();

    const result = await withCache(key, opts, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.data).toEqual({ value: 2 });
    expect(result.isStale).toBe(false);
  });
});
