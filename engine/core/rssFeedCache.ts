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
  try {
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
  } catch {
    return [];
  }
}

/** Load multiple feeds in parallel; one bad feed never blocks the rest. */
export async function loadRssFeedMap(
  cachePrefix: string,
  feeds: ReadonlyArray<{ id: string; url: string }>,
): Promise<Map<string, RssItem[]>> {
  const feedItems = new Map<string, RssItem[]>();
  await Promise.all(
    feeds.map(async (feed) => {
      feedItems.set(feed.id, await loadRssFeedItems(cachePrefix, feed.id, feed.url));
    }),
  );
  return feedItems;
}

/** Load multiple RSS feeds in parallel and flatten results. */
export async function loadRssFeedsParallel(
  cachePrefix: string,
  feeds: ReadonlyArray<{ id: string; url: string }>,
  perFeedLimit?: number,
): Promise<RssItem[]> {
  const batches = await Promise.all(
    feeds.map(async (feed) => {
      try {
        return (await loadRssFeedItems(cachePrefix, feed.id, feed.url)).slice(
          0,
          perFeedLimit ?? Number.MAX_SAFE_INTEGER,
        );
      } catch {
        return [];
      }
    }),
  );
  return batches.flat();
}
