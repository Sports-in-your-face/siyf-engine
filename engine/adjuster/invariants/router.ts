import type { CompetitorLayout } from '../../../config/sportProfiles';
import type { Game } from '../../../types';
import { getSportParseThreshold } from '../metrics';
import type { ParseInvariantIssue } from './types';
import { validateFightLayout } from './fight';
import { validateLeaderboardLayout } from './leaderboard';
import { validateMatchupLayout } from './matchup';
import { validateTeamLayout } from './team';

/** Parsed game.sport tags that imply a layout when batch sport is generic. */
const GAME_SPORT_LAYOUT: Record<string, CompetitorLayout> = {
  ATP: 'matchup',
  WTA: 'matchup',
  UFC: 'fight',
  BOXING: 'fight',
  PGA: 'leaderboard',
  LPGA: 'leaderboard',
  WNBA: 'team',
  NCAA: 'team',
};

export function resolveLayoutForGame(game: Game, batchSport?: string): CompetitorLayout {
  const gameTag = (game.sport ?? '').toUpperCase();
  if (GAME_SPORT_LAYOUT[gameTag]) return GAME_SPORT_LAYOUT[gameTag];

  const batchTag = (batchSport ?? '').toUpperCase();
  if (batchTag) return getSportParseThreshold(batchTag).layout;

  return 'team';
}

export function validateGameForSport(game: Game, sport?: string): ParseInvariantIssue[] {
  const layout = resolveLayoutForGame(game, sport);

  switch (layout) {
    case 'matchup':
      return validateMatchupLayout(game);
    case 'fight':
      return validateFightLayout(game);
    case 'leaderboard':
      return validateLeaderboardLayout(game);
    case 'team':
    default:
      return validateTeamLayout(game);
  }
}
