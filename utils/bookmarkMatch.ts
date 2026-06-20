import type { BookmarkedTeam, Game, Team } from '../types';
import { isWnbaGame } from './coerce';

function bookmarkSportTag(sport: string): string {
  return sport.toUpperCase();
}

function gameSportMatchesBookmark(game: Game, team: BookmarkedTeam): boolean {
  if (!team.sport) return true;
  const tag = bookmarkSportTag(team.sport);
  const gs = (game.sport ?? tag).toUpperCase();
  switch (tag) {
    case 'BASEBALL':
      return gs === 'BASEBALL' || gs === 'MLB';
    case 'FOOTBALL':
      return gs === 'FOOTBALL' || gs === 'NFL';
    case 'HOCKEY':
      return gs === 'HOCKEY' || gs === 'NHL';
    case 'BASKETBALL':
      return gs === 'BASKETBALL' || gs === 'NBA' || gs === 'WNBA' || gs === 'NCAA';
    default:
      return gs === tag;
  }
}

function sideMatchesBookmark(side: Team, team: BookmarkedTeam, game: Game): boolean {
  if (team.id && side.id) {
    return side.id === team.id;
  }

  const abbrHit = side.abbr?.toUpperCase() === team.abbr.toUpperCase();
  const nameHit = side.name.toLowerCase() === team.name.toLowerCase();
  if (!abbrHit && !nameHit) return false;

  if (isWnbaGame(game)) return false;

  if (nameHit) return true;
  return abbrHit;
}

export function gameMatchesBookmark(game: Game, team: BookmarkedTeam): boolean {
  if (!gameSportMatchesBookmark(game, team)) return false;
  return sideMatchesBookmark(game.away, team, game)
    || sideMatchesBookmark(game.home, team, game);
}

export function bookmarkSide(game: Game, team: BookmarkedTeam): 'home' | 'away' | null {
  if (!gameSportMatchesBookmark(game, team)) return null;
  if (sideMatchesBookmark(game.home, team, game)) return 'home';
  if (sideMatchesBookmark(game.away, team, game)) return 'away';
  return null;
}
