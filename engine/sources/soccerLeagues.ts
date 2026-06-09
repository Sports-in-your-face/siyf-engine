import { DEFAULT_SOCCER_LEAGUE } from './espnSoccerSource';
import { SUPPLEMENTAL_SOCCER_LEAGUES } from './soccerSupplementalFeeds';

/** All ESPN soccer league slugs the engine knows about. */
export const ALL_SOCCER_LEAGUE_SLUGS = [
  DEFAULT_SOCCER_LEAGUE,
  ...SUPPLEMENTAL_SOCCER_LEAGUES.map((l) => l.slug),
] as const;

export type SoccerLeagueSlug = (typeof ALL_SOCCER_LEAGUE_SLUGS)[number];
