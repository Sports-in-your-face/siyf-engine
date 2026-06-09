/** Cache tiers — live data stays hot; savable data stays put until busted. */

export type CacheTier = 'live' | 'liveDetail' | 'warm' | 'odds' | 'schedule' | 'season' | 'static';

export interface CacheProfile {
  tier: CacheTier;
  ttlMs: number;
  staleMs: number;
}

export const CACHE_PROFILES: Record<CacheTier, CacheProfile> = {
  /** Scoreboards — always fresh during games. */
  live: { tier: 'live', ttlMs: 12_000, staleMs: 60_000 },
  /** In-game summaries, plays, box scores. */
  liveDetail: { tier: 'liveDetail', ttlMs: 15_000, staleMs: 90_000 },
  /** RSS, post-game summaries. */
  warm: { tier: 'warm', ttlMs: 300_000, staleMs: 1_800_000 },
  /** Paid odds API — throttle quota; lines move slowly pre-game. */
  odds: { tier: 'odds', ttlMs: 600_000, staleMs: 1_800_000 },
  /** Scheduled tip times, upcoming matchups. */
  schedule: { tier: 'schedule', ttlMs: 1_800_000, staleMs: 7_200_000 },
  /** Season PPG, standings, season splits. */
  season: { tier: 'season', ttlMs: 3_600_000, staleMs: 86_400_000 },
  /** Team lists, rosters, logos — rarely changes mid-season. */
  static: { tier: 'static', ttlMs: 86_400_000, staleMs: 604_800_000 },
};

export type GameLiveState = 'pre' | 'in' | 'post';

export function profileForGameState(state?: GameLiveState): CacheProfile {
  if (state === 'in') return CACHE_PROFILES.liveDetail;
  if (state === 'post') return CACHE_PROFILES.warm;
  return CACHE_PROFILES.schedule;
}

export function profileForResource(
  kind: 'scoreboard' | 'summary' | 'teams' | 'standings' | 'schedule' | 'roster' | 'athlete' | 'search' | 'odds' | 'rss',
  gameState?: GameLiveState,
): CacheProfile {
  switch (kind) {
    case 'scoreboard':
      return CACHE_PROFILES.live;
    case 'summary':
      return profileForGameState(gameState);
    case 'teams':
    case 'roster':
      return CACHE_PROFILES.static;
    case 'standings':
    case 'athlete':
      return CACHE_PROFILES.season;
    case 'schedule':
      return CACHE_PROFILES.schedule;
    case 'search':
      return CACHE_PROFILES.warm;
    case 'odds':
      return CACHE_PROFILES.odds;
    case 'rss':
      return CACHE_PROFILES.warm;
    default:
      return CACHE_PROFILES.warm;
  }
}
