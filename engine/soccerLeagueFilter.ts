import { CORE_SOCCER_LEAGUE_SLUGS } from './core/coreSoccerLeagues';

/** Default soccer hub coverage — MLS only to limit API quota. */
export const DEFAULT_SOCCER_SCOREBOARD_LEAGUES = ['usa.1'] as const;

const validSlugs = new Set<string>(CORE_SOCCER_LEAGUE_SLUGS);

let activeLeagues: string[] = [...DEFAULT_SOCCER_SCOREBOARD_LEAGUES];

export function setSoccerScoreboardLeagues(slugs: string[]): void {
  const next = slugs.filter((slug) => validSlugs.has(slug));
  activeLeagues = next.length > 0 ? [...next] : [...DEFAULT_SOCCER_SCOREBOARD_LEAGUES];
}

export function getSoccerScoreboardLeagues(): readonly string[] {
  return activeLeagues;
}

export function isSoccerScoreboardLeagueEnabled(slug: string | undefined): boolean {
  if (!slug) return true;
  return activeLeagues.includes(slug);
}

export function filterGamesBySoccerLeagues<T extends { id?: string; leagueSlug?: string }>(games: T[]): T[] {
  const enabled = new Set(activeLeagues);
  return games.filter((g) => {
    if (g.leagueSlug) return enabled.has(g.leagueSlug);
    // Yahoo-only rows without a league tag should not bypass the user's league filter.
    if (g.id?.startsWith('yahoo-')) return false;
    return true;
  });
}
