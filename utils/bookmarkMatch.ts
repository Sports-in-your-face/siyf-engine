import type { BookmarkedTeam, Game, Team } from '../types';
import { isWnbaGame } from './coerce';

function sideMatchesBookmark(side: Team, team: BookmarkedTeam, game: Game): boolean {
  if (team.id && side.id && side.id === team.id) return true;

  const abbrHit = side.abbr?.toUpperCase() === team.abbr.toUpperCase();
  const nameHit = side.name.toLowerCase() === team.name.toLowerCase();
  if (!abbrHit && !nameHit) return false;

  if (isWnbaGame(game)) return false;

  if (nameHit) return true;
  return abbrHit;
}

export function gameMatchesBookmark(game: Game, team: BookmarkedTeam): boolean {
  return sideMatchesBookmark(game.away, team, game)
    || sideMatchesBookmark(game.home, team, game);
}

export function bookmarkSide(game: Game, team: BookmarkedTeam): 'home' | 'away' | null {
  if (sideMatchesBookmark(game.home, team, game)) return 'home';
  if (sideMatchesBookmark(game.away, team, game)) return 'away';
  return null;
}
