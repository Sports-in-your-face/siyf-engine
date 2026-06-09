import type { Game } from '../../types';
import { validateGameForSport } from './invariants/router';
import type { ParseInvariantIssue } from './invariants/types';

export type { InvariantSeverity, ParseInvariantIssue } from './invariants/types';

/** Post-parse quality gate. Failures here drive the adjuster drift loop. */
export function validateGame(game: Game, sport?: string): ParseInvariantIssue[] {
  return validateGameForSport(game, sport ?? game.sport);
}

export function validateGames(games: Game[], sport?: string): ParseInvariantIssue[] {
  return games.flatMap((game) => validateGameForSport(game, sport ?? game.sport));
}

export function hasBlockingIssues(issues: ParseInvariantIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export { validateGameForSport, resolveLayoutForGame } from './invariants/router';

// Re-export layout validators for targeted tests
export { validateTeamLayout } from './invariants/team';
export { validateMatchupLayout } from './invariants/matchup';
export { validateFightLayout } from './invariants/fight';
export { validateLeaderboardLayout } from './invariants/leaderboard';
export {
  validateMergeHealth,
  validateDedupeHealth,
  runMergePipeline,
  type MergeHealthInput,
  type MergePipelineInput,
  type MergePipelineResult,
} from './invariants/merge';
export { validateGameOdds, validateGamesOdds } from './invariants/odds';
