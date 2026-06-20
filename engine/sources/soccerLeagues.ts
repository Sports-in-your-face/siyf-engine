import { CORE_SOCCER_LEAGUE_SLUGS } from '../core/coreSoccerLeagues';
import { SUPPLEMENTAL_SOCCER_LEAGUES } from './soccerSupplementalFeeds';

export { CORE_SOCCER_LEAGUES, CORE_SOCCER_LEAGUE_SLUGS } from '../core/coreSoccerLeagues';

const BASE_SOCCER_LEAGUE_SLUGS = [
  ...CORE_SOCCER_LEAGUE_SLUGS,
  ...SUPPLEMENTAL_SOCCER_LEAGUES.map((l) => l.slug),
] as const;

/** All ESPN soccer league slugs the engine may touch. */
export const ALL_SOCCER_LEAGUE_SLUGS = [...BASE_SOCCER_LEAGUE_SLUGS] as const;

export function getActiveSoccerLeagueSlugs(): readonly string[] {
  return BASE_SOCCER_LEAGUE_SLUGS;
}

export function getCoreSoccerLeagueSlugs(): readonly string[] {
  return CORE_SOCCER_LEAGUE_SLUGS;
}

export function getActiveSoccerScoreboardLeague(): string {
  return CORE_SOCCER_LEAGUE_SLUGS[0];
}

export type SoccerLeagueSlug = (typeof ALL_SOCCER_LEAGUE_SLUGS)[number];
