import { cacheGet, cacheKey, cacheSetWithProfile } from './cache';
import { profileForResource } from './cacheTiers';
import { fetchRssFeed, type RssItem } from './rss';

const sessionCache = new Map<string, RssItem[]>();

/** Clear in-memory RSS session cache (tests only). */
export function resetRssSessionCache(): void {
  sessionCache.clear();
}

/** Load RSS items with session + tiered cache; returns empty array on failure. */
export async function loadRssFeedItems(cachePrefix: string, feedId: string, url: string): Promise<RssItem[]> {
  const sessionHit = sessionCache.get(feedId);
  if (sessionHit !== undefined) return sessionHit;

  const key = cacheKey(cachePrefix, feedId);
  const stored = cacheGet<RssItem[]>(key);
  if (stored !== undefined) {
    sessionCache.set(feedId, stored);
    return stored;
  }

  const items = await fetchRssFeed(url);
  cacheSetWithProfile(key, items, profileForResource('rss'), ['rss', feedId]);
  sessionCache.set(feedId, items);
  return items;
}

/** Load multiple RSS feeds in parallel and flatten results. */
export async function loadRssFeedsParallel(
  cachePrefix: string,
  feeds: ReadonlyArray<{ id: string; url: string }>,
  perFeedLimit?: number,
): Promise<RssItem[]> {
  const batches = await Promise.all(
    feeds.map((feed) =>
      loadRssFeedItems(cachePrefix, feed.id, feed.url).then((items) =>
        items.slice(0, perFeedLimit ?? items.length),
      ),
    ),
  );
  return batches.flat();
}
