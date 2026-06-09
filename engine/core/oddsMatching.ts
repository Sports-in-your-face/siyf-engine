import type { Game } from '../../types';

export interface OddsTeamEvent {
  away_team: string;
  home_team: string;
}

export function normalizeOddsTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Fuzzy match odds API team names to scoreboard games. */
export function matchOddsEventToGame(
  event: OddsTeamEvent,
  game: Pick<Game, 'away' | 'home'>,
  opts?: { prefixLen?: number; useAbbr?: boolean },
): boolean {
  const prefixLen = opts?.prefixLen ?? (opts?.useAbbr === false ? 4 : 5);
  const away = normalizeOddsTeamName(game.away.name);
  const home = normalizeOddsTeamName(game.home.name);
  const eAway = normalizeOddsTeamName(event.away_team);
  const eHome = normalizeOddsTeamName(event.home_team);

  const awayMatch =
    eAway.includes(away.slice(0, prefixLen))
    || away.includes(eAway.slice(0, prefixLen))
    || (opts?.useAbbr !== false
      && (game.away.abbr ?? '').length >= 2
      && eAway.includes((game.away.abbr ?? '').toLowerCase()));

  const homeMatch =
    eHome.includes(home.slice(0, prefixLen))
    || home.includes(eHome.slice(0, prefixLen))
    || (opts?.useAbbr !== false
      && (game.home.abbr ?? '').length >= 2
      && eHome.includes((game.home.abbr ?? '').toLowerCase()));

  return awayMatch && homeMatch;
}
